"use strict";
const assert=require("node:assert/strict");
// Avaliacao pura. Nao envia comandos, nao congela processos e nao abre conexoes.
function avaliarCongelamentoGlobal(inventario,evidencias,agora=Date.now()) {
  const motivos=[];
  assert.ok(inventario && Array.isArray(inventario.processos) && Array.isArray(inventario.escritoresExternos));
  const all=[...inventario.processos,...inventario.escritoresExternos];
  assert.ok(inventario.processos.length>0 && all.length>0 && all.every(x=>typeof x.id==='string'&&x.id.length>0)); assert.equal(new Set(all.map(x=>x.id)).size,all.length);
  if(inventario.completoConfirmado!==true || !inventario.responsavel)motivos.push('INVENTARIO_NAO_CONFIRMADO');
  const expected=new Set(all.map(x=>x.id)), seen=new Set();
  for(const e of evidencias){assert.ok(expected.has(e.id)&&!seen.has(e.id));seen.add(e.id);}
  const byId=new Map(evidencias.map(x=>[x.id,x]));
  for(const item of all){const e=byId.get(item.id);if(!e){motivos.push('EVIDENCIA_AUSENTE:'+item.id);continue;}
    if(!Number.isSafeInteger(e.coletadoEm)||e.coletadoEm>agora||agora-e.coletadoEm>30000){motivos.push('EVIDENCIA_EXPIRADA:'+item.id);continue;}
    if(inventario.processos.some(p=>p.id===item.id)){
      if(!e.instancia || e.instancia!==item.instancia)motivos.push('INSTANCIA_DIVERGENTE:'+item.id);
      if(e.congelado!==true || e.escritasPendentes!==0 || e.resultadosIncertos!==0 || e.operacoesPersistenciaPendentes!==0 || (e.requisicoesPendentes!==undefined&&e.requisicoesPendentes!==0))motivos.push('DRENAGEM_NAO_CONFIRMADA:'+item.id);
    }else if(e.suspenso!==true || e.transacoesPendentes!==0 || e.reinicioAutomaticoBloqueado!==true)motivos.push('ESCRITOR_EXTERNO_ATIVO:'+item.id);
  }
  if(!inventario.persistenciaConferida || inventario.persistenciaConferida.escritoresAtivos!==0 || inventario.persistenciaConferida.incerto!==false || !Number.isSafeInteger(inventario.persistenciaConferida.coletadoEm) || agora-inventario.persistenciaConferida.coletadoEm>30000 || inventario.persistenciaConferida.coletadoEm>agora)motivos.push('PERSISTENCIA_NAO_CONFIRMADA');
  const validadeAte=Math.min(agora+30000,...evidencias.map(e=>Number.isSafeInteger(e.coletadoEm)?e.coletadoEm+30000:agora),Number.isSafeInteger(inventario.persistenciaConferida?.coletadoEm)?inventario.persistenciaConferida.coletadoEm+30000:agora);
  return {status:motivos.length?'BLOQUEADO':'APTO_PARA_COLETA',motivos,avaliadoEm:agora,validadeAte,escopo:'evidencias do supervisor e operador; nao descobre escritores ocultos',congelamentoAcionado:false};
}
module.exports={avaliarCongelamentoGlobal};
