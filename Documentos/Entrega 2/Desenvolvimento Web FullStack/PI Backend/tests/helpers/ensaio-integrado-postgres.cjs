'use strict';
// Infraestrutura exclusiva de teste. Importar não acessa Docker, rede ou .env.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const SOCKETS=['npipe:////./pipe/dockerDesktopLinuxEngine','npipe:////./pipe/docker_engine','unix:///var/run/docker.sock'];
const OBJETIVO='F84-SINTETICO-DESCARTAVEL';
function validarSocket(socket){assert.ok(SOCKETS.includes(socket),'Socket Docker local revisado obrigatório');return socket;}
function validarDono(c,{nome,nonce,imagem}){
  assert.equal(c.Name,'/'+nome);assert.equal(c.Config.Labels['trocaticket.ensaio'],'f84');
  assert.equal(c.Config.Labels['trocaticket.nonce'],nonce);assert.equal(c.Image,imagem);
}
function validarContainer(c,esperado){
  validarDono(c,esperado);
  assert.equal(c.HostConfig.AutoRemove,true);assert.equal(c.HostConfig.NetworkMode,'bridge');
  assert.ok((c.Mounts||[]).every(m=>m.Type==='tmpfs'&&m.Destination==='/var/lib/postgresql/data'),'Nenhum bind/volume existente permitido');
  const portas=c.NetworkSettings.Ports['5432/tcp'];assert.equal(portas?.length,1);
  assert.equal(portas[0].HostIp,'127.0.0.1');assert.match(portas[0].HostPort,/^[1-9]\d*$/);
  assert.ok(Number(portas[0].HostPort)<=65535);assert.deepEqual(Object.keys(c.NetworkSettings.Ports),['5432/tcp']);
  return Number(portas[0].HostPort);
}
function validarBanco(r,{banco,nonce}){
  assert.match(banco,/^tt_f84_[0-9a-f]{32}$/);assert.equal(r.banco,banco);
  assert.equal(r.nonce,nonce);assert.equal(r.objetivo,OBJETIVO);
  assert.ok(Number(r.versao)>=170000&&Number(r.versao)<180000,'Somente PostgreSQL 17 revisado');
}
function classificarErro(code){
  if(code==='55P03')return 'lock_timeout';if(code==='40P01')return 'deadlock';if(code==='57014')return 'statement_timeout';
  if(/^(EV|AP|CT|TA)\d{3}$/.test(code||''))return 'regra_negocio';return 'inesperado';
}
const pastaSql=join(__dirname,'../../../Banco de dados');
const lerSql=nome=>readFileSync(join(pastaSql,nome),'utf8');
function etapas(versao){
  assert.ok([1,3].includes(versao));
  return [
    ['base',readFileSync(join(__dirname,'../fixtures/ensaio-integrado-base.sql'),'utf8')],
    ['contas',lerSql('contas_teste_imagens.preparacao.sql')],
    ['gestao-v1',lerSql('eventos_gestao.incremental.sql')],
    ...(versao===3?[['capacidade-v3',lerSql('eventos_capacidade.incremental.sql')]]:[]),
    ['avaliacao',lerSql('rpc_avaliar_proposta.preparacao.sql')+`\nREVOKE ALL ON FUNCTION public.avaliar_proposta(numeric,bigint,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.avaliar_proposta(numeric,bigint,text) TO service_role;`],
    ['A7',lerSql('eventos_admin.incremental.sql')],['A10',lerSql('admin_perfis.incremental.sql')],['F8',lerSql('contratacoes.incremental.sql')],
  ];
}
async function aplicarEtapas(versao,executar,validar){
  for(const [nome,sql] of etapas(versao)){await executar(sql,nome);await validar(nome);}
}
async function criarAmbiente(t,opcoes={}){
  assert.ok(Object.keys(opcoes).every(k=>['versao','optIn'].includes(k)),'Conexão/URL externa não é aceita pelo executor');
  const {versao,optIn}=opcoes;
  assert.equal(optIn,'1','Opt-in explícito obrigatório');assert.ok([1,3].includes(versao));
  for(const chave of ['ADMIN_EVENTOS_CRIACAO_ATIVA','ADMIN_PERFIS_GESTAO_ATIVA','CONTRATACOES_ATIVAS'])assert.ok(!process.env[chave]||process.env[chave]==='false','Flag funcional deve continuar desligada: '+chave);
  for(const chave of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])assert.ok(!process.env[chave],'Sobreposição Docker não permitida: '+chave);
  const {spawnSync}=require('node:child_process'),{Client,Pool}=require('pg');
  const nonce=randomUUID(),nome='tt-f84-'+nonce,banco='tt_f84_'+nonce.replaceAll('-',''),senha=randomUUID();
  let imagem,socket,pool,config,sistema,erroPool,etapa='preflight',tentativas=0;const abertos=new Set();
  const inicio=Date.now();
  const comando=(args,combinar=false)=>{
    const r=spawnSync('docker',args,{encoding:'utf8',timeout:10000,stdio:'pipe',maxBuffer:2*1024*1024});
    if(r.error||r.status!==0)throw Object.assign(Error('Docker falhou na etapa '+etapa),{code:r.error?.code||'DOCKER_EXIT'});
    return (r.stdout+(combinar?'\n'+r.stderr:'')).trim();
  };
  socket=validarSocket(JSON.parse(comando(['context','inspect']))[0]?.Endpoints?.docker?.Host);
  const docker=(args,combinar=false)=>comando(['--host',socket,...args],combinar);
  assert.equal(docker(['info','--format','{{.OSType}}']),'linux');
  imagem=JSON.parse(docker(['image','inspect','postgres:17']))[0]?.Id;assert.match(imagem,/^sha256:[0-9a-f]{64}$/);
  const inspecionar=()=>JSON.parse(docker(['inspect',nome]))[0];
  // Cleanup registrado antes de run: cobre também criação parcial. Nunca prune/rm genérico.
  t.after(async()=>{
    etapa='limpeza';
    try{
      for(const c of abertos){try{await c.query('ROLLBACK');}finally{abertos.delete(c);c.release(true);}}
      await pool?.end();
    }finally{
      const ids=docker(['ps','-a','--filter','name=^/'+nome+'$','--format','{{.ID}}']);
      if(ids){const c=inspecionar();validarDono(c,{nome,nonce,imagem});docker(['stop','--time','2',nome]);}
      assert.equal(docker(['ps','-a','--filter','name=^/'+nome+'$','--format','{{.ID}}']),'','Container próprio não removido');
      t.diagnostic('Limpeza do ambiente sintético v'+versao+' confirmada');
      assert.equal(erroPool,undefined,'Conexão ociosa do pool falhou: ensaio não aprovado');
    }
  });
  try{
    etapa='container';
    docker(['run','--detach','--rm','--pull=never','--name',nome,'--label','trocaticket.ensaio=f84','--label','trocaticket.nonce='+nonce,
      '--network','bridge','--publish','127.0.0.1::5432','--tmpfs','/var/lib/postgresql/data:rw,nosuid,noexec,size=256m',
      '--env','POSTGRES_PASSWORD='+senha,imagem]);
    const port=validarContainer(inspecionar(),{nome,nonce,imagem});
    config={host:'127.0.0.1',port,user:'postgres',password:senha,database:'postgres',ssl:false,
      application_name:nome,connectionTimeoutMillis:750,query_timeout:9000,
      options:'-c statement_timeout=8000 -c idle_in_transaction_session_timeout=8000'};
    etapa='prontidao SQL';const limite=Date.now()+30000;let pronto=false;
    while(Date.now()<limite){
      const restante=Math.max(1,Math.min(750,Math.floor((limite-Date.now())/2)));
      const c=new Client({...config,connectionTimeoutMillis:restante,query_timeout:restante});c.on('error',()=>{});tentativas++;
      try{await c.connect();assert.equal((await c.query('SELECT 1 AS pronto')).rows[0].pronto,1);pronto=true;break;}
      catch(e){if(!['ECONNREFUSED','ECONNRESET','EPIPE','ETIMEDOUT','57P03','57P01'].includes(e.code)&&!/^Connection terminated/.test(e.message))throw e;}
      finally{await c.end();}
      await new Promise(r=>setTimeout(r,100));
    }
    assert.ok(pronto,'Prontidão SQL não confirmada em 30s');
    sistema=docker(['exec',nome,'psql','-X','-At','-U','postgres','-d','postgres','-c','SELECT system_identifier::text FROM pg_control_system()']);
    assert.match(sistema,/^\d+$/);
    etapa='criar banco próprio';validarContainer(inspecionar(),{nome,nonce,imagem});
    const bootstrap=new Client(config);
    try{await bootstrap.connect();assert.equal((await bootstrap.query('SELECT current_database() AS banco')).rows[0].banco,'postgres');
      assert.equal((await bootstrap.query('SELECT system_identifier::text AS id FROM pg_control_system()')).rows[0].id,sistema,'TCP não pertence ao cluster do container');
      await bootstrap.query('CREATE DATABASE "'+banco+'"');
    }finally{await bootstrap.end();}
    pool=new Pool({...config,database:banco,max:8});pool.on('error',e=>{erroPool=e.code||'erro_sem_codigo';t.diagnostic('Pool local: '+erroPool);});
    const criador=await pool.connect();
    try{assert.equal((await criador.query('SELECT current_database() AS banco')).rows[0].banco,banco);
      await criador.query(`CREATE SCHEMA tt_ensaio; CREATE TABLE tt_ensaio.identidade(nonce uuid PRIMARY KEY,objetivo text NOT NULL);`);
      await criador.query('INSERT INTO tt_ensaio.identidade VALUES($1,$2)',[nonce,OBJETIVO]);
      await criador.query('GRANT USAGE ON SCHEMA tt_ensaio TO PUBLIC; GRANT SELECT ON tt_ensaio.identidade TO PUBLIC;');
    }finally{criador.release();}
    const conferir=async c=>validarBanco((await c.query(`SELECT current_database() AS banco,current_setting('server_version_num') AS versao,nonce::text,objetivo FROM tt_ensaio.identidade`)).rows[0],{banco,nonce});
    async function sessao(acao){
      validarContainer(inspecionar(),{nome,nonce,imagem});const c=await pool.connect();abertos.add(c);
      try{
        assert.equal((await c.query('SELECT system_identifier::text AS id FROM pg_control_system()')).rows[0].id,sistema,'Cluster local divergente');
        await conferir(c);
        const protegido={async query(sql,args){await conferir(c);return c.query(sql,args);}};
        return await acao(protegido);
      }finally{if(abertos.has(c)){try{await c.query('ROLLBACK');}finally{abertos.delete(c);c.release();}}}
    }
    const executar=(sql,args)=>sessao(c=>c.query(sql,args));
    async function como(papel,sql,args){
      assert.ok(['service_role','anon','authenticated'].includes(papel));
      return sessao(async c=>{await c.query('BEGIN ISOLATION LEVEL READ COMMITTED');await c.query('SET LOCAL ROLE '+papel);
        const r=await c.query(sql,args);await c.query('COMMIT');return r;});
    }
    const validar=async nomeEtapa=>{
      etapa='validar '+nomeEtapa;
      const tabela={base:'usuarios',contas:'contas_teste_imagens',A7:'eventos_criacao_admin',A10:'admin_perfis_auditoria',F8:'contratacoes'}[nomeEtapa];
      if(tabela)assert.equal((await executar('SELECT to_regclass($1) IS NOT NULL AS ok',['public.'+tabela])).rows[0].ok,true);
      if(nomeEtapa==='base')assert.equal((await executar("SELECT 'organizador'::public.usuarios_perfil_enum::text AS perfil")).rows[0].perfil,'organizador');
      if(['gestao-v1','capacidade-v3'].includes(nomeEtapa))assert.equal((await executar('SELECT public.eventos_capacidades_v1() AS v')).rows[0].v,nomeEtapa==='gestao-v1'?1:3);
      if(nomeEtapa==='A7')assert.equal((await como('service_role','SELECT public.admin_eventos_capacidades_v1() AS c')).rows[0].c.controleCapacidade,versao===3);
      if(nomeEtapa==='A10')assert.equal((await como('service_role','SELECT public.admin_perfis_capacidades_v1() AS v')).rows[0].v,1);
      if(nomeEtapa==='F8')assert.equal((await como('service_role','SELECT public.contratacoes_capacidades_v1() AS v')).rows[0].v,1);
      if(nomeEtapa==='avaliacao')assert.equal((await executar("SELECT to_regprocedure('public.avaliar_proposta(numeric,bigint,text)') IS NOT NULL AS ok")).rows[0].ok,true);
      t.diagnostic('Etapa v'+versao+' validada: '+nomeEtapa);
    };
    await aplicarEtapas(versao,async(sql,nome)=>{etapa='aplicacao '+nome;await executar(sql);},validar);
    etapa='cenarios';return {executar,como,sessao,versao};
  }catch(e){
    let estado='indisponivel',logs='';try{estado=inspecionar().State.Status;logs=docker(['logs','--tail','15',nome],true).replaceAll(senha,'[redigido]');}catch{}
    t.diagnostic(JSON.stringify({etapa,codigo:e.code||e.name,tentativas,decorridoMs:Date.now()-inicio,estado,logs}));
    throw Object.assign(Error('Ensaio local interrompido em '+etapa),{code:e.code||'ENSAIO_PREPARACAO'});
  }
}
module.exports={validarSocket,validarContainer,validarBanco,classificarErro,etapas,aplicarEtapas,criarAmbiente};
