"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { criarRepositorioPropostas } = require("../repositories/mysql/propostas.cjs");
const { decimalTexto, instante } = require("../repositories/supabase/suporte-leitura.cjs");
const { campos, base, retornosSimulados, comparacoesPendentes, medidasBytes } = require("./fixtures/propostas-fornecedor-rpc.cjs");

// Validador APENAS de contrato de teste. Nao e adaptador RPC de producao e nao
// simula collation, agregacao ou truncamento. Nenhuma consulta real e realizada.
function conferirObjetoRpc(objeto) {
  assert.ok(objeto && typeof objeto === "object" && !Array.isArray(objeto));
  assert.deepEqual(Object.keys(objeto).sort(), [...campos].sort());
  assert.ok(Number.isSafeInteger(objeto.id) && objeto.id > 0);
  assert.ok(Number.isSafeInteger(objeto.cotacao_id) && objeto.cotacao_id > 0);
  for (const campo of ["condicoes_pagamento", "detalhes_tecnicos", "status", "evento_nome"]) {
    assert.equal(typeof objeto[campo], "string");
  }
  assert.ok(objeto.categoria === null || typeof objeto.categoria === "string");
  decimalTexto(objeto.valor, "TEST_CONTRATO");
  instante(objeto.criada_em, "TEST_CONTRATO");
}

for (const fixture of retornosSimulados) {
  test(`contrato futuro: ${fixture.nome}, sem normalizacao no transporte`, async () => {
    const wire = Object.freeze({ ...base, categoria: fixture.categoria });
    conferirObjetoRpc(wire);
    const data = instante(wire.criada_em, "TEST_CONTRATO");
    const rowMySQL = Object.freeze({ ...wire, criada_em: data });
    let consultas = 0;
    const repo = criarRepositorioPropostas({ async query(sql, args) {
      consultas++;
      assert.deepEqual(args, [7]);
      assert.match(sql, /WHERE p.fornecedor_id = \?/);
      return [[rowMySQL], []];
    } });
    const [recebido] = await repo.listarPorFornecedor(7);
    assert.strictEqual(recebido, rowMySQL);
    assert.equal(recebido.categoria, wire.categoria);
    assert.equal(recebido.valor, wire.valor);
    assert.equal(recebido.criada_em.toJSON(), "2030-01-01T13:00:00.000Z");
    assert.equal(recebido.condicoes_pagamento, " Pix ");
    assert.equal(consultas, 1);
  });
}

test("contrato futuro: dados invalidos nao podem ser aceitos como propostas", () => {
  const valido = { ...base, categoria: null };
  const semCampo = { ...valido };
  delete semCampo.evento_nome;
  for (const row of [null, [], semCampo, { ...valido, id: "2" },
    { ...valido, categoria: [] }, { ...valido, senha: "campo proibido" },
    { ...valido, valor: 0.1 }, { ...valido, valor: "1.001" },
    { ...valido, criada_em: "2030-01-01T10:00:00" }]) {
    assert.throws(() => conferirObjetoRpc(row));
  }
});

test("contrato futuro: ausencia e array vazio, sem proposta artificial", async () => {
  const repo = criarRepositorioPropostas({ async query() { return [[], []]; } });
  assert.deepEqual(await repo.listarPorFornecedor(7), []);
});

test("conversor existente preserva escala, teto e valores historicos sem regra nova", () => {
  for (const valor of ["0.00", "0.10", "0.20", "9999999999.99", "-10.25"]) {
    assert.equal(decimalTexto(valor, "TEST_CONTRATO"), valor);
  }
});

for (const fixture of medidasBytes) {
  test(`fixture de bytes: ${fixture.nome}, sem decidir regra de truncamento`, () => {
    const tamanho = Buffer.byteLength(fixture.texto, "utf8");
    assert.equal(tamanho, fixture.bytesUtf8);
    assert.equal(Math.sign(tamanho - fixture.limiteFixtureBytes), fixture.relacao);
    assert.notEqual(tamanho, fixture.texto.length);
  });
}

test("fixtures Unicode e espacos mantem variantes sem escolher equivalencia", () => {
  assert.notEqual("Áudio", "A\u0301udio");
  assert.equal(Buffer.byteLength("Áudio", "utf8"), 6);
  assert.equal(Buffer.byteLength("A\u0301udio", "utf8"), 7);
  const espacos = comparacoesPendentes.find(caso => caso.nome === "espacos finais").itens;
  assert.deepEqual(espacos.map(s => s.length), [3, 4, 5]);
  // Nao afirmar que as variantes sao iguais/distintas para o banco.
});

test("casos de comparacao nao contem resultado real inventado", () => {
  assert.equal(comparacoesPendentes.length, 8);
  for (const caso of comparacoesPendentes) {
    assert.ok(Array.isArray(caso.itens));
    assert.ok(!Object.hasOwn(caso, "resultadoMySQL"));
    assert.ok(!Object.hasOwn(caso, "resultadoPostgreSQL"));
  }
});
