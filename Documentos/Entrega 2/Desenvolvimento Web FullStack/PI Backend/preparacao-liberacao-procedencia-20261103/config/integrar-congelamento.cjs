"use strict";
const { criarBarreiraDeEscritas } = require("./congelamento-escritas.cjs");
// Preparado para supervisor local. Nao altera ambiente nem ativa congelamento.
function integrarCongelamento(app) {
  if (!app || typeof app.use !== "function") throw TypeError("Aplicacao Express necessaria.");
  app.locals ??= {};
  if (app.locals.congelamentoEscritas) throw Error("Barreira ja instalada.");
  const barreira = criarBarreiraDeEscritas();
  app.use(barreira.middleware);
  app.locals.congelamentoEscritas = barreira;
  return barreira;
}
module.exports = { integrarCongelamento };
