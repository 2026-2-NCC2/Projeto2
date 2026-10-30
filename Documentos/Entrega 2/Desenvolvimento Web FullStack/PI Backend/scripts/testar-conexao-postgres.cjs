"use strict";

const { readFileSync } = require("node:fs");
const path = require("node:path");

function descreverErro(erro) {
  // Somente mensagens fixas: erros do driver podem incluir dados privados.
  const mensagens = {
    ENOENT: "Arquivo .env ou dependencia local nao encontrado.",
    EACCES: "Sem permissao para ler a configuracao ou acessar a conexao.",
    MODULE_NOT_FOUND: "Dependencia necessaria nao instalada.",
    POSTGRES_CONFIG: "Configuracao PostgreSQL ausente ou invalida no ambiente.",
    ENOTFOUND: "Nao foi possivel resolver o endereco do banco (DNS).",
    EAI_AGAIN: "Falha temporaria de DNS ao localizar o banco.",
    ECONNREFUSED: "Conexao recusada pelo banco.",
    ECONNRESET: "Conexao interrompida pelo servidor.",
    ETIMEDOUT: "Tempo limite da conexao excedido.",
    "28P01": "Falha de autenticacao no PostgreSQL.",
    "28000": "Autorizacao de acesso ao PostgreSQL recusada.",
    "3D000": "Banco de dados configurado nao encontrado.",
    "53300": "Limite de conexoes do banco atingido.",
    SELF_SIGNED_CERT_IN_CHAIN: "Falha TLS: certificado autoassinado na cadeia.",
    DEPTH_ZERO_SELF_SIGNED_CERT: "Falha TLS: certificado autoassinado.",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "Falha TLS: cadeia de certificados nao verificavel.",
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "Falha TLS: autoridade certificadora nao encontrada.",
    CERT_HAS_EXPIRED: "Falha TLS: certificado expirado.",
    ERR_TLS_CERT_ALTNAME_INVALID: "Falha TLS: certificado incompativel com o servidor.",
  };
  if (Object.hasOwn(mensagens, erro?.code)) return mensagens[erro.code];
  if (/timeout|timed out/i.test(erro?.message ?? "")) {
    return "Tempo limite da conexao ou consulta excedido.";
  }
  return "Falha ao testar a conexao PostgreSQL (detalhes omitidos para proteger credenciais).";
}

async function main() {
  let pool;
  let sucesso = false;
  try {
    const dotenv = require("dotenv");
    const { criarPoolPostgres } = require("../db-postgres.js");
    // Caminho fixo, sem executar ou imprimir o conteudo do .env.
    // Ambiente isolado: nao altera process.env; valores do arquivo prevalecem.
    const env = {
      ...process.env,
      ...dotenv.parse(readFileSync(path.join(__dirname, "..", ".env"), "utf8")),
    };
    pool = criarPoolPostgres(env);
    const resultado = await pool.query({
      text: "SELECT 1 AS conectado",
      query_timeout: 10000,
    });
    if (resultado.rows[0]?.conectado !== 1) {
      throw new Error("Resultado inesperado");
    }
    sucesso = true;
  } catch (erro) {
    console.error(`Erro: ${descreverErro(erro)}`);
    process.exitCode = 1;
  } finally {
    if (pool) {
      try {
        await pool.end();
      } catch {
        console.error("Erro: nao foi possivel encerrar o pool PostgreSQL corretamente.");
        process.exitCode = 1;
        sucesso = false;
      }
    }
  }
  if (sucesso) console.log("Sucesso: conexao com o Supabase confirmada.");
}

void main();
