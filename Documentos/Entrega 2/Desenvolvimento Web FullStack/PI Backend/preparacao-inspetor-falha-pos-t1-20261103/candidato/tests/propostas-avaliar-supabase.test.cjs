"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { criarRepositorioPropostas: criar } = require("../repositories/supabase/propostas.cjs");
const { criarRepositorioPropostas: criarMysql } = require("../repositories/mysql/propostas.cjs");

function simular(resultado) {
  const calls = [], client = {};
  for (const method of ["schema", "rpc", "retry"]) {
    client[method] = (...args) => { calls.push([method, ...args]); return client; };
  }
  client.then = (resolve, reject) => {
    calls.push(["executar"]);
    return (resultado instanceof Error ? Promise.reject(resultado) : Promise.resolve(resultado)).then(resolve, reject);
  };
  return { calls, client };
}

test("avaliar: assinatura RPC e retorno 0/1 preservam o UPDATE condicional MySQL", async () => {
  for (const status of ["Aprovada", "Recusada"]) {
    for (const affectedRows of [0, 1]) {
      const m = simular({ data: affectedRows });
      const mysql = criarMysql({ async query(sql, args) {
        assert.match(sql, /INNER JOIN cotacoes c ON c.id = p.cotacao_id/);
        assert.match(sql, /INNER JOIN eventos e ON e.id = c.evento_id/);
        assert.match(sql, /SET p.status = \?\s+WHERE p.id = \?\s+AND e.usuario_id = \?\s+AND p.status = 'Em avaliação'/);
        assert.deepEqual(args, [status, 21, 7]); return [{ affectedRows }];
      } });
      assert.equal(await criar(m.client).avaliar(21, 7, status), await mysql.avaliar(21, 7, status));
      assert.deepEqual(m.calls, [["schema", "public"], ["rpc", "avaliar_proposta", {
        p_proposta_id: "21", p_organizador_id: 7, p_status: status,
      }, { get: false, head: false }], ["retry", false], ["executar"]]);
    }
  }
});

test("avaliar: IDs grandes aceitos pelo handler sao transportados sem overflow bigint", async () => {
  for (const id of [2147483648, 9007199254740992, 1e100]) {
    const m = simular({ data: 0 });
    assert.equal(await criar(m.client).avaliar(id, 7, "Aprovada"), 0);
    assert.equal(m.calls[1][2].p_proposta_id, String(id));
  }
});

test("avaliar: falhas de RPC/transporte propagam sem falso 0 nem reenvio", async () => {
  for (const error of [{ code: "PGRST202" }, { code: "42501" }, { code: "TA403" },
    { code: "40P01" }, { code: "57014" }, new Error("timeout: resultado incerto")]) {
    const m = simular(error instanceof Error ? error : { data: 1, error });
    await assert.rejects(criar(m.client).avaliar(21, 7, "Aprovada"), e => e === error);
    assert.equal(m.calls.filter(c => c[0] === "rpc").length, 1);
    assert.deepEqual(m.calls.at(-2), ["retry", false]);
  }
});

test("avaliar: resposta malformada indica resultado incerto sem repetir UPDATE", async () => {
  for (const data of [null, undefined, "0", "1", true, [], Array(1), [1], {}, -1, 2, NaN]) {
    const m = simular({ data });
    await assert.rejects(criar(m.client).avaliar(21, 7, "Recusada"), e =>
      e.code === "SUPABASE_PROPOSTA_EVALUATE_RESPONSE" && e.resultadoIncerto === true);
    assert.equal(m.calls.filter(c => c[0] === "rpc").length, 1);
  }
});

