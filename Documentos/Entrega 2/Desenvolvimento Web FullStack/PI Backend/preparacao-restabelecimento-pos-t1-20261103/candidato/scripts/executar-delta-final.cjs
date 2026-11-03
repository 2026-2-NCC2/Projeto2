"use strict";
const assert=require('node:assert/strict');
const {avaliarCongelamentoGlobal}=require('../config/preparacao-global-cutover.cjs');
const {verificarDeltaFinal}=require('./verificar-delta-final.cjs');
// Orquestracao por adapters locais. Nao importa drivers, .env ou comandos de cutover.
async function executarDeltaFinal({inventario,supervisores,evidenciasExternas,conferirPersistencia,coletarReadOnly,checkpoints,columns,agora=Date.now}){
  async function gate(){const s=await supervisores.status();assert.deepEqual(Object.keys(s).sort(),inventario.processos.map(p=>p.id).sort());
    for(const v of Object.values(s))assert.ok(v.selado&&v.requisicoesPendentes===0&&v.escritasPendentes===0&&v.operacoesPersistenciaPendentes===0&&v.resultadosIncertos===0,'DELTA_DRENAGEM_NAO_COMPROVADA');
    const persistencia=await conferirPersistencia();const g=avaliarCongelamentoGlobal({...inventario,persistenciaConferida:persistencia},[...Object.entries(s).map(([id,v])=>({id,...v})),...await evidenciasExternas()],agora());assert.equal(g.status,'APTO_PARA_COLETA');return g;}
  const antes=await gate();const snapshots=await coletarReadOnly({projeto:'gnwybroqfvwosiqzsfla',somenteLeitura:true});
  assert.equal(snapshots.projeto,'gnwybroqfvwosiqzsfla');assert.equal(snapshots.mysqlReadOnly,true);assert.equal(snapshots.supabaseReadOnly,true);assert.equal(snapshots.tlsVerificado,true);assert.equal(snapshots.catalogoConferido,true);
  const result=verificarDeltaFinal({...snapshots,checkpointMysql:checkpoints.mysql,checkpointSupabase:checkpoints.supabase,columns,gate:antes},agora());
  const depois=await gate();assert.ok(depois.avaliadoEm>=antes.avaliadoEm);
  return {...result,freezeRevalidado:true,cutoverExecutado:false};
}
module.exports={executarDeltaFinal};
