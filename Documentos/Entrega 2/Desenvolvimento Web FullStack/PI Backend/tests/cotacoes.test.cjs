"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const item = (valor = "0.10") => ({ categoria: "Som", descricao: "Locacao", valor_estimado: valor });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

// Sem driver SQL, sockets, arquivos privados ou servidores reais.
function ambiente(opcoes = {}) {
  const rotas = new Map();
  const logs = [];
  const estado = { custos: opcoes.custos ?? [item()], cotacoes: [{ id: 1, antiga: true }],
    itens: [], chamadas: [], commits: 0, rollbacks: 0, releases: 0, destroys: 0, conexoes: 0 };
  let fila = Promise.resolve();
  const db = {
    async execute() { return [[{ id: 10, perfil: opcoes.perfil || "organizador" }]]; },
    async getConnection() {
      estado.conexoes++;
      if (opcoes.falhaConexao) throw Error("segredo-SQL");
      let liberar, snapshot, novas = [], novosItens = [];
      const c = {
        async beginTransaction() { estado.chamadas.push("begin"); },
        async execute(sql, params) {
          const texto = sql.replace(/\s+/g, " ").trim();
          estado.chamadas.push({ sql: texto, params });
          if (/^SELECT id FROM eventos/.test(texto)) {
            assert.match(texto, /FOR UPDATE$/);
            assert.deepEqual(Array.from(params), [13, 10]);
            const anterior = fila;
            const espera = deferred();
            fila = espera.promise;
            liberar = espera.resolve;
            if (opcoes.aoEsperarLock) opcoes.aoEsperarLock();
            await anterior;
            snapshot = structuredClone(estado.custos);
            return [opcoes.semEvento ? [] : [{ id: 13 }]];
          }
          if (/^SELECT .*FROM custos_evento/.test(texto)) {
            assert.ok(snapshot);
            if (/FOR UPDATE/.test(texto)) assert.match(texto, /ORDER BY id FOR UPDATE$/);
            return [snapshot];
          }
          if (/^DELETE FROM custos_evento/.test(texto)) { snapshot = []; return [{}]; }
          if (/^INSERT INTO custos_evento/.test(texto)) {
            snapshot.push({ categoria: params[1], descricao: params[2], valor_estimado: params[3] });
            if (opcoes.pausarPut) { opcoes.pausarPut.entrou.resolve(); await opcoes.pausarPut.continuar.promise; }
            return [{}];
          }
          if (/^INSERT INTO cotacoes/.test(texto)) {
            if (opcoes.pausarPost) { opcoes.pausarPost.entrou.resolve(); await opcoes.pausarPost.continuar.promise; }
            novas.push({ id: 2 }); return [{ insertId: 2 }];
          }
          if (/^INSERT INTO itens_cotacao/.test(texto)) {
            if (opcoes.falhaItem) throw Error("segredo-SQL");
            novosItens.push(Array.from(params)); return [{}];
          }
          throw Error("SQL inesperado");
        },
        async commit() {
          if (opcoes.falhaCommit) throw Error("segredo-SQL");
          estado.commits++;
          estado.custos = snapshot;
          estado.cotacoes.push(...novas); estado.itens.push(...novosItens);
          liberar?.(); liberar = null;
        },
        async rollback() {
          estado.rollbacks++; novas = []; novosItens = [];
          if (opcoes.falhaRollback) throw Error("segredo-SQL");
          liberar?.(); liberar = null;
        },
        release() { estado.releases++; liberar?.(); },
        destroy() { estado.destroys++; liberar?.(); },
      };
      if (opcoes.semDestroy) delete c.destroy;
      return c;
    },
  };
  const app = { use() {} };
  for (const metodo of ["get", "post", "put", "patch", "delete"]) {
    app[metodo] = (rota, ...handlers) => rotas.set(`${metodo} ${rota}`, handlers);
  }
  const express = Object.assign(() => app, { json: () => () => {} });
  const sandbox = { module: { exports: {} }, process: { env: { JWT_SECRET: "segredo-ficticio-exclusivo-dos-testes-simulados-363" } }, console: { log() {}, error: (...args) => logs.push(args) },
    require(nome) {
      if (nome === "express") return express;
      if (nome === "cors") return () => () => {};
      if (nome === "dotenv") return { config() {} };
      if (nome === "./db") return db;
      if (nome === "./isolamento.cjs") return { modoExecucao: () => "principal" };
      if (nome === "bcryptjs") return {};
      if (nome === "jsonwebtoken") return { verify() { if (opcoes.jwtInvalido) throw Error(); return { id: 10 }; } };
      throw Error("Dependencia inesperada: " + nome);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../server.js"), "utf8"), sandbox);
  async function requisitar(metodo = "post", body = {}, token = "simulado") {
    const req = { body: { evento_id: 13, prazo: "2099-12-31", itens: [item()], ...body },
      params: { id: "13" }, headers: { authorization: token ? `Bearer ${token}` : undefined } };
    const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(dados) { this.body = dados; return this; } };
    const handlers = rotas.get(metodo === "post" ? "post /cotacoes" : "put /eventos/:id/custos");
    for (const h of handlers) {
      let next = false;
      await h(req, res, () => { next = true; });
      if (!next) break;
    }
    return res;
  }
  return { estado, requisitar, logs };
}

test("publica copia persistida exata; ignora IDs e preserva cotacao antiga", async () => {
  for (const valor of ["0.00", "0.10", "0.20", "9999999999.99"]) {
    const a = ambiente({ custos: [item(valor)] });
    const r = await a.requisitar("post", { itens: [{ ...item(valor), id: 999, evento_id: 999 }] });
    assert.equal(r.statusCode, 201);
    assert.equal(a.estado.itens[0][3], valor);
    assert.equal(r.body.cotacao.itens[0].valor_estimado, valor);
    assert.equal(a.estado.cotacoes[0].antiga, true);
    assert.equal(a.estado.commits, 1); assert.equal(a.estado.rollbacks, 0); assert.equal(a.estado.releases, 1);
  }
});

test("rejeita JWT ausente/invalido e perfil incorreto antes da transacao", async () => {
  for (const [opts, token, status] of [[{}, "", 401], [{ jwtInvalido: true }, "x", 401], [{ perfil: "participante" }, "x", 403]]) {
    const a = ambiente(opts); assert.equal((await a.requisitar("post", {}, token)).statusCode, status);
    assert.equal(a.estado.conexoes, 0);
  }
});

test("valida ID seguro, data, campos e dinheiro antes de obter conexao", async () => {
  const casos = [null, {}, { ...item(), valor_estimado: "" }, { ...item(), valor_estimado: "0.001" },
    { ...item(), valor_estimado: Infinity }, { ...item(), valor_estimado: -1 },
    { ...item(), valor_estimado: "10000000000.00" }, { ...item(), categoria: "x".repeat(101) },
    { ...item(), descricao: "x".repeat(256) }];
  for (const invalid of casos) {
    const a = ambiente(); assert.equal((await a.requisitar("post", { itens: [invalid] })).statusCode, 400);
    assert.equal(a.estado.conexoes, 0);
  }
  for (const body of [{ evento_id: true }, { evento_id: 0 }, { evento_id: 9007199254740992 },
    { prazo: "2099-02-31" }, { prazo: "2000-01-01" }, { itens: null }, { observacoes: {} }]) {
    const a = ambiente(); assert.equal((await a.requisitar("post", body)).statusCode, 400);
    assert.equal(a.estado.conexoes, 0);
  }
});

test("evento inexistente/alheio e custos vazios nao geram gravacoes", async () => {
  for (const [opts, status] of [[{ semEvento: true }, 404], [{ custos: [] }, 400]]) {
    const a = ambiente(opts); assert.equal((await a.requisitar()).statusCode, status);
    assert.equal(a.estado.cotacoes.length, 1); assert.equal(a.estado.rollbacks, 1); assert.equal(a.estado.releases, 1);
  }
});

test("divergencias de ordem, descricao, valor ou quantidade retornam 409", async () => {
  const custos = [item(), { ...item("0.20"), descricao: "Luz" }];
  for (const itens of [[], custos.slice(0, 1), [...custos].reverse(),
    [{ ...custos[0], descricao: "Outro" }, custos[1]], [item("0.11"), custos[1]]]) {
    const a = ambiente({ custos }); assert.equal((await a.requisitar("post", { itens })).statusCode, 409);
    assert.equal(a.estado.cotacoes.length, 1); assert.equal(a.estado.rollbacks, 1);
  }
});

test("falhas de insert/commit revertem tudo, liberam e nao repetem", async () => {
  for (const opts of [{ falhaItem: true }, { falhaCommit: true }, { custos: [item("0.001")] }]) {
    const a = ambiente(opts); const r = await a.requisitar();
    assert.equal(r.statusCode, 500); assert.equal(a.estado.cotacoes.length, 1); assert.equal(a.estado.itens.length, 0);
    assert.equal(a.estado.conexoes, 1); assert.equal(a.estado.rollbacks, 1); assert.equal(a.estado.releases, 1);
    assert.ok(!JSON.stringify(r.body).includes("segredo"));
  }
});

test("falha de rollback nao oculta resposta; descarta ou libera adaptador", async () => {
  for (const semDestroy of [false, true]) {
    const a = ambiente({ falhaItem: true, falhaRollback: true, semDestroy });
    assert.equal((await a.requisitar()).statusCode, 500);
    assert.equal(a.estado.destroys, semDestroy ? 0 : 1); assert.equal(a.estado.releases, semDestroy ? 1 : 0);
  }
  const a = ambiente({ falhaConexao: true }); assert.equal((await a.requisitar()).statusCode, 500);
  assert.equal(a.estado.rollbacks, 0);
});

test("PUT concorrente primeiro: POST aguarda e rejeita revisao antiga", async () => {
  const pausa = { entrou: deferred(), continuar: deferred() };
  let locks = 0; const segundo = deferred();
  const a = ambiente({ pausarPut: pausa, aoEsperarLock() { if (++locks === 2) segundo.resolve(); } });
  const put = a.requisitar("put", { custos: [item("0.20")] });
  await pausa.entrou.promise;
  const post = a.requisitar(); await segundo.promise;
  assert.equal(a.estado.cotacoes.length, 1);
  pausa.continuar.resolve(); assert.equal((await put).statusCode, 200); assert.equal((await post).statusCode, 409);
  assert.equal(a.estado.cotacoes.length, 1);
});

test("POST concorrente primeiro: snapshot publicado permanece apos PUT", async () => {
  const pausa = { entrou: deferred(), continuar: deferred() };
  let locks = 0; const segundo = deferred();
  const a = ambiente({ pausarPost: pausa, aoEsperarLock() { if (++locks === 2) segundo.resolve(); } });
  const post = a.requisitar(); await pausa.entrou.promise;
  const put = a.requisitar("put", { custos: [item("0.20")] }); await segundo.promise;
  pausa.continuar.resolve(); assert.equal((await post).statusCode, 201); assert.equal((await put).statusCode, 200);
  assert.equal(a.estado.itens[0][3], "0.10"); assert.equal(a.estado.custos[0].valor_estimado, "0.20");
});
