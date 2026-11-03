"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { criarRepositorioCustos } = require("../repositories/mysql/custos.cjs");

const item = { categoria: "Som", descricao: "Caixa", valor_estimado: "9999999999.99" };
const campos = "SELECT id, evento_id, categoria, descricao, valor_estimado FROM custos_evento WHERE evento_id = ? ORDER BY id";
const lock = "SELECT id FROM eventos WHERE id = ? AND usuario_id = ? FOR UPDATE";
const normalizar = sql => sql.replace(/\s+/g, " ").trim();

for (const [metodo, transacional, sql, params] of [
  ["buscarEventoDoUsuario", false, "SELECT id FROM eventos WHERE id = ? AND usuario_id = ?", [13, 7]],
  ["bloquearEventoDoUsuario", true, lock, [13, 7]],
  ["listarPorEvento", false, campos, [13]],
  ["excluirPorEvento", true, "DELETE FROM custos_evento WHERE evento_id = ?", [13]],
  ["inserir", true, "INSERT INTO custos_evento (evento_id, categoria, descricao, valor_estimado) VALUES (?, ?, ?, ?)", [13, item.categoria, item.descricao, item.valor_estimado]],
]) {
  test(`${metodo}: SQL e parametros preservados; executor correto; sem conversao`, async () => {
    const resultado = [{ id: 1, evento_id: 13, ...item }];
    let chamadas = 0;
    const executor = { async execute(texto, p) {
      chamadas++; assert.equal(normalizar(texto), sql); assert.deepEqual(p, params);
      return [resultado];
    } };
    const proibido = { execute() { throw Error("Pool indevido na transacao"); } };
    const repo = criarRepositorioCustos(transacional ? proibido : executor);
    const args = metodo === "buscarEventoDoUsuario" ? [13, 7]
      : metodo === "bloquearEventoDoUsuario" ? [executor, 13, 7]
        : metodo === "listarPorEvento" ? [13] : [executor, 13, item];
    assert.strictEqual(await repo[metodo](...args), resultado);
    assert.equal(chamadas, 1);
  });
}

test("leitura final do PUT usa a conexao recebida, nunca o pool", async () => {
  const rows = [];
  const repo = criarRepositorioCustos({ execute() { throw Error("Pool indevido"); } });
  assert.strictEqual(await repo.listarPorEvento(13, { async execute(sql, params) {
    assert.equal(normalizar(sql), campos); assert.deepEqual(params, [13]); return [rows];
  } }), rows);
});

// Handlers reais em VM fechada, repositorio real e conexao inteiramente fake.
function ambiente(opcoes = {}) {
  const rotas = new Map(), ordem = [];
  let salvos = [{ id: 99, evento_id: 13, ...item }], pendentes, inserts = 0;
  const falha = etapa => { if (opcoes.falharEm === etapa) throw Error("SQL privado"); };
  const conexao = {
    async beginTransaction() { ordem.push("begin"); falha("begin"); pendentes = structuredClone(salvos); },
    async execute(sql, params) {
      const texto = normalizar(sql);
      if (texto === lock) {
        ordem.push("lock"); assert.deepEqual(Array.from(params), [13, 7]); falha("lock");
        return [opcoes.semEvento ? [] : [{ id: 13 }]];
      }
      if (texto === "DELETE FROM custos_evento WHERE evento_id = ?") {
        ordem.push("delete"); assert.deepEqual(Array.from(params), [13]); falha("delete"); pendentes = []; return [{}];
      }
      if (texto.startsWith("INSERT INTO custos_evento")) {
        ordem.push("insert"); inserts++; falha(`insert${inserts}`);
        assert.equal(params[0], 13);
        assert.equal(typeof params[3], "string");
        pendentes.push({ id: inserts, evento_id: params[0], categoria: params[1], descricao: params[2], valor_estimado: params[3] });
        return [{ insertId: inserts }];
      }
      assert.equal(texto, campos); ordem.push("list"); falha("list"); return [structuredClone(pendentes)];
    },
    async commit() { ordem.push("commit"); falha("commit"); salvos = pendentes; },
    async rollback() { ordem.push("rollback"); pendentes = undefined; if (opcoes.falhaRollback) throw Error("SQL privado"); },
    release() { ordem.push("release"); },
  };
  const db = {
    async execute(sql, params) {
      const texto = normalizar(sql);
      if (texto === "SELECT id, nome, email, perfil FROM usuarios WHERE id = ?") return [[{ id: 7, perfil: "organizador" }]];
      if (texto === "SELECT id FROM eventos WHERE id = ? AND usuario_id = ?") {
        ordem.push("owner"); assert.deepEqual(Array.from(params), [13, 7]); falha("owner"); return [opcoes.semEvento ? [] : [{ id: 13 }]];
      }
      assert.equal(texto, campos); ordem.push("getList"); falha("getList"); return [opcoes.vazio ? [] : salvos];
    },
    async getConnection() { ordem.push("getConnection"); falha("getConnection"); return conexao; },
  };
  const app = { use() {} };
  for (const m of ["get", "post", "put", "patch", "delete"]) app[m] = (p, ...handlers) => rotas.set(`${m} ${p}`, handlers);
  const dependencias = {
    express: Object.assign(() => app, { json: () => () => {} }), cors: () => () => {},
    bcryptjs: {}, jsonwebtoken: { verify: () => ({ id: 7 }) }, dotenv: { config() {} },
    "./db": db, "./isolamento.cjs": { modoExecucao: () => "principal" },
    "./repositories/mysql/usuarios.cjs": require("../repositories/mysql/usuarios.cjs"),
    "./repositories/mysql/eventos.cjs": require("../repositories/mysql/eventos.cjs"),
    "./repositories/mysql/cotacoes.cjs": require("../repositories/mysql/cotacoes.cjs"),
    "./repositories/mysql/propostas.cjs": require("../repositories/mysql/propostas.cjs"),
    "./repositories/mysql/inscricoes.cjs": require("../repositories/mysql/inscricoes.cjs"),
    "./repositories/mysql/solicitacoes-acesso.cjs": require("../repositories/mysql/solicitacoes-acesso.cjs"),
    "./repositories/mysql/custos.cjs": { criarRepositorioCustos },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../server.js"), "utf8"), {
    Buffer, module: { exports: {} }, process: { env: { JWT_SECRET: "segredo-ficticio-exclusivo-da-suite-de-custos" } },
    console: { log() {}, error() {} },
    require(nome) { const nova = require("./helpers/persistencia.cjs").dependencia(nome, db); if (nova) return nova;  assert.ok(Object.hasOwn(dependencias, nome)); return dependencias[nome]; },
  });
  return {
    ordem, get salvos() { return salvos; },
    async request(metodo, custos = []) {
      const req = { headers: { authorization: "Bearer simulado" }, params: { id: "13" }, body: { custos } };
      const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(dados) { this.body = dados; return this; } };
      for (const handler of rotas.get(`${metodo} /eventos/:id/custos`)) {
        let next = false; await handler(req, res, () => { next = true; }); if (!next) break;
      }
      return res;
    },
  };
}

