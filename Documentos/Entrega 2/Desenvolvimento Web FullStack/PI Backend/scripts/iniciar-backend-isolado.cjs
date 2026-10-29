"use strict";

const { carregarConfiguracao, iniciarBackendIsolado, sanitizar } = require("../isolamento.cjs");

async function executar(args = process.argv.slice(2)) {
  if (args.length !== 2 || args[0] !== "--config") {
    throw Object.assign(new Error("Informe --config com o arquivo privado do ambiente isolado."), { code: "ISOLATED_CONFIG" });
  }
  const config = await carregarConfiguracao(args[1]);
  return iniciarBackendIsolado(config);
}

if (require.main === module) {
  executar().then(() => {
    console.log("Backend isolado pronto em http://127.0.0.1:3107.");
  }).catch(erro => {
    console.error(`Backend isolado nao iniciado (${sanitizar(erro).code}).`);
    process.exitCode = 1;
  });
}

module.exports = { executar };
