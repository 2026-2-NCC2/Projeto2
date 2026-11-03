"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const config = require("../config/banco.cjs");
const raiz = path.join(__dirname, "..");
const segredo = "segredo-ficticio-exclusivo-do-teste-de-integracao-333";
const item = () => ({ categoria: "Som", descricao: "PA", valor_estimado: "0.10" });
const rotas = { custos: "put /eventos/:id/custos", cotacoes: "post /cotacoes", acesso: "patch /solicitacoes-acesso/:id" };
function ambiente(provider, caso, op = {}) {
  const imports = [], transacao = [], rpcs = [], writes = [], routes = new Map();
  const perfil = op.perfil ?? (caso === "acesso" ? "admin" : "organizador");
  const usuario = { id: 7, nome: "Teste", email: "teste@example.invalid", perfil };
  const env = { JWT_SECRET: segredo, ...(provider === undefined ? {} : { DB_PROVIDER: provider }),
    SUPABASE_URL: "https://integracao.invalid", SUPABASE_SECRET_KEY: "sb_secret_ficticia" };
  let clientCount = 0, signals = [], salvos = [], resolveLate;
  const connection = {
    async beginTransaction() { transacao.push("begin"); },
    async commit() { transacao.push("commit"); if (op.commitTimeout) throw Error("SQL privado senha privada"); },
    async rollback() { transacao.push("rollback"); }, release() { transacao.push("release"); },
  };
  const db = { async getConnection() { transacao.push("getConnection"); return connection; } };
  const check = c => assert.equal(c, connection);
  const mysql = {
    usuarios: { async buscarParaAutenticacao() { return op.usuarioAusente ? undefined : usuario; } },
    custos: {
      async bloquearEventoDoUsuario(c, id, user) { check(c); assert.equal(id, 13); assert.equal(user, 7); transacao.push("evento"); return op.ausente ? [] : [{ id }]; },
      async excluirPorEvento(c) { check(c); writes.push("delete"); salvos = []; },
      async inserir(c, id, row) { check(c); writes.push("insertCost"); salvos.push({ id: 21, evento_id: id, ...row }); },
      async listarPorEvento(id, c) { check(c); transacao.push("releitura"); return salvos; },
    },
    cotacoes: {
      async bloquearCustosDoEvento(c) { check(c); transacao.push("custos"); return op.persistidos ?? [item()]; },
      async criar(c, row) { check(c); writes.push(["quote", row]); return 21; },
      async inserirItem(c, id, row) { check(c); assert.equal(id, 21); writes.push(["item", row]); },
    },
    solicitacoesAcesso: {
      async bloquearPorId(c) { check(c); transacao.push("solicitacao"); return op.ausente ? [] : [{ usuario_id: 9, perfil_solicitado: "fornecedor", status: op.statusAnterior ?? "pendente" }]; },
      async atualizarPerfilParticipante(c, perfil, id) { check(c); assert.equal(perfil, "fornecedor"); assert.equal(id, 9); writes.push("perfil"); return op.afetados ?? 1; },
      async atualizarStatus(c, status) { check(c); writes.push(["status", status]); },
    }, propostas: {}, eventos: {}, inscricoes: {},
  };
  const client = { schema(schema) {
    assert.equal(schema, "public");
    return {
      from(tabela) {
        assert.equal(tabela, "usuarios");
        const q = { select() { return q; }, eq(campo, id) { assert.equal(campo, "id"); assert.equal(id, 7); return q; },
          async maybeSingle() { return { data: op.usuarioAusente ? null : usuario }; } };
        return q;
      },
      rpc(name, args, options) {
        rpcs.push({ name, args, options });
        assert.deepEqual(options, { get: false, head: false });
        return { retry(repetir) { assert.equal(repetir, false); return { abortSignal(signal) {
          signals.push(signal);
          if (op.timeout) return new Promise(resolve => { resolveLate = resolve; });
          if (op.rpcError) return Promise.resolve({ error: { code: op.rpcError, message: "senha privada SQL privado" } });
          let data;
          if (caso === "custos") data = args.p_custos.map((r, i) => ({ id: 21 + i, evento_id: 13, ...r }));
          if (caso === "cotacoes") data = { id: 21, evento_id: 13, prazo: args.p_prazo, observacoes: args.p_observacoes, modalidade: "Fechada", status: "Aberta", itens: args.p_itens };
          if (caso === "acesso") data = { mensagem: args.p_status === "aprovado" ? "Solicitação aprovada com sucesso!" : "Solicitação rejeitada com sucesso!" };
          return Promise.resolve({ data });
        } }; } };
      },
    };
  } };
  const app = { use() {}, listen() { throw Error("HTTP real proibido"); } };
  for (const method of ["get", "post", "put", "patch", "delete"]) app[method] = (url, ...handlers) => routes.set(method + " " + url, handlers);
  const cache = new Map();
  function carregar(arquivo) {
    if (cache.has(arquivo)) return cache.get(arquivo);
    const module = { exports: {} };
    const req = name => {
      imports.push(name);
      if (name === "express") return Object.assign(() => app, { json: () => () => {} });
      if (name === "cors") return () => () => {};
      if (name === "bcryptjs") return {};
      if (name === "jsonwebtoken") return { verify(token, key, opts) {
        assert.equal(key, segredo); assert.deepEqual(JSON.parse(JSON.stringify(opts)), { algorithms: ["HS256"] });
        if (token === "invalido") throw Error("segredo privado"); return { id: 7 };
      } };
      if (name === "dotenv") return { config() {} };
      if (name.endsWith("isolamento.cjs")) return { modoExecucao: () => "principal" };
      if (name.endsWith("config/banco.cjs")) return {
        ...config,
        // Somente no teste: exercitar caminho preparado sem liberar startup real.
        validarInicializacaoBanco: op.testarStartupReal ? config.validarInicializacaoBanco : config.lerConfiguracaoBanco,
      };
      if (name === "../db" || name === "./db") { assert.notEqual(provider, "supabase", "Supabase importou db.js"); return db; }
      if (name === "../db-supabase.cjs") {
        assert.equal(provider, "supabase"); return { criarClienteSupabase() { clientCount++; return client; } };
      }
      const destino = path.resolve(raiz, path.dirname(arquivo), name);
      if (name.includes("/mysql/")) {
        assert.notEqual(provider, "supabase", "Supabase importou repositorio MySQL");
        const dominio = path.basename(name, ".cjs"), key = dominio === "solicitacoes-acesso" ? "solicitacoesAcesso" : dominio;
        const fabrica = Object.keys(require(destino))[0];
        return { [fabrica](adapter) { assert.equal(adapter, db); return mysql[key]; } };
      }
      if (name.startsWith("../services/")) {
        const real = require(destino), fabrica = Object.keys(real)[0];
        return { [fabrica](options) {
          const service = real[fabrica]({ ...options, timeoutMs: 10, agora: () => new Date("2030-01-01T12:00:00Z") });
          if (op.erroForjado) {
            return Object.fromEntries(Object.keys(service).map(method => [method, async () => {
              throw Object.assign(Error("senha privada SQL privado"), { respostaStatus: 409, resultadoIncerto: false });
            }]));
          }
          return service;
        } };
      }
      if (name === "./repositories/index.cjs") return carregar("repositories/index.cjs");
      return require(destino);
    };
    vm.runInNewContext(fs.readFileSync(path.join(raiz, arquivo), "utf8"), {
      module, require: req, process: { env }, Buffer, console: { error() {}, log() {} },
    });
    cache.set(arquivo, module.exports); return module.exports;
  }
  carregar("server.js");
  return { imports, rpcs, writes, transacao, clientCount: () => clientCount, signals,
    late() { resolveLate?.({ data: {} }); },
    async request(body, token = "valido") {
      if (body === undefined) body = caso === "custos" ? { custos: [item()] }
        : caso === "cotacoes" ? { ...payload(), usuario_id: 999 } : { status: "aprovado", admin_id: 999 };
      const req = { body, params: { id: "13" }, headers: { authorization: token === null ? undefined : "Bearer " + token } };
      const res = { statusCode: 200, status(n) { this.statusCode = n; return this; },
        json(value) { this.body = JSON.parse(JSON.stringify(value)); return this; } };
      for (const handler of routes.get(rotas[caso])) {
        let next = false; await handler(req, res, () => { next = true; }); if (!next) break;
      }
      return res;
    },
  };
}
function payload() { return { evento_id: 13, prazo: "2030-01-02", observacoes: "Teste", itens: [item()] }; }