test("GET preserva lista vazia, propriedade e falhas sem buscar custos alheios", async () => {
  for (const [opts, status, ordem] of [[{ vazio: true }, 200, ["owner", "getList"]],
    [{ semEvento: true }, 404, ["owner"]], [{ falharEm: "owner" }, 500, ["owner"]],
    [{ falharEm: "getList" }, 500, ["owner", "getList"]]]) {
    const a = ambiente(opts); const r = await a.request("get");
    assert.equal(r.statusCode, status); assert.deepEqual(a.ordem, ordem);
    if (status === 200) assert.deepEqual(Array.from(r.body), []);
  }
});

test("PUT multiplo preserva normalizacao, precisao e ordem completa da transacao", async () => {
  const a = ambiente(); const r = await a.request("put", [{ ...item, categoria: " Som ", valor_estimado: "0000.1" }, item]);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(a.ordem, ["getConnection", "begin", "lock", "delete", "insert", "insert", "list", "commit", "release"]);
  assert.equal(r.body[0].categoria, "Som"); assert.equal(r.body[0].valor_estimado, "0.10");
  assert.equal(r.body[1].valor_estimado, "9999999999.99");
  assert.deepEqual(r.body, a.salvos);
});

test("PUT vazio exclui, rele e confirma sem inserir", async () => {
  const a = ambiente(); assert.equal((await a.request("put", [])).statusCode, 200);
  assert.deepEqual(a.salvos, []);
  assert.deepEqual(a.ordem, ["getConnection", "begin", "lock", "delete", "list", "commit", "release"]);
});

for (const etapa of ["getConnection", "begin", "lock", "delete", "insert1", "insert2", "list", "commit"]) {
  test(`PUT falha em ${etapa}: nao repete, reverte e libera quando ha conexao`, async () => {
    const a = ambiente({ falharEm: etapa }); const original = structuredClone(a.salvos);
    const r = await a.request("put", [item, item]);
    assert.equal(r.statusCode, 500); assert.deepEqual(a.salvos, original);
    assert.equal(a.ordem.filter(e => e === "getConnection").length, 1);
    if (etapa === "getConnection") assert.deepEqual(a.ordem, ["getConnection"]);
    else assert.deepEqual(a.ordem.slice(-2), ["rollback", "release"]);
    assert.ok(!JSON.stringify(r.body).includes("SQL privado"));
  });
}

test("PUT evento ausente reverte antes do DELETE; rollback falho ainda libera", async () => {
  const a = ambiente({ semEvento: true }); assert.equal((await a.request("put", [item])).statusCode, 404);
  assert.deepEqual(a.ordem, ["getConnection", "begin", "lock", "rollback", "release"]);
  const b = ambiente({ falharEm: "insert2", falhaRollback: true });
  assert.equal((await b.request("put", [item, item])).statusCode, 500);
  assert.deepEqual(b.ordem.slice(-2), ["rollback", "release"]);
});

test("PUT invalido continua sendo rejeitado antes de adquirir conexao", async () => {
  const a = ambiente(); const r = await a.request("put", [{ ...item, valor_estimado: "1.001" }]);
  assert.equal(r.statusCode, 400); assert.deepEqual(a.ordem, []);
});
