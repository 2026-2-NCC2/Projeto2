'use strict';
const assert=require('node:assert/strict');
// Nomes confirmados pelo schema PI Backend; o adapter SQL reconfirma ownership.
const SEQUENCIAS={eventos:'eventos_id_seq',custos_evento:'custos_evento_id_seq'};
function catalogoT1(base,atual,{createdEventIds=[],createdCostIds=[]}){
  const copy=structuredClone(atual);
  if(base.sequences===undefined){assert.equal(copy.sequences,undefined);assert.deepEqual(copy,base);return copy;}
  assert.ok(Array.isArray(base.sequences)&&Array.isArray(copy.sequences));
  for(const [table,ids] of [['eventos',createdEventIds],['custos_evento',createdCostIds]]){
    assert.ok(ids.length<=1);const old=base.sequences.find(x=>x.schemaname==='public'&&x.sequencename===SEQUENCIAS[table]),next=copy.sequences.find(x=>x.schemaname==='public'&&x.sequencename===SEQUENCIAS[table]);assert.ok(old&&next);assert.equal(Number(old.increment_by),1);assert.equal(Number(old.cache_size),1);
    if(ids.length){const prior=Number(old.last_value),last=Number(next.last_value);assert.ok(old.last_value!==null&&Number.isSafeInteger(prior)&&last===ids[0]&&last===prior+1,'T1_SEQUENCIA_DIVERGENTE');next.last_value=old.last_value;}
  }
  assert.deepEqual(copy,base,'T1_CATALOGO_DIVERGENTE');return copy;
}
module.exports={catalogoT1,SEQUENCIAS};
