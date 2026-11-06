'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {canonical,rowsHash}=require('./backup-postgres-isolado.cjs');
const {catalogoSql}=require('./catalogo-backup.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
async function executar(){
 const root=path.join(__dirname,'../..'),dest='C:\\Users\\Lucas\\BackupsTrocaTicket\\backup-etapa3-20261105';
 const old=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidencias/eventos-capacidade-janela-20261105-183fb0bf-cac8-4f79-88a6-c4128e2b9a24.json')));
 const out={projeto:old.projeto,coletadoEm:new Date().toISOString(),somenteLeitura:true,backup:{},sql:{},checks:{}};
 for(const [f,h] of Object.entries({'banco-completo.dump':'55774f5a08fe0fef8f0cbf217af408e3efc8d951c6ed1a852558e994b11cdcc6','roles-sem-senhas.sql':'2ff69ca03533f1a631341d7cd4433e9edb9e34961d6accef7d9c2351946292ea','manifesto.json':'2427320df0fd10a8d79a43beb8522c401c4c4d124892fc0a02f4963d23818ab0','storage-arquivos-nao-incluidos.json':'b8ba3e688e140c392b9a0fab948760cc327791cde5b8c00d832549c57b4dc845'})){
  out.backup[f]=sha(fs.readFileSync(path.join(dest,f)))===h;assert.ok(out.backup[f],'BACKUP_DIVERGENTE');
 }
 for(const f of ['eventos_capacidade.incremental.sql','eventos_capacidade.preflight.sql','eventos_capacidade.verificacao.sql']){out.sql[f]=sha(fs.readFileSync(path.join(root,'Banco de dados',f)));assert.equal(out.sql[f],old.sha256[f],'SQL_DIVERGENTE');}
 const env=require('dotenv').parse(fs.readFileSync(path.join(__dirname,'../.env'))),{c,pg}=require('./preflight-imagens-producao.cjs').configurar(env);
 const r=await fetch(c.url+'/rest/v1/eventos?select=id&limit=0',{redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:c.secretKey,Authorization:'Bearer '+c.secretKey}});assert.ok(r.ok&&r.headers.get('sb-project-ref')===out.projeto,'PROJETO_RECUSADO');await r.arrayBuffer();
 const pool=require('../db-postgres.js').criarPoolPostgres(pg,{queryTimeoutMs:30000});let db;
 try{
 db=await pool.connect();assert.equal(db.connection.stream.authorized,true);out.tlsVerificado=true;
 const p=await db.query(fs.readFileSync(path.join(root,'Banco de dados/eventos_capacidade.preflight.sql'),'utf8'));out.preflight=p.filter(x=>x.fields.length).map(x=>({campos:x.fields.map(x=>x.name),linhas:x.rows}));
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL timezone='UTC'; SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='2s'");
 out.verificacao=(await db.query(fs.readFileSync(path.join(root,'Banco de dados/eventos_capacidade.verificacao.sql'),'utf8'))).rows[0].verificacao;
 for(const k of ['integridade','estados','legados_com_metadados_iniciais','colunas_gestao','sequencias','seguranca_tabelas','chaves_estrangeiras','funcoes','triggers','restricao_estados','indice_idempotencia','etapa3'])out.checks[k]=canonical(out.verificacao[k])===canonical(old.verificacao[k]);
 out.catalogo=(await db.query(catalogoSql)).rows[0].catalogo;
 const manifest=JSON.parse(fs.readFileSync(path.join(dest,'manifesto.json')));
 out.catalogoChecks=Object.fromEntries(Object.entries(out.catalogo).map(([k,v])=>[k,sha(canonical(v))===manifest.catalogo[k].sha256]));delete out.catalogo;
 out.tabelas=[];
 for(const t of old.extras.publicHashes){const name=t.tabela;assert.match(name,/^[a-z_]+$/);const rows=(await db.query('SELECT to_jsonb(t) AS row FROM public."'+name+'" t')).rows.map(x=>x.row);out.tabelas.push({tabela:name,quantidade:rows.length,sha256:rowsHash(rows),igual:rows.length===t.quantidade&&rowsHash(rows)===t.sha256});}
 out.atividade=(await db.query("SELECT backend_type,usename,application_name,state,count(*)::integer AS sessoes,count(xact_start)::integer AS transacoes FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() GROUP BY 1,2,3,4 ORDER BY 1,2,3,4")).rows;
 out.locks=(await db.query("SELECT mode,granted,count(*)::integer AS total FROM pg_locks WHERE pid<>pg_backend_pid() AND relation IN ('public.eventos'::regclass,'public.inscricoes'::regclass) GROUP BY 1,2")).rows;
 out.limpeza=(await db.query("SELECT count(*)::integer AS registros,count(*) FILTER(WHERE lease_ate>clock_timestamp())::integer AS leases,count(*) FILTER(WHERE estado='limpeza' AND limpeza_apos<=clock_timestamp())::integer AS vencidas FROM public.perfil_imagens_objetos")).rows[0];
 await db.query('ROLLBACK');
 out.etapa2=await require('./preflight-eventos-imagens.cjs').executar(env);
 out.uploadsDesativados=JSON.parse(fs.readFileSync(path.join(__dirname,'../config/ativacao-eventos-imagens.json'))).ativo===false;
 out.filaPendenteAutorizada=true;
 out.aprovado=Object.values(out.checks).every(Boolean)&&Object.values(out.catalogoChecks).every(Boolean)&&out.tabelas.every(x=>x.igual)&&out.atividade.every(x=>x.transacoes===0)&&out.locks.length===0&&out.limpeza.leases===0&&out.limpeza.registros===5&&out.limpeza.vencidas===5&&out.etapa2.pronto&&out.uploadsDesativados;
 const file=path.join(__dirname,'../evidencias/eventos-capacidade-final-autorizado-20261106.json');fs.writeFileSync(file,JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify({aprovado:out.aprovado,checks:out.checks,catalogoChecks:out.catalogoChecks,backup:out.backup,tabelas:out.tabelas.map(x=>({tabela:x.tabela,igual:x.igual})),atividade:out.atividade,locks:out.locks,limpeza:out.limpeza,etapa2:out.etapa2.pronto,uploadsDesativados:out.uploadsDesativados,evidencia:path.basename(file)}));if(!out.aprovado)process.exitCode=1;
 }finally{if(db){await db.query('ROLLBACK').catch(()=>{});db.release();}await pool.end();}
}
executar().catch(e=>{console.error(JSON.stringify({aprovado:false,codigo:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'VERIFICACAO_INTERROMPIDA'}));process.exitCode=1;});
