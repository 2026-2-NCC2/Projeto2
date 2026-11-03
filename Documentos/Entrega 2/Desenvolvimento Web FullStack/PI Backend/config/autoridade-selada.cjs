'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const contextos=new WeakSet();let controladorInstalado;
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function conferirBase(e,env,agora=Date.now()){
  const r=e.controleSelado,t=e.transicao;
  assert.ok(e.congelado&&e.selado&&t?.fase==='INICIADA'&&t.ticket===null&&r,'SUBSTITUICAO_ESTADO_RECUSADO');
  if(t.t1)require('./procedencia-t1-selada.cjs').conferirProcedenciaT1(e,{posParada:true,agora});
  else assert.notEqual(r.modo,'IMPLANTACAO_POS_T1');
  assert.equal(r.fasePreservada,t.fase);assert.equal(r.checkpointId,t.checkpointId);assert.equal(r.configuracaoHash,t.configuracaoHash);assert.equal(r.configuracaoHash,require('./startup-controlado.cjs').fingerprint(env));
  assert.ok(r.anterioresAusentes===true&&Number.isSafeInteger(r.epoch)&&r.epoch>0);return r;
}
function consumir({estado,env,ticket,boot,role,pid=process.pid,parentPid=process.ppid,agora=Date.now(),instalar=false}){
  const e=estado.ler(),r=conferirBase(e,env,agora),controller=role==='controlador',slot=controller?r.ticketControlador:r.ticketSupervisor,who=controller?r.controlador:r.supervisor;
  assert.ok(controller? r.etapa==='CONTROLADOR_ARMADO':r.etapa==='SUPERVISOR_ARMADO','SUBSTITUICAO_ETAPA_RECUSADA');
  assert.match(ticket,/^[a-f0-9]{64}$/);assert.equal(slot.hash,hash(ticket));assert.ok(slot.emitidoEm<=agora&&slot.expiraEm>=agora&&slot.expiraEm-slot.emitidoEm<=30000);assert.ok(!r.consumidos.includes(slot.hash),'SUBSTITUICAO_TICKET_REUTILIZADO');
  assert.equal(who.pid,pid);assert.equal(who.boot,boot);assert.equal(parentPid,controller?r.operador.pid:r.controlador.pid);assert.ok(who.boot&&who.criadoEm&&who.entradaConhecida);
  if(instalar){assert.equal(pid,process.pid);assert.equal(parentPid,process.ppid);}
  const ctx=Object.freeze({estado,id:r.id,epoch:r.epoch,role,pid,parentPid,boot:who.boot,ticketSha256:slot.hash,procedenciaBaseSha256:e.transicao.t1?require('./procedencia-t1-selada.cjs').conferirProcedenciaT1(e):null});contextos.add(ctx);
  const next={...r,etapa:controller?'CONTROLADOR_ADMITIDO':'SUPERVISOR_CONSUMIDO',consumidos:[...r.consumidos,slot.hash],[controller?'ticketControlador':'ticketSupervisor']:null};
  const transition=controller?e.transicao:{...e.transicao,pidDestino:pid,destino:who.boot,recuperacao:{...e.transicao.recuperacao,smokeIsolado:{aprovado:false,substituicaoId:r.id}}};
  estado.gravar({...e,...(!controller?{instancias:[who.boot]}:{}),transicao:transition,controleSelado:next});
  if(instalar&&controller)controladorInstalado=ctx;return ctx;
}
function consumirControlador(op){return consumir({...op,role:'controlador'});}
function consumirSupervisor(op){return consumir({...op,role:'supervisor'});}
function validarControlador(e,ctx=controladorInstalado,pid=process.pid){
  const r=e.controleSelado;if(!r||!e.congelado)return;
  assert.ok(contextos.has(ctx)&&ctx.role==='controlador'&&ctx.pid===pid&&ctx.id===r.id&&ctx.epoch===r.epoch,'CONTROLADOR_SEM_AUTORIDADE');
  if(r.modo==='IMPLANTACAO_POS_T1'||ctx.procedenciaBaseSha256!==null)assert.equal(ctx.procedenciaBaseSha256,require('./procedencia-t1-selada.cjs').conferirProcedenciaT1(e,{destino:['SUPERVISOR_CONSUMIDO','VINCULANDO','ATIVO'].includes(r.etapa)}));
  assert.equal(r.ticketControlador,null);assert.ok(r.anterioresAusentes&&r.consumidos.includes(ctx.ticketSha256));
  assert.equal(r.controlador.pid,pid);assert.ok(['CONTROLADOR_ADMITIDO','SUPERVISOR_ARMADO','SUPERVISOR_CONSUMIDO','VINCULANDO','ATIVO'].includes(r.etapa),'CONTROLADOR_REVOGADO');
}
function validarSupervisor(e,pid,instancia){
  const r=e.controleSelado;if(!r||!e.congelado)return;
  if(r.modo==='IMPLANTACAO_POS_T1'||r.procedenciaT1)require('./procedencia-t1-selada.cjs').conferirProcedenciaT1(e,{destino:true});
  assert.ok(['SUPERVISOR_CONSUMIDO','VINCULANDO','ATIVO'].includes(r.etapa),'SUPERVISOR_AUTORIDADE_REVOGADA');assert.ok(r.anterioresAusentes);assert.equal(r.ticketControlador,null);assert.equal(r.ticketSupervisor,null);assert.equal(r.supervisor.pid,pid);assert.equal(r.supervisor.boot,instancia);assert.equal(e.transicao.pidDestino,pid);assert.equal(e.transicao.destino,instancia);
}
function validarContextoSupervisor(e,ctx){
  assert.ok(contextos.has(ctx)&&ctx.role==='supervisor');
  if(e.controleSelado.modo==='IMPLANTACAO_POS_T1'||ctx.procedenciaBaseSha256!==null)assert.equal(ctx.procedenciaBaseSha256,require('./procedencia-t1-selada.cjs').conferirProcedenciaT1(e,{destino:true}));assert.equal(ctx.id,e.controleSelado.id);assert.equal(ctx.epoch,e.controleSelado.epoch);assert.ok(e.controleSelado.consumidos.includes(ctx.ticketSha256));validarSupervisor(e,ctx.pid,ctx.boot);
}
function revogar(estado,motivo='CANAL_PERDIDO'){
  const e=estado.ler(),r=e.controleSelado;if(!r||e.transicao?.fase==='CONCLUIDA')return;
  const spent=[...r.consumidos,...[r.ticketControlador?.hash,r.ticketSupervisor?.hash].filter(Boolean)];estado.gravar({...e,congelado:true,selado:true,controleSelado:{...r,etapa:'FALHA',motivo,consumidos:[...new Set(spent)],ticketControlador:null,ticketSupervisor:null}});
}
module.exports={consumirControlador,consumirSupervisor,validarControlador,validarSupervisor,validarContextoSupervisor,revogar};
