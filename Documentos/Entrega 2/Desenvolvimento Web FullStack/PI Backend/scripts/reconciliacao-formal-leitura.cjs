"use strict";
// Parecer de leitura. Nao importa controlador, recuperacao, server ou executor de delta.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {TABLES,validar,fingerprint}=require('./delta-cutover.cjs'),{criarColetorReadOnly}=require('./coletar-delta-readonly.cjs'),{executarHelper}=require('./helper-powershell.cjs');
const root=path.resolve(__dirname,'..'),sha=x=>crypto.createHash('sha256').update(x).digest('hex'),output=path.join(root,'evidencias','reconciliacao-formal-leitura-'+crypto.randomUUID()+'.json');
const report={startedUtc:new Date().toISOString(),status:'EM_VALIDACAO',readOnly:true,historicalAbsenceOfWritesProven:false,historicalGapExplicitlyAcknowledged:true,scope:'Oito dominios do TrocaTicket; controle operacional local conforme declaracao do proprietario e autorizacao desta janela',recoveryExecuted:false,maintenanceReleased:false,deltaOrchestratorExecuted:false,backupsGenerated:false,checkpointCreated:false,jwtRotated:false,dataWrites:false,rollbackExecuted:false,commitsCreated:false,checks:[]};
let env,state,baseline,cp,checkpointBytes,checkpointPath,envBytes,oldState,ca,columns;
const safe=e=>/^[A-Z0-9_]+$/.test(e?.code||'')?e.code:'VALIDACAO_RECUSADA';
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
function stage(s){report.stage=s;save();console.log(JSON.stringify({stage:s}));}
function check(x,name){assert.ok(x,name);report.checks.push(name);}
async function local(){
  const proof=JSON.parse((await executarHelper('processo-recuperacao.ps1',['-PidAlvo',String(require('../config/identidade-supervisor.cjs').identidadeSupervisor(oldState).pid)])).toString());
  const inventory=JSON.parse((await executarHelper('inventario-janela-real.ps1')).toString().replace(/^\uFEFF/,''));
  const known=new Set([process.pid,proof.pid,proof.parentPid]);
  assert.equal(inventory.tasks.length,0,'TAREFA_NAO_AUTORIZADA');assert.ok(inventory.processes.every(p=>['MYSQL_LOCAL','CODEX_MCP'].includes(p.category)||known.has(p.pid)),'PROCESSO_NAO_AUTORIZADO');
  assert.ok(proof.entradaConhecida&&proof.portaExclusivaLocal);assert.ok(inventory.listeners.length===1&&inventory.listeners[0].pid===proof.pid&&inventory.listeners[0].port===3001);
  const res=await fetch('http://127.0.0.1:3001/perfil',{headers:{connection:'close'},signal:AbortSignal.timeout(3000)});await res.arrayBuffer();assert.equal(res.status,503);
  return {capturedUtc:new Date().toISOString(),knownBackend:proof,processCount:inventory.processes.length,unknownProcessCount:0,tasks:0,mysqlClientPids:inventory.mysqlClients.map(c=>c.pid),httpStatus:res.status};
}
async function clients(){
  let my,pool,pg;const out={capturedUtc:new Date().toISOString()};
  try{
    my=await require('mysql2/promise').createConnection({host:env.DB_HOST,port:Number(env.DB_PORT||3306),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,connectTimeout:7000});
    const q=(sql,args)=>my.query({sql,timeout:15000},args);await q('SET SESSION TRANSACTION READ ONLY');await q('START TRANSACTION READ ONLY');
    const [rows]=await q("SELECT ID,COMMAND FROM information_schema.PROCESSLIST WHERE ID<>CONNECTION_ID() AND COMMAND<>'Daemon'");const [trx]=await q('SELECT count(*) AS total FROM information_schema.INNODB_TRX WHERE trx_mysql_thread_id<>CONNECTION_ID()');const [events]=await q('SELECT COUNT(*) AS total FROM information_schema.EVENTS WHERE STATUS=?',['ENABLED']);const [scheduler]=await q("SHOW VARIABLES LIKE 'event_scheduler'");
    assert.equal(rows.length,0,'CLIENTE_MYSQL_NAO_CONTROLADO');assert.equal(Number(trx[0].total),0);assert.equal(Number(events[0].total),0);assert.equal(scheduler[0].Value,'OFF');
    out.mysql={otherClients:0,otherTransactions:0,enabledJobs:0,scheduler:'OFF'};await q('COMMIT');await my.end();my=null;
    pool=require('../db-postgres.js').criarPoolPostgres({...env,PGSSLROOTCERT:ca,PGCONNECT_TIMEOUT_MS:'7000'});pg=await pool.connect();assert.ok(pg.connection.stream.encrypted&&pg.connection.stream.authorized);
    await pg.query('BEGIN READ ONLY');await pg.query("SET LOCAL statement_timeout='15s'");
    const sessions=(await pg.query("SELECT usename,state,xact_start IS NOT NULL AS transaction_open FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'")).rows;
    const allowed=new Set(['supabase_admin','pgbouncer','authenticator','supabase_auth_admin','supabase_storage_admin','supabase_realtime_admin']);
    assert.ok(sessions.every(s=>allowed.has(s.usename)&&s.state==='idle'&&!s.transaction_open),'SESSAO_PG_NAO_CONTROLADA');
    const jobs=(await pg.query("SELECT to_regclass('cron.job') IS NOT NULL AS cron,to_regclass('net.http_request_queue') IS NOT NULL AS net")).rows[0];
    let activeCron=0,queue=0;if(jobs.cron)activeCron=Number((await pg.query('SELECT count(*) AS total FROM cron.job WHERE active')).rows[0].total);if(jobs.net)queue=Number((await pg.query('SELECT count(*) AS total FROM net.http_request_queue')).rows[0].total);
    assert.equal(activeCron,0);assert.equal(queue,0);out.supabase={sessions,activeCron,httpQueue:queue,tlsVerified:true};await pg.query('COMMIT');return out;
  }finally{if(my)await my.end();if(pg)pg.release();if(pool)await pool.end();}
}
function summarize(current){
  const my=validar(current.mysql,columns),pg=validar(current.supabase,columns),expectedMy=validar(cp.mysql,columns),expectedPg=validar(cp.supabase,columns);
  const counts={},extras={};let shared=0;
  for(const t of TABLES){const map=new Map(pg[t].map(r=>[r.id,r])),expectedExtra=expectedPg[t].filter(r=>!expectedMy[t].some(s=>s.id===r.id)).map(r=>Number(r.id));
    for(const r of my[t]){assert.deepEqual(map.get(r.id),r,'DIVERGENCIA_ENTRE_PROVEDORES');shared++;}
    extras[t]=pg[t].filter(r=>!my[t].some(s=>s.id===r.id)).map(r=>Number(r.id));assert.deepEqual(extras[t],expectedExtra,'ADICIONAIS_DIVERGENTES');counts[t]={mysql:my[t].length,supabase:pg[t].length};
  }
  assert.equal(fingerprint(my),fingerprint(expectedMy),'ORIGEM_DIVERGE_CHECKPOINT');assert.equal(fingerprint(pg),fingerprint(expectedPg),'DESTINO_DIVERGE_CHECKPOINT');
  assert.equal(Object.values(extras).reduce((n,a)=>n+a.length,0),10);
  for(const users of [my.usuarios,pg.usuarios]){assert.ok(users.every(u=>['admin','organizador','fornecedor','participante'].includes(u.perfil)),'PERFIL_INVALIDO');assert.ok(users.every(u=>/^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(u.senha)),'HASH_INVALIDO');}
  return {counts,additionalIds:extras,additionalRecordsPreserved:10,sharedRecordsIdentical:shared,identitiesProfilesAndPasswordHashesEqual:true,uniqueIdsAndEmails:true,foreignKeysValid:true,allPersistedFieldsEqual:true,mysqlRows:my.usuarios.length+TABLES.filter(t=>t!=='usuarios').reduce((n,t)=>n+my[t].length,0),supabaseRows:TABLES.reduce((n,t)=>n+pg[t].length,0)};
}
async function main(){
  assert.equal(process.argv[2],'--somente-leitura');stage('referencias_privadas');envBytes=fs.readFileSync(path.join(root,'.env'));env=require('dotenv').parse(envBytes);state=require('../config/estado-supervisor.cjs').criarEstadoPrivado();oldState=state.ler();check(oldState.congelado&&oldState.selado&&oldState.transicao.fase==='INCERTA'&&!oldState.transicao.recuperacao,'manutencao persistida e nenhuma recuperacao iniciada');
  baseline=JSON.parse(fs.readFileSync(path.join(root,'evidencias/janela-final-real-20261031.json')));checkpointPath=path.join(baseline.t0Directory,'checkpoint-t0.privado.json');checkpointBytes=fs.readFileSync(checkpointPath);const saved=JSON.parse(checkpointBytes);cp=saved.checkpoint;
  assert.equal(saved.checkpointId,oldState.transicao.checkpointId);assert.equal(saved.checkpointId,baseline.checkpointId);report.schemaVersion=2;report.run=baseline.run;report.janelaId=oldState.transicao.id;report.configuracaoHash=oldState.transicao.configuracaoHash;report.estadoSha256=sha(JSON.stringify(oldState));report.checkpointId=saved.checkpointId;report.checkpointSha256=sha(checkpointBytes);const identity=require('../config/identidade-supervisor.cjs').identidadeSupervisor(oldState);report.currentSupervisorIdentity=identity;report.readmissionObserved=identity.tipo==='RESTABELECIDO_SELADO';
  assert.equal(oldState.transicao.configuracaoHash,require('../config/startup-controlado.cjs').fingerprint(env));
  require('./backups-t0.cjs').validarArtefatosT0(saved.backups);report.existingBackupIntegrityVerified=true;
  columns=Object.fromEntries(TABLES.map(t=>[t,Object.keys(cp.mysql[t][0]||cp.supabase[t][0])]));ca=path.join(os.homedir(),'BackupsTrocaTicket/backup-20261031-e51f28697254468aa205e99c9a1fbe15/supabase-ca-2021.crt');
  stage('escritores_antes');report.writersBefore={local:await local(),database:await clients()};
  const collect=criarColetorReadOnly(env,columns,cp.catalogos,ca);
  stage('comparacao_formal');const first=await collect({projeto:'gnwybroqfvwosiqzsfla',somenteLeitura:true});report.comparison=summarize(first);report.firstCapture=first.capturas;
  stage('estabilidade_e_escritores_depois');const second=await collect({projeto:'gnwybroqfvwosiqzsfla',somenteLeitura:true});assert.deepEqual(summarize(second),report.comparison);report.secondCapture=second.capturas;
  check(fingerprint(validar(first.mysql,columns))===fingerprint(validar(second.mysql,columns))&&fingerprint(validar(first.supabase,columns))===fingerprint(validar(second.supabase,columns)),'duas capturas consistentes com o checkpoint, sem mudanca observada');report.dataHashes=require('./gate-reconciliacao-recuperacao.cjs').resumo(cp,second,columns).hashes;
  report.writersAfter={database:await clients(),local:await local()};assert.deepEqual(report.writersAfter.local.knownBackend,report.writersBefore.local.knownBackend);
  check(report.writersBefore.local.mysqlClientPids.length===0&&report.writersAfter.local.mysqlClientPids.length===0,'nenhum cliente local MySQL adicional observado');
  check(sha(JSON.stringify(oldState))===sha(JSON.stringify(state.ler())),'estado do supervisor inalterado');check(sha(envBytes)===sha(fs.readFileSync(path.join(root,'.env'))),'JWT e configuracao inalterados');check(sha(checkpointBytes)===sha(fs.readFileSync(checkpointPath)),'checkpoint original inalterado');
  require('./backups-t0.cjs').validarArtefatosT0(saved.backups);check(true,'artefatos dos backups existentes preservados');
  report.currentOperationalWriterControlConfirmed=true;report.databaseEnforcedGlobalWriteLock=false;report.catalogsMatchCheckpoint=true;report.crossDatabaseSnapshotAtomic=false;
  report.residualRisks=['Ausencia historica de escritas NAO comprovada e nao inferida desta reconciliacao.','Controle operacional e observacoes antes/depois nao equivalem a revogacao global de SQL/REST; a janela exclusiva deve continuar.','Capturas por provedor sao independentes, sem transacao distribuida.','Admissao selada nao resolve INCERTA nem libera leitura ou escrita.','Smoke final e liberacao normal permanecem pendentes e exigem autorizacao.'];
  report.status='RECONCILIACAO_ATUAL_APROVADA';report.opinion='FAVORAVEL_CONDICIONADO_PARA_DECISAO_DE_RECUPERACAO';report.liveRecoveryGateUpdated=true;report.normalOperationApproved=false;report.finishedUtc=new Date().toISOString();save();console.log(JSON.stringify({status:report.status,evidenceFile:output,mysqlRows:report.comparison.mysqlRows,supabaseRows:report.comparison.supabaseRows,additionalPreserved:10,historicalAbsenceOfWritesProven:false,maintenanceStatus:503,recoveryExecuted:false}));
}
main().catch(e=>{report.status='INTERROMPIDA';report.failure={stage:report.stage,code:safe(e)};report.finishedUtc=new Date().toISOString();save();console.log(JSON.stringify({status:report.status,failure:report.failure,recoveryExecuted:false}));process.exitCode=1;});
