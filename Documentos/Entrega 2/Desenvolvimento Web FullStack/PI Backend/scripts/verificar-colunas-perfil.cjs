"use strict";
// Somente metadados via GET; não lê registros, não altera schema nem usuários.
require("dotenv").config({ quiet: true });
async function main() {
  const cliente = require("../db-supabase.cjs").criarClienteSupabase();
  for (const coluna of ["id", "nome", "email", "telefone", "biografia"]) {
    const { error } = await cliente.schema("public").from("usuarios").select(coluna).limit(0);
    console.log(`${coluna}: ${error ? `indisponível (${error.code || "transporte"})` : "disponível"}`);
    if (error && !["42703", "PGRST204"].includes(error.code)) process.exitCode = 1;
  }
}
main().catch(() => { console.error("Verificação de colunas indisponível; nenhum dado alterado."); process.exitCode = 1; });
