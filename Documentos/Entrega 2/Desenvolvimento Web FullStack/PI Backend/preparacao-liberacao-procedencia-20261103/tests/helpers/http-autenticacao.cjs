"use strict";
// Express, bcrypt, JWT, fabrica e repositorios reais. Somente o transporte de
// persistencia e falso. Nenhum .env, banco, porta fixa ou endpoint externo.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const http = require("node:http"), assert = require("node:assert/strict");
const bcrypt = require("bcryptjs"), jwt = require("jsonwebtoken");
const config = require("../../config/banco.cjs");
const raiz = path.join(__dirname, "../..");
const segredoPadrao = "segredo-ficticio-exclusivo-da-validacao-http-incremento-4";
const senha = "senha-ficticia-123";
const hash = bcrypt.hashSync(senha, 12);
const secretKey = "sb_secret_sintetica_exclusiva_do_backend";
const privado = "SEGREDO_SQL_CREDENCIAL_FICTICIA_NAO_EXIBIR";
const dataLocal = d => new Date(d + "T00:00:00");
function fixture(provider) {
  const perfis = { 7: "organizador", 8: "fornecedor", 9: "participante", 10: "admin" };
  const usuarios = Object.entries(perfis).map(([id, perfil]) => ({ id: Number(id), perfil,
    nome: `Teste ${id}`, email: `teste${id}@example.invalid`, senha: hash }));
  const eventos = [13, 14].map((id, i) => ({ id, usuario_id: i ? 17 : 7, nome: "Evento sintético " + id,
    data: "2030-01-02", horario: "14:30:00", local: "Local fictício", categoria: "Corporativo", publico: 10,
    descricao: "Teste", status: "Em planejamento" }));
  const cotacoes = [21, 22].map((id, i) => ({ id, evento_id: i ? 14 : 13, prazo: "2030-01-03",
    modalidade: "Fechada", observacoes: null, status: "Aberta", criada_em: "2030-01-01T12:00:00Z" }));
  const propostas = [31, 32].map((id, i) => ({ id, cotacao_id: i ? 22 : 21, fornecedor_id: i ? 18 : 8,
    valor: "10.10", condicoes_pagamento: "Pix", detalhes_tecnicos: "Teste", status: "Em avaliação", criada_em: "2030-01-01T12:00:00Z" }));
  return { usuarios, eventos, cotacoes, propostas, solicitacoes: [{ id: 41, usuario_id: 9,
    perfil_solicitado: "fornecedor", justificativa: "Teste", status: "pendente", criada_em: "2030-01-01T12:00:00Z" }] };
}
async function iniciar(t, provider, op = {}) {
  const segredo = op.jwtSecret ?? segredoPadrao;
  const state = fixture(provider), calls = [], imports = [], logs = [], rpcCalls = [];
  state.falha = null; state.authIdDivergente = false;
  const env = { JWT_SECRET: segredo, ...(provider === undefined ? {} : { DB_PROVIDER: provider }),
    SUPABASE_URL: "https://supabase.invalid", SUPABASE_SECRET_KEY: secretKey };
  const evento = c => state.eventos.find(e => e.id === c.evento_id);
  const cotacao = p => state.cotacoes.find(c => c.id === p.cotacao_id);
  const perfilUsuario = u => Object.fromEntries(["id", "nome", "email", "perfil"].map(k => [k, u[k]]));
  const normal = sql => sql.replace(/\s+/g, " ").trim();
  function rpc(name, args) {
    const dono = id => state.eventos.find(e => e.id === Number(id))?.usuario_id;
    if (name === "avaliar_proposta") {
      const row = state.propostas.find(p => p.id === Number(args.p_proposta_id));
      if (!row || dono(cotacao(row).evento_id) !== args.p_organizador_id || row.status !== "Em avaliação") return 0;
      row.status = args.p_status; return 1;
    }
    if (name === "substituir_custos_evento" || name === "publicar_cotacao") {
      if (dono(args.p_evento_id) !== args.p_usuario_id) return { error: name === "publicar_cotacao" ? "TP404" : "TC404" };
      return { error: name === "publicar_cotacao" ? "TP409" : "TC400" };
    }
    if (name === "decidir_solicitacao_acesso") {
      const row = state.solicitacoes.find(s => s.id === Number(args.p_solicitacao_id));
      if (!row) return { error: "TA404" };
      if (row.status !== "pendente") return { error: "TA409" };
      const u = state.usuarios.find(u => u.id === row.usuario_id);
      if (args.p_status === "aprovado") {
        if (u.perfil !== "participante") return { error: "TA412" };
        u.perfil = row.perfil_solicitado;
      }
      row.status = args.p_status;
      return { mensagem: args.p_status === "aprovado" ? "Solicitação aprovada com sucesso!" : "Solicitação rejeitada com sucesso!" };
    }
    if (name === "listar_propostas_por_fornecedor") return state.propostas.filter(p => p.fornecedor_id === args.p_fornecedor_id)
      .map(({ fornecedor_id, ...p }) => ({ ...p, evento_nome: evento(cotacao(p)).nome, categoria: "Som" }));
    throw Error("RPC inesperada no transporte falso: " + name);
  }
  async function executar(sql, params = []) {
    sql = normal(sql); params = Array.from(params); calls.push({ kind: "mysql", sql, params });
    if (state.falha) throw Object.assign(Error(privado), { code: "ETIMEDOUT" });
    if (/FROM usuarios WHERE email = \?/.test(sql)) {
      const u = state.usuarios.find(u => u.email === params[0]);
      return [u ? [sql.startsWith("SELECT id FROM") ? { id: u.id } : { ...u }] : []];
    }
    if (/FROM usuarios WHERE id = \?/.test(sql)) {
      const u = state.usuarios.find(u => u.id === params[0]);
      return [u ? [sql.includes("perfil") ? perfilUsuario(u) : { id: u.id, nome: u.nome, email: u.email }] : []];
    }
    if (sql.startsWith("INSERT INTO usuarios")) {
      const [nome, email, senha, perfil] = params;
      state.usuarios.push({ id: 33, nome, email, senha, perfil }); return [{ insertId: 33 }];
    }
    if (/FROM eventos/.test(sql)) {
      const rows = /WHERE id = \?/.test(sql) ? state.eventos.filter(e => e.id === params[0] && e.usuario_id === params[1])
        : state.eventos.filter(e => e.usuario_id === params[0]).sort((a,b) => b.id-a.id);
      return [rows.map(e => sql.startsWith("SELECT id FROM") ? { id: e.id } : { ...e, data: dataLocal(e.data) })];
    }
    if (/SELECT .*FROM cotacoes c INNER JOIN eventos e/.test(sql)) {
      return [state.cotacoes.filter(c => evento(c).usuario_id === params[0]).sort((a,b) => b.id-a.id)
        .map(c => ({ ...c, prazo: dataLocal(c.prazo), criada_em: new Date(c.criada_em), evento_nome: evento(c).nome,
          evento_data: dataLocal(evento(c).data), evento_local: evento(c).local }))];
    }
    if (/FROM itens_cotacao/.test(sql)) return [[{ id: 51, categoria: "Som", descricao: "PA", valor_estimado: "0.10" }]];
    if (sql.startsWith("UPDATE propostas")) return [{ affectedRows: rpc("avaliar_proposta", {
      p_status: params[0], p_proposta_id: params[1], p_organizador_id: params[2],
    }) }];
    if (sql.includes("FROM propostas p")) {
      let rows = state.propostas;
      if (sql.includes("WHERE p.fornecedor_id")) rows = rows.filter(p => p.fornecedor_id === params[0]);
      if (sql.includes("WHERE e.usuario_id")) rows = rows.filter(p => evento(cotacao(p)).usuario_id === params[0]);
      return [rows.sort((a,b) => b.id-a.id).map(p => {
        if (sql.includes("GROUP_CONCAT")) { const { fornecedor_id, ...r } = p; return { ...r, criada_em: new Date(p.criada_em), evento_nome: evento(cotacao(p)).nome, categoria: "Som" }; }
        return { ...p, criada_em: new Date(p.criada_em), evento_id: evento(cotacao(p)).id, evento_nome: evento(cotacao(p)).nome, fornecedor_nome: "Fornecedor fictício" };
      })];
    }
    if (sql.includes("FROM solicitacoes_acesso") && sql.includes("FOR UPDATE")) return [state.solicitacoes.filter(s => s.id === params[0]).map(s => ({ ...s }))];
    if (sql.startsWith("SELECT id FROM solicitacoes_acesso")) return [state.solicitacoes.filter(s => s.usuario_id === params[0] && s.status === "pendente").map(s => ({ id: s.id }))];
    if (sql.includes("FROM solicitacoes_acesso s")) return [state.solicitacoes.map(s => ({ ...s, criada_em: new Date(s.criada_em), nome: "Teste", email: "teste9@example.invalid" }))];
    if (sql.startsWith("UPDATE usuarios")) { const u = state.usuarios.find(u => u.id === params[1]); if (u?.perfil !== "participante") return [{ affectedRows: 0 }]; u.perfil = params[0]; return [{ affectedRows: 1 }]; }
    if (sql.startsWith("UPDATE solicitacoes_acesso")) { state.solicitacoes.find(s => s.id === params[1]).status = params[0]; return [{ affectedRows: 1 }]; }
    throw Error("SQL nao previsto pelo transporte falso: " + sql);
  }
  const db = { execute: executar, query: executar, async getConnection() {
    return { execute: executar, async beginTransaction() {}, async commit() {}, async rollback() {}, release() {} };
  } };
  function selecionar(tabela, u) {
    const eq = (key, value) => u.searchParams.get(key) === "eq." + value;
    if (tabela === "usuarios") {
      let rows = state.usuarios.filter(r => u.searchParams.has("email") ? eq("email", r.email) : eq("id", r.id));
      return rows.map(r => Object.fromEntries(u.searchParams.get("select").split(/,\s*/).map(k => [k, state.authIdDivergente && k === "id" ? r.id + 100 : r[k]])));
    }
    if (tabela === "eventos") return state.eventos.filter(e => (!u.searchParams.has("id") || eq("id", e.id)) && eq("usuario_id", e.usuario_id)).sort((a,b) => b.id-a.id);
    if (tabela === "cotacoes") return state.cotacoes.filter(c => eq("evento.usuario_id", evento(c).usuario_id)).sort((a,b) => b.id-a.id).map(c => ({ ...c, evento: { nome: evento(c).nome, usuario_id: evento(c).usuario_id, data: evento(c).data, local: evento(c).local } }));
    if (tabela === "itens_cotacao") return [{ id: 51, categoria: "Som", descricao: "PA", valor_estimado: "0.10" }];
    if (tabela === "propostas") return state.propostas.filter(p => eq("cotacao.evento.usuario_id", evento(cotacao(p)).usuario_id)).map(p => ({ ...p,
      cotacao: { evento: { id: evento(cotacao(p)).id, nome: evento(cotacao(p)).nome, usuario_id: evento(cotacao(p)).usuario_id } }, fornecedor: { nome: "Fornecedor fictício" } }));
    if (tabela === "solicitacoes_acesso") {
      if (u.searchParams.has("usuario_id")) return state.solicitacoes.filter(s => eq("usuario_id", s.usuario_id) && eq("status", s.status)).map(s => ({ id: s.id }));
      return state.solicitacoes.map(s => ({ ...s, usuario: { nome: "Teste", email: "teste9@example.invalid" } }));
    }
    throw Error("Tabela inesperada no transporte falso");
  }
  async function fetchFalso(url, options) {
    const u = new URL(url); assert.equal(u.origin, "https://supabase.invalid");
    const h = new Headers(options.headers);
    // A chave e exclusivamente do backend. Nenhum JWT proprio chega ao SDK.
    assert.equal(h.get("apikey"), secretKey); assert.equal(h.get("authorization"), "Bearer " + secretKey);
    calls.push({ kind: "supabase", path: u.pathname, query: u.search, method: options.method, headersChecked: true });
    if (state.falha === "transporte") throw Object.assign(Error(privado), { name: "AbortError" });
    if (state.falha) return new Response(JSON.stringify({ code: "XX000", message: privado, details: privado }), { status: 500 });
    let data, count;
    if (u.pathname.includes("/rpc/")) {
      const name = u.pathname.split("/").at(-1), args = JSON.parse(options.body);
      rpcCalls.push({ name, args });
      if (op.rpcPendente) return new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(Object.assign(Error(privado), { name: "AbortError" })), { once: true });
      });
      data = rpc(name, args);
      if (data?.error) return new Response(JSON.stringify({ code: data.error, message: privado }), { status: 400 });
    } else if (options.method === "POST") {
      assert.equal(u.pathname, "/rest/v1/usuarios"); const row = JSON.parse(options.body);
      state.usuarios.push({ id: 33, ...row }); data = { id: 33 };
    } else {
      data = selecionar(u.pathname.split("/").at(-1), u); count = data.length;
    }
    return new Response(JSON.stringify(data), { status: 200, headers: {
      "content-type": "application/json", "sb-project-ref": "gnwybroqfvwosiqzsfla",
      ...(count === undefined ? {} : { "content-range": count ? `0-${count-1}/${count}` : "*/0" }),
    } });
  }
  const cache = new Map();
  function carregar(file) {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    const req = name => {
      imports.push(name);
      if (name === "../config/supervisor-cutover.cjs") return { criarSupervisor: () => op.supervisor ?? require("../../config/supervisor-cutover.cjs").criarSupervisor({estado:{ler:()=>({versao:1,congelado:false,selado:false,instancias:[]}),gravar(){throw Error("Estado real proibido no teste");}}}) };
      if (name === "express") {
        const express = require("express");
        return Object.assign(() => {
          const app = express();
          for (const verb of ["get", "post", "put", "patch", "delete"]) {
            const original = app[verb].bind(app);
            app[verb] = (route, ...handlers) => original(route, ...handlers.map(handler => function(...args) {
              // Promises de outra VM sao thenables para o router. Converter
              // apenas no harness evita aviso de depreciacao, sem mudar o app.
              const result = handler(...args);
              return result && typeof result.then === "function" ? Promise.resolve(result) : result;
            }));
          }
          return app;
        }, { json: express.json });
      }
      if (["bcryptjs", "jsonwebtoken", "cors"].includes(name)) return require(name);
      if (name === "dotenv") return { config() {} };
      if (name.endsWith("isolamento.cjs")) return { modoExecucao: () => "principal" };
      if (name.endsWith("config/banco.cjs")) return { ...config,
        // Exclusivamente nesta VM: testa o caminho preparado; trava real intacta.
        validarInicializacaoBanco: op.travaReal ? config.validarInicializacaoBanco : config.lerConfiguracaoBanco };
      if (name === "../db") { assert.notEqual(provider, "supabase"); return db; }
      if (name === "@supabase/supabase-js") return { createClient(url, key, options) {
        assert.equal(url, "https://supabase.invalid"); assert.equal(key, secretKey);
        assert.deepEqual(JSON.parse(JSON.stringify(options.auth)), { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
        let fetch = fetchFalso;
        if (op.somenteLeitura) {
          const transporte = require("../../homologacao.cjs").protegerFetch({ SUPABASE_URL: url, SUPABASE_SECRET_KEY: key }, fetchFalso);
          fetch = transporte.fetch; t.after(() => transporte.abortar());
        }
        return require(name).createClient(url, key, { ...options, global: { fetch } });
      } };
      const resolved = path.resolve(raiz, path.dirname(file), name);
      if (name === "./repositories/index.cjs") return carregar("repositories/index.cjs");
      if (name === "../db-supabase.cjs") { assert.equal(provider, "supabase"); return carregar("db-supabase.cjs"); }
      if (name.startsWith("../services/")) {
        const real = require(resolved), factory = Object.keys(real)[0];
        return { [factory](options) { return real[factory]({ ...options, timeoutMs: 20 }); } };
      }
      if (name.includes("/mysql/")) assert.notEqual(provider, "supabase");
      return require(resolved);
    };
    vm.runInNewContext(fs.readFileSync(path.join(raiz, file), "utf8"), {
      module, require: req, process: { env }, Buffer, console: { error: (...a) => logs.push(a), log: (...a) => logs.push(a) },
    });
    cache.set(file, module.exports); return module.exports;
  }
  const app = carregar("server.js");
  const externo = op.somenteLeitura ? require("express")().use(require("../../homologacao.cjs").filtroLeitura).use(app) : app;
  // A porta e efemera, exclusiva deste teste e nunca uma porta do projeto.
  const server = await new Promise((resolve, reject) => {
    const s = externo.listen(0, "127.0.0.1", () => resolve(s)); s.once("error", reject);
  });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const port = server.address().port; assert.ok(![3001,3107,5173,5174,3306,3307].includes(port));
  async function request(method, route, body, token, raw = false) {
    return new Promise((resolve, reject) => {
      const headers = { connection: "close", ...(token ? { authorization: "Bearer " + token } : {}) };
      if (body !== undefined) headers["content-type"] = "application/json";
      const req = http.request({ host: "127.0.0.1", port, method, path: route, headers }, res => {
        const chunks = []; res.on("data", chunk => chunks.push(chunk)); res.on("end", () => {
          try {
            const text = Buffer.concat(chunks).toString();
            resolve({ status: res.statusCode, body: text ? JSON.parse(text) : undefined });
          } catch (e) { reject(e); }
        });
      });
      req.setTimeout(3000, () => req.destroy(Error("Timeout do HTTP local")));
      req.on("error", reject); req.end(body === undefined ? undefined : raw ? body : JSON.stringify(body));
    });
  }
  return { state, calls, imports, logs, rpcCalls, request, app,
    token(id = 7, options = {}) { return jwt.sign({ id, perfil: "ignorado" }, segredo, { algorithm: "HS256", expiresIn: "1h", ...options }); },
    async login(id = 7, password = senha) { return request("POST", "/login", { email: ` TESTE${id}@EXAMPLE.INVALID `, senha: password }); },
    segredo, senha, hash, privado };
}
module.exports = { iniciar };
