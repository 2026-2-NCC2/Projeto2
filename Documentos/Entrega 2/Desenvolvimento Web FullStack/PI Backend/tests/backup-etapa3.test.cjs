'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizarConstraint,CHECK_ORIGEM,CHECK_RESTAURADO}=require('../scripts/backup-etapa3-validado.cjs');
test('normalização de catálogo aceita somente os casts equivalentes da restrição conhecida',()=>{
  const c={table:'eventos',name:'eventos_ciclo_v1',definition:CHECK_RESTAURADO};
  assert.equal(normalizarConstraint(c).definition,CHECK_ORIGEM);
  for(const alterado of [{...c,table:'outra'},{...c,name:'outra'},
    {...c,definition:c.definition.replace('COLLATE "C"','')},
    {...c,definition:c.definition.replace('Encerrado','Outro')},
    {...c,definition:c.definition.replace('status IS NOT NULL','status IS NULL')}])assert.deepEqual(normalizarConstraint(alterado),alterado);
});
