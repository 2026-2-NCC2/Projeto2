"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { criarRepositorioEventos: criar } = require("../repositories/supabase/eventos.cjs");
const { criarRepositorioEventos: criarMysql } = require("../repositories/mysql/eventos.cjs");

function mock(resultado) {
  const calls = [], client = {};
  for (const metodo of ["schema", "from", "update", "eq", "select"]) {
    client[metodo] = (...args) => { calls.push([metodo, ...args]); return client; };
  }
  client.retry = valor => {
    calls.push(["retry", valor]);
    return typeof resultado === "function" ? resultado() : Promise.resolve(resultado);
  };
  return { calls, client };
}

test("publicar: UPDATE condicional unico, retorno 0/1 conforme MySQL", async () => {
  for (const affectedRows of [0, 1]) {
    const m = mock({ data: affectedRows ? [{ id: 13 }] : [] });
    const mysql = criarMysql({ async execute(sql, args) {
      assert.match(sql, /UPDATE eventos\s+SET status = 'Ativo'\s+WHERE id = \?\s+AND usuario_id = \?\s+AND status = 'Em planejamento'/);
      assert.deepEqual(args, [13, 7]);
      return [{ affectedRows }];
    } });
    assert.equal(await criar(m.client).publicar(13, 7), await mysql.publicar(13, 7));
    assert.deepEqual(m.calls, [
      ["schema", "public"], ["from", "eventos"], ["update", { status: "Ativo" }],
      ["eq", "id", 13], ["eq", "usuario_id", 7],
      ["eq", "status", "Em planejamento"], ["select", "id"], ["retry", false],
    ]);
  }
});

test("publicar: erros de banco/transporte propagam sem retry ou falso sucesso", async () => {
  for (const code of ["23503", "42501", "40P01", "57014", "503"]) {
    const error = { code, message: "simulado" }, m = mock({ error });
    await assert.rejects(criar(m.client).publicar(13, 7), e => e === error);
    assert.equal(m.calls.filter(c => c[0] === "update").length, 1);
    assert.deepEqual(m.calls.at(-1), ["retry", false]);
  }
  const error = new Error("timeout: resultado desconhecido");
  const m = mock(() => Promise.reject(error));
  await assert.rejects(criar(m.client).publicar(13, 7), e => e === error);
  assert.equal(m.calls.filter(c => c[0] === "update").length, 1);
});

test("publicar: respostas malformadas sinalizam resultado incerto sem repetir", async () => {
  for (const data of [null, undefined, {}, Array(1), [null], [[]], [{}],
    [{ id: "13" }], [{ id: 0 }], [{ id: 14 }], [Object.create({ id: 13 })],
    [{ id: 13 }, { id: 13 }]]) {
    const m = mock({ data });
    await assert.rejects(criar(m.client).publicar(13, 7),
      e => e.code === "SUPABASE_EVENTO_PUBLISH_RESPONSE" && e.resultadoIncerto === true);
    assert.equal(m.calls.filter(c => c[0] === "update").length, 1);
  }
});

// Executa o handler e a autorizacao existentes, sem iniciar servidor ou banco.
function harness(repo) {
  const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
  const source = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const inicio = source.indexOf("function permitirPerfis(");
  const guard = source.slice(inicio, source.indexOf("const eventos = []", inicio));
  const route = source.slice(source.indexOf('app.patch("/eventos/:id/publicar",'),
    source.indexOf("// Listar custos de um evento do organizador"));
  let action, authorize;
  vm.runInNewContext(guard + "\n" + route, {
    app: { patch(name, ...args) {
      assert.equal(name, "/eventos/:id/publicar");
      authorize = args[1]; action = args.at(-1);
    } }, autenticar() {}, eventosRepository: repo, console: { error() {} },
  });
  return async req => {
    const res = { status(n) { this.code = n; return this; },
      json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; } };
    let allowed = false;
    authorize(req, res, () => { allowed = true; });
    if (allowed) await action(req, res);
    return res;
  };
}
const request = () => ({ params: { id: "13" }, usuario: { id: 7, perfil: "organizador" },
  body: { usuario_id: 999, status: "Outro" } });

test("handler real: 200/404/500 e mensagens preservadas; identidade vem da sessao", async () => {
  for (const [resultado, code, body] of [
    [{ data: [{ id: 13 }] }, 200, { mensagem: "Evento publicado com sucesso!", status: "Ativo" }],
    [{ data: [] }, 404, { erro: "Evento não encontrado, não pertence a você ou não está em planejamento." }],
    [{ error: { code: "42501" } }, 500, { erro: "Erro interno ao publicar evento." }],
  ]) {
    const m = mock(resultado), res = await harness(criar(m.client))(request());
    assert.equal(res.code, code); assert.deepEqual(res.body, body);
    assert.ok(m.calls.some(c => c[0] === "eq" && c[1] === "usuario_id" && c[2] === 7));
  }
});

test("middleware real: sem usuario 401 e outros perfis 403, sem escrita", async () => {
  for (const perfil of [undefined, "participante", "fornecedor", "admin"]) {
    const m = mock({ data: [] }), req = request();
    req.usuario = perfil ? { id: 7, perfil } : undefined;
    assert.equal((await harness(criar(m.client))(req)).code, perfil ? 403 : 401);
    assert.equal(m.calls.length, 0);
  }
});

test("handler real: preserva validacao de ID antes da persistencia", async () => {
  for (const id of ["0", "-1", "abc", "1.5"]) {
    const m = mock({ data: [] }), req = request(); req.params.id = id;
    const res = await harness(criar(m.client))(req);
    assert.equal(res.code, 400); assert.deepEqual(res.body, { erro: "ID do evento inválido." });
    assert.equal(m.calls.length, 0);
  }
});

test("SDK com fetch simulado: filtros impedem publicar evento alheio, ausente ou ja ativo", async () => {
  const { createClient } = require("@supabase/supabase-js");
  for (const [dono, estado, existe, expected] of [
    [7, "Em planejamento", true, 1], [99, "Em planejamento", true, 0],
    [7, "Ativo", true, 0], [7, "Em planejamento", false, 0],
  ]) {
    let calls = 0;
    const client = createClient("https://eventos.invalid", "synthetic-test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (url, options) => {
        calls++;
        const u = new URL(url);
        assert.equal(u.pathname, "/rest/v1/eventos");
        assert.equal(options.method, "PATCH");
        assert.equal(u.searchParams.get("id"), "eq.13");
        assert.equal(u.searchParams.get("usuario_id"), "eq.7");
        assert.equal(u.searchParams.get("status"), "eq.Em planejamento");
        assert.equal(u.searchParams.get("select"), "id");
        assert.deepEqual(JSON.parse(options.body), { status: "Ativo" });
        const matched = existe && dono === 7 && estado === "Em planejamento";
        return new Response(JSON.stringify(matched ? [{ id: 13 }] : []), {
          status: 200, headers: { "content-type": "application/json" },
        });
      } },
    });
    assert.equal(await criar(client).publicar(13, 7), expected);
    assert.equal(calls, 1);
  }
});

test("SDK com fetch simulado: 503 nao dispara nova publicacao", async () => {
  const { createClient } = require("@supabase/supabase-js");
  let calls = 0;
  const client = createClient("https://eventos.invalid", "synthetic-test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async () => {
      calls++;
      return new Response(JSON.stringify({ code: "503", message: "simulado" }), {
        status: 503, headers: { "content-type": "application/json" },
      });
    } },
  });
  await assert.rejects(criar(client).publicar(13, 7), e => e.code === "503");
  assert.equal(calls, 1);
});
