"use strict";

const { Pool } = require("pg");
const { readFileSync } = require("node:fs");

function erroConfiguracao(mensagem) {
  return Object.assign(new Error(mensagem), { code: "POSTGRES_CONFIG" });
}

function inteiro(env, nome, padrao, limite = Number.MAX_SAFE_INTEGER) {
  const valor = env[nome] ?? String(padrao);
  if (!/^\d+$/.test(valor) || !Number.isSafeInteger(Number(valor)) || Number(valor) < 1 || Number(valor) > limite) {
    throw erroConfiguracao(`${nome} deve ser um inteiro positivo ate ${limite}.`);
  }
  return Number(valor);
}

// Criar o pool nao abre conexoes. Somente query()/connect() fazem acesso ao banco.
// O chamador carrega seu ambiente explicitamente; este modulo nao le .env.
function criarPoolPostgres(env = process.env) {
  for (const nome of ["PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD"]) {
    if (typeof env[nome] !== "string" || !env[nome].trim()) {
      throw erroConfiguracao(`${nome} deve ser definido para usar PostgreSQL.`);
    }
  }

  const ssl = { rejectUnauthorized: true, minVersion: "TLSv1.2" };
  if (env.PGSSLROOTCERT) {
    try {
      ssl.ca = readFileSync(env.PGSSLROOTCERT, "utf8");
      if (!ssl.ca.trim()) throw new Error("Certificado vazio");
    } catch {
      throw erroConfiguracao("Nao foi possivel carregar a CA de PGSSLROOTCERT.");
    }
  }

  const pool = new Pool({
    host: env.PGHOST,
    port: inteiro(env, "PGPORT", 5432, 65535),
    database: env.PGDATABASE,
    user: env.PGUSER,
    password: env.PGPASSWORD,
    max: inteiro(env, "PGPOOL_MAX", 10),
    connectionTimeoutMillis: inteiro(env, "PGCONNECT_TIMEOUT_MS", 10000),
    idleTimeoutMillis: inteiro(env, "PGIDLE_TIMEOUT_MS", 30000),
    ssl,
  });

  // Erros de clientes ociosos precisam de listener para nao encerrar o processo.
  // Nunca registrar o erro bruto: ele pode conter SQL, credenciais ou endpoints.
  pool.on("error", () => {
    console.error("[PostgreSQL] Erro em conexao ociosa do pool.");
  });
  return pool;
}

module.exports = { criarPoolPostgres };
