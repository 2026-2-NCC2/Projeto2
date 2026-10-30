"use strict";

const test = require("node:test");
const { comparacoesPendentes } = require("./fixtures/propostas-fornecedor-rpc.cjs");

// Historico: equivalencia estrita substituida por contrato ICU explicitamente
// aprovado. Estes SKIP nao sao bloqueios do contrato novo nem provas aprovadas.
// Sem drivers,
// .env, SDK ou callbacks de conexao. Implementar a comparacao somente apos
// autorizacao para fixtures reais em ambiente descartavel e oracle preservado.
for (const caso of comparacoesPendentes) {
  test.skip(`HISTORICO equivalencia estrita nao exigida pelo contrato ICU aprovado: ${caso.nome}`);
}
