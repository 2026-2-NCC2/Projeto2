"use strict";
const { iniciarHomologacao } = require("../homologacao.cjs");
async function executar(args = process.argv.slice(2)) {
  if (args.length !== 0) {
    throw Object.assign(Error("A homologação usa exclusivamente o .env de PI Backend, sem argumentos."), { code: "HOMOLOG_ARGS" });
  }
  return iniciarHomologacao();
}
if (require.main === module) {
  executar().then(() => {
    console.log("Homologação somente leitura disponível em http://127.0.0.1:3111.");
  }).catch(erro => {
    const code = ["HOMOLOG_ARGS", "HOMOLOG_CONFIG", "HOMOLOG_PATH", "HOMOLOG_ENTRY", "HOMOLOG_START"].includes(erro?.code)
      ? erro.code : "HOMOLOG_START";
    console.error(`Homologação não iniciada (${code}). Confira as variáveis HOMOLOG_ no .env e a disponibilidade da porta 3111.`);
    process.exitCode = 1;
  });
}
module.exports = { executar };
