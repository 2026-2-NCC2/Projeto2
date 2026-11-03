"use strict";
const assert=require('node:assert/strict');
// Identidade ativa e distinta da referencia historica preservada no cutover.
function identidadeSupervisor(e){
  const t=e.transicao;assert.ok(t,'SUPERVISOR_SEM_TRANSICAO');const r=t.restabelecimento;
  if(t.fase==='INCERTA'&&r&&r.etapa!=='RECUPERACAO_SUBSEQUENTE'){
    assert.ok(e.congelado&&e.selado&&r.etapa==='ADMITIDA_SELADA'&&r.ticket===null,'SUPERVISOR_RESTABELECIMENTO_NAO_ADMITIDO');
    assert.equal(r.janelaId,t.id);assert.equal(r.checkpointId,t.checkpointId);assert.equal(r.configuracaoHash,t.configuracaoHash);
    assert.ok(Number.isSafeInteger(r.pidDestino)&&r.pidDestino>0&&typeof r.destino==='string'&&r.destino!==t.destino);
    assert.deepEqual(e.instancias,[r.destino]);
    return {pid:r.pidDestino,instancia:r.destino,tipo:'RESTABELECIDO_SELADO',admissaoId:r.id};
  }
  return {pid:t.pidDestino,instancia:t.destino,tipo:'ORIGINAL'};
}
function conferirSeladoRestabelecido(s){
  assert.ok(s?.congelado&&s.selado&&s.faseTransicao==='INCERTA'&&s.requisicoesPendentes===0&&s.escritasPendentes===0&&s.operacoesPersistenciaPendentes===0&&s.incertezasOperacionais===0&&s.incertezaTransicao===1&&s.resultadosIncertos===1,'RESTABELECIMENTO_DRENAGEM_RECUSADA');
}
module.exports={identidadeSupervisor,conferirSeladoRestabelecido};
