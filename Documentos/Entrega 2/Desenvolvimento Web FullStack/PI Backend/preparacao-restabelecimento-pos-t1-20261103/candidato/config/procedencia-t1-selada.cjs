'use strict';
// A procedencia nunca modifica o diario nem o PID da execucao T1 original.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function conferirProcedenciaT1(e,{destino=false,posParada=false,agora=Date.now()}={}){
  const r=e.controleSelado,t=e.transicao,x=t?.t1,p=r?.procedenciaT1;
  assert.ok(e.congelado&&e.selado&&t?.fase==='INICIADA'&&t.ticket===null&&r?.modo==='IMPLANTACAO_POS_T1'&&p?.versao===1,'POS_T1_PROCEDENCIA_AUSENTE');
  assert.ok(x?.etapa==='CONCLUIDA'&&x.cleanupVerified===true&&x.unknownResult===false&&x.retryCount===0);
  const originalBytes=Buffer.from(r.estadoAnteriorPosT1Base64,'base64'),original=JSON.parse(originalBytes);assert.equal(crypto.createHash('sha256').update(originalBytes).digest('hex'),p.estadoAnteriorBytesSha256);assert.deepEqual(original.transicao.t1,x);assert.equal(original.controleSelado.id,p.controleAnteriorId);assert.equal(original.controleSelado.epoch,p.epochAnterior);assert.deepEqual(original.controleSelado.supervisor,p.supervisorOriginal);assert.deepEqual(original.controleSelado.controlador,p.controladorOriginal);
  assert.equal(p.registroSha256,hash(x));assert.equal(p.journalSha256,x.journalSha256);assert.equal(p.run,x.run);
  assert.equal(p.checkpointId,t.checkpointId);assert.equal(p.checkpointSha256,t.recuperacao.decisaoSeguranca.checkpointSha256);assert.equal(p.configuracaoHash,t.configuracaoHash);
  assert.equal(p.supervisorOriginal.pid,x.pid);assert.equal(p.supervisorOriginal.boot,x.instancia);assert.equal(p.supervisorOriginal.parentPid,p.controladorOriginal.pid);
  assert.ok(p.supervisorOriginal.entradaConhecida&&p.controladorOriginal.entradaConhecida);
  assert.equal(r.epoch,p.epochAnterior+1);assert.notEqual(r.id,p.controleAnteriorId);assert.ok(p.referenciaAutorizacao?.trim().length>=8);
  assert.ok(Array.isArray(p.consumidosAnteriores)&&p.consumidosAnteriores.length>0&&new Set(p.consumidosAnteriores).size===p.consumidosAnteriores.length);assert.ok(p.consumidosAnteriores.every(h=>r.consumidos.includes(h)));
  assert.equal(p.codigoNovoSha256,r.controlador.codigoSha256);assert.match(p.codigoAnteriorSha256,/^[a-f0-9]{64}$/);assert.notEqual(p.codigoAnteriorSha256,p.codigoNovoSha256);
  assert.equal(p.hashes.supabase,x.beforeHash);assert.equal(p.hashes.supabase,x.afterHash);
  if(posParada){const v=r.validacaoT1PosParada;assert.ok(v?.anterioresAusentes===true&&Number.isSafeInteger(v.verificadoEm)&&v.verificadoEm<=agora&&agora-v.verificadoEm<=30000,'POS_T1_POS_PARADA_EXPIRADA');assert.equal(v.registroSha256,p.registroSha256);assert.deepEqual(v.hashes,p.hashes);}
  if(destino){assert.equal(p.destino.pid,t.pidDestino);assert.equal(p.destino.instancia,t.destino);assert.equal(p.destino.controllerPid,r.controlador.pid);assert.equal(r.supervisor.pid,p.destino.pid);assert.equal(r.supervisor.boot,p.destino.instancia);assert.equal(r.supervisor.parentPid,p.destino.controllerPid);}
  const base={...p};delete base.destino;return hash(base);
}
function conferirVinculoT1(e,x){
  if(x.pid===e.transicao.pidDestino&&x.instancia===e.transicao.destino){if(e.controleSelado?.modo==='IMPLANTACAO_POS_T1'){assert.ok(['ENCERRANDO_SUPERVISOR','ENCERRANDO_CONTROLADOR','POS_PARADA','CONTROLADOR_ARMADO','CONTROLADOR_ADMITIDO'].includes(e.controleSelado.etapa),'POS_T1_DESTINO_NAO_SUBSTITUIDO');conferirProcedenciaT1(e);}return;}
  conferirProcedenciaT1(e,{destino:true});
  assert.equal(e.controleSelado.etapa,'ATIVO');assert.equal(e.controleSelado.ticketControlador,null);assert.equal(e.controleSelado.ticketSupervisor,null);
}
module.exports={conferirProcedenciaT1,conferirVinculoT1,hash};
