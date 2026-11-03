"use strict";
const assert = require("node:assert/strict");
const ORDEM = ["propostas", "inscricoes", "itens_cotacao", "cotacoes", "custos_evento", "solicitacoes_acesso", "eventos", "usuarios"];
async function limparDescartaveis({ ids, foreignKeys, ler, remover, pertence }) {
  // Auditar todo o conjunto e todas as referencias ANTES de remover algo.
  for (const table of ORDEM) for (const row of await ler(table, "id", ids[table])) {
    assert.ok(ids[table].includes(row.id) && pertence(table, row), "Registro fora do manifesto");
  }
  for (const fk of foreignKeys) {
    const col = fk.definition.match(/FOREIGN KEY \((\w+)\)/)[1];
    for (const row of await ler(fk.table, col, ids[fk.references]))
      assert.ok(ids[fk.table].includes(row.id) && pertence(fk.table, row), "Dependencia fora do manifesto");
  }
  for (const table of ORDEM) for (const id of [...ids[table]].reverse()) {
    const rows = await ler(table, "id", [id]);
    if (!rows.length) continue;
    assert.equal(rows.length, 1); assert.ok(pertence(table, rows[0]), "DELETE somente registro da run");
    assert.deepEqual(await remover(table, id), [{ id }]);
  }
  const residuos = {};
  for (const table of ORDEM) residuos[table] = (await ler(table, "id", ids[table])).map(r => r.id);
  assert.ok(Object.values(residuos).every(v => v.length === 0), "Limpeza incompleta");
  return residuos;
}
module.exports = { limparDescartaveis, ORDEM };
