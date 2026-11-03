"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { criarRepositorioSolicitacoesAcesso: criar } = require("../repositories/supabase/solicitacoes-acesso.cjs");
const { criarRepositorioSolicitacoesAcesso: criarMysql } = require("../repositories/mysql/solicitacoes-acesso.cjs");

function simular(respostas) {
  const calls = [], client = {};
  for (const method of ["schema", "from", "insert", "select", "single", "eq", "order", "range", "retry"]) {
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

test("criar: parametros e ID preservam MySQL; status e data continuam defaults", async () => {
  for (const perfil of ["organizador", "fornecedor"]) {
    const m = simular([{ data: { id: 21 } }]);
    const mysql = criarMysql({ async execute(sql, args) {
      assert.match(sql, /INSERT INTO solicitacoes_acesso\s+\(usuario_id, perfil_solicitado, justificativa\)\s+VALUES \(\?, \?, \?\)/);
      assert.deepEqual(args, [7, perfil, " Razão Á "]); return [{ insertId: 21 }];
    } });
    assert.equal(await criar(m.client).criar(7, perfil, " Razão Á "), await mysql.criar(7, perfil, " Razão Á "));
    assert.deepEqual(m.calls, [["schema", "public"], ["from", "solicitacoes_acesso"],
      ["insert", { usuario_id: 7, perfil_solicitado: perfil, justificativa: " Razão Á " }],
      ["select", "id"], ["single"], ["retry", false], ["executar"]]);
  }
});

test("criar: unicidade, FK, enum, campos obrigatorios e transporte propagam sem retry", async () => {
  for (const error of [{ code: "23505" }, { code: "23503" }, { code: "22P02" },
    { code: "23502" }, { code: "42501" }, new Error("timeout simulado")]) {
    const m = simular([error instanceof Error ? error : { error }]);
    await assert.rejects(criar(m.client).criar(7, "fornecedor", "Razão"), e => e === error);
    assert.equal(m.calls.filter(c => c[0] === "insert").length, 1);
  }
});

test("criar: rejeita respostas malformadas como resultado incerto", async () => {
  for (const data of [null, undefined, [], Array(1), {}, { id: "21" }, { id: 0 },
    { id: -1 }, { id: Infinity }, { id: 9007199254740992 }, Object.create({ id: 21 })]) {
    const m = simular([{ data }]);
    await assert.rejects(criar(m.client).criar(7, "fornecedor", "Razão"), e =>
      e.code === "SUPABASE_SOLICITACAO_CREATE_RESPONSE" && e.resultadoIncerto === true);
    assert.equal(m.calls.filter(c => c[0] === "insert").length, 1);
  }
});

// Handler real isolado: nao inicia Express, JWT, drivers ou conexoes.
function harness(repo) {
  const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
  const source = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const route = source.slice(source.indexOf('app.post("/solicitacoes-acesso",'),
    source.indexOf('app.get("/solicitacoes-acesso",'));
  let action;
  vm.runInNewContext(route, {
    app: { post(name, ...args) { assert.equal(name, "/solicitacoes-acesso"); action = args.at(-1); } },
    autenticar() {}, solicitacoesAcessoRepository: repo, console: { error() {} },
  });
  return async req => {
    const res = { status(n) { this.code = n; return this; },
      json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; } };
    await action(req, res); return res;
  };
}
const request = perfil => ({ usuario: { id: 7, perfil: "participante" }, body: {
  perfil_solicitado: perfil, justificativa: "  Razão Á  ", usuario_id: 999, status: "aprovado",
} });

test("handler real: 201, usuario autenticado, trim e resposta pendente", async () => {
  for (const perfil of ["organizador", "fornecedor"]) {
    const m = simular([{ data: [], count: 0 }, { data: { id: 21 } }]);
    const res = await harness(criar(m.client))(request(perfil));
    assert.equal(res.code, 201); assert.deepEqual(res.body, {
      mensagem: "Solicitação enviada com sucesso!",
      solicitacao: { id: 21, usuario_id: 7, perfil_solicitado: perfil, justificativa: "Razão Á", status: "pendente" },
    });
    assert.deepEqual(m.calls.filter(c => c[0] === "eq"), [["eq", "usuario_id", 7], ["eq", "status", "pendente"]]);
    assert.deepEqual(m.calls.find(c => c[0] === "insert")[1], {
      usuario_id: 7, perfil_solicitado: perfil, justificativa: "Razão Á",
    });
  }
});

test("handler real: pendencia de qualquer perfil gera 409 sem INSERT", async () => {
  for (const perfil of ["organizador", "fornecedor"]) {
    const m = simular([{ data: [{ id: 20 }], count: 1 }]);
    const res = await harness(criar(m.client))(request(perfil));
    assert.equal(res.code, 409); assert.deepEqual(res.body, { erro: "Você já possui uma solicitação pendente." });
    assert.equal(m.calls.filter(c => c[0] === "insert").length, 0);
    assert.equal(m.calls.some(c => c[0] === "eq" && c[1] === "perfil_solicitado"), false);
  }
});

test("handler real: dados invalidos 400 antes do perfil; corpo valido nao participante 403", async () => {
  for (const body of [null, undefined, {}, { perfil_solicitado: "admin", justificativa: "Razão" },
    { perfil_solicitado: "fornecedor", justificativa: " " },
    { perfil_solicitado: "organizador", justificativa: 123 }]) {
    const m = simular([]), req = request("fornecedor"); req.body = body; req.usuario.perfil = "admin";
    const res = await harness(criar(m.client))(req);
    assert.equal(res.code, 400); assert.deepEqual(res.body, { erro: "Informe um perfil válido e uma justificativa." });
    assert.equal(m.calls.length, 0);
  }
  for (const perfil of ["organizador", "fornecedor", "admin"]) {
    const m = simular([]), req = request("fornecedor"); req.usuario.perfil = perfil;
    const res = await harness(criar(m.client))(req);
    assert.equal(res.code, 403); assert.deepEqual(res.body, { erro: "Somente participantes podem solicitar acesso." });
    assert.equal(m.calls.length, 0);
  }
});

test("handler real: erros de leitura/INSERT e unicidade continuam 500", async () => {
  for (const responses of [[{ error: { code: "42501" } }],
    ...["23505", "23503", "22P02"].map(code => [{ data: [], count: 0 }, { error: { code } }]),
    [{ data: [], count: 0 }, { data: null }]]) {
    const m = simular(responses), res = await harness(criar(m.client))(request("fornecedor"));
    assert.equal(res.code, 500); assert.deepEqual(res.body, { erro: "Erro interno ao solicitar acesso." });
    assert.ok(m.calls.filter(c => c[0] === "insert").length <= 1);
  }
});

test("SDK com fetch simulado: POST HTTPS limitado, ID e falhas sem repeticao", async () => {
  const { createClient } = require("@supabase/supabase-js");
  for (const [status, data] of [[201, { id: 21 }], [409, { code: "23505" }], [503, { code: "503" }]]) {
    let calls = 0;
    const client = createClient("https://solicitacoes.invalid", "synthetic-test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (url, options) => {
        calls++; const u = new URL(url);
        assert.equal(u.protocol, "https:"); assert.equal(u.pathname, "/rest/v1/solicitacoes_acesso");
        assert.equal(u.searchParams.get("select"), "id"); assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), { usuario_id: 7, perfil_solicitado: "fornecedor", justificativa: "Razão" });
        return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
      } },
    });
    if (status === 201) assert.equal(await criar(client).criar(7, "fornecedor", "Razão"), 21);
    else await assert.rejects(criar(client).criar(7, "fornecedor", "Razão"), e => e.code === data.code);
    assert.equal(calls, 1);
  }
});
