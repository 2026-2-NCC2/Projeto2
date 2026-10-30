"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { criarRepositorioPropostas } = require("../repositories/mysql/propostas.cjs");
const { criarRepositorioPropostas: criarSupabase } = require("../repositories/supabase/propostas.cjs");

// Fixtures de retorno do DRIVER, nao um emulador de GROUP_CONCAT. Os exemplos
// nao estabelecem regras reais de collation/ordem/tamanho. Nenhum banco e usado.
const proposta = { id: 2, cotacao_id: 6, valor: "9999999999.99", condicoes_pagamento: " Pix ",
  detalhes_tecnicos: " Som ", status: "Recusada", criada_em: new Date("2030-01-01T13:00:00Z"),
  evento_nome: " Evento Á " };
const fixtures = [
  { nome: "multiplos itens ja agregados pelo driver", categoria: "Som, Luz" },
  { nome: "duplicatas ja eliminadas pelo driver", categoria: "Som" },
  { nome: "acentos preservados na string agregada", categoria: "Áudio, Segurança" },
  { nome: "sem itens ou apenas expressoes NULL", categoria: null },
  { nome: "categoria vazia nao vira NULL", categoria: "" },
  { nome: "separador dentro de categoria nao e reinterpretado", categoria: "Som, Luz, Palco" },
  { nome: "string parcial do driver nao e completada ou rejeitada", categoria: "Áudio, Ilum" },
];

for (const fixture of fixtures) {
  test(`fornecedor MySQL: ${fixture.nome}`, async () => {
    const row = Object.freeze({ ...proposta, categoria: fixture.categoria });
    const rows = Object.freeze([row]);
    let consultas = 0;
    const repo = criarRepositorioPropostas({ async query(sql, parametros) {
      consultas++;
      assert.deepEqual(parametros, [7]);
      const texto = sql.replace(/\s+/g, " ").trim();
      assert.ok(texto.includes("GROUP_CONCAT(DISTINCT i.categoria SEPARATOR ', ') AS categoria"));
      assert.ok(texto.includes("INNER JOIN cotacoes c ON c.id = p.cotacao_id"));
      assert.ok(texto.includes("INNER JOIN eventos e ON e.id = c.evento_id"));
      assert.ok(texto.includes("LEFT JOIN itens_cotacao i ON i.cotacao_id = c.id"));
      assert.ok(texto.includes("WHERE p.fornecedor_id = ? GROUP BY"));
      assert.ok(texto.endsWith("ORDER BY p.criada_em DESC, p.id DESC"));
      assert.ok(!texto.includes("CURDATE"));
      assert.ok(!texto.includes("p.status ="));
      return [rows, []];
    } });
    const recebido = await repo.listarPorFornecedor(7);
    assert.strictEqual(recebido, rows);
    assert.strictEqual(recebido[0], row);
    assert.equal(recebido[0].categoria, fixture.categoria);
    assert.equal(recebido[0].valor, "9999999999.99");
    assert.strictEqual(recebido[0].criada_em, proposta.criada_em);
    assert.equal(consultas, 1);
  });
}

test("fornecedor MySQL: nenhuma proposta permanece lista vazia", async () => {
  const rows = [];
  const repo = criarRepositorioPropostas({ async query() { return [rows, []]; } });
  assert.strictEqual(await repo.listarPorFornecedor(7), rows);
});

test("fornecedor MySQL: falha do driver e propagada sem retry/fallback", async () => {
  const erro = Object.assign(new Error("falha simulada"), { code: "ER_QUERY_INTERRUPTED" });
  let consultas = 0;
  const repo = criarRepositorioPropostas({ async query() { consultas++; throw erro; } });
  await assert.rejects(repo.listarPorFornecedor(7), e => e === erro);
  assert.equal(consultas, 1);
});

test("fornecedor Supabase: contrato aprovado exposto sem inicializar fabrica ou transporte", () => {
  // Cliente vazio injetado: nenhuma fabrica/configuracao/conexao e utilizada.
  assert.equal(typeof criarSupabase({}).listarPorFornecedor, 'function');
});