function harness(repo) {
  const source = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const start = source.indexOf("function permitirPerfis(");
  const guard = source.slice(start, source.indexOf("const eventos = []", start));
  const routeStart = source.indexOf('app.patch("/organizador/propostas/:id/status",');
  const route = source.slice(routeStart, source.indexOf("\napp.", routeStart + 1));
  let authorize, action;
  vm.runInNewContext(guard + "\n" + route, {
    app: { patch(name, ...args) { assert.equal(name, "/organizador/propostas/:id/status");
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
const request = status => ({ params: { id: "21" }, usuario: { id: 7, perfil: "organizador" },
  body: { status, organizador_id: 999, usuario_id: 999 } });

test("handler real: aprovar/recusar 200 e ator da sessao, nunca do corpo", async () => {
  for (const status of ["Aprovada", "Recusada"]) {
    const m = simular({ data: 1 }), res = await harness(criar(m.client))(request(status));
    assert.equal(res.code, 200); assert.deepEqual(res.body, {
      mensagem: `Proposta ${status.toLowerCase()} com sucesso!`, proposta_id: 21, status,
    });
    assert.equal(m.calls[1][2].p_organizador_id, 7);
  }
});

test("handler real: ausente/alheia/ja avaliada compartilham 404; falhas retornam 500", async () => {
  for (const [resultado, code, erro] of [
    [{ data: 0 }, 404, "Proposta não encontrada, sem permissão ou já avaliada."],
    [{ error: { code: "PGRST202" } }, 500, "Erro interno ao avaliar proposta."],
    [{ error: { code: "42501" } }, 500, "Erro interno ao avaliar proposta."],
    [{ data: {} }, 500, "Erro interno ao avaliar proposta."],
  ]) {
    const m = simular(resultado), res = await harness(criar(m.client))(request("Aprovada"));
    assert.equal(res.code, code); assert.deepEqual(res.body, { erro });
    assert.equal(m.calls.filter(c => c[0] === "rpc").length, 1);
  }
});

test("handler real: ID/status 400, sessao/perfil 401/403 sem chamar RPC", async () => {
  for (const id of ["abc", "0", "-1", "1.5"]) {
    const m = simular({ data: 1 }), req = request("Aprovada"); req.params.id = id;
    const res = await harness(criar(m.client))(req);
    assert.equal(res.code, 400); assert.deepEqual(res.body, { erro: "ID da proposta inválido." });
    assert.equal(m.calls.length, 0);
  }
  for (const status of [undefined, "aprovada", "Recusada ", "Em avaliação"]) {
    const m = simular({ data: 1 }), res = await harness(criar(m.client))(request(status));
    assert.equal(res.code, 400); assert.deepEqual(res.body, { erro: "O status deve ser Aprovada ou Recusada." });
    assert.equal(m.calls.length, 0);
  }
  for (const perfil of [undefined, "participante", "fornecedor", "admin"]) {
    const m = simular({ data: 1 }), req = request("Aprovada");
    req.usuario = perfil ? { id: 7, perfil } : undefined;
    assert.equal((await harness(criar(m.client))(req)).code, perfil ? 403 : 401);
    assert.equal(m.calls.length, 0);
  }
});

test("SQL preparado: propriedade e estado na mesma escrita, sem tocar outras entidades", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../../Banco de dados/rpc_avaliar_proposta.preparacao.sql"), "utf8");
  const code = sql.replace(/--[^\n]*/g, "");
  assert.match(code, /CREATE FUNCTION public\.avaliar_proposta\(\s*p_proposta_id numeric,\s*p_organizador_id bigint,\s*p_status text/);
  assert.match(code, /SECURITY INVOKER\s+SET search_path = ''/);
  assert.match(code, /current_user <> 'service_role'/);
  assert.match(code, /p_status COLLATE pg_catalog\."C" NOT IN \('Aprovada', 'Recusada'\)/);
  assert.match(code, /UPDATE public\.propostas AS p\s+SET status = p_status\s+WHERE p.id = p_proposta_id::integer\s+AND p.status = 'Em avaliação'\s+AND EXISTS/);
  assert.match(code, /INNER JOIN public\.eventos AS e ON e.id = c.evento_id\s+WHERE c.id = p.cotacao_id AND e.usuario_id = p_organizador_id/);
  assert.match(code, /GET DIAGNOSTICS v_afetadas = ROW_COUNT;\s+RETURN v_afetadas;/);
  assert.equal((code.match(/\bUPDATE\b/g) || []).length, 1);
  assert.doesNotMatch(code, /\b(GRANT|REVOKE|INSERT|DELETE|COMMIT|EXCEPTION WHEN)\b/i);
  // Inspecao textual, nao prova compilacao, locks, rollback ou autorizacao HTTP.
});

test("SDK com fetch simulado: POST RPC exato e falha 503 sem repeticao", async () => {
  const { createClient } = require("@supabase/supabase-js");
  for (const [status, data] of [[200, 1], [200, 0], [503, { code: "503" }]]) {
    let calls = 0;
    const client = createClient("https://propostas.invalid", "synthetic-test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (url, options) => {
        calls++; const u = new URL(url);
        assert.equal(u.protocol, "https:"); assert.equal(u.pathname, "/rest/v1/rpc/avaliar_proposta");
        assert.equal(u.search, ""); assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), { p_proposta_id: "21", p_organizador_id: 7, p_status: "Recusada" });
        return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
      } },
    });
    if (status === 200) assert.equal(await criar(client).avaliar(21, 7, "Recusada"), data);
    else await assert.rejects(criar(client).avaliar(21, 7, "Recusada"), e => e.code === "503");
    assert.equal(calls, 1);
  }
});
