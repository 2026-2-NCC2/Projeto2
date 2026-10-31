"use strict";
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {prepararT0Delta}=require('./preparar-t0-delta.cjs'),{executarDeltaFinal}=require('./executar-delta-final.cjs'),{validarArtefatosT0}=require('./backups-t0.cjs');
// API futura. Construir nao cria processos, faz conexoes, gera chaves ou altera estado.
function criarEtapaFinal({controlador,estado,opcoesT0,ambienteOrigem,ambienteNovo,lancar,validarSmoke}){
  let referencia;
  async function revalidar(){
    assert.ok(referencia&&typeof referencia.checkpointFile==='string','T0_AINDA_NAO_PREPARADO');const data=fs.readFileSync(referencia.checkpointFile);assert.equal(crypto.createHash('sha256').update(data).digest('hex'),referencia.checkpointSha256);const saved=JSON.parse(data);assert.equal(saved.checkpointId,referencia.checkpointId);validarArtefatosT0(saved.backups);
    const inv=structuredClone(opcoesT0.inventario),s=await controlador.status(),t=estado.ler().transicao;
    for(const p of inv.processos){const current=s[p.id];assert.ok(current);if(current.instancia!==p.instancia){assert.ok(t&&t.destino===current.instancia&&t.checkpointId===referencia.checkpointId);p.instancia=current.instancia;}}
    const result=await executarDeltaFinal({...opcoesT0,inventario:inv,supervisores:controlador,checkpoints:{mysql:saved.checkpoint.mysql,supabase:saved.checkpoint.supabase}});
    return {...result,checkpointId:referencia.checkpointId,backupsT0Verificados:true};
  }
  return {
    async prepararT0(){assert.ok(!referencia,'T0_JA_PREPARADO_SEM_RETRY_AUTOMATICO');referencia=await prepararT0Delta({...opcoesT0,supervisores:controlador});return referencia;},
    transicionar(){return controlador.substituirPlanejado({id:opcoesT0.inventario.processos[0].id,lancar,validarT0:revalidar,ambienteOrigem,ambienteNovo});},
    liberar({autorizarEscritas=false}={}){return controlador.liberarPlanejado({id:opcoesT0.inventario.processos[0].id,autorizarEscritas,validarSmoke,validarDelta:revalidar});}
  };
}
module.exports={criarEtapaFinal};
