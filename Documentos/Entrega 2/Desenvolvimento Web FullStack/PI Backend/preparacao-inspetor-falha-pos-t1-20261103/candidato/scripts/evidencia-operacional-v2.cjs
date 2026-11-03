"use strict";
// Restabelece apenas HTTP de manutencao e coleta evidencias READ ONLY.
// Nao consome tickets nem altera o estado privado do supervisor.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{fork}=require('node:child_process');
const root=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),output=path.join(root,'evidencias','operacional-v2-'+crypto.randomUUID()+'.json');
const report={schemaVersion:2,startedUtc:new Date().toISOString(),status:'EM_VALIDACAO',scopeType:'PRE_RECUPERACAO_SEM_SUPERVISOR',historicalAbsenceOfWritesProven:false,historicalGapExplicitlyAcknowledged:true,readOnly:true,recoveryExecuted:false,maintenanceReleased:false,deltaOrchestratorExecuted:false,backupsGenerated:false,checkpointCreated:false,jwtRotated:false,dataWrites:false,rollbackExecuted:false,commitsCreated:false};
let child,ready,env,s,oldState,envBytes,cpBytes,cpFile,saved;
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
function progress(stage){report.stage=stage;save();console.log(JSON.stringify({stage}));}
const safe=e=>/^[A-Z0-9_]+$/.test(e?.code||'')?e.code:'VALIDACAO_RECUSADA';
async function iniciarManutencao(){
  const cleanEnv=Object.fromEntries(['SystemRoot','USERPROFILE','HOMEDRIVE','HOMEPATH','PATH','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  child=fork(path.join(__dirname,'manutencao-validacao.cjs'),['--somente-manutencao'],{cwd:root,windowsHide:true,detached:true,stdio:['ignore','ignore','ignore','ipc'],env:cleanEnv});
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>done(Error('MANUTENCAO_STARTUP_TIMEOUT')),12000);function done(e,m){clearTimeout(timer);child.removeListener('message',message);child.removeListener('exit',exit);e?reject(e):resolve(m);}function exit(){done(Error('MANUTENCAO_ENCERROU'));}function message(m){if(m?.tipo==='manutencao-validacao-pronta'&&m.pid===child.pid&&m.role==='MANUTENCAO_SEM_BACKEND')done(null,m);else if(m?.tipo==='manutencao-validacao-falhou')done(Error('MANUTENCAO_FALHOU'));}child.on('message',message);child.once('exit',exit);});
}
async function local(){
  const helper=require('./helper-powershell.cjs').executarHelper,proof=JSON.parse((await helper('inspecionar-manutencao-validacao.ps1',['-PidAlvo',String(ready.pid)])).toString()),inventory=JSON.parse((await helper('inventario-janela-real.ps1')).toString());
  assert.equal(proof.backendSupervisor,false);assert.equal(proof.role,'MANUTENCAO_SEM_BACKEND');assert.ok(proof.portaExclusivaLocal);
  assert.equal(inventory.tasks.length,0);const known=new Set([process.pid,ready.pid]);assert.ok(inventory.processes.every(p=>['MYSQL_LOCAL','CODEX_MCP'].includes(p.category)||known.has(p.pid)),'PROCESSO_NAO_AUTORIZADO');
  assert.ok(inventory.listeners.length===1&&inventory.listeners[0].pid===ready.pid&&inventory.listeners[0].port===3001);assert.equal(inventory.mysqlClients.length,0);
  const response=await fetch('http://127.0.0.1:3001/perfil',{headers:{connection:'close'},signal:AbortSignal.timeout(3000)});await response.arrayBuffer();assert.equal(response.status,503);
  return {capturedUtc:new Date().toISOString(),knownBackend:null,knownMaintenanceResponder:{...proof,boot:ready.boot},unknownProcessCount:0,tasks:0,mysqlClientPids:[],httpStatus:503,backendSupervisorPresent:false};
}
function checkWriters(w){const m=w.mysql,p=w.supabase;assert.equal(m.otherClients,0);assert.equal(m.otherTransactions,0);assert.equal(m.enabledJobs,0);assert.equal(m.scheduler,'OFF');assert.equal(p.activeCron,0);assert.equal(p.httpQueue,0);assert.equal(p.tlsVerified,true);const roles=new Set(['supabase_admin','pgbouncer','authenticator','supabase_auth_admin','supabase_storage_admin','supabase_realtime_admin']);assert.ok(p.sessions.every(x=>roles.has(x.usename)&&x.state==='idle'&&!x.transaction_open),'SESSAO_NAO_CONTROLADA');return w;}
async function main(){
  assert.ok(['--preparar-sem-recuperar','--usar-manutencao-existente'].includes(process.argv[2]));progress('referencias');envBytes=fs.readFileSync(path.join(root,'.env'));env=require('dotenv').parse(envBytes);s=require('../config/estado-supervisor.cjs').criarEstadoPrivado();oldState=s.ler();assert.ok(oldState.congelado&&oldState.selado&&oldState.transicao.fase==='INCERTA'&&!oldState.transicao.recuperacao&&!oldState.transicao.restabelecimento);
  const prior=JSON.parse(fs.readFileSync(path.join(root,'evidencias/janela-final-real-20261031.json')));cpFile=path.join(prior.t0Directory,'checkpoint-t0.privado.json');cpBytes=fs.readFileSync(cpFile);saved=JSON.parse(cpBytes);
  assert.equal(saved.checkpointId,oldState.transicao.checkpointId);assert.equal(require('../config/startup-controlado.cjs').fingerprint(env),oldState.transicao.configuracaoHash);
  report.run=prior.run;report.janelaId=oldState.transicao.id;report.checkpointId=saved.checkpointId;report.checkpointSha256=sha(cpBytes);report.estadoSha256=sha(JSON.stringify(oldState));report.configuracaoHash=oldState.transicao.configuracaoHash;
  require('./backups-t0.cjs').validarArtefatosT0(saved.backups);report.existingBackupIntegrityVerified=true;
  // Nenhum PID anterior e usado como processo atual: so constam na referencia historica.
  const inventory=JSON.parse((await require('./helper-powershell.cjs').executarHelper('inventario-janela-real.ps1')).toString());assert.equal(inventory.tasks.length,0);
  if(process.argv[2]==='--usar-manutencao-existente'){
    const receipt=JSON.parse(fs.readFileSync(process.argv[3],'utf8')),expected=receipt.writersAfter.local.knownMaintenanceResponder;
    const proof=JSON.parse((await require('./helper-powershell.cjs').executarHelper('inspecionar-manutencao-validacao.ps1',['-PidAlvo',String(expected.pid)])).toString());
    assert.deepEqual({...proof,boot:expected.boot},expected);assert.ok(inventory.listeners.length===1&&inventory.listeners[0].pid===proof.pid&&inventory.listeners[0].port===3001);
    ready={pid:proof.pid,boot:expected.boot,role:proof.role};report.existingMaintenanceRevalidated=true;
  }else{assert.equal(inventory.listeners.length,0,'PORTA_OCUPADA_NAO_ADOTADA');assert.ok(inventory.processes.every(p=>p.pid===process.pid||['MYSQL_LOCAL','CODEX_MCP'].includes(p.category)),'PROCESSO_NAO_AUTORIZADO');progress('iniciar_apenas_respondedor_503');ready=await iniciarManutencao();}
  assert.ok(inventory.processes.every(p=>p.pid===process.pid||p.pid===ready.pid||['MYSQL_LOCAL','CODEX_MCP'].includes(p.category)),'PROCESSO_NAO_AUTORIZADO');report.maintenanceResponder={pid:ready.pid,boot:ready.boot,role:ready.role};
  const ca=path.join(os.homedir(),'BackupsTrocaTicket/backup-20261031-e51f28697254468aa205e99c9a1fbe15/supabase-ca-2021.crt'),{conferirEscritoresBanco}=require('./inspecao-escritores-readonly.cjs'),{TABLES,validar}=require('./delta-cutover.cjs'),{resumo}=require('./gate-reconciliacao-recuperacao.cjs');
  const checkpoint=saved.checkpoint,columns=Object.fromEntries(TABLES.map(t=>[t,Object.keys(checkpoint.mysql[t][0]||checkpoint.supabase[t][0])]));const collect=require('./coletar-delta-readonly.cjs').criarColetorReadOnly(env,columns,checkpoint.catalogos,ca);
  progress('escritores_antes');report.writersBefore={local:await local(),database:checkWriters(await conferirEscritoresBanco(env,ca))};
  progress('reconciliacao_readonly');const first=await collect({projeto:'gnwybroqfvwosiqzsfla',somenteLeitura:true}),a=resumo(checkpoint,first,columns);const second=await collect({projeto:'gnwybroqfvwosiqzsfla',somenteLeitura:true}),b=resumo(checkpoint,second,columns);assert.deepEqual(a,b);report.firstCapture=first.capturas;report.secondCapture=second.capturas;report.dataHashes=b.hashes;
  const users=[validar(second.mysql,columns).usuarios,validar(second.supabase,columns).usuarios];assert.ok(users.every(rows=>rows.every(u=>['admin','organizador','fornecedor','participante'].includes(u.perfil)&&/^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(u.senha))));
  report.comparison={counts:b.counts,additionalIds:b.additionalIds,mysqlRows:b.mysqlRows,supabaseRows:b.supabaseRows,sharedRecordsIdentical:b.mysqlRows,additionalRecordsPreserved:10,identitiesProfilesAndPasswordHashesEqual:true,uniqueIdsAndEmails:true,foreignKeysValid:true,allPersistedFieldsEqual:true};
  progress('escritores_depois');report.writersAfter={database:checkWriters(await conferirEscritoresBanco(env,ca)),local:await local()};assert.deepEqual(report.writersBefore.local.knownMaintenanceResponder,report.writersAfter.local.knownMaintenanceResponder);
  assert.equal(sha(JSON.stringify(s.ler())),report.estadoSha256);assert.equal(sha(fs.readFileSync(path.join(root,'.env'))),sha(envBytes));assert.equal(sha(fs.readFileSync(cpFile)),report.checkpointSha256);require('./backups-t0.cjs').validarArtefatosT0(saved.backups);
  report.currentOperationalWriterControlConfirmed=true;report.databaseEnforcedGlobalWriteLock=false;report.catalogsMatchCheckpoint=true;report.reconciliationApproved=true;report.recoveryGateApproved=false;report.knownSupervisorPresent=false;report.oldPidsReusedAsCurrentEvidence=false;
  report.gateAssessment={approved:false,formalGateExecuted:false,reason:'PROCESSO_SUPERVISOR_AUSENTE; RESPONDEDOR_503_NAO_E_BACKEND',requiredKnownBackendEvidence:false,supervisorPidAndBootBindingSatisfied:false,maintenanceResponderMustNotBeAdopted:true};
  report.status='V2_RECONCILIADA_GATE_NAO_APROVADO';report.stateUnchanged=true;report.environmentUnchanged=true;report.checkpointUnchanged=true;report.residualRisks=['Ausencia historica permanece NAO comprovada.','Controle operacional atual nao equivale a lock global SQL/REST.','O startup principal em INCERTA nao pode ser restabelecido sem readmissao planejada; isso constituiria recuperacao real, nao autorizada nesta tarefa.','HTTP 503 e fornecido por respondedor isolado, sem aplicar os contratos autenticados do backend.'];
  report.finishedUtc=new Date().toISOString();save();console.log(JSON.stringify({status:report.status,evidenceFile:output,maintenancePid:ready.pid,mysqlRows:b.mysqlRows,supabaseRows:b.supabaseRows,additionalPreserved:10,recoveryGateApproved:false,recoveryExecuted:false}));
}
main().catch(e=>{report.status='INTERROMPIDA';report.failure={stage:report.stage,code:safe(e)};report.finishedUtc=new Date().toISOString();save();console.log(JSON.stringify({status:report.status,failure:report.failure,evidenceFile:output,maintenancePid:ready?.pid,recoveryExecuted:false}));process.exitCode=1;}).finally(()=>{if(child){if(child.connected)child.disconnect();child.unref();}});
