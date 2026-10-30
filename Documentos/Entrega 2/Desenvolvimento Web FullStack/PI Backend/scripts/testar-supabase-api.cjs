"use strict";

const { readFileSync } = require("node:fs");
const path = require("node:path");

async function main() {
  try {
    const dotenv = require("dotenv");
    const { createClient } = require("@supabase/supabase-js");
    const arquivoEnv = path.join(__dirname, "..", ".env");
    let envArquivo = {};
    try {
      envArquivo = dotenv.parse(readFileSync(arquivoEnv, "utf8"));
    } catch (erro) {
      if (erro.code !== "ENOENT") throw erro;
    }
    // Variaveis do servidor prevalecem; nao modifica process.env.
    const env = { ...envArquivo, ...process.env };
    if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
      console.error("Erro: SUPABASE_URL ou SUPABASE_SECRET_KEY ausente no ambiente do servidor ou .env privado.");
      process.exitCode = 1;
      return;
    }

    const url = new URL(env.SUPABASE_URL);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      console.error("Erro: SUPABASE_URL deve ser uma URL HTTPS sem credenciais, parametros ou fragmentos.");
      process.exitCode = 1;
      return;
    }
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    // Executar somente no servidor: a Secret Key tem acesso privilegiado.
    // Uma unica consulta de leitura, sem autenticacao adicional.
    const { data, error, status } = await supabase
      .from("eventos")
      .select("id,nome")
      .limit(1)
      .abortSignal(AbortSignal.timeout(15000));

    if (error) {
      // Nao imprimir erros brutos: podem conter URL ou outros dados privados.
      const motivo = status === 401 || status === 403 || error.code === "42501"
        ? "acesso negado (autenticacao, permissao ou RLS)."
        : status === 0
          ? "falha de rede ou tempo limite excedido."
          : `consulta recusada pela API (HTTP ${Number(status)}).`;
      console.error(`Erro: ${motivo}`);
      process.exitCode = 1;
      return;
    }

    console.log(`Sucesso: consulta de id e nome em eventos concluida; ${data.length} registro(s) retornado(s).`);
    if (data.length === 0) {
      console.log("Resultado vazio: a tabela pode estar vazia ou a RLS pode ocultar os registros.");
    }
  } catch {
    console.error("Erro: nao foi possivel concluir o teste (configuracao, dependencia ou conexao); detalhes omitidos para proteger credenciais.");
    process.exitCode = 1;
  }
}

void main();
