"use strict";
function validarNovaChave(nova, referencias) {
  if (!Array.isArray(referencias) || referencias.length < 2 || referencias.some(s => typeof s !== "string" || s.length < 32) ||
      typeof nova !== "string" || !/^[A-Za-z0-9_-]{64,256}$/.test(nova) || new Set(nova).size < 20 || referencias.includes(nova)) {
    throw Object.assign(Error("Chave de rotacao recusada."), { code: "JWT_ROTACAO_INVALIDA" });
  }
  return true;
}
function verificarReferencias(env) {
  const principal = env.JWT_SECRET, homologacao = env.HOMOLOG_JWT_SECRET;
  if (typeof principal !== "string" || principal.length < 32 || typeof homologacao !== "string" || homologacao.length < 64 || principal === homologacao)
    throw Object.assign(Error("Referencias JWT invalidas."), { code: "JWT_REFERENCIAS_INVALIDAS" });
  return { principalConfigurado: true, homologacaoConfigurada: true, referenciasDistintas: true,
    geracaoNovaChave: "PENDENTE_DE_AUTORIZACAO", chavesGeradas: 0, credenciaisAlteradas: 0 };
}
if (require.main === module) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== "--verificar") throw Error();
    const fs = require("node:fs"), path = require("node:path");
    const env = require("dotenv").parse(fs.readFileSync(path.resolve(__dirname, "../.env"), "utf8"));
    console.log(JSON.stringify(verificarReferencias(env)));
  } catch { console.log('{"status":"JWT_REFERENCIAS_RECUSADAS","credenciaisAlteradas":0}'); process.exitCode = 1; }
}
module.exports = { validarNovaChave, verificarReferencias };
