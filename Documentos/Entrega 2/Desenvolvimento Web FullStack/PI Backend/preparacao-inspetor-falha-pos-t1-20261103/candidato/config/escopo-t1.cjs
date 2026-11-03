'use strict';
const assert=require('node:assert/strict'),jwt=require('jsonwebtoken');
function validarEscopoT1({estado:e,method,route,body,token,run,organizadorId,jwtSecret,agora=Date.now()}){
  const x=e.transicao?.t1;assert.ok(e.congelado&&e.selado&&e.transicao.fase==='INICIADA'&&x?.etapa==='EM_EXECUCAO'&&x.run===run&&x.organizadorId===organizadorId&&x.unknownResult===false);assert.equal(x.pid,e.transicao.pidDestino);assert.equal(x.instancia,e.transicao.destino);assert.equal(x.checkpointId,e.transicao.checkpointId);assert.equal(x.configuracaoHash,e.transicao.configuracaoHash);assert.ok(x.autorizacao?.length>=8);assert.match(x.gateSha256,/^[a-f0-9]{64}$/);assert.equal(x.marker,'TT-T1-'+run);
  const claim=jwt.verify(token,jwtSecret,{algorithms:['HS256']});assert.equal(claim.id,organizadorId);assert.equal(claim.perfil,'organizador');
  const op=x.operacoes.at(-1),n=x.operacoes.length;assert.ok(n>=1&&n<=2&&op.status==='ENVIANDO'&&typeof op.id==='string');assert.equal(op.method,method);assert.equal(op.route,route);assert.ok(Number.isSafeInteger(op.iniciadoEm)&&op.iniciadoEm<=agora&&agora-op.iniciadoEm<=30000);
  if(n===1){assert.equal(method,'POST');assert.equal(route,'/eventos');assert.equal(x.createdEventIds.length,0);assert.equal(x.createdCostIds.length,0);assert.deepEqual(body,{nome:x.marker,data:'2026-12-20',horario:'14:00',local:'Fixture descartavel T1',categoria:'Corporativo',publico:10,descricao:x.marker});}
  else{
    assert.equal(x.createdEventIds.length,1);const id=x.createdEventIds[0];assert.ok(Number.isSafeInteger(id)&&id>0);const proof=x.verificacoes.at(-1),ev=proof?.eventosNovos?.[0];assert.ok(ev&&ev.id===id&&ev.usuario_id===organizadorId&&ev.nome===x.marker&&ev.descricao===x.marker);
    assert.equal(method,'PUT');assert.equal(route,'/eventos/'+id+'/custos');assert.deepEqual(body,{custos:[{categoria:'Som',descricao:x.marker,valor_estimado:'0.10'}]});assert.equal(x.createdCostIds.length,0);
  }
  return {id:op.id,run};
}
module.exports={validarEscopoT1};