for (const provider of [undefined, "mysql", "supabase"]) {
  for (const caso of Object.keys(rotas)) {
    test(`handler ${caso} / ${provider ?? "padrao"}: contrato de sucesso e isolamento`, async () => {
      const a = ambiente(provider, caso), res = await a.request();
      assert.equal(res.statusCode, caso === "cotacoes" ? 201 : 200);
      if (caso === "custos") assert.deepEqual(res.body, [{ id: 21, evento_id: 13, ...item() }]);
      if (caso === "cotacoes") assert.deepEqual(res.body, { mensagem: "Cotação publicada com sucesso!", cotacao: {
        id: 21, evento_id: 13, prazo: "2030-01-02", observacoes: "Teste", modalidade: "Fechada", status: "Aberta", itens: [item()],
      } });
      if (caso === "acesso") assert.deepEqual(res.body, { mensagem: "Solicitação aprovada com sucesso!" });
      if (provider === "supabase") {
        assert.equal(a.rpcs.length, 1); assert.equal(a.clientCount(), 1); assert.deepEqual(a.transacao, []);
        assert.equal(a.imports.some(i => i === "./db" || i === "../db" || i.includes("/mysql/")), false);
      } else {
        assert.equal(a.rpcs.length, 0); assert.equal(a.clientCount(), 0);
        assert.equal(a.imports.includes("../db-supabase.cjs"), false);
        assert.equal(a.transacao.filter(i => i === "commit").length, 1);
      }
    });
  }
}
for (const provider of ["mysql", "supabase"]) {
  test(`handlers ${provider}: JWT, perfil e validacoes bloqueiam escrita`, async () => {
    for (const caso of Object.keys(rotas)) {
      for (const [opcoes, body, token, esperado] of [
        [{}, undefined, null, 401], [{}, undefined, "invalido", 401],
        [{ perfil: "fornecedor" }, undefined, "valido", 403],
        [{ usuarioAusente: true }, undefined, "valido", 401],
        [{}, caso === "custos" ? { custos: [{ ...item(), valor_estimado: "0.001" }] }
          : caso === "cotacoes" ? { ...payload(), prazo: "2030-02-30" } : { status: "Aprovado" }, "valido", 400],
      ]) {
        const a = ambiente(provider, caso, opcoes), res = await a.request(body, token);
        assert.equal(res.statusCode, esperado); assert.deepEqual(a.writes, []); assert.deepEqual(a.rpcs, []);
      }
    }
  });
}
test("handlers MySQL: ausencia, custos vazios, revisao divergente e decisao repetida", async () => {
  for (const [caso, options, expected] of [["custos", { ausente: true }, 404], ["cotacoes", { ausente: true }, 404],
    ["cotacoes", { persistidos: [] }, 400], ["cotacoes", { persistidos: [{ ...item(), valor_estimado: "0.20" }] }, 409],
    ["acesso", { ausente: true }, 404], ["acesso", { statusAnterior: "aprovado" }, 409], ["acesso", { afetados: 0 }, 409]]) {
    const a = ambiente("mysql", caso, options), res = await a.request(); assert.equal(res.statusCode, expected);
    assert.equal(a.transacao.includes("commit"), false); assert.equal(a.transacao.at(-1), "release");
  }
});
test("handlers Supabase: conflitos e falhas nao expoem dados privados nem repetem RPC", async () => {
  for (const [caso, code, expected, message] of [
    ["custos", "TC404", 404, "Evento não encontrado."],
    ["cotacoes", "TP409", 409, "Os custos foram alterados. Consulte e revise a lista antes de publicar."],
    ["acesso", "TA409", 409, "Esta solicitação já foi analisada."],
    ["acesso", "TA412", 409, "O usuário não possui mais o perfil participante."],
    ["cotacoes", "XX000", 500, "Não foi possível confirmar a publicação. Consulte as cotações antes de tentar novamente."],
  ]) {
    const a = ambiente("supabase", caso, { rpcError: code }), res = await a.request();
    assert.equal(res.statusCode, expected); assert.deepEqual(res.body, { erro: message }); assert.equal(a.rpcs.length, 1);
  }
});
test("handlers Supabase: timeout incerto sem reenvio, mesmo com resposta tardia", async () => {
  for (const caso of Object.keys(rotas)) {
    const a = ambiente("supabase", caso, { timeout: true }), res = await a.request();
    assert.equal(res.statusCode, 500); assert.equal(a.rpcs.length, 1); assert.equal(a.signals[0].aborted, true);
    a.late(); await Promise.resolve(); assert.equal(a.rpcs.length, 1); assert.doesNotMatch(JSON.stringify(res.body), /privad/);
  }
});
test("startup Supabase real continua bloqueado antes da fabrica, pool ou SDK", () => {
  assert.throws(() => ambiente("supabase", "custos", { testarStartupReal: true }), e => e.code === "DB_PROVIDER_NOT_IMPLEMENTED");
});
test("handlers nao confiam em status ou mensagem forjados por erros de integracao", async () => {
  for (const caso of Object.keys(rotas)) {
    const a = ambiente("mysql", caso, { erroForjado: true }), res = await a.request();
    assert.equal(res.statusCode, 500); assert.doesNotMatch(JSON.stringify(res.body), /privad/);
    assert.deepEqual(a.writes, []); assert.deepEqual(a.rpcs, []);
  }
});
