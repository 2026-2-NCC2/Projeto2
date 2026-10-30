"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { criarRepositorioInscricoes } = require("../repositories/mysql/inscricoes.cjs");

const casos = [
  { metodo: "buscarEventoAtivo", args: [13], params: [13], lista: true,
    sql: "SELECT id FROM eventos WHERE id = ? AND status = 'Ativo'" },
  { metodo: "buscarPorUsuarioEEvento", args: [7, 13], params: [7, 13], lista: true,
    sql: "SELECT id FROM inscricoes WHERE usuario_id = ? AND evento_id = ?" },
  { metodo: "criar", args: [7, 13], params: [7, 13],
    sql: "INSERT INTO inscricoes (usuario_id, evento_id) VALUES (?, ?)",
    valor: { insertId: "9007199254740993" }, retorno: v => v.insertId },
  { metodo: "listarPorUsuario", args: [7], params: [7], lista: true,
    sql: "SELECT i.id, i.evento_id, i.status, i.data_inscricao, e.nome AS evento_nome, e.data AS evento_data, e.horario AS evento_horario, e.local AS evento_local, e.categoria AS evento_categoria FROM inscricoes i INNER JOIN eventos e ON i.evento_id = e.id WHERE i.usuario_id = ? ORDER BY i.data_inscricao DESC" },
];

for (const caso of casos) {
  test(`${caso.metodo}: preserva execute, SQL, filtros, campos, ordem e parametros`, async () => {
    const linhas = [{ id: 21, evento_id: 13, status: "Confirmada",
      data_inscricao: new Date("2030-01-01T12:00:00Z"), evento_nome: "Evento",
      evento_data: "2030-01-02", evento_horario: "19:00:00", evento_local: "Local",
      evento_categoria: null }];
    const valor = caso.valor ?? linhas;
    let chamadas = 0;
    const repo = criarRepositorioInscricoes({ async execute(sql, params) {
      chamadas++;
      assert.equal(sql.replace(/\s+/g, " ").trim(), caso.sql);
      assert.deepEqual(params, caso.params);
      return [valor, ["metadados"]];
    } });
    assert.strictEqual(await repo[caso.metodo](...caso.args), caso.retorno ? caso.retorno(valor) : valor);
    assert.equal(chamadas, 1);
  });

  test(`${caso.metodo}: propaga erro original e ER_DUP_ENTRY sem retry`, async () => {
    for (const code of ["ER_DUP_ENTRY", "ER_ACCESS_DENIED_ERROR"]) {
      const erro = Object.assign(new Error("falha simulada"), { code });
      let chamadas = 0;
      const repo = criarRepositorioInscricoes({ async execute() { chamadas++; throw erro; } });
      await assert.rejects(() => repo[caso.metodo](...caso.args), e => e === erro);
      assert.equal(chamadas, 1);
    }
  });

  if (caso.lista) test(`${caso.metodo}: preserva array vazio`, async () => {
    const vazio = [];
    const repo = criarRepositorioInscricoes({ async execute() { return [vazio]; } });
    assert.strictEqual(await repo[caso.metodo](...caso.args), vazio);
  });
}

test("repositorios usam somente o adaptador injetado, sem cache ou consultas adicionais", async () => {
  let chamadas = 0;
  const a = criarRepositorioInscricoes({ async execute() { return [[{ id: ++chamadas }]]; } });
  const b = criarRepositorioInscricoes({ async execute() { return [[{ id: 99 }]]; } });
  assert.deepEqual(await a.listarPorUsuario(7), [{ id: 1 }]);
  assert.deepEqual(await b.listarPorUsuario(8), [{ id: 99 }]);
  assert.deepEqual(await a.listarPorUsuario(7), [{ id: 2 }]);
});
