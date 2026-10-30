"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { criarRepositorioEventos } = require("../repositories/mysql/eventos.cjs");

// Nenhum driver, servidor, .env ou banco real. Contratos HTTP continuam cobertos
// pelas suites existentes, que carregam este repositorio com o banco simulado.
const evento = { id: 13, nome: " Evento ", data: new Date("2030-01-01T00:00:00Z"),
  horario: "10:00:00", local: " Local ", categoria: "Corporativo", publico: 10,
  descricao: null, status: "Em planejamento", usuario_id: 7 };
const entrada = { nome: " Evento ", data: "2030-01-01", horario: "10:00", local: " Local ",
  categoria: "", publico: 10, descricao: "", status: "Em planejamento", usuarioId: 7 };
const selecao = "id, nome, data, horario, local, categoria, publico, descricao, status, usuario_id";
const casos = [
  { metodo: "listarPorUsuario", args: [7], params: [7], lista: true,
    sql: `SELECT ${selecao} FROM eventos WHERE usuario_id = ? ORDER BY id DESC`,
    resultado: [evento], retorno: valor => valor },
  { metodo: "listarAdministrativo", args: [], lista: true,
    sql: "SELECT e.id, e.nome, e.data, e.horario, e.local, e.categoria, e.publico, e.descricao, e.status, e.usuario_id, u.nome AS organizador_nome FROM eventos e INNER JOIN usuarios u ON u.id = e.usuario_id ORDER BY e.id DESC",
    resultado: [{ ...evento, organizador_nome: "Pessoa" }], retorno: valor => valor },
  { metodo: "listarAtivosParaParticipante", args: [], lista: true,
    sql: "SELECT id, nome, data, horario, local, categoria, publico, descricao, status FROM eventos WHERE status = 'Ativo' ORDER BY data ASC, id ASC",
    resultado: [{ id: 13, data: evento.data, descricao: null }], retorno: valor => valor },
  { metodo: "buscarPorIdDoUsuario", args: [13, 7], params: [13, 7], detalhe: true,
    sql: `SELECT ${selecao} FROM eventos WHERE id = ? AND usuario_id = ?`,
    resultado: [evento], retorno: valor => valor[0] },
  { metodo: "criar", args: [entrada],
    sql: "INSERT INTO eventos (nome, data, horario, local, categoria, publico, descricao, status, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    params: [entrada.nome, entrada.data, entrada.horario, entrada.local, entrada.categoria,
      entrada.publico, entrada.descricao, entrada.status, entrada.usuarioId],
    resultado: { insertId: "9007199254740993" }, retorno: valor => valor.insertId },
  { metodo: "atualizar", args: [13, 7, entrada], alteracao: true,
    sql: "UPDATE eventos SET nome = ?, data = ?, horario = ?, local = ?, categoria = ?, publico = ?, descricao = ? WHERE id = ? AND usuario_id = ?",
    params: [entrada.nome, entrada.data, entrada.horario, entrada.local, entrada.categoria,
      entrada.publico, entrada.descricao, 13, 7],
    resultado: { affectedRows: 1 }, retorno: valor => valor.affectedRows },
  { metodo: "excluir", args: [13, 7], params: [13, 7], alteracao: true,
    sql: "DELETE FROM eventos WHERE id = ? AND usuario_id = ?",
    resultado: { affectedRows: 1 }, retorno: valor => valor.affectedRows },
  { metodo: "publicar", args: [13, 7], params: [13, 7], alteracao: true,
    sql: "UPDATE eventos SET status = 'Ativo' WHERE id = ? AND usuario_id = ? AND status = 'Em planejamento'",
    resultado: { affectedRows: 1 }, retorno: valor => valor.affectedRows },
];

for (const caso of casos) {
  test(`${caso.metodo}: preserva SQL, parametros, campos e retorno sem conversao`, async () => {
    let chamadas = 0;
    const repo = criarRepositorioEventos({ async execute(sql, ...args) {
      chamadas++;
      assert.equal(sql.replace(/\s+/g, " ").trim(), caso.sql);
      assert.deepEqual(args, caso.params === undefined ? [] : [caso.params]);
      return [caso.resultado, ["metadados nao retornados"]];
    } });
    assert.strictEqual(await repo[caso.metodo](...caso.args), caso.retorno(caso.resultado));
    assert.equal(chamadas, 1);
    assert.equal(entrada.nome, " Evento "); // Normalizacao continua no handler.
  });

  test(`${caso.metodo}: propaga erro original sem retry, fallback ou HTTP`, async () => {
    for (const code of ["ECONNREFUSED", "ER_ROW_IS_REFERENCED_2"]) {
      const erro = Object.assign(new Error("falha simulada"), { code });
      let chamadas = 0;
      const repo = criarRepositorioEventos({ async execute() { chamadas++; throw erro; } });
      await assert.rejects(() => repo[caso.metodo](...caso.args), recebido => recebido === erro);
      assert.equal(chamadas, 1);
    }
  });

  if (caso.lista || caso.detalhe) test(`${caso.metodo}: preserva ausencia de resultados`, async () => {
    const vazio = [];
    const repo = criarRepositorioEventos({ async execute() { return [vazio]; } });
    assert.strictEqual(await repo[caso.metodo](...caso.args), caso.retorno(vazio));
  });

  if (caso.alteracao) test(`${caso.metodo}: affectedRows zero permanece zero para o 404 do handler`, async () => {
    const repo = criarRepositorioEventos({ async execute() { return [{ affectedRows: 0 }]; } });
    assert.equal(await repo[caso.metodo](...caso.args), 0);
  });
}

test("repositorios independentes usam somente adaptador injetado, sem cache ou consultas extras", async () => {
  let consultas = 0;
  const a = criarRepositorioEventos({ async execute() { consultas++; return [[{ ...evento, id: consultas }]]; } });
  const b = criarRepositorioEventos({ async execute() { return [[]]; } });
  assert.equal((await a.buscarPorIdDoUsuario(13, 7)).id, 1);
  assert.equal(await b.buscarPorIdDoUsuario(13, 7), undefined);
  assert.equal((await a.buscarPorIdDoUsuario(13, 7)).id, 2);
  assert.equal(consultas, 2);
});
