"use strict";

function erroConfiguracao(code, mensagem) {
  return Object.assign(new Error(mensagem), { code });
}

// Puro: nao le .env, importa drivers, cria clientes ou abre conexoes.
function lerConfiguracaoBanco(env = process.env, modo = "principal") {
  if (!env || typeof env !== "object" || Array.isArray(env) || !["principal", "isolado"].includes(modo)) {
    throw erroConfiguracao("DB_CONFIG_MODE", "Modo de execucao do banco invalido.");
  }
  const provider = env.DB_PROVIDER === undefined ? "mysql" : env.DB_PROVIDER;
  if (!["mysql", "supabase"].includes(provider)) {
    throw erroConfiguracao("DB_PROVIDER_INVALID", "DB_PROVIDER deve ser mysql ou supabase.");
  }
  if (modo === "isolado" && provider !== "mysql") {
    throw erroConfiguracao("DB_PROVIDER_ISOLATED", "O ambiente isolado aceita exclusivamente MySQL/MariaDB.");
  }
  // Configuracoes Supabase nao afetam o MySQL historico, nem sao usadas como fallback.
  if (provider === "mysql") return Object.freeze({ provider });

  let url;
  try {
    if (typeof env.SUPABASE_URL !== "string" || /\s/u.test(env.SUPABASE_URL)) throw Error();
    url = new URL(env.SUPABASE_URL);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw Error();
    }
  } catch {
    throw erroConfiguracao("SUPABASE_CONFIG", "SUPABASE_URL deve ser uma origem HTTPS sem credenciais, caminho, parametros ou fragmento.");
  }
  // Secret key moderna de backend; recusa chaves publicas e JWTs de usuarios.
  if (typeof env.SUPABASE_SECRET_KEY !== "string" || !/^sb_secret_[A-Za-z0-9_-]+$/u.test(env.SUPABASE_SECRET_KEY)) {
    throw erroConfiguracao("SUPABASE_CONFIG", "Informe SUPABASE_SECRET_KEY como secret key de backend.");
  }
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw erroConfiguracao("SUPABASE_TLS", "Supabase exige verificacao TLS habilitada.");
  }
  return Object.freeze({ provider, url: url.origin, secretKey: env.SUPABASE_SECRET_KEY });
}

function validarInicializacaoBanco(env = process.env, modo = "principal") {
  const config = lerConfiguracaoBanco(env, modo);
  if (config.provider === "supabase") {
    throw erroConfiguracao("DB_PROVIDER_NOT_IMPLEMENTED", "Repositorios Supabase ainda nao implementados; inicializacao recusada.");
  }
  return config;
}

module.exports = { lerConfiguracaoBanco, validarInicializacaoBanco };
