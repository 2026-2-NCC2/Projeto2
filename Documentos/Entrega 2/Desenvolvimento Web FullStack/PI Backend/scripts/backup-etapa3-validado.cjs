'use strict';
// Execução explícita, somente no destino aprovado. Nunca importa server.js.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),{pipeline}=require('node:stream/promises');
const {rowsHash,canonical,pgpass}=require('./backup-postgres-isolado.cjs');
const {catalogoSql}=require('./catalogo-backup.cjs');
const DESTINO='C:\\Users\\Lucas\\BackupsTrocaTicket\\backup-etapa3-20261105';
const REF='gnwybroqfvwosiqzsfla',qi=s=>'"'+s.replaceAll('"','""')+'"';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
// pg_dump/restore pode distribuir o cast de varchar[] para text[] por elemento.
// Aceitar somente este par exato; não normalizar expressões arbitrárias.
const CHECK_ORIGEM='CHECK (((status IS NOT NULL) AND (((status)::text COLLATE "C") = ANY ((ARRAY[\'Em planejamento\'::character varying, \'Ativo\'::character varying, \'Cancelado\'::character varying, \'Encerrado\'::character varying])::text[]))))';
const CHECK_RESTAURADO='CHECK (((status IS NOT NULL) AND (((status)::text COLLATE "C") = ANY (ARRAY[(\'Em planejamento\'::character varying)::text, (\'Ativo\'::character varying)::text, (\'Cancelado\'::character varying)::text, (\'Encerrado\'::character varying)::text]))))';
function normalizarConstraint(x){
  if(x.table==='eventos'&&x.name==='eventos_ciclo_v1'&&x.definition===CHECK_RESTAURADO)return {...x,definition:CHECK_ORIGEM};
  return x;
}
// stderr fica apenas em memória; não imprimir erros de driver/restore com dados.
async function cmd(args,{input,output,timeout=180000}={}) {
  const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const out=[],err=[];let bytes=0;
  const timer=setTimeout(()=>child.kill(),timeout);
  child.stderr.on('data',b=>{if(err.reduce((n,x)=>n+x.length,0)<1048576)err.push(b)});
  const stream=output?pipeline(child.stdout,fs.createWriteStream(output,{flags:'wx'})):null;
  if(!output)child.stdout.on('data',b=>{bytes+=b.length;if(bytes>67108864)child.kill();else out.push(b)});
  child.stdin.on('error',()=>{});child.stdin.end(input);
  try{
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});
    if(stream)await stream;
    if(code!==0){const e=Object.assign(Error('Subprocesso recusado'),{code:'BACKUP_SUBPROCESS'});e.privado=Buffer.concat(err).toString();throw e;}
    return Buffer.concat(out);
  }finally{clearTimeout(timer);if(stream)await stream.catch(()=>{});}
}
async function executar({restaurarExistente=false}={}) {
  assert.equal(fs.realpathSync(DESTINO).toLowerCase(),DESTINO.toLowerCase());
  assert.ok(!fs.lstatSync(DESTINO).isSymbolicLink());
  const manifesto=path.join(DESTINO,'manifesto.json'),dump=path.join(DESTINO,'banco-completo.dump'),roles=path.join(DESTINO,'roles-sem-senhas.sql'),ca=path.join(DESTINO,'ca-temporaria.pem');
  let m=restaurarExistente?JSON.parse(fs.readFileSync(manifesto,'utf8')):{projeto:REF,iniciadoEm:new Date().toISOString(),status:'PREPARACAO',origemEscritas:0,
    privacidade:{acl:'Lucas e SYSTEM conferida antes da copia',backupSensivel:true,senhasDeConexaoIncluidas:false,senhasDeRolesIncluidas:false,retencao:'Preservar dump e manifesto ate autorizacao explicita',exclusao:'Remover clone/tmpfs e temporarios; nao garante apagamento forense SSD'},
    escopo:'Banco completo schema/dados e roles sem senhas; exclui bytes Storage e configuracao da plataforma'};
  const save=()=>fs.writeFileSync(manifesto,JSON.stringify(m,null,2)+'\n');
  if(restaurarExistente&&m.falha){m.historicoTentativas??=[];m.historicoTentativas.push({falha:m.falha,cloneRemovido:m.restauracao?.removido});delete m.falha;}
  let source,pool,container,stage='DESTINO',clientContainer;const run='etapa3-20261105';
  const readSql=async text=>{
    await validarClone();
    return (await cmd(['exec','-i',container,'psql','-X','-U','supabase_admin','-h','/tmp','-d','postgres','-v','ON_ERROR_STOP=1','-A','-t','-q'],{input:"SET timezone='UTC';\n"+text})).toString().trim();
  };
  async function validarClone(){
    assert.match(container,/^[a-f0-9]{64}$/);
    const [c]=JSON.parse((await cmd(['inspect',container])).toString());
    assert.equal(c.Config.Labels['tt.backup.run'],run);assert.equal(c.HostConfig.NetworkMode,'none');
    assert.equal(c.HostConfig.ReadonlyRootfs,true);assert.equal(c.Config.User,'postgres');
    assert.ok(!c.HostConfig.PortBindings||Object.keys(c.HostConfig.PortBindings).length===0);
    assert.ok(c.HostConfig.Tmpfs['/isolated']);
    assert.ok(c.Mounts.every(x=>x.Type==='tmpfs'||x.Type==='bind'&&!x.RW&&['/backup/dump','/backup/roles'].includes(x.Destination)));
  }
  try {
    const image=(await cmd(['image','inspect','postgres:17','--format','{{.Id}}'])).toString().trim();
    const restoreImage=(await cmd(['image','inspect','supabase/postgres:17.11.0.016','--format','{{.Id}}'])).toString().trim();
    m.ferramentas={pgDump:(await cmd(['run','--rm','--pull=never','--network','none','--read-only','--entrypoint','pg_dump',image,'--version'])).toString().trim(),pgRestore:(await cmd(['run','--rm','--pull=never','--network','none','--read-only','--entrypoint','pg_restore',image,'--version'])).toString().trim(),imagemCliente:image,imagemRestauracao:restoreImage};
    if(!restaurarExistente){
      assert.ok(!fs.existsSync(dump)&&!fs.existsSync(roles)&&!fs.existsSync(manifesto));
      stage='CONEXAO_ORIGEM';
      const env=require('dotenv').parse(fs.readFileSync(path.join(__dirname,'../.env'),'utf8'));
      const {c,pg}=require('./preflight-imagens-producao.cjs').configurar(env);
      const rest=await fetch(c.url+'/rest/v1/eventos?select=id&limit=0',{redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:c.secretKey,Authorization:'Bearer '+c.secretKey}});
      assert.ok(rest.ok&&rest.headers.get('sb-project-ref')===REF);await rest.arrayBuffer();
      pool=require('../db-postgres.js').criarPoolPostgres(pg,{queryTimeoutMs:30000});source=await pool.connect();
      assert.equal(source.connection.stream.authorized,true);m.tlsVerificado=true;
      await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await source.query("SET LOCAL timezone='UTC'");
      await source.query("SET LOCAL statement_timeout='30s'");await source.query("SET LOCAL idle_in_transaction_session_timeout='5min'");
      m.versaoOrigem=(await source.query('SHOW server_version_num')).rows[0].server_version_num;assert.equal(Number(m.versaoOrigem),170011);
      const snapshot=(await source.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;assert.match(snapshot,/^[0-9A-F-]+$/);
      const tables=(await source.query("SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','m') AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' ORDER BY 1,2")).rows;
      m.tabelas=[];stage='SNAPSHOT_SOMENTE_LEITURA';
      for(const t of tables){const rows=(await source.query('SELECT to_jsonb(t) AS row FROM '+qi(t.schema)+'.'+qi(t.name)+' t')).rows.map(x=>x.row);m.tabelas.push({...t,quantidade:rows.length,sha256:rowsHash(rows)});}
      m.extensoes=(await source.query('SELECT extname,extversion FROM pg_extension ORDER BY extname')).rows;
      const catalogo=(await source.query(catalogoSql)).rows[0].catalogo;
      m.catalogo=Object.fromEntries(Object.entries(catalogo).map(([k,v])=>[k,{quantidade:Array.isArray(v)?v.length:0,sha256:sha(canonical(v))}]));
      m.verificacaoEventos=(await source.query(fs.readFileSync(path.join(__dirname,'../../Banco de dados/eventos_capacidade.verificacao.sql'),'utf8'))).rows[0].verificacao;
      m.storage={bytesIncluidos:false,inventarioPrivado:'storage-arquivos-nao-incluidos.json',objetos:(await source.query('SELECT bucket_id,count(*)::integer AS quantidade FROM storage.objects GROUP BY bucket_id ORDER BY bucket_id')).rows};
      // Inventário com caminhos fica somente fora do Git, junto ao backup sensível.
      const objects=(await source.query('SELECT bucket_id,name FROM storage.objects ORDER BY bucket_id,name')).rows;
      fs.writeFileSync(path.join(DESTINO,m.storage.inventarioPrivado),JSON.stringify({bytesIncluidos:false,objetos:objects},null,2)+'\n',{flag:'wx'});
      const roots=env.PGSSLROOTCERT?fs.readFileSync(env.PGSSLROOTCERT,'utf8'):require('node:tls').getCACertificates('default').join('\n');assert.ok(roots.includes('BEGIN CERTIFICATE'));fs.writeFileSync(ca,roots,{flag:'wx'});
      const pass=[env.PGHOST,'5432','postgres',env.PGUSER,env.PGPASSWORD].map(pgpass).join(':')+'\n';
      const clientArgs=['run','--rm','-i','--read-only','--log-driver','none','--label','tt.backup.run='+run,'--network','bridge','--tmpfs','/tmp:rw,size=64m,mode=1777','--mount','type=bind,source='+ca+',target=/ca.pem,readonly',
        '--env','PGHOST='+env.PGHOST,'--env','PGPORT=5432','--env','PGDATABASE=postgres','--env','PGUSER='+env.PGUSER,'--env','PGSSLMODE=verify-full','--env','PGSSLROOTCERT=/ca.pem','--env','PGCONNECT_TIMEOUT=15',
        '--env','PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=120000','--entrypoint','/bin/sh',image,'-c','umask 077; cat > /tmp/pass; export PGPASSFILE=/tmp/pass; exec "$@"','backup-client'];
      stage='DUMP_COMPLETO';m.status='DUMP_EM_ANDAMENTO';save();
      clientContainer='tt-backup-etapa3-dump';clientArgs.splice(1,0,'--name',clientContainer);
      await cmd([...clientArgs,'pg_dump','--format=custom','--snapshot='+snapshot],{input:pass,output:dump,timeout:300000});clientContainer=null;
      m.dump={arquivo:path.basename(dump),bytes:fs.statSync(dump).size,sha256:sha(fs.readFileSync(dump))};save();
      stage='ROLES_SEM_SENHAS';clientContainer='tt-backup-etapa3-roles';const roleArgs=[...clientArgs];roleArgs[roleArgs.indexOf('--name')+1]=clientContainer;
      await cmd([...roleArgs,'pg_dumpall','--roles-only','--no-role-passwords'],{input:pass,output:roles});clientContainer=null;
      m.roles={arquivo:path.basename(roles),bytes:fs.statSync(roles).size,sha256:sha(fs.readFileSync(roles))};
      await source.query('ROLLBACK');source.release();source=null;await pool.end();pool=null;
      m.status='BACKUP_GERADO';m.snapshotConcluidoEm=new Date().toISOString();save();
      console.log(JSON.stringify({status:m.status,tabelas:m.tabelas.length,bytes:m.dump.bytes,escritasOrigem:0}));
    }else{assert.equal(m.projeto,REF);assert.ok(m.dump&&m.roles);assert.ok(!m.restauracao||m.restauracao.removido);}
    for(const [file,expected] of [[dump,m.dump],[roles,m.roles]])assert.equal(sha(fs.readFileSync(file)),expected.sha256);
    stage='CLONE_ISOLADO';
    container=(await cmd(['run','--detach','--pull=never','--name','tt-pg-backup-etapa3-20261105','--label','tt.backup.run='+run,'--log-driver','none','--network','none','--read-only','--memory','1536m','--cpus','2','--pids-limit','256','--user','postgres',
      '--tmpfs','/tmp:rw,size=128m,mode=1777','--tmpfs','/isolated:rw,size=1g,uid=100,gid=101,mode=0700',
      '--mount','type=bind,source='+dump+',target=/backup/dump,readonly','--mount','type=bind,source='+roles+',target=/backup/roles,readonly','--entrypoint','/bin/sh',restoreImage,'-c',
      "initdb -D /isolated/data -U supabase_admin --auth-local=trust --auth-host=reject --no-locale --encoding=UTF8 >/tmp/init.log 2>&1 && exec postgres -D /isolated/data -k /tmp -c listen_addresses= -c unix_socket_permissions=0700 -c shared_preload_libraries=pg_stat_statements -c logging_collector=off -c log_statement=none -c log_min_messages=panic -c log_min_error_statement=panic"])).toString().trim();
    m.restauracao={container,rede:'none',portas:[],tmpfs:true,removido:false,validada:false};save();await validarClone();
    let pronto=false;for(let i=0;i<60;i++){try{if(await readSql('SELECT 1')==='1'){pronto=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(pronto);
    stage='RESTAURAR_ROLES';await readSql(fs.readFileSync(roles,'utf8').replace(/^CREATE ROLE supabase_admin;\r?\n/gm,''));
    stage='PG_RESTORE';await validarClone();await cmd(['exec',container,'pg_restore','--exit-on-error','--single-transaction','--dbname=postgres','--host=/tmp','--username=supabase_admin','/backup/dump'],{timeout:300000});
    stage='VALIDAR_DADOS';
    for(const t of m.tabelas){const rows=JSON.parse(await readSql("SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM "+qi(t.schema)+'.'+qi(t.name)+' t'));assert.equal(rows.length,t.quantidade);assert.equal(rowsHash(rows),t.sha256);}
    stage='VALIDAR_CATALOGO';
    const restored=JSON.parse(await readSql(catalogoSql));
    const ciclo=restored.constraints.find(x=>x.table==='eventos'&&x.name==='eventos_ciclo_v1');
    const original=m.verificacaoEventos.restricao_estados.find(x=>x.nome==='eventos_ciclo_v1');
    if(ciclo?.definition===CHECK_RESTAURADO&&original?.definicao===CHECK_ORIGEM){
      const cases=[null,'Em planejamento','Ativo','Cancelado','Encerrado','ativo','ÁTIVO','Em Planejamento','Ativo ','Desconhecido',''];
      const resultados=JSON.parse(await readSql(`WITH entrada AS (SELECT value::varchar AS status FROM jsonb_array_elements_text('${JSON.stringify(cases)}'::jsonb))
        SELECT jsonb_agg(jsonb_build_object('origem',${CHECK_ORIGEM.slice(6)},'clone',${CHECK_RESTAURADO.slice(6)})) FROM entrada`));
      assert.ok(resultados.every((r,i)=>r.origem===r.clone&&r.clone===(i>=1&&i<=4)));
      m.restauracao.equivalenciaRestricao={nome:'eventos_ciclo_v1',diferenca:'Cast varchar[]->text[] distribuido por elemento no deparse',casosVerificados:cases.length,resultadoIgual:true,alteracaoDeRestricao:false};
      restored.constraints=restored.constraints.map(normalizarConstraint);
    }
    m.restauracao.comparacaoCatalogo={};
    for(const [k,v] of Object.entries(restored)){
      const h=sha(canonical(v));m.restauracao.comparacaoCatalogo[k]={quantidade:Array.isArray(v)?v.length:0,sha256:h,igual:h===m.catalogo[k].sha256};
    }
    save();
    if(!m.restauracao.comparacaoCatalogo.constraints.igual){
      const env=require('dotenv').parse(fs.readFileSync(path.join(__dirname,'../.env'),'utf8'));
      const {pg}=require('./preflight-imagens-producao.cjs').configurar(env);
      const diagnosticPool=require('../db-postgres.js').criarPoolPostgres(pg,{queryTimeoutMs:30000});let dc;
      try{
        dc=await diagnosticPool.connect();assert.equal(dc.connection.stream.authorized,true);
        await dc.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await dc.query("SET LOCAL timezone='UTC'");
        const current=(await dc.query(catalogoSql)).rows[0].catalogo;
        assert.equal(sha(canonical(current.constraints)),m.catalogo.constraints.sha256,'ORIGEM_MUDOU');
        const key=x=>x.table+'.'+x.name;
        const diffs=current.constraints.map(x=>({origem:x,clone:restored.constraints.find(y=>key(x)===key(y))})).filter(x=>canonical(x.origem)!==canonical(x.clone));
        fs.writeFileSync(path.join(DESTINO,'diagnostico-catalogo-privado.json'),JSON.stringify(diffs,null,2)+'\n');
        m.restauracao.diagnostico={restricoesDiferentes:diffs.map(x=>({tabela:x.origem.table,nome:x.origem.name})),origemAindaIgualAoSnapshot:true};
        save();console.log(JSON.stringify({diagnostico:m.restauracao.diagnostico}));
        await dc.query('ROLLBACK');
      }finally{if(dc){await dc.query('ROLLBACK').catch(()=>{});dc.release();}await diagnosticPool.end();}
    }
    for(const [k,v] of Object.entries(m.restauracao.comparacaoCatalogo))assert.ok(v.igual,'CATALOGO_'+k);
    stage='VALIDAR_EXTENSOES';
    const ext=JSON.parse(await readSql('SELECT jsonb_agg(to_jsonb(e) ORDER BY extname) FROM (SELECT extname,extversion FROM pg_extension) e'));assert.deepEqual(ext,m.extensoes);
    stage='VALIDAR_VERIFICACAO';
    const verify=JSON.parse(await readSql(fs.readFileSync(path.join(__dirname,'../../Banco de dados/eventos_capacidade.verificacao.sql'),'utf8')));
    if(m.restauracao.equivalenciaRestricao){
      for(const r of verify.restricao_estados)if(r.nome==='eventos_ciclo_v1'&&r.definicao===CHECK_RESTAURADO)r.definicao=CHECK_ORIGEM;
    }
    // O clone usa bootstrap supabase_admin; isso não é alteração de dados/ACL.
    const {contexto,...comparavel}=verify,{contexto:contextoOrigem,...baseline}=m.verificacaoEventos;
    assert.equal(contexto.usuario,'supabase_admin');assert.equal(contextoOrigem.usuario,'postgres');
    assert.equal(contexto.banco,contextoOrigem.banco);assert.equal(contexto.versao,contextoOrigem.versao);
    assert.deepEqual(comparavel,baseline);
    stage='VALIDAR_PERMISSOES';
    assert.equal(await readSql('BEGIN READ ONLY;SET LOCAL ROLE service_role;SELECT public.eventos_capacidades_v1();ROLLBACK;'),'1');
    const scope=await readSql("BEGIN READ ONLY;SET LOCAL ROLE service_role;SELECT count(*) FROM public.eventos_imagens;ROLLBACK;");assert.match(scope,/^\d+$/);
    m.restauracao.validada=true;m.restauracao.tabelasComparadas=m.tabelas.length;m.restauracao.catalogoComparado=true;m.restauracao.eventosEInscricoesComparados=true;m.restauracao.etapas1e2=true;m.restauracao.extensoesComparadas=true;
    m.status='BACKUP_RESTAURACAO_VALIDADA';m.validadoEm=new Date().toISOString();save();
    console.log(JSON.stringify({status:m.status,tabelas:m.tabelas.length,hashesConferidos:true,etapas1e2:true,escritasOrigem:0}));
  }catch(e){
    m.status='INTERROMPIDO';m.falha={etapa:stage,codigo:/^[A-Z0-9_]{1,64}$/.test(e.code||'')?e.code:'VALIDACAO_RECUSADA'};
    // Classificação limitada; nunca registrar SQL/linhas, mensagens de driver ou senha.
    const raw=e.privado||'';const extension=raw.match(/extension "([a-z_0-9]+)"/i)?.[1];if(extension)m.falha.extensao=extension;
    if(/permission denied/i.test(raw))m.falha.classe='PERMISSAO';
    if(/certificate verify failed|SSL error/i.test(raw))m.falha.classe='TLS';
    if(/already exists/i.test(raw))m.falha.classe='OBJETO_EXISTENTE';
    if(e.code==='ERR_ASSERTION')m.falha.comparacao=/^CATALOGO_[a-z_]+$/.test(e.message||'')?e.message:'INTEGRIDADE_OU_GUARDA';
    save();console.log(JSON.stringify({status:m.status,falha:m.falha,detalhesPrivadosOmitidos:true}));process.exitCode=1;
  }finally{
    if(source){await source.query('ROLLBACK').catch(()=>{});source.release();}if(pool)await pool.end();
    if(clientContainer){try{
      const [c]=JSON.parse((await cmd(['inspect',clientContainer])).toString());assert.equal(c.Config.Labels['tt.backup.run'],run);
      await cmd(['rm','--force',c.Id]);
    }catch{m.limpezaClientePendente=true;}}
    if(container){try{await validarClone();await cmd(['stop','--time','10',container]);await cmd(['rm',container]);m.restauracao.removido=true;}catch{m.limpezaClonePendente=true;process.exitCode=1;}}
    if(fs.existsSync(ca))fs.unlinkSync(ca);
    const diagnostico=path.join(DESTINO,'diagnostico-catalogo-privado.json');if(fs.existsSync(diagnostico))fs.unlinkSync(diagnostico);
    m.temporariosRemovidos=!fs.existsSync(ca)&&!m.limpezaClientePendente;
    m.backupPreservado=Boolean(m.dump&&m.roles&&sha(fs.readFileSync(dump))===m.dump.sha256&&sha(fs.readFileSync(roles))===m.roles.sha256);
    save();console.log(JSON.stringify({status:m.status,cloneRemovido:m.restauracao?.removido||false,temporariosRemovidos:m.temporariosRemovidos,backupPreservado:m.backupPreservado}));
  }
}
if(require.main===module){
  assert.ok(process.argv.length===2||process.argv.length===3&&process.argv[2]==='--restaurar-existente');
  executar({restaurarExistente:process.argv[2]==='--restaurar-existente'}).catch(()=>{console.error('BACKUP_PREPARACAO_RECUSADA');process.exitCode=1;});
}
module.exports={executar,normalizarConstraint,CHECK_ORIGEM,CHECK_RESTAURADO};
