'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const {fixture:baseFixture,hash}=require('./gate-final-selado.cjs'),{criarSubstituicaoSelada}=require('../../scripts/substituicao-controlador-selada.cjs'),authority=require('../../config/autoridade-selada.cjs'),startup=require('../../config/startup-controlado.cjs');
async function fixture(){
  const f=await baseFixture(),e=f.estado.ler();e.transicao.pidDestino=202;f.estado.gravar(e);f.report.supervisorPid=202;f.report.controllerPid=101;const reportBytes=Buffer.from(JSON.stringify(f.report));
  const iso=n=>new Date(n).toISOString(),origin={backend:{pid:202,parentPid:101,criadoEm:iso(f.now()-110000),entradaConhecida:true,portaExclusivaLocal:true},controlador:{pid:101,parentPid:1,criadoEm:iso(f.now()-120000),entradaConhecida:true}};
  let candidate={pid:303,parentPid:1,criadoEm:iso(f.now()-1000),entradaConhecida:true,boot:'controle-303',codigoSha256:'a'.repeat(64),canalRetomavelInstalado:true},oldChild=true,oldOwner=true,ownChild=false,controllerActive=false,port=202,locked=false,stopped=false,childPid=404,supervisor,ctx;
  const events=[],bridge={pid:707,parentPid:303,criadoEm:iso(f.now()),entradaConhecida:true,portaExclusivaLocal:true,backendSupervisor:false,role:'MANUTENCAO_SEM_BACKEND',boot:'ponte-707'};
  function writers(time,maintenance){return {local:{capturedUtc:iso(time),knownBackend:maintenance?null:structuredClone(origin.backend),...(maintenance?{knownMaintenanceResponder:structuredClone(bridge)}:{}),unknownProcessCount:0,tasks:0,mysqlClientPids:[],httpStatus:503},database:{capturedUtc:iso(time),mysql:{otherClients:0,otherTransactions:0,enabledJobs:0,scheduler:'OFF'},supabase:{sessions:[{usename:'authenticator',state:'idle',transaction_open:false}],activeCron:0,httpQueue:0,tlsVerified:true}}};}
  function data(maintenance){const now=f.now();return {checkpointBytes:f.checkpointBytes,columns:f.columns,backupsVerificados:true,snapshot:{...structuredClone(f.v.snapshot),capturas:{mysql:{inicio:now-5000,fim:now-4900},supabase:{inicio:now-4800,fim:now-4000}}},writersBefore:writers(now-6000,maintenance),writersAfter:writers(now-3000,maintenance)};}
  const a={estado:f.estado,ambiente:f.env,agora:f.now,
    adquirirExclusivo(){assert.equal(locked,false,'TRAVA_OCUPADA');locked=true;return ()=>{locked=false;};},
    async inspecionar({retomada}){return {...data(retomada),origem:structuredClone(origin),respondedor:retomada?structuredClone(bridge):undefined,candidato:structuredClone(candidate),aceite:{legadoSemIpc:true,riscoResidualAceito:true,historicoNaoComprovado:true,referencia:'Autorizacao ficticia de substituicao'},ipcAnteriorComprovado:false,relatorioBytes:reportBytes,relatorioSha256:hash(reportBytes),relatorioFile:'/ficticio/aprovado.json',anterioresAusentes:!oldChild&&!oldOwner,todosCandidatosAusentes:!ownChild&&!controllerActive};},
    async encerrarSupervisor(p){assert.equal(f.estado.ler().controleSelado.etapa,'ENCERRANDO_SUPERVISOR');assert.deepEqual(p,origin.backend);oldChild=false;port=null;events.push('old-child-exit');},
    async encerrarControlador(p){assert.equal(oldChild,false);assert.deepEqual(p,origin.controlador);oldOwner=false;events.push('old-owner-exit');},
    async provarAusenciaAnteriores(){return !oldChild&&!oldOwner;},
    async garantir503(){assert.equal(port,null);port=bridge.pid;events.push('503');return structuredClone(bridge);},
    async inspecionarAposParada(){events.push('read-after-stop');return {...data(true),anterioresAusentes:!oldChild&&!oldOwner};},
    async admitirControlador(m){assert.equal(oldOwner,false);assert.equal(oldChild,false);ctx=authority.consumirControlador({estado:f.estado,env:f.env,ticket:m.ticket,boot:m.boot,pid:candidate.pid,parentPid:candidate.parentPid,agora:f.now()});controllerActive=true;events.push('new-owner-authority');},
    async lancarSupervisorPausado(){assert.equal(controllerActive,true);assert.equal(port,bridge.pid);ownChild=true;events.push('new-child-paused');return {pid:childPid,parentPid:candidate.pid,criadoEm:iso(f.now()),entradaConhecida:true,boot:'sup-'+childPid};},
    async admitirSupervisor(m){startup.consumirSubstituicao({estado:f.estado,env:f.env,instancia:m.instancia,ticket:m.ticket,pid:childPid,parentPid:candidate.pid,agora:f.now()});supervisor=require('../../config/supervisor-cutover.cjs').criarSupervisor({estado:f.estado,pid:childPid,instancia:m.instancia,agora:f.now});assert.equal(port,bridge.pid);events.push('new-child-sealed-no-bind');},
    consultarSupervisor:async()=>supervisor.status(),
    async encerrarRespondedor(p){assert.equal(f.estado.ler().controleSelado.etapa,'TROCANDO_PORTA');assert.deepEqual(p,bridge);port=null;events.push('bridge-exit');},
    async portaLivre(){events.push('port-free');return port===null;},
    async ouvirSupervisor(){assert.equal(port,null);port=childPid;events.push('bind');},
    async conferirContinuidade(){authority.validarControlador(f.estado.ler(),ctx,candidate.pid);const s=supervisor.status();assert.equal(s.resultadosIncertos,0);assert.equal(port,childPid);events.push('ipc-round-trip');return {pid:childPid,controllerPid:candidate.pid,httpStatus:503};},
    async abortarSomenteProprios(){ownChild=false;controllerActive=false;if(port===childPid)port=null;events.push('abort-own');},
    async garantir503EmFalha(){if(port===null)port=bridge.pid;return {known503:port===bridge.pid||port===202};},
    estaInterrompido:()=>stopped
  };
  return {...f,a,origin,bridge,events,api:()=>criarSubstituicaoSelada(a),status:()=>({oldChild,oldOwner,ownChild,controllerActive,port,locked}),changeCandidate:pid=>{candidate={...candidate,pid,boot:'controle-'+pid};childPid+=100;},simularQueda(){oldChild=oldOwner=ownChild=controllerActive=false;port=bridge.pid;},ctx:()=>ctx,supervisor:()=>supervisor,stopInput:()=>{stopped=true;},setPort:n=>{port=n;}};
}
module.exports={fixture};
