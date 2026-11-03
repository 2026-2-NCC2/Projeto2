'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fingerprint}=require('./startup-controlado.cjs');
const {conferirDrenagem}=require('./transicao-controlada.cjs');
const recibos=new WeakMap(),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function criarContinuidadeControlador({estado,ambiente,filho,consultar,inspecionarNativo,pid=process.pid,agora=Date.now}){
  assert.equal(pid,process.pid,'CONTROLE_EXIGE_PAI_ATUAL');
  let revogado=false;const revogar=()=>{revogado=true;};filho.once('exit',revogar);filho.once('disconnect',revogar);
  return {revogar,async conferir(){
    assert.ok(!revogado&&filho.connected,'CONTROLE_IPC_DESCONECTADO');const inicio=agora(),e=estado.ler(),t=e.transicao;
    assert.ok(e.congelado&&e.selado&&t?.fase==='INICIADA');assert.equal(t.configuracaoHash,fingerprint(ambiente));assert.equal(t.pidDestino,filho.pid);
    const a=await inspecionarNativo(),s=await consultar(),b=await inspecionarNativo();assert.deepEqual(a,b,'CONTROLE_IDENTIDADE_ALTERADA');
    assert.equal(a.controlador.pid,pid);assert.equal(a.backend.pid,filho.pid);assert.equal(a.backend.parentPid,pid);assert.ok(a.controlador.entradaConhecida&&a.backend.entradaConhecida&&a.backend.portaExclusivaLocal);
    for(const p of [a.controlador,a.backend])assert.ok(p.parentPid>0&&Number.isFinite(Date.parse(p.criadoEm))&&Date.parse(p.criadoEm)<=inicio);
    conferirDrenagem(s);assert.equal(s.pid,filho.pid);assert.equal(s.instancia,t.destino);assert.ok(!revogado&&filho.connected);assert.equal(hash(estado.ler()),hash(e));const fim=agora();assert.ok(fim>=inicio&&fim-inicio<=30000);assert.ok(s.coletadoEm>=inicio&&s.coletadoEm<=fim);
    const recibo={nonce:crypto.randomUUID(),controller:a.controlador,backend:a.backend,instancia:t.destino,janelaId:t.id,checkpointId:t.checkpointId,configuracaoHash:t.configuracaoHash,estadoSha256:hash(e),inicio,fim,status:s,ipcConfirmado:true};
    recibos.set(recibo,{hash:hash(recibo),ativo:()=>!revogado&&filho.connected});return Object.freeze(recibo);
  }};
}
function validarContinuidadeControlador(r,e,agora=Date.now()){
  const prova=recibos.get(r);assert.ok(prova&&prova.ativo(),'CONTROLE_RECIBO_NAO_AUTENTICO');assert.equal(prova.hash,hash(r),'CONTROLE_RECIBO_ALTERADO');assert.ok(r.ipcConfirmado&&r.fim<=agora&&agora-r.inicio<=30000,'CONTROLE_RECIBO_EXPIRADO');assert.equal(r.estadoSha256,hash(e));assert.equal(r.backend.pid,e.transicao.pidDestino);assert.equal(r.backend.parentPid,r.controller.pid);assert.equal(r.instancia,e.transicao.destino);conferirDrenagem(r.status);return r;
}
module.exports={criarContinuidadeControlador,validarContinuidadeControlador};
