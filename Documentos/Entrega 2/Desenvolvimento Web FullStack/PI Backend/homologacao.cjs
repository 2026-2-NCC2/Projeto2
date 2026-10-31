"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { lerConfiguracaoBanco } = require("./config/banco.cjs");
const PROJECT_REF = "gnwybroqfvwosiqzsfla";
const HOST = "127.0.0.1", PORT = 3111;
const INICIALIZADOR = path.join(__dirname, "scripts/iniciar-homologacao-leitura.cjs");
let contexto;
function falha(code = "HOMOLOG_CONFIG") {
  return Object.assign(new Error("Homologação recusada. Confira a configuração privada."), { code });
}
function validarConfiguracao(valor, segredosPrincipais) {
  const campos = ["projectName", "projectRef", "SUPABASE_URL", "SUPABASE_SECRET_KEY", "JWT_SECRET", "host", "port"];
  if (!valor || typeof valor !== "object" || Array.isArray(valor) ||
      Object.keys(valor).length !== campos.length || campos.some(k => !Object.hasOwn(valor, k)) ||
      valor.projectName !== "PI Backend" || valor.projectRef !== PROJECT_REF ||
      valor.SUPABASE_URL !== `https://${PROJECT_REF}.supabase.co` ||
      valor.host !== HOST || valor.port !== PORT ||
      typeof valor.JWT_SECRET !== "string" || !/^[A-Za-z0-9_-]{64,256}$/.test(valor.JWT_SECRET) ||
      new Set(valor.JWT_SECRET).size < 20 || !Array.isArray(segredosPrincipais) ||
      segredosPrincipais.length === 0 || segredosPrincipais.some(s => typeof s !== "string" || s.length < 32) ||
      segredosPrincipais.includes(valor.JWT_SECRET) || valor.JWT_SECRET === valor.SUPABASE_SECRET_KEY) throw falha();
  lerConfiguracaoBanco({ DB_PROVIDER: "supabase", SUPABASE_URL: valor.SUPABASE_URL, SUPABASE_SECRET_KEY: valor.SUPABASE_SECRET_KEY });
  return Object.freeze({ ...valor });
}
function canonico(p) { return path.resolve(p).toLowerCase(); }
function carregarConfiguracao() {
  try {
    if (arguments.length) throw falha("HOMOLOG_ARGS");
    const arquivo = path.join(__dirname, ".env");
    const real = fs.realpathSync(arquivo);
    if (canonico(real) !== canonico(arquivo)) throw falha("HOMOLOG_PATH");
    const stat = fs.statSync(real);
    if (!stat.isFile() || stat.size > 32768) throw falha();
    // Parse puro: somente variaveis exclusivas da homologacao. Os demais
    // campos do .env nao sao propagados para o processo separado.
    const privado = require("dotenv").parse(fs.readFileSync(real, "utf8"));
    const segredos = [...new Set([privado.JWT_SECRET, process.env.JWT_SECRET].filter(s => s !== undefined))];
    return validarConfiguracao({ projectName: "PI Backend", projectRef: PROJECT_REF,
      SUPABASE_URL: privado.HOMOLOG_SUPABASE_URL, SUPABASE_SECRET_KEY: privado.HOMOLOG_SUPABASE_SECRET_KEY,
      JWT_SECRET: privado.HOMOLOG_JWT_SECRET, host: HOST, port: PORT }, segredos);
  } catch (e) {
    if (/^HOMOLOG_/.test(e?.code ?? "")) throw e;
    throw falha();
  }
}
function confirmarEntrada() {
  if (!contexto || process.env.TROCATICKET_HOMOLOGACAO !== "somente-leitura" ||
      Object.entries(contexto.env).some(([k, v]) => process.env[k] !== v) ||
      Object.keys(process.env).some(k => /^(DB_|PG)/.test(k) && k !== "DB_PROVIDER")) throw falha("HOMOLOG_ENTRY");
  return true;
}
function filtroLeitura(req, res, next) {
  if (req.method === "GET" || (req.method === "POST" && req.path === "/login")) return next();
  res.setHeader("Allow", req.path === "/login" ? "GET, POST" : "GET");
  return res.status(405).json({ erro: "Método não permitido na homologação somente leitura." });
}
function protegerFetch(config, original) {
  const pendentes = new Set();
  const tabelas = new Set(["usuarios", "eventos", "cotacoes", "custos_evento", "itens_cotacao", "propostas", "inscricoes", "solicitacoes_acesso"]);
  const fetchSeguro = async (input, options = {}) => {
    const u = new URL(typeof input === "string" ? input : input.url ?? input.toString());
    const method = (options.method ?? input.method ?? "GET").toUpperCase();
    const headers = new Headers(options.headers ?? input.headers);
    const tabela = u.pathname.slice("/rest/v1/".length);
    const leitura = ["GET", "HEAD"].includes(method) &&
      u.pathname.startsWith("/rest/v1/") && tabelas.has(tabela);
    const rpcLeitura = method === "POST" && u.pathname === "/rest/v1/rpc/listar_propostas_por_fornecedor";
    if (u.origin !== config.SUPABASE_URL || u.username || u.password || u.hash || (!leitura && !rpcLeitura) ||
        headers.get("apikey") !== config.SUPABASE_SECRET_KEY ||
        headers.get("authorization") !== "Bearer " + config.SUPABASE_SECRET_KEY ||
        ["accept-profile", "content-profile"].some(k => headers.has(k) && headers.get(k) !== "public")) throw falha("HOMOLOG_TRANSPORT");
    if (rpcLeitura) {
      let args;
      try { args = JSON.parse(options.body); } catch { throw falha("HOMOLOG_TRANSPORT"); }
      if (!args || Object.keys(args).length !== 1 || !Number.isSafeInteger(args.p_fornecedor_id) || args.p_fornecedor_id <= 0) throw falha("HOMOLOG_TRANSPORT");
    }
    const controle = new AbortController(); pendentes.add(controle);
    const signal = AbortSignal.any([controle.signal, AbortSignal.timeout(15000), ...(options.signal ? [options.signal] : [])]);
    const liberar = () => pendentes.delete(controle);
    signal.addEventListener("abort", liberar, { once: true });
    if (signal.aborted) liberar();
    try {
      const response = await original(input, { ...options, signal, redirect: "error" });
      if (response.headers.get("sb-project-ref") !== PROJECT_REF) throw falha("HOMOLOG_PROJECT");
      // Fetch resolve nos headers, nao no fim do corpo. Manter o controle ate
      // aborto/timeout (no maximo 15s) preserva a Response e seu streaming nativos.
      if (!response.body) { liberar(); signal.removeEventListener("abort", liberar); }
      return response;
    } catch (erro) {
      controle.abort(); liberar(); signal.removeEventListener("abort", liberar);
      throw erro;
    }
  };
  return { fetch: fetchSeguro, abortar() { for (const c of pendentes) c.abort(); pendentes.clear(); } };
}
async function iniciarHomologacao() {
  // Nao e um bypass acionavel por variavel de ambiente ou por HTTP.
  if (!require.main?.filename || canonico(require.main.filename) !== canonico(INICIALIZADOR) || contexto ||
      Object.keys(require.cache).some(p => canonico(p) === canonico(path.join(__dirname, "server.js")) ||
        canonico(p) === canonico(path.join(__dirname, "db.js")) || /[\\/]node_modules[\\/]mysql2[\\/]/i.test(p))) throw falha("HOMOLOG_ENTRY");
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" || process.env.TROCATICKET_AMBIENTE === "isolado") throw falha();
  if (arguments.length) throw falha("HOMOLOG_ARGS");
  const config = carregarConfiguracao();
  const anteriores = {}, chaves = new Set([...Object.keys(process.env).filter(k => /^(DB_|PG|SUPABASE_|JWT_|TROCATICKET_|HOMOLOG_)/.test(k) || k === "PORT"),
    "DB_PROVIDER", "SUPABASE_URL", "SUPABASE_SECRET_KEY", "JWT_SECRET", "PORT", "TROCATICKET_HOMOLOGACAO", "TROCATICKET_AMBIENTE"]);
  for (const k of chaves) { anteriores[k] = process.env[k]; delete process.env[k]; }
  const env = { DB_PROVIDER: "supabase", SUPABASE_URL: config.SUPABASE_URL, SUPABASE_SECRET_KEY: config.SUPABASE_SECRET_KEY,
    JWT_SECRET: config.JWT_SECRET, PORT: String(PORT), TROCATICKET_HOMOLOGACAO: "somente-leitura", TROCATICKET_AMBIENTE: "principal" };
  Object.assign(process.env, env); contexto = { env };
  const fetchAnterior = global.fetch;
  const transporte = protegerFetch(config, fetchAnterior); global.fetch = transporte.fetch;
  let servidor, fechado = false;
  const sinais = ["SIGINT", "SIGTERM"];
  const restaurar = () => {
    transporte.abortar(); global.fetch = fetchAnterior; contexto = undefined;
    for (const k of chaves) { if (anteriores[k] === undefined) delete process.env[k]; else process.env[k] = anteriores[k]; }
    for (const s of sinais) process.removeListener(s, pararPorSinal);
  };
  async function fechar() {
    if (fechado) return; fechado = true;
    transporte.abortar();
    try {
      if (servidor) await new Promise(resolve => {
        const limite = setTimeout(() => servidor.closeAllConnections(), 3000);
        servidor.close(() => { clearTimeout(limite); resolve(); }); servidor.closeIdleConnections?.();
      });
    } finally { restaurar(); }
  }
  function pararPorSinal() { fechar().catch(() => { process.exitCode = 1; }); }
  try {
    confirmarEntrada();
    const express = require("express"), externo = express();
    externo.disable("x-powered-by");
    // Filtro ANTES de JSON, JWT, roteadores ou servicos da aplicacao.
    externo.use(filtroLeitura);
    externo.use(require("./server.js"));
    externo.use((erro, req, res, next) => {
      if (res.headersSent) return res.destroy();
      return res.status(500).json({ erro: "Erro interno no servidor." });
    });
    await new Promise((resolve, reject) => {
      const limite = setTimeout(() => reject(falha("HOMOLOG_LISTEN")), 10000);
      try {
        servidor = externo.listen(PORT, HOST, () => {
          clearTimeout(limite);
          if (fechado) { servidor.closeAllConnections(); servidor.close(); return; }
          resolve();
        });
        servidor.once("error", () => { clearTimeout(limite); reject(falha("HOMOLOG_LISTEN")); });
      } catch { clearTimeout(limite); reject(falha("HOMOLOG_LISTEN")); }
    });
    for (const s of sinais) process.once(s, pararPorSinal);
    return Object.freeze({ host: HOST, port: PORT, fechar });
  } catch {
    await fechar(); throw falha("HOMOLOG_START");
  }
}
module.exports = { validarConfiguracao, carregarConfiguracao, confirmarEntrada, filtroLeitura, protegerFetch, iniciarHomologacao };
