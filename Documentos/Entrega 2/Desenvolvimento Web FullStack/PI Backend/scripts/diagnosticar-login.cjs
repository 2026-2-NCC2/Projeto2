"use strict";

// Somente leitura: conta de teste existente, sem imprimir dados ou erros brutos.
const path = require("node:path");
const raiz = path.resolve(__dirname, "..");
process.chdir(raiz);
require("dotenv").config({ path: path.join(raiz, ".env"), quiet: true });
const codigos = ["UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "CERT_HAS_EXPIRED", "ENOTFOUND", "ECONNREFUSED",
  "ETIMEDOUT", "42501", "42703", "42P01", "PGRST116", "PGRST205",
  "SUPABASE_USUARIO_RESPONSE"];
function falha(etapa, erro) {
  // Whitelist: nunca imprimir message/details/stack recebidos do SDK ou banco.
  const texto = [erro?.code, erro?.cause?.code, erro?.details].join(" ");
  console.log(JSON.stringify({ etapa, codigo: codigos.find(c => texto.includes(c)) || "NAO_CLASSIFICADO" }));
  process.exitCode = 1;
}
async function main() {
  const env = process.env;
  if (env.DB_PROVIDER !== "supabase" || !env.HOMOLOG_ADMIN_EMAIL ||
      !env.HOMOLOG_ADMIN_PASSWORD || env.HOMOLOG_SUPABASE_URL !== env.SUPABASE_URL) {
    throw Error("Configuracao de teste ausente ou projeto divergente.");
  }
  const email = env.HOMOLOG_ADMIN_EMAIL.trim().toLowerCase();
  const senha = env.HOMOLOG_ADMIN_PASSWORD;
  let usuario;
  try {
    usuario = await require("../repositories/supabase/usuarios.cjs")
      .criarRepositorioUsuarios().buscarParaLogin(email);
  } catch (erro) { falha("consulta_login", erro); }
  if (usuario) try {
    console.log(JSON.stringify({ etapa: "consulta_login", encontrado: true }));
    const valido = await require("bcryptjs").compare(senha, usuario.senha);
    console.log(JSON.stringify({ etapa: "bcrypt", valido }));
    if (!valido) { process.exitCode = 1; return; }
  } catch (erro) { falha("bcrypt", erro); return; }
  let servidor;
  try {
    const app = require("../server.js");
    servidor = await new Promise((resolve, reject) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
      s.once("error", reject);
    });
    const url = `http://127.0.0.1:${servidor.address().port}`;
    const resposta = await fetch(`${url}/login`, { method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
      body: JSON.stringify({ email, senha }), signal: AbortSignal.timeout(20000) });
    const body = await resposta.json();
    let jwtValido = false;
    if (resposta.status === 200) {
      const claims = require("jsonwebtoken").verify(body.token, env.JWT_SECRET, { algorithms: ["HS256"] });
      jwtValido = !!usuario && claims.id === usuario.id && claims.perfil === usuario.perfil && claims.exp - claims.iat === 3600;
    }
    console.log(JSON.stringify({ etapa: "POST /login", status: resposta.status, jwtValido,
      semHash: !Object.hasOwn(body.usuario || {}, "senha") }));
    if (!jwtValido) { process.exitCode = 1; return; }
    const perfil = await fetch(`${url}/perfil`, { headers: { Authorization: `Bearer ${body.token}` },
      signal: AbortSignal.timeout(20000) });
    console.log(JSON.stringify({ etapa: "GET /perfil", status: perfil.status }));
    if (perfil.status !== 200) process.exitCode = 1;
  } catch (erro) { falha("http_login", erro); }
  finally {
    if (servidor) {
      servidor.closeAllConnections();
      await new Promise(resolve => servidor.close(resolve));
    }
  }
}
main().catch(erro => falha("configuracao", erro));
