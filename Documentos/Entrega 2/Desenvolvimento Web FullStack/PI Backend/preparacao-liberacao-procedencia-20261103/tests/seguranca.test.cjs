"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const jwt = require("jsonwebtoken");

const segredo = "segredo-ficticio-apenas-para-testes-de-seguranca";
const privado = "SENHA_TOKEN_SQL_CREDENCIAL_PRIVADOS";
const fonte = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");

// Exercita os middlewares reais das rotas sem ler .env, abrir sockets ou acessar bancos.
function ambiente() {
  const rotas = new Map(), middlewares = [], logs = [], chamadas = [];
  const estado = { agora: 0, falhar: false, inexistente: false, comparar: 0, hashes: 0 };
  const usuario = { id: 7, nome: "Teste", email: "teste@example.com", perfil: "participante" };
  const db = { async execute(sql, params) {
    chamadas.push({ sql, params: Array.from(params || []) });
    if (estado.falhar) throw Object.assign(new Error(privado), {
      sql: privado, sqlMessage: privado, password: privado, token: privado, code: privado,
    });
    if (/FROM eventos/.test(sql)) return [[{ id: 13, usuario_id: 7, nome: "Evento" }]];
    if (/^INSERT/.test(sql)) return [{ insertId: 8 }];
    if (/WHERE email/.test(sql)) return [/SELECT id FROM/.test(sql) ? [] : [{ ...usuario, senha: privado }]];
    return [estado.inexistente ? [] : [usuario]];
  } };
  const app = { use: (...args) => middlewares.push(...args) };
  for (const metodo of ["get", "post", "put", "patch", "delete"]) {
    app[metodo] = (rota, ...handlers) => rotas.set(`${metodo} ${rota}`, handlers);
  }
  const express = Object.assign(() => app, { json: () => () => {} });
  const sandbox = {
    module: { exports: {} }, Buffer,
    Date: class extends Date { static now() { return estado.agora; } },
    process: { env: { JWT_SECRET: segredo } },
    console: { log: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    require(nome) { const nova = require("./helpers/persistencia.cjs").dependencia(nome, db); if (nova) return nova;
      if (nome === "express") return express;
      if (nome === "jsonwebtoken") return jwt;
      if (nome === "bcryptjs") return {
        async compare(senha) { estado.comparar++; return senha === "senha-correta"; },
        async hash() { estado.hashes++; return "hash-ficticio"; },
      };
      if (nome === "cors") return () => () => {};
      if (nome === "./db") return db;
      if (nome === "./repositories/mysql/usuarios.cjs") return require("../repositories/mysql/usuarios.cjs");
      if (nome === "./repositories/mysql/eventos.cjs") return require("../repositories/mysql/eventos.cjs");
      if (nome === "./repositories/mysql/cotacoes.cjs") return require("../repositories/mysql/cotacoes.cjs");
      if (nome === "./repositories/mysql/propostas.cjs") return require("../repositories/mysql/propostas.cjs");
      if (nome === "./repositories/mysql/inscricoes.cjs") return require("../repositories/mysql/inscricoes.cjs");
      if (nome === "./repositories/mysql/solicitacoes-acesso.cjs") return require("../repositories/mysql/solicitacoes-acesso.cjs");
      if (nome === "./repositories/mysql/custos.cjs") return require("../repositories/mysql/custos.cjs");
      if (nome === "./isolamento.cjs") return { modoExecucao: () => "principal" };
      if (nome === "dotenv") return { config() {} };
      throw new Error("Dependencia inesperada");
    },
  };
  vm.runInNewContext(fonte, sandbox);
  const token = (payload = { id: 7 }, opcoes = {}) => jwt.sign(payload, segredo, {
    algorithm: "HS256", ...opcoes,
  });
  async function requisitar(rota, body = {}, opcoes = {}) {
    const req = { body, ip: opcoes.ip || "127.0.0.1", params: { id: "13" },
      headers: { authorization: `Bearer ${opcoes.token ?? token()}`, ...opcoes.headers } };
    const res = { statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(n) { this.statusCode = n; return this; },
      json(dados) { this.body = dados; return this; },
    };
    for (const handler of rotas.get(rota)) {
      let continuar = false;
      await handler(req, res, () => { continuar = true; });
      if (!continuar) break;
    }
    return res;
  }
  return { requisitar, token, estado, chamadas, logs, middlewares, rotas };
}

test("login limita antes do SQL/bcrypt, ignora X-Forwarded-For e libera no fim da janela", async () => {
  const a = ambiente();
  for (let i = 0; i < 10; i++) {
    assert.equal((await a.requisitar("post /login", { email: "a@b.com", senha: "errada" })).statusCode, 401);
  }
  const r = await a.requisitar("post /login", { email: "outro@b.com", senha: "senha-correta" }, {
    headers: { "x-forwarded-for": "198.51.100.1" },
  });
  assert.equal(r.statusCode, 429);
  assert.equal(r.headers["Retry-After"], "900");
  assert.equal(a.chamadas.length, 10);
  assert.equal(a.estado.comparar, 10);
  assert.equal((await a.requisitar("post /login", {}, { ip: "127.0.0.2" })).statusCode, 400);
  a.estado.agora = 899999;
  assert.equal((await a.requisitar("post /login")).headers["Retry-After"], "1");
  a.estado.agora = 900000;
  const sucesso = await a.requisitar("post /login", { email: "a@b.com", senha: "senha-correta" });
  assert.equal(sucesso.statusCode, 200);
  assert.equal(jwt.decode(sucesso.body.token, { complete: true }).header.alg, "HS256");
  const dados = jwt.verify(sucesso.body.token, segredo, { algorithms: ["HS256"] });
  assert.equal(dados.exp - dados.iat, 3600);
});

test("cadastro tem limite independente por IP e janela, antes de SQL/hash", async () => {
  const a = ambiente();
  const body = { nome: "Teste", email: "a@b.com", senha: "senha-segura", perfil: "participante" };
  for (let i = 0; i < 5; i++) assert.equal((await a.requisitar("post /usuarios", body)).statusCode, 201);
  assert.equal(a.estado.hashes, 5);
  const consultas = a.chamadas.length;
  const r = await a.requisitar("post /usuarios", body);
  assert.equal(r.statusCode, 429);
  assert.equal(r.headers["Retry-After"], "3600");
  assert.equal(a.chamadas.length, consultas);
  assert.equal(a.estado.hashes, 5);
  assert.equal((await a.requisitar("post /login")).statusCode, 400);
  assert.equal((await a.requisitar("post /usuarios", body, { ip: "127.0.0.2" })).statusCode, 201);
  a.estado.agora = 3600000;
  assert.equal((await a.requisitar("post /usuarios", body)).statusCode, 201);
});

test("requisicoes invalidas e concorrentes tambem consomem a cota", async () => {
  const a = ambiente();
  const respostas = await Promise.all(Array.from({ length: 20 }, () => a.requisitar("post /login")));
  assert.equal(respostas.filter(r => r.statusCode === 400).length, 10);
  assert.equal(respostas.filter(r => r.statusCode === 429).length, 10);
  assert.equal(a.chamadas.length, 0);
});

test("capacidade de IPs e limitada sem permitir evadir bloqueios existentes", async () => {
  const a = ambiente();
  for (let i = 0; i < 10000; i++) await a.requisitar("post /login", {}, { ip: `ip-${i}` });
  assert.equal((await a.requisitar("post /login", {}, { ip: "novo" })).statusCode, 429);
  a.estado.agora = 900000;
  assert.equal((await a.requisitar("post /login", {}, { ip: "novo" })).statusCode, 400);
});

test("JWT rejeita algoritmos inesperados, assinatura incorreta e expiracao antes do SQL", async () => {
  const a = ambiente();
  const tokens = [a.token({ id: 7 }, { algorithm: "HS384" }),
    a.token({ id: 7 }, { algorithm: "HS512" }), a.token({ id: 7 }, { algorithm: "none" }),
    a.token({ id: 7 }, { expiresIn: -1 }), a.token({ id: 7 }, { notBefore: "1h" }),
    jwt.sign({ id: 7 }, "outro-segredo-ficticio"), "invalido"];
  for (const token of tokens) assert.equal((await a.requisitar("get /perfil", {}, { token })).statusCode, 401);
  assert.equal(a.chamadas.length, 0);
});

test("JWT exige id numerico inteiro positivo seguro antes do SQL", async () => {
  const a = ambiente();
  for (const payload of [{}, { id: null }, { id: 0 }, { id: -1 }, { id: 1.5 },
    { id: "7" }, { id: true }, { id: {} }, { id: [7] }, { id: 9007199254740992 }]) {
    assert.equal((await a.requisitar("get /perfil", {}, { token: a.token(payload) })).statusCode, 401);
  }
  const texto = jwt.sign("payload-textual", segredo);
  assert.equal((await a.requisitar("get /perfil", {}, { token: texto })).statusCode, 401);
  assert.equal(a.chamadas.length, 0);
  assert.equal((await a.requisitar("get /perfil")).statusCode, 200);
  a.estado.inexistente = true;
  assert.equal((await a.requisitar("get /perfil")).statusCode, 401);
});

test("autorizacao continua usando perfil do banco, independentemente do perfil no JWT", async () => {
  const a = ambiente();
  const r = await a.requisitar("get /usuarios", {}, { token: a.token({ id: 7, perfil: "admin" }) });
  assert.equal(r.statusCode, 403);
  assert.equal(a.chamadas.length, 1);
});

test("evento usa somente colunas permitidas e preserva filtro por proprietario", async () => {
  const a = ambiente();
  assert.equal((await a.requisitar("get /eventos/:id")).statusCode, 200);
  const consulta = a.chamadas.at(-1);
  assert.equal(consulta.sql.replace(/\s+/g, " ").trim(),
    "SELECT id, nome, data, horario, local, categoria, publico, descricao, status, usuario_id FROM eventos WHERE id = ? AND usuario_id = ?");
  assert.deepEqual(consulta.params, [13, 7]);
});

test("erros de driver nao expoem dados privados em logs ou respostas", async () => {
  const a = ambiente();
  a.estado.falhar = true;
  for (const [rota, body] of [["post /login", { email: "a@b.com", senha: privado }],
    ["post /usuarios", { nome: "Teste", email: "a@b.com", senha: privado, perfil: "participante" }],
    ["get /perfil", {}]]) {
    const r = await a.requisitar(rota, body);
    assert.equal(r.statusCode, 500);
    assert.ok(!JSON.stringify(r.body).includes(privado));
  }
  assert.equal(a.logs.length, 3);
  assert.ok(!JSON.stringify(a.logs).includes(privado));
  // Todos os logs de erro das rotas devem usar apenas mensagens literais fixas.
  const logs = fonte.match(/console\.error\([^\n]+/g);
  for (const log of logs) assert.match(log, /^console\.error\("[^"\n]*"\);/);
});

test("handler final sanitiza JSON invalido, tamanho excedido e erros inesperados", () => {
  const a = ambiente();
  const handler = a.middlewares.find(fn => fn.length === 4);
  for (const [type, status] of [["entity.parse.failed", 400], ["entity.too.large", 413], [privado, 500]]) {
    const res = { status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; } };
    handler({ type, message: privado, stack: privado, body: privado }, {}, res, () => assert.fail());
    assert.equal(res.statusCode, status);
    assert.ok(!JSON.stringify(res.body).includes(privado));
  }
  let destruida = false;
  handler(new Error(privado), {}, { headersSent: true, destroy() { destruida = true; } }, () => assert.fail());
  assert.equal(destruida, true);
  assert.ok(!JSON.stringify(a.logs).includes(privado));
});
