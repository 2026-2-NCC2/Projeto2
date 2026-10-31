"use strict";
// Auditoria pontual autorizada: somente SELECT/metadados em transacoes READ ONLY.
// Nao importa/executa orquestradores de delta, recovery, backups ou server.js.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {TABLES,validar}=require('./delta-cutover.cjs'),{catalogoSql}=require('./catalogo-backup.cjs'),{canonical}=require('./backup-postgres-isolado.cjs');
const root=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const envBytes=fs.readFileSync(path.join(root,'.env')),env=require('dotenv').parse(envBytes),state=require('../config/estado-supervisor.cjs').criarEstadoPrivado(),beforeState=state.ler();
const prior=JSON.parse(fs.readFileSync(path.join(root,'evidencias/janela-final-real-20261031.json'))),cpPath=path.join(prior.t0Directory,'checkpoint-t0.privado.json'),cpBytes=fs.readFileSync(cpPath),saved=JSON.parse(cpBytes),checkpoint=saved.checkpoint;
const columns=Object.fromEntries(TABLES.map(t=>[t,Object.keys(checkpoint.mysql[t][0]||checkpoint.supabase[t][0])]));
const cutoff=Math.min(...Object.values(checkpoint.capturas).map(x=>x.inicio));
const report={startedUtc:new Date().toISOString(),checkpointId:saved.checkpointId,checkpointCaptureUtc:Object.fromEntries(Object.entries(checkpoint.capturas).map(([k,x])=>[k,{start:new Date(x.inicio).toISOString(),end:new Date(x.fim).toISOString()}])),lastPreTransitionGateUpperBoundUtc:new Date(beforeState.transicao.preparadaEm).toISOString(),exactLastDeltaGateTimestampPersisted:false,auditConservativeStartUtc:new Date(cutoff).toISOString(),scope:'Oito dominios public do TrocaTicket e origem MySQL; metadados de auditoria/jobs/sessoes e processos locais',deltaOrchestratorExecuted:false,checkpointCreated:false,backupsGenerated:false,jwtRotated:false,recoveryExecuted:false,rawRowsPersisted:false,queries:[],gaps:[]};
const writeIntent=q=>/\b(insert|update|delete|replace|truncate|alter|drop|create|grant|revoke|call|copy)\b/i.test(q||'');
const errCode=e=>/^[A-Z0-9_]+$/.test(e?.code||'')?e.code:'AUDIT_READ_FAILED';
function diffRows(oldRows,newRows){
  const a=validar(oldRows,columns),b=validar(newRows,columns),out={};
  for(const t of TABLES){const old=new Map(a[t].map(r=>[r.id,r])),next=new Map(b[t].map(r=>[r.id,r]));out[t]={checkpointCount:a[t].length,currentCount:b[t].length,insertedIds:b[t].filter(r=>!old.has(r.id)).map(r=>Number(r.id)),deletedIds:a[t].filter(r=>!next.has(r.id)).map(r=>Number(r.id)),changed:b[t].filter(r=>old.has(r.id)&&canonical(r)!==canonical(old.get(r.id))).map(r=>({id:Number(r.id),fields:columns[t].filter(k=>r[k]!==old.get(r.id)[k])}))};}
  return {equal:canonical(a)===canonical(b),tables:out};
}
async function mysql(){
  assert.ok(['localhost','127.0.0.1','::1'].includes(env.DB_HOST));let db;
  try{
    db=await require('mysql2/promise').createConnection({host:env.DB_HOST,port:Number(env.DB_PORT||3306),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,charset:'utf8mb4',connectTimeout:7000});
    const q=(sql,args)=>db.query({sql,timeout:15000},args);
    await q("SET SESSION time_zone='+00:00'");await q('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await q('START TRANSACTION READ ONLY');
    const rows={},catalog={};for(const t of TABLES){[rows[t]]=await q('SELECT '+columns[t].map(k=>'CAST(`'+k+'` AS CHAR) AS `'+k+'`').join(',')+' FROM `'+t+'` ORDER BY id');const [ddl]=await q('SHOW CREATE TABLE `'+t+'`');catalog[t]=ddl[0]['Create Table'];}
    const [vars]=await q("SHOW VARIABLES WHERE Variable_name IN ('log_bin','general_log','general_log_file','log_output','slow_query_log','slow_query_log_file','event_scheduler','performance_schema')");const settings=Object.fromEntries(vars.map(r=>[r.Variable_name,r.Value]));
    const [plugins]=await q("SELECT PLUGIN_NAME,PLUGIN_STATUS FROM information_schema.PLUGINS WHERE PLUGIN_NAME LIKE '%AUDIT%'");
    const [jobs]=await q('SELECT EVENT_NAME,STATUS,LAST_EXECUTED FROM information_schema.EVENTS WHERE EVENT_SCHEMA=?',[env.DB_NAME]);
    const [clients]=await q("SELECT COMMAND,STATE,INFO FROM information_schema.PROCESSLIST WHERE ID<>CONNECTION_ID() AND COMMAND<>'Daemon'");
    const [trx]=await q('SELECT COUNT(*) AS total FROM information_schema.INNODB_TRX WHERE trx_mysql_thread_id<>CONNECTION_ID()');
    let binlogFiles=[];if(settings.log_bin==='ON'){const [logs]=await q('SHOW BINARY LOGS');binlogFiles=logs.map(l=>({name:l.Log_name,bytes:l.File_size}));}
    const fileLogs=[];for(const key of ['general_log_file','slow_query_log_file']){const file=settings[key];if(!file)continue;try{const s=fs.statSync(file);fileLogs.push({kind:key,exists:true,bytes:s.size,modifiedUtc:s.mtime.toISOString()});}catch{fileLogs.push({kind:key,exists:false});}}
    await q('COMMIT');
    return {readOnly:true,comparison:diffRows(checkpoint.mysql,rows),catalogEqual:canonical(catalog)===canonical(checkpoint.catalogos.mysql),logging:{binaryLog:settings.log_bin,generalLog:settings.general_log,logOutput:settings.log_output,slowQueryLog:settings.slow_query_log,auditPlugins:plugins,binlogFiles,fileLogs},scheduler:settings.event_scheduler,jobs:jobs.map(j=>({enabled:j.STATUS==='ENABLED',lastExecuted:j.LAST_EXECUTED})),otherClients:clients.map(c=>({command:c.COMMAND,state:c.STATE,possibleWriteActive:writeIntent(c.INFO)})),otherTransactions:Number(trx[0].total),historyComplete:false};
  }finally{if(db)await db.end();}
}
async function postgres(){
  assert.equal(env.PGUSER,'postgres.gnwybroqfvwosiqzsfla');assert.equal(env.PGDATABASE,'postgres');assert.equal(env.PGPORT,'5432');assert.match(env.PGHOST,/^[a-z0-9.-]+\.pooler\.supabase\.com$/);
  const ca=path.join(os.homedir(),'BackupsTrocaTicket/backup-20261031-e51f28697254468aa205e99c9a1fbe15/supabase-ca-2021.crt');
  const pool=require('../db-postgres.js').criarPoolPostgres({...env,PGSSLROOTCERT:ca,PGCONNECT_TIMEOUT_MS:'7000'});let db;
  try{
    db=await pool.connect();assert.ok(db.connection.stream.encrypted&&db.connection.stream.authorized);const q=(text,values)=>db.query({text,values,query_timeout:15000});
    await q('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await q("SET LOCAL timezone='UTC'");await q("SET LOCAL statement_timeout='15s'");
    const rows={};for(const t of TABLES){const fields=columns[t].map(k=>"'"+k+"',\""+k+'"::text').join(',');rows[t]=(await q('SELECT jsonb_build_object('+fields+') AS row FROM public."'+t+'" ORDER BY id')).rows.map(x=>x.row);}
    const catalog=(await q(catalogoSql)).rows[0].catalogo;
    const settings=(await q("SELECT name,setting FROM pg_settings WHERE name IN ('pgaudit.log','log_statement','log_min_duration_statement','logging_collector','log_destination','track_commit_timestamp','shared_preload_libraries') ORDER BY name")).rows;
    const extensions=(await q("SELECT extname FROM pg_extension WHERE extname IN ('pgaudit','pg_stat_statements','pg_cron','pg_net') ORDER BY extname")).rows.map(x=>x.extname);
    const auditTables=(await q("SELECT table_schema,table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema') AND (table_name ILIKE '%audit%' OR table_name ILIKE '%log%') ORDER BY table_schema,table_name")).rows;
    const clients=(await q("SELECT usename,state,xact_start,query FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'")).rows.map(x=>({role:x.usename,state:x.state,transactionOpen:x.xact_start!==null,possibleWriteActive:x.state==='active'&&writeIntent(x.query)}));
    const stats=(await q("SELECT relname,n_tup_ins::text,n_tup_upd::text,n_tup_del::text FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY relname")).rows;
    const statsReset=(await q('SELECT stats_reset FROM pg_stat_database WHERE datname=current_database()')).rows[0].stats_reset;
    const configured=(await q("SELECT to_regclass('cron.job') IS NOT NULL AS cron,to_regclass('cron.job_run_details') IS NOT NULL AS cron_history,to_regclass('net.http_request_queue') IS NOT NULL AS net,to_regclass('auth.audit_log_entries') IS NOT NULL AS auth_log")).rows[0];
    const jobs={configured};if(configured.cron)jobs.cron=(await q('SELECT jobid,active FROM cron.job')).rows;if(configured.cron_history)jobs.runsSinceCheckpoint=(await q('SELECT count(*)::text AS total FROM cron.job_run_details WHERE start_time >= $1',[new Date(cutoff).toISOString()])).rows[0].total;if(configured.net)jobs.httpQueue=(await q('SELECT count(*)::text AS total FROM net.http_request_queue')).rows[0].total;
    if(configured.auth_log)jobs.supabaseAuthAuditSinceCheckpoint=(await q('SELECT count(*)::text AS total FROM auth.audit_log_entries WHERE created_at >= $1',[new Date(cutoff).toISOString()])).rows[0].total;
    // Apenas metadados do log local. Nao exporta mensagens SQL, IPs ou parametros.
    const canLogs=(await q("SELECT has_function_privilege(current_user,'pg_catalog.pg_ls_logdir()','EXECUTE') AS permitted")).rows[0].permitted;
    let fileLogs={permitted:canLogs};if(canLogs){await q('SAVEPOINT log_probe');try{const logs=(await q('SELECT name,size,modification FROM pg_catalog.pg_ls_logdir() ORDER BY modification DESC LIMIT 10')).rows;fileLogs.files=logs;await q('RELEASE SAVEPOINT log_probe');}catch(e){await q('ROLLBACK TO SAVEPOINT log_probe');await q('RELEASE SAVEPOINT log_probe');fileLogs.errorCode=errCode(e);}}
    await q('COMMIT');return {readOnly:true,tlsVerified:true,comparison:diffRows(checkpoint.supabase,rows),catalogEqual:canonical(catalog)===canonical(checkpoint.catalogos.supabase),settings,extensions,auditTables,clients,statsReset,tableCounters:stats,counterBaselineAtCheckpointAvailable:false,jobs,fileLogs,restGatewayHistoryAvailableViaThisConnection:false,historyComplete:false};
  }finally{if(db)db.release();await pool.end();}
}
async function local(){const helper=require('./helper-powershell.cjs').executarHelper;const proof=JSON.parse((await helper('processo-recuperacao.ps1',['-PidAlvo',String(beforeState.transicao.pidDestino)])).toString());const inv=JSON.parse((await helper('inventario-janela-real.ps1')).toString().replace(/^\uFEFF/,''));const res=await fetch('http://127.0.0.1:3001/perfil',{headers:{connection:'close'},signal:AbortSignal.timeout(3000)});await res.arrayBuffer();const known=new Set([process.pid,beforeState.transicao.pidDestino,proof.parentPid]);return {...inv,knownParentPid:proof.parentPid,unattributedProcesses:inv.processes.filter(p=>!['CODEX_MCP','MYSQL_LOCAL'].includes(p.category)&&!known.has(p.pid)),maintenanceStatus:res.status,historicalProcessInventoryComplete:false};}
async function main(){
  assert.equal(process.argv[2],'--somente-leitura');assert.equal(saved.checkpointId,beforeState.transicao.checkpointId);assert.equal(beforeState.transicao.configuracaoHash,require('../config/startup-controlado.cjs').fingerprint(env));
  const results=await Promise.allSettled([mysql(),postgres(),local()]);for(const [i,k] of ['mysql','supabase','local'].entries())report[k]=results[i].status==='fulfilled'?results[i].value:{errorCode:errCode(results[i].reason)};
  report.finishedUtc=new Date().toISOString();report.stateUnchanged=sha(JSON.stringify(beforeState))===sha(JSON.stringify(state.ler()));report.environmentUnchanged=sha(envBytes)===sha(fs.readFileSync(path.join(root,'.env')));report.checkpointUnchanged=sha(cpBytes)===sha(fs.readFileSync(cpPath));
  report.currentRowsMatchCheckpoint=report.mysql.comparison?.equal===true&&report.supabase.comparison?.equal===true;
  report.historicalAbsenceOfWritesProven=false;
  report.gaps=['Snapshots iguais nao excluem alteracoes revertidas, tentativas, rollback de transacoes ou operacoes fora dos oito dominios.','Nao ha trilha historica completa e correlacionada de SQL/REST/jobs/processos fornecida nesta janela.','Metadados/counters atuais sem baseline nao comprovam ausencia historica de escritas.','Historico completo do gateway REST/Supabase Logs nao foi disponibilizado via conexao SQL.'];
  report.normalOperationApproved=false;report.recoveryApproved=false;
  fs.writeFileSync(path.join(root,'evidencias/auditoria-continuidade-leitura-20261031.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:'AUDITORIA_CONCLUIDA',currentRowsMatchCheckpoint:report.currentRowsMatchCheckpoint,historicalAbsenceOfWritesProven:false,mysqlError:report.mysql.errorCode,supabaseError:report.supabase.errorCode,localError:report.local.errorCode,stateUnchanged:report.stateUnchanged,environmentUnchanged:report.environmentUnchanged,checkpointUnchanged:report.checkpointUnchanged}));
}
main().catch(e=>{console.log(JSON.stringify({status:'AUDITORIA_INTERROMPIDA',code:errCode(e)}));process.exitCode=1;});
