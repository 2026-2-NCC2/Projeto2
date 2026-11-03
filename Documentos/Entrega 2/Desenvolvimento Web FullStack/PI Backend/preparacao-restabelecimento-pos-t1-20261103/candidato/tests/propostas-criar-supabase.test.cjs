"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { criarRepositorioPropostas: criar } = require("../repositories/supabase/propostas.cjs");
const { criarRepositorioPropostas: criarMysql } = require("../repositories/mysql/propostas.cjs");
const dados = () => ({ cotacaoId: "013", fornecedorId: 7, valor: 12.345,
  condicoesPagamento: " Pix ", detalhesTecnicos: " Som Á " });

function simular(respostas) {
  const calls = [], client = {};
  for (const method of ["schema", "from", "insert", "select", "single", "eq", "gte", "retry"]) {
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

test("criar: campos e ID MySQL preservados, sem trim/arredondamento/regra nova", async () => {
  const m = simular([{ data: { id: 21 } }]);
  const mysql = criarMysql({ async query(sql, args) {
    assert.match(sql, /INSERT INTO propostas\s+\(cotacao_id, fornecedor_id, valor,\s+condicoes_pagamento, detalhes_tecnicos\)\s+VALUES \(\?, \?, \?, \?, \?\)/);
    assert.deepEqual(args, ["013", 7, 12.345, " Pix ", " Som Á "]); return [{ insertId: 21 }];
  } });
  assert.equal(await criar(m.client).criar(dados()), await mysql.criar(dados()));
  assert.deepEqual(m.calls, [["schema", "public"], ["from", "propostas"],
    ["insert", { cotacao_id: "013", fornecedor_id: 7, valor: 12.345,
      condicoes_pagamento: " Pix ", detalhes_tecnicos: " Som Á " }],
    ["select", "id"], ["single"], ["retry", false], ["executar"]]);
});

test("criar: duplicidade e outros erros propagam sem retry nem conversao para 409", async () => {
  for (const error of [{ code: "23505" }, { code: "23503" }, { code: "23502" },
    { code: "22003" }, { code: "42501" }, new Error("timeout simulado")]) {
    const m = simular([error instanceof Error ? error : { error }]);
    await assert.rejects(criar(m.client).criar(dados()), e => e === error);
    assert.equal(m.calls.filter(c => c[0] === "insert").length, 1);
  }
});

test("criar: resposta malformada nao vira sucesso nem autoriza reenvio", async () => {
  for (const data of [null, undefined, [], Array(1), {}, { id: "21" }, { id: 0 },
    { id: -1 }, { id: Infinity }, { id: 9007199254740992 }, Object.create({ id: 21 })]) {
    const m = simular([{ data }]);
    await assert.rejects(criar(m.client).criar(dados()), e =>
      e.code === "SUPABASE_PROPOSTA_CREATE_RESPONSE" && e.resultadoIncerto === true);
    assert.equal(m.calls.filter(c => c[0] === "insert").length, 1);
  }
});

function harness(repo) {
  const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
  const source = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const start = source.indexOf("function permitirPerfis(");
  const guard = source.slice(start, source.indexOf("const eventos = []", start));
  const route = source.slice(source.indexOf('app.post("/fornecedor/propostas",'),
    source.indexOf('app.get("/fornecedor/propostas",'));
  let authorize, action;
  vm.runInNewContext(guard + "\n" + route, {
    app: { post(name, ...args) { assert.equal(name, "/fornecedor/propostas");
      authorize = args[1]; action = args.at(-1); } },
    autenticar() {}, propostasRepository: repo, console: { error() {} },
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
const request = () => ({ usuario: { id: 7, perfil: "fornecedor" }, body: {
  cotacao_id: "013", valor: "12.345", condicoes_pagamento: " Pix ", detalhes_tecnicos: " Som Á ",
  fornecedor_id: 999, status: "Outro",
} });

test("handler real: identidade confiavel, Number/trim, cotacao aberta/prazo e resposta 201", async () => {
  const m = simular([{ data: [{ id: 13 }] }, { data: { id: 21 } }]);
  const res = await harness(criar(m.client))(request());
  assert.equal(res.code, 201);
  assert.deepEqual(res.body, { mensagem: "Proposta enviada com sucesso!", proposta_id: 21 });
  assert.deepEqual(m.calls.filter(c => ["eq", "gte"].includes(c[0])),
    [["eq", "id", "013"], ["eq", "status", "Aberta"], ["gte", "prazo", "today"]]);
  assert.deepEqual(m.calls.find(c => c[0] === "insert")[1], {
    cotacao_id: "013", fornecedor_id: 7, valor: 12.345,
    condicoes_pagamento: "Pix", detalhes_tecnicos: "Som Á",
  });
});

test("handler real: ausencia/fechamento/prazo 404; erros e duplicidade 500", async () => {
  for (const [responses, code, erro, inserts] of [
    [[{ data: [] }], 404, "Cotação não encontrada, encerrada ou com prazo expirado.", 0],
    [[{ error: { code: "42501" } }], 500, "Erro interno ao enviar proposta.", 0],
    ...["23505", "23503", "22003"].map(code => [[{ data: [{ id: 13 }] }, { error: { code } }], 500, "Erro interno ao enviar proposta.", 1]),
  ]) {
    const m = simular(responses), res = await harness(criar(m.client))(request());
    assert.equal(res.code, code); assert.deepEqual(res.body, { erro });
    assert.equal(m.calls.filter(c => c[0] === "insert").length, inserts);
  }
});

test("handler real: nao cria bloqueio novo de propostas repetidas", async () => {
  const m = simular([{ data: [{ id: 13 }] }, { data: { id: 21 } },
    { data: [{ id: 13 }] }, { data: { id: 22 } }]);
  const run = harness(criar(m.client));
  assert.equal((await run(request())).body.proposta_id, 21);
  assert.equal((await run(request())).body.proposta_id, 22);
  assert.deepEqual(m.calls.filter(c => c[0] === "from").map(c => c[1]),
    ["cotacoes", "propostas", "cotacoes", "propostas"]);
});

test("handler real: validacoes 400, corpo ausente 500 e autorizacao 401/403 sem consultas", async () => {
  for (const patch of [{ cotacao_id: 0 }, { cotacao_id: "abc" }, { valor: 0 },
    { valor: Infinity }, { valor: "abc" }, { condicoes_pagamento: " " }, { detalhes_tecnicos: null }]) {
    const m = simular([]), req = request(); Object.assign(req.body, patch);
    const res = await harness(criar(m.client))(req);
    assert.equal(res.code, 400); assert.deepEqual(res.body, { erro: "Preencha todos os campos corretamente." });
    assert.equal(m.calls.length, 0);
  }
  for (const body of [null, undefined]) {
    const m = simular([]), req = request(); req.body = body;
    assert.equal((await harness(criar(m.client))(req)).code, 500); assert.equal(m.calls.length, 0);
  }
  for (const perfil of [undefined, "organizador", "participante", "admin"]) {
    const m = simular([]), req = request(); req.usuario = perfil ? { id: 7, perfil } : undefined;
    assert.equal((await harness(criar(m.client))(req)).code, perfil ? 403 : 401);
    assert.equal(m.calls.length, 0);
  }
});

test("SDK HTTPS com fetch simulado: payload limitado, ID e falhas sem retry", async () => {
  const { createClient } = require("@supabase/supabase-js");
  for (const [status, data] of [[201, { id: 21 }], [409, { code: "23505" }], [503, { code: "503" }]]) {
    let calls = 0;
    const client = createClient("https://propostas.invalid", "synthetic-test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (url, options) => {
        calls++; const u = new URL(url);
        assert.equal(u.protocol, "https:"); assert.equal(u.pathname, "/rest/v1/propostas");
        assert.equal(u.searchParams.get("select"), "id"); assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), { cotacao_id: "013", fornecedor_id: 7,
          valor: 12.345, condicoes_pagamento: " Pix ", detalhes_tecnicos: " Som Á " });
        return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
      } },
    });
    if (status === 201) assert.equal(await criar(client).criar(dados()), 21);
    else await assert.rejects(criar(client).criar(dados()), e => e.code === data.code);
    assert.equal(calls, 1);
  }
});
