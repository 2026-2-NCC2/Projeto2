"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { criarRepositorioInscricoes: criar } = require("../repositories/supabase/inscricoes.cjs");
const { criarRepositorioInscricoes: criarMysql } = require("../repositories/mysql/inscricoes.cjs");

function simular(respostas) {
  const calls = [], client = {};
  for (const method of ["schema", "from", "insert", "select", "single", "eq", "retry"]) {
    client[method] = (...args) => { calls.push([method, ...args]); return client; };
  }
  client.then = (resolve, reject) => {
    const result = respostas.shift();
    assert.notEqual(result, undefined, "consulta inesperada");
    calls.push(["executar"]);
    return (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)).then(resolve, reject);
  };
  return { calls, client };
}

test("criar: mesmos parametros e ID MySQL, defaults preservados, sem retry", async () => {
  const m = simular([{ data: { id: 21 } }]);
  const mysql = criarMysql({ async execute(sql, args) {
    assert.equal(sql, "INSERT INTO inscricoes (usuario_id, evento_id) VALUES (?, ?)");
    assert.deepEqual(args, [7, 13]); return [{ insertId: 21 }];
  } });
  assert.equal(await criar(m.client).criar(7, 13), await mysql.criar(7, 13));
  assert.deepEqual(m.calls, [["schema", "public"], ["from", "inscricoes"],
    ["insert", { usuario_id: 7, evento_id: 13 }], ["select", "id"],
    ["single"], ["retry", false], ["executar"]]);
});

test("criar: unicidade PostgreSQL vira ER_DUP_ENTRY sem expor detalhes", async () => {
  const m = simular([{ error: { code: "23505", details: "dado privado" } }]);
  await assert.rejects(criar(m.client).criar(7, 13), e =>
    e.code === "ER_DUP_ENTRY" && !JSON.stringify(e).includes("dado privado"));
  assert.equal(m.calls.filter(c => c[0] === "insert").length, 1);
});

test("criar: FK, campos obrigatorios, permissao e transporte propagam sem repeticao", async () => {
  for (const error of [{ code: "23503" }, { code: "23502" }, { code: "42501" },
    { code: "57014" }, new Error("timeout simulado")]) {
    const m = simular([error instanceof Error ? error : { error }]);
    await assert.rejects(criar(m.client).criar(7, 13), e => e === error);
    assert.equal(m.calls.filter(c => c[0] === "executar").length, 1);
  }
});

test("criar: ID malformado sinaliza resultado incerto, sem reenviar", async () => {
  for (const data of [null, undefined, [], Array(1), {}, { id: "21" }, { id: 0 },
    { id: -1 }, { id: Infinity }, { id: 9007199254740992 }, Object.create({ id: 21 })]) {
    const m = simular([{ data }]);
    await assert.rejects(criar(m.client).criar(7, 13), e =>
      e.code === "SUPABASE_INSCRICAO_CREATE_RESPONSE" && e.resultadoIncerto === true);
    assert.equal(m.calls.filter(c => c[0] === "insert").length, 1);
  }
});

function harness(repo) {
  const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
  const source = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const start = source.indexOf("function permitirPerfis(");
  const guard = source.slice(start, source.indexOf("const eventos = []", start));
  const route = source.slice(source.indexOf('app.post("/participante/inscricoes",'),
    source.indexOf('app.get("/participante/inscricoes",'));
  let authorize, action;
  vm.runInNewContext(guard + "\n" + route, {
    app: { post(name, ...args) { assert.equal(name, "/participante/inscricoes");
      authorize = args[1]; action = args.at(-1); } },
    autenticar() {}, inscricoesRepository: repo, console: { error() {} },
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
const request = () => ({ usuario: { id: 7, perfil: "participante" },
  body: { evento_id: "13", usuario_id: 999, status: "Outro" } });

test("handler real: 201, evento indisponivel 404, duplicidade previa/corrida 409 e falhas 500", async () => {
  const cases = [
    [[{ data: [{ id: 13 }] }, { data: [] }, { data: { id: 21 } }], 201,
      { mensagem: "Inscrição realizada com sucesso!", inscricao: { id: 21, usuario_id: 7, evento_id: 13, status: "Confirmada" } }, 1],
    [[{ data: [] }], 404, { erro: "Evento não encontrado ou não publicado." }, 0],
    [[{ data: [{ id: 13 }] }, { data: [{ id: 20 }] }], 409, { erro: "Você já está inscrito neste evento." }, 0],
    [[{ data: [{ id: 13 }] }, { data: [] }, { error: { code: "23505" } }], 409, { erro: "Você já está inscrito neste evento." }, 1],
    [[{ data: [{ id: 13 }] }, { data: [] }, { error: { code: "23503" } }], 500, { erro: "Erro interno ao realizar inscrição." }, 1],
    [[{ error: { code: "42501" } }], 500, { erro: "Erro interno ao realizar inscrição." }, 0],
    [[{ data: [{ id: 13 }] }, { error: { code: "42501" } }], 500, { erro: "Erro interno ao realizar inscrição." }, 0],
  ];
  for (const [responses, code, body, inserts] of cases) {
    const m = simular(responses), res = await harness(criar(m.client))(request());
    assert.equal(res.code, code); assert.deepEqual(res.body, body);
    assert.equal(m.calls.filter(c => c[0] === "insert").length, inserts);
    assert.ok(m.calls.some(c => c[0] === "eq" && c[1] === "status" && c[2] === "Ativo"));
    if (inserts) assert.deepEqual(m.calls.find(c => c[0] === "insert")[1], { usuario_id: 7, evento_id: 13 });
  }
});

test("handler real: ID invalido 400 e autorizacao 401/403 antes de consultar", async () => {
  for (const id of [undefined, "0", "-1", "abc", "1.5"]) {
    const m = simular([]), req = request(); req.body.evento_id = id;
    assert.equal((await harness(criar(m.client))(req)).code, 400); assert.equal(m.calls.length, 0);
  }
  for (const perfil of [undefined, "organizador", "fornecedor", "admin"]) {
    const m = simular([]), req = request(); req.usuario = perfil ? { id: 7, perfil } : undefined;
    assert.equal((await harness(criar(m.client))(req)).code, perfil ? 403 : 401);
    assert.equal(m.calls.length, 0);
  }
});

test("SDK HTTPS com fetch simulado: INSERT limitado, ID, erro de unicidade e sem retry", async () => {
  const { createClient } = require("@supabase/supabase-js");
  for (const [status, data] of [[201, { id: 21 }], [409, { code: "23505" }], [503, { code: "503" }]]) {
    let calls = 0;
    const client = createClient("https://inscricoes.invalid", "synthetic-test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (url, options) => {
        calls++; const u = new URL(url);
        assert.equal(u.protocol, "https:"); assert.equal(u.pathname, "/rest/v1/inscricoes");
        assert.equal(u.searchParams.get("select"), "id"); assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), { usuario_id: 7, evento_id: 13 });
        return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
      } },
    });
    if (status === 201) assert.equal(await criar(client).criar(7, 13), 21);
    else await assert.rejects(criar(client).criar(7, 13), e => e.code === (status === 409 ? "ER_DUP_ENTRY" : "503"));
    assert.equal(calls, 1);
  }
});
