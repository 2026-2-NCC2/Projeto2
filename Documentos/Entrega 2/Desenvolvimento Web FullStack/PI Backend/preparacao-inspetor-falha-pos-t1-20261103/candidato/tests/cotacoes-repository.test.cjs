"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { criarRepositorioCotacoes } = require("../repositories/mysql/cotacoes.cjs");

const item = { categoria: " Som ", descricao: " Caixa ", valor_estimado: "9999999999.99" };
const dados = { eventoId: 13, prazo: "2030-01-01", observacoes: " sem trim " };
const projecao = "c.id, c.evento_id, e.nome AS evento_nome, e.data AS evento_data, e.local AS evento_local, c.prazo, c.modalidade, c.observacoes, c.status, c.criada_em";
const casos = [
  { metodo: "bloquearCustosDoEvento", tx: true, args: [13], params: [13], lista: true,
    sql: "SELECT id, categoria, descricao, valor_estimado FROM custos_evento WHERE evento_id = ? ORDER BY id FOR UPDATE" },
  { metodo: "criar", tx: true, args: [dados], params: [13, dados.prazo, dados.observacoes],
    sql: "INSERT INTO cotacoes (evento_id, prazo, modalidade, observacoes, status) VALUES (?, ?, 'Fechada', ?, 'Aberta')",
    valor: { insertId: "9007199254740993" }, retorno: v => v.insertId },
  { metodo: "inserirItem", tx: true, args: [21, item], params: [21, item.categoria, item.descricao, item.valor_estimado],
    sql: "INSERT INTO itens_cotacao (cotacao_id, categoria, descricao, valor_estimado) VALUES (?, ?, ?, ?)",
    valor: { affectedRows: 1 } },
  { metodo: "listarPorOrganizador", args: [7], params: [7], lista: true,
    sql: `SELECT ${projecao} FROM cotacoes c INNER JOIN eventos e ON e.id = c.evento_id WHERE e.usuario_id = ? ORDER BY c.id DESC` },
  { metodo: "listarAdministrativo", args: [], lista: true,
    sql: "SELECT c.id, c.evento_id, e.nome AS evento_nome, c.prazo, c.modalidade, c.observacoes, c.status, c.criada_em FROM cotacoes c INNER JOIN eventos e ON e.id = c.evento_id ORDER BY c.id DESC" },
  { metodo: "listarDisponiveisParaFornecedor", args: [], lista: true,
    sql: `SELECT ${projecao} FROM cotacoes c INNER JOIN eventos e ON e.id = c.evento_id WHERE c.status = 'Aberta' AND c.prazo >= CURDATE() ORDER BY c.id DESC` },
  { metodo: "listarItens", args: [21], params: [21], lista: true,
    sql: "SELECT id, categoria, descricao, valor_estimado FROM itens_cotacao WHERE cotacao_id = ? ORDER BY id" },
];

for (const caso of casos) {
  test(`${caso.metodo}: preserva SQL, projecao, filtros, parametros e tipos`, async () => {
    const valor = caso.valor ?? [{ id: 21, prazo: new Date("2030-01-01T00:00:00Z"), observacoes: null, ...item }];
    let chamadas = 0;
    const executor = { async execute(sql, ...args) {
      chamadas++;
      assert.equal(sql.replace(/\s+/g, " ").trim(), caso.sql);
      assert.deepEqual(args, caso.params === undefined ? [] : [caso.params]);
      return [valor, ["metadados"]];
    } };
    const pool = caso.tx ? { execute() { throw Error("Pool nao pode substituir conexao transacional"); } } : executor;
    const repo = criarRepositorioCotacoes(pool);
    const args = caso.tx ? [executor, ...caso.args] : caso.args;
    assert.strictEqual(await repo[caso.metodo](...args), caso.retorno ? caso.retorno(valor) : valor);
    assert.equal(chamadas, 1);
  });

  test(`${caso.metodo}: propaga erro sem retry, fallback ou alterar HTTP`, async () => {
    const erro = Object.assign(new Error("falha simulada"), { code: "ER_LOCK_DEADLOCK" });
    let chamadas = 0;
    const executor = { async execute() { chamadas++; throw erro; } };
    const repo = criarRepositorioCotacoes(executor);
    await assert.rejects(() => repo[caso.metodo](...(caso.tx ? [executor, ...caso.args] : caso.args)), e => e === erro);
    assert.equal(chamadas, 1);
  });

  if (caso.lista) test(`${caso.metodo}: resultado vazio permanece array vazio`, async () => {
    const vazio = [];
    const executor = { async execute() { return [vazio]; } };
    const repo = criarRepositorioCotacoes(executor);
    assert.strictEqual(await repo[caso.metodo](...(caso.tx ? [executor, ...caso.args] : caso.args)), vazio);
  });
}
