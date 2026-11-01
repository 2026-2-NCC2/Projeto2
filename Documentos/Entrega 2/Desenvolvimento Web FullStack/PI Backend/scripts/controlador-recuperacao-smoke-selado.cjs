'use strict';
// Execucao desta autorizacao. Nao chama abrirSmoke/abrirLeitura/liberarEscritas.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const output=path.join(root,'evidencias','recuperacao-smoke-selado-'+crypto.randomUUID()+'.json');
const report={startedUtc:new Date().toISOString(),controllerPid:process.pid,status:'EM_VALIDACAO',maintenanceReleased:false,dataWrites:false,jwtRotated:false,backupsGenerated:false,checkpointCreated:false,deltaOrchestratorExecuted:false,rollbackExecuted:false,historicalAbsenceOfWritesProven:false};
let adapters,estado,hold;
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const progress=stage=>{report.stage=stage;save();console.log(JSON.stringify({stage,controllerPid:process.pid}));};
const helper=async(name,args=[])=>JSON.parse((await require('./helper-powershell.cjs').executarHelper(name,args)).toString().replace(/^\uFEFF/,''));
async function conferir503(){const r=await fetch('http://127.0.0.1:3001/perfil',{headers:{connection:'close'},signal:AbortSignal.timeout(3000)});await r.arrayBuffer();assert.equal(r.status,503);return r.status;}
async function main(){
  assert.equal(process.argv[2],'--recuperar-smoke-selado');
  const evidenceFile=fs.realpathSync(process.argv[3]);assert.equal(path.dirname(evidenceFile),fs.realpathSync(path.join(root,'evidencias')));
  estado=require('../config/estado-supervisor.cjs').criarEstadoPrivado();const before=estado.ler(),envFile=path.join(root,'.env'),envBytes=fs.readFileSync(envFile),env=require('dotenv').parse(envBytes);
  const baseline=JSON.parse(fs.readFileSync(path.join(root,'evidencias/janela-final-real-20261031.json'))),cpFile=path.join(baseline.t0Directory,'checkpoint-t0.privado.json'),cpBytes=fs.readFileSync(cpFile),saved=JSON.parse(cpBytes),bytes=fs.readFileSync(evidenceFile),r=JSON.parse(bytes);
  assert.equal(env.DB_PROVIDER,'supabase');assert.ok(before.congelado&&before.selado&&before.transicao.fase==='INCERTA'&&!before.transicao.recuperacao);
  require('./backups-t0.cjs').validarArtefatosT0(saved.backups);
  const contas=[],selectors=[['admin',env.HOMOLOG_ADMIN_EMAIL,env.HOMOLOG_ADMIN_PASSWORD],['participante',env.HOMOLOG_PARTICIPANTE_EMAIL,env.HOMOLOG_PARTICIPANTE_PASSWORD],['organizador',null,env.HOMOLOG_PARTICIPANTE_PASSWORD,4],['fornecedor',null,env.HOMOLOG_PARTICIPANTE_PASSWORD,3]];
  progress('credenciais_de_teste_em_memoria');
  for(const [perfil,email,password,id] of selectors){assert.ok(typeof password==='string'&&password.length>0,'SMOKE_CREDENCIAL_AUSENTE');const u=saved.checkpoint.mysql.usuarios.find(x=>email?x.email.trim().toLowerCase()===email.trim().toLowerCase():Number(x.id)===id&&/teste/i.test(x.email));assert.ok(u&&u.perfil===perfil&&/teste/i.test(u.email),'SMOKE_CONTA_DIVERGENTE');assert.ok(await require('bcryptjs').compare(password,u.senha),'SMOKE_CREDENCIAL_RECUSADA');contas.push({id:Number(u.id),perfil,email:u.email,password});}
  const oldEnv=require('dotenv').parse(fs.readFileSync(path.join(baseline.journalDirectory,'ambiente-anterior.privado.env'))),admin=contas.find(a=>a.perfil==='admin');
  const tokensAntigos=[oldEnv.JWT_SECRET,env.HOMOLOG_JWT_SECRET].map(key=>{assert.ok(typeof key==='string'&&key!==env.JWT_SECRET);return require('jsonwebtoken').sign({id:admin.id,perfil:'admin'},key,{algorithm:'HS256',expiresIn:'1h'});});
  const aceite={criterio:'EQUIVALENCIA_ATUAL',reconheceLacunaHistorica:true,aceitaRiscoResidual:true,aceitaControleOperacionalSemLockGlobal:true,referenciaAutorizacao:'Usuario autorizou explicitamente recuperacao controlada e smoke final em 01/11/2026, aceitando o risco residual da lacuna historica nao comprovada; esclareceu manter HTTP 503 integral e preparar smoke isolado. Sem liberacao normal.',aceitoEm:new Date().toISOString(),evidenciaSha256:sha(bytes),checkpointId:r.checkpointId,checkpointSha256:r.checkpointSha256,janelaId:r.janelaId,configuracaoHash:r.configuracaoHash};
  report.aceiteRiscoResidual=aceite;report.evidenceFile=evidenceFile;save();
  adapters=require('./adapters-recuperacao-local.cjs').criarAdaptersLocais({estado,ambiente:env,relatorioFile:path.join(root,'evidencias/janela-final-real-20261031.json'),confirmarJanelaExclusiva:true,reconciliacaoFile:evidenceFile,aceitacaoReconciliacao:aceite,contasSmoke:contas,tokensAntigosSmoke:tokensAntigos});
  const baseStop=adapters.encerrarConhecido,baseLaunch=adapters.lancarSelado;let parentProof;
  adapters.encerrarConhecido=async proof=>{
    progress('encerrar_somente_supervisor_e_controlador_conhecidos');assert.equal(proof.parentPid,parentProof.pid);assert.deepEqual(await helper('controlador-restabelecimento-conhecido.ps1',['-PidAlvo',String(parentProof.pid)]),parentProof);
    const result=await baseStop(proof);assert.ok(result.encerrado&&result.portaLivre);
    const stopped=await helper('controlador-restabelecimento-conhecido.ps1',['-PidAlvo',String(parentProof.pid),'-CriadoEm',parentProof.criadoEm,'-Pai',String(parentProof.parentPid),'-Encerrar']);assert.equal(stopped.pid,parentProof.pid);assert.equal(stopped.encerrado,true);report.previousControllerStopped=stopped.pid;return result;
  };
  adapters.lancarSelado=async proof=>{progress('admitir_supabase_selado');return baseLaunch(proof);};
  const flow=require('./recuperacao-supervisor.cjs').criarRecuperacao(adapters);
  progress('gate_v2_e_reconciliacao_atual');const plano=await flow.planejar();report.gateApproved=true;report.previousSupervisorPid=plano.pidAnterior;parentProof=await helper('controlador-restabelecimento-conhecido.ps1',['-PidAlvo',String(plano.processo.parentPid)]);report.previousControllerPid=parentProof.pid;assert.ok(parentProof.entradaConhecida);await conferir503();
  progress('recuperacao_controlada');report.recoveryResult=await flow.recuperar(plano,{autorizar:true});report.recoveryExecuted=true;await conferir503();
  progress('smoke_isolado_sem_abrir_http');report.smokeResult=await flow.smokeIsolado(plano,{autorizar:true});assert.equal(report.smokeResult.result.mysqlModulesLoaded,false);await conferir503();
  const after=estado.ler(),s=(await adapters.obterControlador().status())['express-principal'];require('../config/transicao-controlada.cjs').conferirDrenagem(s);
  assert.ok(after.congelado&&after.selado&&after.transicao.fase==='INICIADA'&&after.transicao.recuperacao.smokeIsolado.aprovado);assert.equal(after.transicao.checkpointId,before.transicao.checkpointId);assert.equal(after.transicao.configuracaoHash,before.transicao.configuracaoHash);assert.ok(fs.readFileSync(envFile).equals(envBytes));assert.ok(fs.readFileSync(cpFile).equals(cpBytes));require('./backups-t0.cjs').validarArtefatosT0(saved.backups);
  Object.assign(report,{status:'RECUPERACAO_E_SMOKE_ISOLADO_APROVADOS',supervisorPid:s.pid,phase:after.transicao.fase,httpStatus:503,additional10RowsPreserved:true,checkpointUnchanged:true,environmentUnchanged:true,backupsIntegrityVerified:true,startupProvider:'supabase',mysqlModulesLoaded:false,currentOperationalWriterControlConfirmed:true,historicalAbsenceOfWritesProven:false,finishedUtc:new Date().toISOString(),normalOperationReleased:false});save();
  console.log(JSON.stringify({status:report.status,controllerPid:process.pid,supervisorPid:s.pid,phase:report.phase,httpStatus:503,requests:report.smokeResult.result.http.length,perfisAprovados:4,reportFile:output}));hold=setInterval(()=>{},60000);
}
main().catch(async e=>{
  report.status='INTERROMPIDA';report.failureCode=/^[A-Z0-9_]+$/.test(e?.code||'')?e.code:'VALIDACAO_RECUSADA';
  if(estado?.ler().transicao?.recuperacao){const e=estado.ler();estado.gravar({...e,congelado:true,selado:true,transicao:{...e.transicao,fase:'INCERTA',recuperacao:{...e.transicao.recuperacao,etapa:'INTERROMPIDA'}}});try{await conferir503();report.maintenanceConfirmed=true;}catch{report.maintenanceConfirmed=false;}hold=setInterval(()=>{},60000);}
  report.finishedUtc=new Date().toISOString();save();console.log(JSON.stringify({status:report.status,stage:report.stage,code:report.failureCode,reportFile:output}));process.exitCode=1;
});
