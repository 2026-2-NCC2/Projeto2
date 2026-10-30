"use strict";

const { lerConfiguracaoBanco } = require("./config/banco.cjs");

// Fabrica inerte e exclusiva do backend. Nenhuma rota a utiliza nesta etapa.
// Nao recebe request, JWT de usuario, headers ou opcoes de autenticacao externas.
function criarClienteSupabase(env = process.env) {
  if (typeof window !== "undefined") {
    throw Object.assign(Error("Cliente Supabase exclusivo do backend."), { code: "SUPABASE_BACKEND_ONLY" });
  }
  const { modoExecucao } = require("./isolamento.cjs");
  const config = lerConfiguracaoBanco(env, modoExecucao());
  if (config.provider !== "supabase") {
    throw Object.assign(Error("Cliente Supabase exige DB_PROVIDER=supabase."), { code: "SUPABASE_PROVIDER" });
  }
  try {
    // Importacao tardia: nunca carregado pelo MySQL ou pelo ambiente isolado.
    const { createClient } = require("@supabase/supabase-js");
    return createClient(config.url, config.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  } catch {
    // Nao propagar erro do SDK, URL, credenciais ou detalhes de dependencias.
    throw Object.assign(Error("Cliente Supabase indisponivel ou configuracao recusada."), { code: "SUPABASE_CLIENT" });
  }
}

module.exports = { criarClienteSupabase };
