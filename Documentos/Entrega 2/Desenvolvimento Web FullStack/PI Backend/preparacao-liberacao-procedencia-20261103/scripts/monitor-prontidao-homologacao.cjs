"use strict";
const { StringDecoder } = require("node:string_decoder");

// Escapes ASCII evitam corromper o sinal ao transportar scripts pelo PowerShell.
const SINAL = "Homologa\u00e7\u00e3o somente leitura dispon\u00edvel em http://127.0.0.1:3111.";
function aguardarProntidao(filho, tempoMs = 12000) {
  return new Promise((resolve, reject) => {
    const decoder = new StringDecoder("utf8");
    let trecho = "";
    const timer = setTimeout(() => terminar("STARTUP_TIMEOUT"), tempoMs);
    function limpar() {
      clearTimeout(timer);
      filho.stdout.removeListener("data", dados);
      filho.removeListener("exit", saiu);
      filho.removeListener("error", erro);
    }
    function terminar(code) {
      limpar();
      if (code) reject(Object.assign(new Error("Prontidao nao confirmada."), { code }));
      else resolve();
    }
    function dados(chunk) {
      trecho += typeof chunk === "string" ? chunk : decoder.write(chunk);
      if (trecho.includes(SINAL)) terminar();
      else trecho = trecho.slice(-SINAL.length);
    }
    function saiu() { terminar("STARTUP_RECUSADO"); }
    function erro() { terminar("STARTUP_ERRO"); }
    filho.stdout.on("data", dados);
    filho.once("exit", saiu);
    filho.once("error", erro);
  });
}
module.exports = { aguardarProntidao };
