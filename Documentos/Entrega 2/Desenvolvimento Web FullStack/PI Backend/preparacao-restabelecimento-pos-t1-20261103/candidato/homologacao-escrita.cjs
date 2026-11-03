"use strict";
const path = require("node:path"), Module = require("node:module");
const { isDeepStrictEqual } = require("node:util");
const TABELAS = ["usuarios", "eventos", "custos_evento", "cotacoes", "itens_cotacao", "propostas", "inscricoes", "solicitacoes_acesso"];
const RPCS = ["substituir_custos_evento", "publicar_cotacao", "decidir_solicitacao_acesso", "avaliar_proposta", "listar_propostas_por_fornecedor"];
const entrada = path.join(__dirname, "scripts/executar-homologacao-escrita.cjs");
let contexto;
const falha = code => Object.assign(Error("Homologacao de escrita recusada."), { code });
function mesmaEntrada(p) { return path.resolve(p).toLowerCase() === path.resolve(entrada).toLowerCase(); }
function confirmarEntrada() {
  if (!contexto || process.env.TROCATICKET_HOMOLOGACAO !== "escrita-descartavel" ||
      Object.entries(contexto).some(([k, v]) => process.env[k] !== v) ||
      Object.keys(process.env).some(k => /^(DB_|PG)/.test(k) && k !== "DB_PROVIDER")) throw falha("HW_ENTRY");
  return true;
}
function criarControle() {
  let http, escrita;
  const contagem = { leituras: 0, escritas: 0, mysqlTentativas: 0, recusas: 0 };
  const rotas = /^(?:POST \/(?:usuarios|login|eventos|cotacoes|fornecedor\/propostas|participante\/inscricoes|solicitacoes-acesso)|PUT \/eventos\/[1-9]\d*(?:\/custos)?|PATCH \/(?:eventos\/[1-9]\d*\/publicar|organizador\/propostas\/[1-9]\d*\/status|solicitacoes-acesso\/[1-9]\d*)|DELETE \/eventos\/[1-9]\d*)$/;
  return {
    contagem,
    armarHttp(method, route, authorization) {
      if (http || (method !== "GET" && !rotas.test(method + " " + route))) throw falha("HW_HTTP_ARM");
      http = { method, route, authorization };
    },
    filtro(req, res, next) {
      if (!http || req.method !== http.method || req.path !== http.route || req.headers.authorization !== http.authorization) {
        contagem.recusas++; return res.status(405).json({ erro: "Operacao fora do roteiro descartavel." });
      }
      http = undefined; return next();
    },
    armarEscrita(method, route, body, conferir) {
      if (escrita || !["POST", "PATCH", "DELETE"].includes(method)) throw falha("HW_ARM");
      escrita = { method, route, body, conferir };
    },
    async consumir(method, route, body) {
      const permitida = escrita;
      // Uma permissao, uma tentativa. Nunca reutilizar depois de falha/timeout.
      escrita = undefined;
      if (!permitida || method !== permitida.method || route !== permitida.route ||
          !(permitida.conferir ? await permitida.conferir(body) : isDeepStrictEqual(body, permitida.body))) {
        contagem.recusas++; throw falha("HW_MUTATION_DENIED");
      }
      contagem.escritas++;
    },
    limpar() { http = undefined; escrita = undefined; },
  };
}
function criarTransporte(config, controle, original, registrar) {
  const pendentes = new Set();
  return {
    async fetch(input, options = {}) {
      const u = new URL(typeof input === "string" ? input : input.url ?? input.toString());
      const method = (options.method ?? input.method ?? "GET").toUpperCase();
      const headers = new Headers(options.headers ?? input.headers);
      const route = u.pathname + u.search;
      const tabela = u.pathname.slice("/rest/v1/".length);
      if (u.origin !== config.SUPABASE_URL || u.username || u.password || u.hash ||
          headers.get("apikey") !== config.SUPABASE_SECRET_KEY ||
          headers.get("authorization") !== "Bearer " + config.SUPABASE_SECRET_KEY ||
          ["accept-profile", "content-profile"].some(k => headers.has(k) && headers.get(k) !== "public") ||
          !(TABELAS.includes(tabela) || RPCS.some(r => u.pathname === "/rest/v1/rpc/" + r))) throw falha("HW_TRANSPORT");
      let body;
      if (["GET", "HEAD"].includes(method)) {
        if (!TABELAS.includes(tabela)) throw falha("HW_TRANSPORT");
        controle.contagem.leituras++;
      } else {
        try { body = options.body === undefined ? undefined : JSON.parse(options.body); }
        catch { throw falha("HW_BODY"); }
        await controle.consumir(method, route, body);
        await registrar({ phase: "antes", method, tabela, body });
      }
      const abortador = new AbortController(); pendentes.add(abortador);
      const signal = AbortSignal.any([abortador.signal, AbortSignal.timeout(15000), ...(options.signal ? [options.signal] : [])]);
      const liberar = () => pendentes.delete(abortador);
      signal.addEventListener("abort", liberar, { once: true });
      if (signal.aborted) liberar();
      try {
        const response = await original(input, { ...options, signal, redirect: "error" });
        if (response.headers.get("sb-project-ref") !== config.projectRef) throw falha("HW_PROJECT");
        if (!["GET", "HEAD"].includes(method)) {
          if (response.status >= 500) throw falha("HW_UNCERTAIN");
          if (response.ok) {
            const data = await response.clone().json();
            await registrar({ phase: "confirmada", method, tabela, body, data });
          } else await registrar({ phase: "recusada", method, tabela, body });
        }
        if (!response.body) { liberar(); signal.removeEventListener("abort", liberar); }
        return response;
      } catch (e) { abortador.abort(); liberar(); throw e; }
    },
    abortar() { for (const c of pendentes) c.abort(); pendentes.clear(); },
  };
}
async function iniciar(controle, registrar) {
  if (!require.main?.filename || !mesmaEntrada(require.main.filename) || contexto ||
      Object.keys(require.cache).some(p => /[\\/]mysql2[\\/]|[\\/]PI Backend[\\/](?:server|db)\.js$/i.test(p)) ||
      process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" || process.env.TROCATICKET_AMBIENTE === "isolado") throw falha("HW_ENTRY");
  const config = require("./homologacao.cjs").carregarConfiguracao();
  const anteriores = { ...process.env }, oldFetch = global.fetch, oldLoad = Module._load;
  for (const k of Object.keys(process.env)) if (/^(DB_|PG|SUPABASE_|JWT_|TROCATICKET_|HOMOLOG_)/.test(k) || k === "PORT") delete process.env[k];
  contexto = { DB_PROVIDER: "supabase", SUPABASE_URL: config.SUPABASE_URL, SUPABASE_SECRET_KEY: config.SUPABASE_SECRET_KEY,
    JWT_SECRET: config.JWT_SECRET, PORT: "3111", TROCATICKET_HOMOLOGACAO: "escrita-descartavel", TROCATICKET_AMBIENTE: "principal" };
  Object.assign(process.env, contexto);
  Module._load = function (nome, pai) {
    if (/^mysql2(?:[\\/]|$)/i.test(nome) || (pai && /[\\/]PI Backend[\\/]/.test(pai.filename) && /^(?:\.\/|\.\.\/)db(?:\.js)?$/.test(nome))) {
      controle.contagem.mysqlTentativas++; throw falha("HW_MYSQL");
    }
    return oldLoad.apply(this, arguments);
  };
  const transporte = criarTransporte(config, controle, oldFetch, registrar);
  global.fetch = transporte.fetch;
  let servidor, fechado = false;
  const restaurar = () => {
    transporte.abortar(); global.fetch = oldFetch; Module._load = oldLoad; contexto = undefined;
    for (const k of Object.keys(process.env)) if (!Object.hasOwn(anteriores, k)) delete process.env[k];
    Object.assign(process.env, anteriores);
    process.removeListener("SIGINT", sinal); process.removeListener("SIGTERM", sinal);
  };
  async function fechar() {
    if (fechado) return; fechado = true; transporte.abortar();
    try {
      if (servidor) await new Promise(resolve => {
        const timer = setTimeout(() => servidor.closeAllConnections(), 3000);
        servidor.close(() => { clearTimeout(timer); resolve(); }); servidor.closeIdleConnections?.();
      });
    } finally { restaurar(); }
  }
  function sinal() { fechar().catch(() => { process.exitCode = 1; }); }
  try {
    confirmarEntrada();
    const express = require("express"), externo = express();
    externo.disable("x-powered-by"); externo.use(controle.filtro); externo.use(require("./server.js"));
    await new Promise((resolve, reject) => {
      servidor = externo.listen(3111, "127.0.0.1", resolve);
      servidor.once("error", () => reject(falha("HW_LISTEN")));
    });
    process.once("SIGINT", sinal); process.once("SIGTERM", sinal);
    return { fechar, fetch: transporte.fetch, config };
  } catch (e) { await fechar(); throw e; }
}
module.exports = { criarControle, criarTransporte, confirmarEntrada, iniciar, TABELAS };
