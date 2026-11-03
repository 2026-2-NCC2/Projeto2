"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { criarRepositorioSolicitacoesAcesso: criar } = require("../repositories/supabase/solicitacoes-acesso.cjs");
const sucesso = status => ({ mensagem: status === "aprovado"
  ? "Solicitação aprovada com sucesso!" : "Solicitação rejeitada com sucesso!" });

// Falso transporte da RPC existente: nao executa SQL ou conecta a servidores.
function mock(responder) {
  const calls = [];
  const client = { schema(schema) {
    assert.equal(schema, "public");
    return { rpc(name, args, options) {
      calls.push({ name, args, options });
      return { retry(value) {
        assert.equal(value, false);
        return { abortSignal(signal) {
          assert.ok(signal instanceof AbortSignal);
          return Promise.resolve().then(() => responder(args));
        } };
      } };
    } };
  } };
  return { calls, client };
}

test("repositorio: aprovar/rejeitar reutiliza assinatura e resposta do adaptador existente", async () => {
  const m = mock(args => ({ data: { ...sucesso(args.p_status), extra: "nao devolver" } }));
  const repo = criar(m.client);
  for (const status of ["aprovado", "rejeitado"]) {
    assert.deepEqual(await repo.decidir(7, "013", status), sucesso(status));
    assert.deepEqual(m.calls.at(-1), { name: "decidir_solicitacao_acesso",
      args: { p_admin_id: 7, p_solicitacao_id: "13", p_status: status },
      options: { get: false, head: false } });
  }
  assert.equal(m.calls.length, 2); // duas decisoes explicitas, nenhum retry
});

test("repositorio: ausencia 404, repeticao/perfil 409, autorizacao 403 e falhas 500", async () => {
  for (const [code, status, message] of [
    ["TA404", 404, "Solicitação não encontrada."],
    ["TA409", 409, "Esta solicitação já foi analisada."],
    ["TA412", 409, "O usuário não possui mais o perfil participante."],
    ["TA403", 403, "Você não tem permissão para realizar esta ação."],
    ["PGRST202", 500, "Erro interno ao analisar solicitação."],
    ["23503", 500, "Erro interno ao analisar solicitação."],
  ]) {
    const m = mock(() => ({ error: { code, message: "detalhe privado" } }));
    await assert.rejects(criar(m.client).decidir(7, 13, "aprovado"), e =>
      e.respostaStatus === status && e.message === message && e.resultadoIncerto === (status === 500));
    assert.equal(m.calls.length, 1);
  }
});

test("repositorio: validacoes do adaptador nao sao contornadas pela nova entrada", async () => {
  for (const [admin, id, status, expected] of [[0, 13, "aprovado", 403],
    [7, 0, "aprovado", 400], [7, 13, "recusado", 400], [7, 13, "Aprovado", 400]]) {
    const m = mock(() => { throw Error("nao chamar"); });
    await assert.rejects(criar(m.client).decidir(admin, id, status), e =>
      e.respostaStatus === expected && e.resultadoIncerto === false);
    assert.equal(m.calls.length, 0);
  }
});

test("repositorio: resposta invalida ou transporte incerto nunca dispara reenvio", async () => {
  for (const responder of [() => ({ data: null }), () => ({ data: [] }),
    () => ({ data: Array(1) }), () => ({ data: sucesso("rejeitado") }),
    () => { throw Error("timeout simulado"); }]) {
    const m = mock(responder);
    await assert.rejects(criar(m.client).decidir(7, 13, "aprovado"), e =>
      e.respostaStatus === 500 && e.resultadoIncerto === true);
    assert.equal(m.calls.length, 1);
  }
});

test("repositorio: delegacao tardia reutiliza adaptador sem emular transacao MySQL", async () => {
  const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
  const source = fs.readFileSync(path.join(__dirname, "../repositories/supabase/solicitacoes-acesso.cjs"), "utf8");
  let factories = 0;
  const calls = [], client = {};
  const context = { module: { exports: {} }, require(name) {
    assert.equal(name, "./solicitacoes-acesso-decisao.cjs");
    return { criarAdaptadorDecisaoAcesso(received) {
      factories++; assert.equal(received, client);
      return { async decidir(...args) { calls.push(args); return "delegado"; } };
    } };
  } };
  vm.runInNewContext(source, context);
  assert.equal(factories, 0);
  const repo = context.module.exports.criarRepositorioSolicitacoesAcesso(client);
  assert.equal(factories, 0);
  assert.equal(await repo.decidir(7, 13, "aprovado"), "delegado");
  await repo.decidir(7, 14, "rejeitado");
  assert.equal(factories, 1);
  assert.deepEqual(calls, [[7, 13, "aprovado"], [7, 14, "rejeitado"]]);
  for (const name of ["bloquearPorId", "atualizarPerfilParticipante", "atualizarStatus"]) {
    assert.equal(repo[name], undefined); // nao oferece falsa compatibilidade transacional
  }
});

test("repositorio com SDK: POST HTTPS de decisao unica e 503 sem retry", async () => {
  const { createClient } = require("@supabase/supabase-js");
  for (const [http, data] of [[200, sucesso("rejeitado")], [503, { code: "53300" }]]) {
    let calls = 0;
    const client = createClient("https://solicitacoes.invalid", "synthetic-test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (url, options) => {
        calls++;
        assert.equal(String(url), "https://solicitacoes.invalid/rest/v1/rpc/decidir_solicitacao_acesso");
        assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), { p_admin_id: 7, p_solicitacao_id: "13", p_status: "rejeitado" });
        return new Response(JSON.stringify(data), { status: http, headers: { "content-type": "application/json" } });
      } },
    });
    if (http === 200) assert.deepEqual(await criar(client).decidir(7, 13, "rejeitado"), sucesso("rejeitado"));
    else await assert.rejects(criar(client).decidir(7, 13, "rejeitado"), e => e.respostaStatus === 500 && e.resultadoIncerto);
    assert.equal(calls, 1);
  }
});
