'use strict';
// Execução explícita, única. Não inicia aplicação nem supervisor de limpeza.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {canonical,rowsHash}=require('./backup-postgres-isolado.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const root=path.join(__dirname,'../..'),file=path.join(__dirname,'../evidencias/eventos-capacidade-aplicacao-20261106.json');
async function executar(){
 assert.equal(process.argv[2],'--aplicar-autorizacao-20261106');assert.ok(!fs.existsSync(file),'EXECUCAO_JA_REGISTRADA_NAO_REPETIR');
 const pre=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidencias/eventos-capacidade-final-autorizado-20261106.json')));assert.ok(pre.aprovado);assert.ok(Date.now()-Date.parse(pre.coletadoEm)<15*60000);
 const sql=fs.readFileSync(path.join(root,'Banco de dados/eventos_capacidade.incremental.sql'),'utf8');assert.equal(sha(Buffer.from(sql)), 'e5fde4026e650955308e5063f7c07c3d61fbb1b0ae319f857e637534f0e0f20e');
 const env=require('dotenv').parse(fs.readFileSync(path.join(__dirname,'../.env'))),{c,pg}=require('./preflight-imagens-producao.cjs').configurar(env);
 const pool=require('../db-postgres.js').criarPoolPostgres(pg);let db,etapa='PREPARACAO';
 const out={projeto:pre.projeto,iniciadoEm:new Date().toISOString(),sha256:sha(Buffer.from(sql)),tentativas:0,commitConfirmado:false,validado:false};
 const save=()=>fs.writeFileSync(file,JSON.stringify(out,null,2)+'\n');
 async function snapshot(){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL timezone='UTC'; SET LOCAL statement_timeout='10s'");
  try{
   const verificacao=(await db.query(fs.readFileSync(path.join(root,'Banco de dados/eventos_capacidade.verificacao.sql'),'utf8'))).rows[0].verificacao;
   const tabelas=[];for(const t of pre.tabelas){assert.match(t.tabela,/^[a-z_]+$/);const expr=t.tabela==='eventos'?"to_jsonb(t)-'capacidade_maxima'":'to_jsonb(t)';const rows=(await db.query('SELECT '+expr+' AS row FROM public."'+t.tabela+'" t')).rows.map(x=>x.row);tabelas.push({tabela:t.tabela,quantidade:rows.length,sha256:rowsHash(rows)});}
   const objetos=(await db.query('SELECT to_jsonb(o) AS row FROM storage.objects o ORDER BY bucket_id,name')).rows.map(x=>x.row);
   const arquivos=[];for(const o of objetos){assert.ok(['perfil-fotos','perfil-capas'].includes(o.bucket_id));const r=await fetch(c.url+'/storage/v1/object/authenticated/'+encodeURIComponent(o.bucket_id)+'/'+o.name.split('/').map(encodeURIComponent).join('/'),{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{apikey:c.secretKey,Authorization:'Bearer '+c.secretKey}});assert.ok(r.ok,'STORAGE_LEITURA_RECUSADA');const b=Buffer.from(await r.arrayBuffer());assert.ok(b.length<=10485760);arquivos.push({identificador:sha(o.bucket_id+'/'+o.name),bytes:b.length,sha256:sha(b)});}
   return {verificacao,tabelas,storage:{quantidade:objetos.length,metadadosHash:rowsHash(objetos),arquivos}};
  }finally{await db.query('ROLLBACK');}
 }
 try{
  db=await pool.connect();assert.equal(db.connection.stream.authorized,true);out.tlsVerificado=true;
  const rest=await fetch(c.url+'/rest/v1/eventos?select=id&limit=0',{redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:c.secretKey,Authorization:'Bearer '+c.secretKey}});assert.ok(rest.ok&&rest.headers.get('sb-project-ref')===pre.projeto);await rest.arrayBuffer();
  out.antes=await snapshot();assert.equal(canonical(out.antes.verificacao),canonical(pre.verificacao),'SNAPSHOT_DIVERGENTE');assert.equal(canonical(out.antes.tabelas),canonical(pre.tabelas.map(({igual,...t})=>t)),'TABELAS_DIVERGENTES');assert.equal(out.antes.storage.quantidade,5);
  const activity=await db.query("SELECT count(*)::integer AS total FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND xact_start IS NOT NULL");assert.equal(activity.rows[0].total,0,'ATIVIDADE_EXTERNA');
  assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname,'../config/ativacao-eventos-imagens.json'))).ativo,false);
  etapa='APLICACAO_UNICA';out.tentativas=1;out.envioEm=new Date().toISOString();save();
  const results=await db.query(sql);assert.equal(results.at(-1).command,'COMMIT');out.commitConfirmado=true;out.commitEm=new Date().toISOString();save();
  etapa='VERIFICACAO_POSTERIOR';out.depois=await snapshot();const a=out.antes.verificacao,b=out.depois.verificacao;
  out.checks={};for(const k of ['integridade','estados','legados_com_metadados_iniciais','colunas_gestao','sequencias','seguranca_tabelas','chaves_estrangeiras','restricao_estados','indice_idempotencia'])out.checks[k]=canonical(a[k])===canonical(b[k]);
  Object.assign(out.checks,{todasTabelas:canonical(out.antes.tabelas)===canonical(out.depois.tabelas),storageIntacto:canonical(out.antes.storage)===canonical(out.depois.storage),hashEventos:a.etapa3.hash_eventos_sem_capacidade===b.etapa3.hash_eventos_sem_capacidade,marcador3:b.etapa3.versao_instalada===3,legadosSemLimite:Number(b.etapa3.sem_limite)===6&&Number(b.etapa3.capacidade_configurada)===0,semExcessos:Number(b.etapa3.duplicidades)===0&&Number(b.etapa3.acima_da_capacidade)===0,coluna:b.etapa3.coluna.length===1&&b.etapa3.coluna[0].tipo==='integer'&&b.etapa3.coluna[0].nula==='YES'&&b.etapa3.coluna[0].padrao===null,restricao:b.etapa3.restricao.length===1&&b.etapa3.restricao[0].validada,indice:b.etapa3.indice.length===1&&b.etapa3.indice[0].valido&&b.etapa3.indice[0].pronto,funcoes:b.funcoes.length===7&&b.funcoes.every(f=>!f.security_definer&&!f.anon&&!f.authenticated&&f.service_role&&!f.service_role_grant_option),triggers:b.triggers.length===3&&b.triggers.every(t=>t.habilitado==='O'),triggerInscricoes:b.triggers.some(t=>t.nome==='inscricoes_guardar_evento_v1'&&t.definicao.includes('INSERT OR UPDATE'))});
  await db.query('BEGIN READ ONLY; SET LOCAL ROLE service_role');try{out.provaServiceRole=(await db.query('SELECT public.eventos_capacidades_v1() AS marcador,public.eventos_vagas_v3(ARRAY[]::integer[]) AS vagas')).rows[0];}finally{await db.query('ROLLBACK');}
  out.checks.serviceRole=out.provaServiceRole.marcador===3&&canonical(out.provaServiceRole.vagas)==='[]';
  const p=await db.query(fs.readFileSync(path.join(root,'Banco de dados/eventos_capacidade.preflight.sql'),'utf8'));out.preflightDepois=p.filter(r=>r.fields.length).map(r=>({campos:r.fields.map(f=>f.name),linhas:r.rows}));
  out.etapa2=await require('./preflight-eventos-imagens.cjs').executar(env);out.checks.etapa2=out.etapa2.pronto;out.checks.uploadsDesativados=JSON.parse(fs.readFileSync(path.join(__dirname,'../config/ativacao-eventos-imagens.json'))).ativo===false;
  out.validado=Object.values(out.checks).every(Boolean);out.finalizadoEm=new Date().toISOString();save();assert.ok(out.validado,'DIVERGENCIA_POS_MIGRACAO');console.log(JSON.stringify({commitConfirmado:out.commitConfirmado,validado:out.validado,checks:out.checks,provaServiceRole:out.provaServiceRole,evidencia:path.basename(file)}));
 }catch(e){if(db)await db.query('ROLLBACK').catch(()=>{});out.falha={etapa,codigo:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'EXECUCAO_INTERROMPIDA'};if(out.tentativas){try{out.verificacaoAposFalha=(await db.query(fs.readFileSync(path.join(root,'Banco de dados/eventos_capacidade.verificacao.sql'),'utf8'))).rows[0].verificacao;}catch{out.estadoExigeInspecao=true;}}save();console.error(JSON.stringify({commitConfirmado:out.commitConfirmado,falha:out.falha,nenhumaRepeticao:true}));process.exitCode=1;
 }finally{if(db)db.release();await pool.end();}
}
executar().catch(e=>{console.error(JSON.stringify({falha:'GUARDA_INICIAL',codigo:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'RECUSADO'}));process.exitCode=1;});
