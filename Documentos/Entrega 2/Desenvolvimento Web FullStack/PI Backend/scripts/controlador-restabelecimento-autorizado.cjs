'use strict';
// Controlador desta autorizacao: somente readmissao selada. Mantem o IPC vivo.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const output=path.join(root,'evidencias','restabelecimento-real-'+crypto.randomUUID()+'.json');
const report={startedUtc:new Date().toISOString(),controllerPid:process.pid,status:'EM_VALIDACAO',recoveryExecuted:false,maintenanceReleased:false,dataWrites:false,jwtRotated:false,backupsGenerated:false,checkpointCreated:false,historicalAbsenceOfWritesProven:false};
let adapters,hold;
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const progress=stage=>{report.stage=stage;save();console.log(JSON.stringify({stage,controllerPid:process.pid}));};
async function main(){
  assert.equal(process.argv[2],'--admitir-selado');
  const preFile=fs.realpathSync(process.argv[3]);assert.equal(path.dirname(preFile),fs.realpathSync(path.join(root,'evidencias')));
  const estado=require('../config/estado-supervisor.cjs').criarEstadoPrivado(),original=estado.ler(),envBytes=fs.readFileSync(path.join(root,'.env')),ambiente=require('dotenv').parse(envBytes);
  const prior=JSON.parse(fs.readFileSync(path.join(root,'evidencias/janela-final-real-20261031.json'))),cpFile=path.join(prior.t0Directory,'checkpoint-t0.privado.json'),cpBytes=fs.readFileSync(cpFile),saved=JSON.parse(cpBytes);
  require('./backups-t0.cjs').validarArtefatosT0(saved.backups);
  report.preEvidenceFile=preFile;report.checkpointId=saved.checkpointId;
  adapters=require('./adapters-restabelecimento-selado.cjs').criarAdaptersRestabelecimento({estado,ambiente,evidenciaPreFile:preFile,evidenciaSha256:sha(fs.readFileSync(preFile)),janelaExclusivaConfirmada:true,riscoResidualAceito:true,referenciaAutorizacao:'Autorizacao explicita do usuario para restabelecimento selado; retomada apos fechamento do Workbench em 01/11/2026. Lacuna historica e risco residual previamente reconhecidos.'});
  const flow=require('./restabelecer-supervisor-selado.cjs').criarRestabelecimento(adapters);
  progress('planejar_readonly');const plano=await flow.planejar();
  report.maintenanceResponderPid=plano.respondedor.pid;
  progress('admissao_selada_handoff_e_gate_v2');const result=await flow.executar(plano,{autorizarAdmissao:true});
  const current=estado.ler(),historical={...current.transicao};delete historical.restabelecimento;
  assert.deepEqual(historical,original.transicao);assert.equal(current.transicao.fase,'INCERTA');assert.ok(current.congelado&&current.selado);assert.ok(!current.transicao.recuperacao);
  assert.ok(fs.readFileSync(path.join(root,'.env')).equals(envBytes));assert.ok(fs.readFileSync(cpFile).equals(cpBytes));require('./backups-t0.cjs').validarArtefatosT0(saved.backups);
  const status=(await adapters.obterControlador().status())['express-principal'];require('../config/identidade-supervisor.cjs').conferirSeladoRestabelecido(status);
  const r=await fetch('http://127.0.0.1:3001/perfil',{headers:{connection:'close'},signal:AbortSignal.timeout(3000)});await r.arrayBuffer();assert.equal(r.status,503);assert.equal(result.evidencia.gateAprovado,true);
  Object.assign(report,{status:'ADMITIDA_SELADA_GATE_V2_APROVADO',result,supervisorPid:status.pid,httpStatus:503,phase:'INCERTA',operationalWriterControlConfirmed:true,environmentUnchanged:true,checkpointUnchanged:true,backupsIntegrityVerified:true,originalTransitionPreserved:true,finishedUtc:new Date().toISOString()});save();
  console.log(JSON.stringify({status:report.status,controllerPid:process.pid,supervisorPid:status.pid,replacedResponderPid:report.maintenanceResponderPid,phase:'INCERTA',httpStatus:503,gateV2Approved:true,evidenceFile:result.evidencia.evidenceFile,reportFile:output}));
  // Nenhum comando de recuperacao ou liberacao e exposto por este controlador.
  hold=setInterval(()=>{},60000);
}
main().catch(async e=>{
  report.status='INTERROMPIDA';report.failureCode=/^[A-Z0-9_]+$/.test(e?.code||'')?e.code:'VALIDACAO_RECUSADA';report.finishedUtc=new Date().toISOString();save();
  console.log(JSON.stringify({status:report.status,stage:report.stage,code:report.failureCode,reportFile:output}));
  adapters?.obterControlador()?.fechar();process.exitCode=1;
});
