"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { criarRepositorioPropostas } = require("../repositories/mysql/propostas.cjs");

const dados = { cotacaoId: "013", fornecedorId: 7, valor: 12.345,
  condicoesPagamento: " Pix ", detalhesTecnicos: " Som " };
const recebida = "p.id, p.cotacao_id, p.fornecedor_id, p.valor, p.condicoes_pagamento, p.detalhes_tecnicos, p.status, p.criada_em, e.id AS evento_id, e.nome AS evento_nome, u.nome AS fornecedor_nome";
const joins = "FROM propostas p INNER JOIN cotacoes c ON c.id = p.cotacao_id INNER JOIN eventos e ON e.id = c.evento_id INNER JOIN usuarios u ON u.id = p.fornecedor_id";
const casos = [
  { metodo: "buscarCotacaoDisponivel", args: ["013"], params: ["013"], lista: true,
    sql: "SELECT id FROM cotacoes WHERE id = ? AND status = 'Aberta' AND prazo >= CURDATE()" },
  { metodo: "criar", args: [dados], params: ["013", 7, 12.345, " Pix ", " Som "],
    sql: "INSERT INTO propostas (cotacao_id, fornecedor_id, valor, condicoes_pagamento, detalhes_tecnicos) VALUES (?, ?, ?, ?, ?)",
    valor: { insertId: "9007199254740993" }, retorno: v => v.insertId },
  { metodo: "listarPorFornecedor", args: [7], params: [7], lista: true,
    sql: "SELECT p.id, p.cotacao_id, p.valor, p.condicoes_pagamento, p.detalhes_tecnicos, p.status, p.criada_em, e.nome AS evento_nome, GROUP_CONCAT(DISTINCT i.categoria SEPARATOR ', ') AS categoria FROM propostas p INNER JOIN cotacoes c ON c.id = p.cotacao_id INNER JOIN eventos e ON e.id = c.evento_id LEFT JOIN itens_cotacao i ON i.cotacao_id = c.id WHERE p.fornecedor_id = ? GROUP BY p.id, p.cotacao_id, p.valor, p.condicoes_pagamento, p.detalhes_tecnicos, p.status, p.criada_em, e.nome ORDER BY p.criada_em DESC, p.id DESC" },
  { metodo: "listarPorOrganizador", args: [7], params: [7], lista: true,
    sql: `SELECT ${recebida} ${joins} WHERE e.usuario_id = ? ORDER BY p.criada_em DESC, p.id DESC` },
  { metodo: "listarAdministrativo", args: [], lista: true,
    sql: `SELECT ${recebida} ${joins} ORDER BY p.criada_em DESC, p.id DESC` },
  { metodo: "avaliar", args: [13, 7, "Aprovada"], params: ["Aprovada", 13, 7],
    sql: "UPDATE propostas p INNER JOIN cotacoes c ON c.id = p.cotacao_id INNER JOIN eventos e ON e.id = c.evento_id SET p.status = ? WHERE p.id = ? AND e.usuario_id = ? AND p.status = 'Em avaliação'",
    valor: { affectedRows: 1 }, retorno: v => v.affectedRows },
];

for (const caso of casos) {
  test(`${caso.metodo}: preserva query, SQL, filtros, ordenacao, parametros e tipos`, async () => {
    const linhas = [{ id: 21, cotacao_id: 13, fornecedor_id: 7, valor: "12.30",
      condicoes_pagamento: "Pix", detalhes_tecnicos: "Som", status: "Em avaliação",
      criada_em: new Date("2030-01-01T00:00:00Z"), evento_id: 9,
      evento_nome: "Evento", fornecedor_nome: "Fornecedor", categoria: null }];
    const valor = caso.valor ?? linhas;
    let chamadas = 0;
    const db = { async query(sql, ...args) {
      chamadas++;
      assert.equal(sql.replace(/\s+/g, " ").trim(), caso.sql);
      assert.deepEqual(args, caso.params === undefined ? [] : [caso.params]);
      return [valor, ["metadados"]];
    } };
    const repo = criarRepositorioPropostas(db);
    assert.strictEqual(await repo[caso.metodo](...caso.args), caso.retorno ? caso.retorno(valor) : valor);
    assert.equal(chamadas, 1);
  });

  test(`${caso.metodo}: propaga falha original sem retry ou fallback`, async () => {
    const erro = Object.assign(new Error("falha simulada"), { code: "ER_DUP_ENTRY" });
    let chamadas = 0;
    const repo = criarRepositorioPropostas({ async query() { chamadas++; throw erro; } });
    await assert.rejects(() => repo[caso.metodo](...caso.args), e => e === erro);
    assert.equal(chamadas, 1);
  });

  if (caso.lista) test(`${caso.metodo}: preserva lista vazia`, async () => {
    const vazio = [];
    const repo = criarRepositorioPropostas({ async query() { return [vazio]; } });
    assert.strictEqual(await repo[caso.metodo](...caso.args), vazio);
  });
}

test("avaliacao: zero linhas afetadas permanece zero para ausente, alheia ou ja avaliada", async () => {
  const repo = criarRepositorioPropostas({ async query() { return [{ affectedRows: 0 }]; } });
  assert.equal(await repo.avaliar(13, 7, "Recusada"), 0);
});

test("repositorios usam exclusivamente o adaptador injetado, sem cache entre chamadas", async () => {
  let chamadas = 0;
  const a = criarRepositorioPropostas({ async query() { return [[{ id: ++chamadas }]]; } });
  const b = criarRepositorioPropostas({ async query() { return [[{ id: 99 }]]; } });
  assert.deepEqual(await a.listarPorFornecedor(7), [{ id: 1 }]);
  assert.deepEqual(await b.listarPorFornecedor(8), [{ id: 99 }]);
  assert.deepEqual(await a.listarPorFornecedor(7), [{ id: 2 }]);
});
