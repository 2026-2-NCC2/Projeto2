"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { aguardarProntidao } = require("../scripts/monitor-prontidao-homologacao.cjs");
const sinal = "Homologa\u00e7\u00e3o somente leitura dispon\u00edvel em http://127.0.0.1:3111.";
function filho() { const p = new EventEmitter(); p.stdout = new EventEmitter(); return p; }
function limpo(p) {
  assert.equal(p.stdout.listenerCount("data"), 0);
  assert.equal(p.listenerCount("exit"), 0);
  assert.equal(p.listenerCount("error"), 0);
}
test("monitor: regressao ASCII reproduz falha anterior e sinal UTF8 e reconhecido", async () => {
  const corrompido = sinal.replace(/[^\x00-\x7f]/g, "?");
  assert.equal(sinal.includes(corrompido), false);
  const p = filho(), ready = aguardarProntidao(p);
  p.stdout.emit("data", Buffer.from(sinal + "\r\n", "utf8"));
  await ready; limpo(p);
});
test("monitor: reconhece prontidao em todas as fragmentacoes incluindo acentos UTF8", async () => {
  const bytes = Buffer.from(sinal, "utf8");
  for (let i = 1; i < bytes.length; i++) {
    const p = filho(), ready = aguardarProntidao(p);
    p.stdout.emit("data", bytes.subarray(0, i));
    p.stdout.emit("data", bytes.subarray(i));
    await ready; limpo(p);
  }
});
test("monitor: porta ou host divergente nao confirma prontidao", async () => {
  const p = filho(), ready = aguardarProntidao(p, 10);
  const rejection = assert.rejects(ready, { code: "STARTUP_TIMEOUT" });
  p.stdout.emit("data", Buffer.from(sinal.replace("3111", "3001")));
  p.stdout.emit("data", Buffer.from(sinal.replace("127.0.0.1", "0.0.0.0")));
  await rejection; limpo(p);
});
test("monitor: saida prematura e erro do processo falham sem expor logs", async () => {
  for (const [event, code] of [["exit", "STARTUP_RECUSADO"], ["error", "STARTUP_ERRO"]]) {
    const p = filho(), ready = aguardarProntidao(p);
    const rejection = assert.rejects(ready, e => e.code === code && !e.message.includes("privado"));
    p.emit(event, new Error("privado")); await rejection; limpo(p);
  }
});
