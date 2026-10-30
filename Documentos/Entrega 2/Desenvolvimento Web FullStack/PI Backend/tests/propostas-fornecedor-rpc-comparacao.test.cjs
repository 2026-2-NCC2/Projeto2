"use strict";

const test = require("node:test");
const { comparacoesPendentes } = require("./fixtures/propostas-fornecedor-rpc.cjs");

// Plano executavel de pendencias, nao aprovacao de equivalencia. Sem drivers,
// .env, SDK ou callbacks de conexao. Implementar a comparacao somente apos
// autorizacao para fixtures reais em ambiente descartavel e oracle preservado.
for (const caso of comparacoesPendentes) {
  test.skip(`PENDENTE comparacao real MySQL/PostgreSQL: ${caso.nome}`);
}
