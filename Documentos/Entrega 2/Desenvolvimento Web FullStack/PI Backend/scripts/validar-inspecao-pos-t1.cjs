'use strict';
// Somente arquivos privados e validacao pura. Sem sockets, drivers ou admissao.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function validar({estado:e,estadoBytes,ambiente,journalBytes,checkpointBytes,controllerPid,supervisorPid}){
 const r=e.controleSelado,t=e.transicao,x=t?.t1;assert.ok(e.congelado&&e.selado&&t?.fase==='INICIADA'&&t.ticket===null);assert.equal(r?.modo,'IMPLANTACAO_POS_T1');assert.ok(['VINCULANDO','ATIVO'].includes(r.etapa));assert.equal(r.ticketControlador,null);assert.equal(r.ticketSupervisor,null);assert.ok(Array.isArray(r.consumidos)&&new Set(r.consumidos).size===r.consumidos.length);
 assert.equal(r.controlador.pid,controllerPid);assert.equal(r.supervisor.pid,supervisorPid);assert.equal(r.supervisor.parentPid,controllerPid);assert.equal(t.pidDestino,supervisorPid);assert.deepEqual(e.instancias,[t.destino]);
 assert.equal(require('../config/startup-controlado.cjs').fingerprint(ambiente),t.configuracaoHash);require('../config/procedencia-t1-selada.cjs').conferirProcedenciaT1(e,{destino:true});
 assert.ok(r.consumidos.every(h=>/^[a-f0-9]{64}$/.test(h)));assert.equal(r.consumidos.length,(r.recuperacaoFalhaPosT1?.consumidosAnteriores||r.procedenciaT1.consumidosAnteriores).length+2);
 assert.ok(Buffer.isBuffer(estadoBytes)&&Buffer.isBuffer(journalBytes)&&Buffer.isBuffer(checkpointBytes));assert.deepEqual(JSON.parse(estadoBytes),e);assert.equal(sha(journalBytes),x.journalSha256);const record={...x};delete record.journalSha256;assert.deepEqual(JSON.parse(journalBytes),record);assert.equal(x.etapa,'CONCLUIDA');assert.equal(x.cleanupVerified,true);assert.equal(x.unknownResult,false);assert.equal(x.retryCount,0);assert.equal(x.checkpointId,t.checkpointId);assert.equal(x.configuracaoHash,t.configuracaoHash);
 assert.equal(sha(checkpointBytes),t.recuperacao.decisaoSeguranca.checkpointSha256);assert.equal(JSON.parse(checkpointBytes).checkpointId,t.checkpointId);
 return {ok:true,estadoSha256:sha(estadoBytes),journalSha256:x.journalSha256};
}
function main(args=process.argv.slice(2)){
 const fs=require('node:fs'),path=require('node:path');assert.equal(args.length,5);assert.equal(args[0],'--somente-inspecionar');assert.equal(args[1],'--controlador');assert.equal(args[3],'--supervisor');const controllerPid=Number(args[2]),supervisorPid=Number(args[4]);assert.ok(Number.isSafeInteger(controllerPid)&&controllerPid>0&&Number.isSafeInteger(supervisorPid)&&supervisorPid>0&&controllerPid!==supervisorPid);
 const root=path.resolve(__dirname,'..'),state=require('../config/estado-supervisor.cjs').criarEstadoPrivado(),file=path.join(state.diretorio,'estado.json'),estadoBytes=fs.readFileSync(file),e=JSON.parse(estadoBytes),locator=JSON.parse(fs.readFileSync(path.join(root,'evidencias/janela-final-real-20261031.json'))),checkpointBytes=fs.readFileSync(path.join(locator.t0Directory,'checkpoint-t0.privado.json'));assert.match(e.transicao.t1.run,/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);const journalBytes=fs.readFileSync(path.join(state.diretorio,'t1-'+e.transicao.t1.run+'.privado.json')),ambiente=require('dotenv').parse(fs.readFileSync(path.join(root,'.env'))),result=validar({estado:e,estadoBytes,ambiente,journalBytes,checkpointBytes,controllerPid,supervisorPid});assert.ok(fs.readFileSync(file).equals(estadoBytes),'INSPECAO_ESTADO_ALTERADO');return result;
}
if(require.main===module)try{console.log(JSON.stringify(main()));}catch{console.log('{"ok":false,"code":"INSPECAO_POS_T1_RECUSADA"}');process.exitCode=1;}
module.exports={validar,main};
