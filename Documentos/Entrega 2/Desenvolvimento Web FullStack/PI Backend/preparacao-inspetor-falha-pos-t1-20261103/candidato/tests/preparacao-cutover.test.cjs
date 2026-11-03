"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), { EventEmitter } = require("node:events");
const { criarBarreiraDeEscritas } = require("../config/congelamento-escritas.cjs");
const { validarNovaChave, verificarReferencias } = require("../scripts/preparar-rotacao-jwt.cjs");
function resposta() { const r = new EventEmitter(); r.statusCode = 200; r.setHeader = () => {}; r.status = code => { r.statusCode = code; return r; }; r.json = data => { r.data = data; return r; }; return r; }
test("integracao preparada instala middleware inativo antes dos parsers, sem endpoint publico", () => {
  const middlewares = [], app = { locals: {}, use(fn) { middlewares.push(fn); } };
  const { integrarCongelamento } = require("../config/integrar-congelamento.cjs");
  const b = integrarCongelamento(app); const parser = () => {}; app.use(parser);
  assert.equal(middlewares[0], b.middleware); assert.equal(middlewares[1], parser);
  assert.equal(app.locals.congelamentoEscritas, b); assert.equal(b.status().congelado, false);
  assert.throws(() => integrarCongelamento(app));
  let next = 0; const r = resposta(); middlewares[0]({ method: "POST", path: "/eventos" }, r, () => next++);
  assert.equal(next, 1); r.emit("finish"); assert.equal(b.status().escritasPendentes, 0);
});
test("barreira inativa preserva requests; congelada bloqueia novas escritas antes de next", async () => {
  const b = criarBarreiraDeEscritas(), r = resposta(); let calls = 0;
  b.middleware({ method: "POST", path: "/eventos" }, r, () => calls++); r.emit("finish");
  assert.equal(calls, 1); b.congelar();
  const blocked = resposta(); b.middleware({ method: "DELETE", path: "/eventos/1" }, blocked, () => calls++);
  assert.equal(blocked.statusCode, 503); assert.equal(calls, 1); await b.aguardarDrenagem();
});
test("barreira preserva GET e POST login durante freeze", () => {
  const b = criarBarreiraDeEscritas(); b.congelar(); let calls = 0;
  for (const [method, route] of [["GET", "/perfil"], ["HEAD", "/eventos"], ["OPTIONS", "/login"], ["POST", "/login"]])
    b.middleware({ method, path: route }, resposta(), () => calls++);
  assert.equal(calls, 4); assert.equal(b.status().escritasPendentes, 0);
});
test("drain aguarda finish de escrita admitida antes do freeze", async () => {
  const b = criarBarreiraDeEscritas(), r = resposta(); b.middleware({ method: "PUT", path: "/eventos/1" }, r, () => {});
  b.congelar(); assert.equal(b.status().escritasPendentes, 1);
  const done = b.aguardarDrenagem(); r.emit("finish"); await done;
  assert.equal(b.status().escritasPendentes, 0); b.liberar(); assert.equal(b.status().congelado, false);
});
test("desconexao ou 5xx nao sao prova de rollback; freeze continua bloqueado", async () => {
  for (const mode of ["close", "5xx"]) {
    const b = criarBarreiraDeEscritas(), r = resposta(); b.middleware({ method: "POST", path: "/cotacoes" }, r, () => {}); b.congelar();
    const failed = assert.rejects(b.aguardarDrenagem(), { code: "FREEZE_RESULTADO_INCERTO" });
    if (mode === "5xx") { r.statusCode = 500; r.emit("finish"); } else r.emit("close");
    await failed; assert.equal(b.status().congelado, true); assert.equal(b.status().resultadosIncertos, 1);
    assert.throws(() => b.liberar(), { code: "FREEZE_DRENAGEM_PENDENTE" });
  }
});
test("timeout de drain nao libera escrita e nao descarta pendencias", async () => {
  const b = criarBarreiraDeEscritas(), r = resposta(); b.middleware({ method: "POST", path: "/eventos" }, r, () => {}); b.congelar();
  await assert.rejects(b.aguardarDrenagem(5), { code: "FREEZE_TIMEOUT" });
  assert.equal(b.status().escritasPendentes, 1); assert.equal(b.status().congelado, true); r.emit("finish");
});
test("JWT: rejeita reutilizacao principal/homologacao e nao altera referencias", () => {
  const principal = "principal_ficticio_" + "a".repeat(32), homol = "homologacao_ficticia_" + "b".repeat(64);
  const env = { JWT_SECRET: principal, HOMOLOG_JWT_SECRET: homol }, before = { ...env };
  assert.equal(verificarReferencias(env).credenciaisAlteradas, 0);
  for (const nova of [principal, homol, "x".repeat(64), "curta"]) assert.throws(() => validarNovaChave(nova, [principal, homol]));
  assert.equal(validarNovaChave("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-", [principal, homol]), true);
  assert.deepEqual(env, before);
});
