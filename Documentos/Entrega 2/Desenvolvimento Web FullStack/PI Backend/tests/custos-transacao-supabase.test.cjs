"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { criarAdaptadorSubstituicaoCustos } = require("../repositories/supabase/custos-transacao.cjs");
const entrada = valor => ({ categoria: " Segurança ", descricao: " Equipe ", valor_estimado: valor });

// Somente transporte simulado. Nao executa SQL nem reproduz um motor transacional.
function mock(responder) {
  const chamadas = [];
  let sinal;
  const cliente = { schema(nome) {
    assert.equal(nome, "public");
    return { rpc(nomeRpc, parametros, opcoes) {
      chamadas.push({ nomeRpc, parametros, opcoes });
      return { retry(valor) {
        assert.equal(valor, false);
        return { abortSignal(signal) {
          sinal = signal;
          return Promise.resolve().then(() => responder(parametros));
        } };
      } };
    } };
  } };
  return { cliente, chamadas, get sinal() { return sinal; } };
}
function sucesso(p) {
  return { data: p.p_custos.map((item, indice) => ({ id: indice + 10,
    evento_id: p.p_evento_id, ...item, extra: "nao projetar" })), error: null };
}

test("uma RPC POST: lista completa, projecao, IDs e decimais textuais sem mutacao", async () => {
  const m = mock(sucesso);
  const custos = [entrada(0), entrada(0.1), entrada(0.2), entrada("9999999999.99"), entrada("000001.2")];
  const antes = structuredClone(custos);
  const resultado = await criarAdaptadorSubstituicaoCustos(m.cliente).substituir(9, 1, custos);
  assert.deepEqual(custos, antes);
  assert.deepEqual(resultado.map(c => c.valor_estimado), ["0.00", "0.10", "0.20", "9999999999.99", "1.20"]);
  assert.deepEqual(Object.keys(resultado[0]), ["id", "evento_id", "categoria", "descricao", "valor_estimado"]);
  assert.equal(resultado[0].categoria, "Segurança");
  assert.equal(resultado[0].descricao, "Equipe");
  assert.equal(m.chamadas.length, 1);
  assert.equal(m.chamadas[0].nomeRpc, "substituir_custos_evento");
  assert.equal(m.chamadas[0].parametros.p_usuario_id, 1);
  assert.deepEqual(m.chamadas[0].opcoes, { get: false, head: false });
  assert.equal(m.sinal.aborted, true);
});

test("lista vazia e limites Unicode aceitos", async () => {
  const m = mock(sucesso);
  const a = criarAdaptadorSubstituicaoCustos(m.cliente);
  assert.deepEqual(await a.substituir(9, 1, []), []);
  const [item] = await a.substituir(9, 1, [{ categoria: "😀".repeat(100), descricao: "é".repeat(255), valor_estimado: " 0.10 " }]);
  assert.equal(Array.from(item.categoria).length, 100);
  assert.equal(item.valor_estimado, "0.10");
});

const invalidos = [
  ["evento zero", 0, 1, [], 400], ["evento inseguro", Number.MAX_SAFE_INTEGER + 1, 1, [], 400],
  ["evento string", "9", 1, [], 400], ["ator invalido", 9, 0, [], 403],
  ["array obrigatorio", 9, 1, null, 400], ["array esparso", 9, 1, Array(1), 400],
  ["item null", 9, 1, [null], 400], ["item array", 9, 1, [[]], 400],
  ["categoria vazia", 9, 1, [{ ...entrada(1), categoria: " \uFEFF " }], 400],
  ["categoria longa", 9, 1, [{ ...entrada(1), categoria: "😀".repeat(101) }], 400],
  ["descricao longa", 9, 1, [{ ...entrada(1), descricao: "a".repeat(256) }], 400],
  ["descricao ausente", 9, 1, [{ categoria: "x", valor_estimado: 1 }], 400],
  ...["", " ", "1.001", "-1", "1,10", "1e2", "Infinity", "10000000000.00", NaN, Infinity, null, true]
    .map((valor, i) => [`dinheiro invalido ${i}`, 9, 1, [entrada(1), entrada(valor)], 400]),
];
for (const [nome, evento, usuario, custos, status] of invalidos) {
  test(`validacao integral antes de transporte: ${nome}`, async () => {
    const m = mock(sucesso);
    await assert.rejects(criarAdaptadorSubstituicaoCustos(m.cliente).substituir(evento, usuario, custos),
      e => e.respostaStatus === status && !e.resultadoIncerto);
    assert.equal(m.chamadas.length, 0);
  });
}

for (const [codigo, status] of [["TC400", 400], ["TC403", 403], ["TC404", 404]]) {
  test(`erro de negocio ${codigo} sem exposicao nem retry`, async () => {
    const m = mock(() => ({ data: null, error: { code: codigo, message: "SEGREDO" } }));
    await assert.rejects(criarAdaptadorSubstituicaoCustos(m.cliente).substituir(9, 1, []),
      e => e.respostaStatus === status && !e.resultadoIncerto && !e.message.includes("SEGREDO"));
    assert.equal(m.chamadas.length, 1);
  });
}

for (const codigo of ["23503", "40P01", "57014", "08006"]) {
  test(`falha SQL/transacional simulada ${codigo}: nao afirmar sucesso nem repetir`, async () => {
    const m = mock(() => ({ error: { code: codigo, message: "SQL SEGREDO", details: "SEGREDO" } }));
    await assert.rejects(criarAdaptadorSubstituicaoCustos(m.cliente).substituir(9, 1, [entrada(1)]),
      e => e.respostaStatus === 500 && e.resultadoIncerto && !JSON.stringify(e).includes("SEGREDO") && !e.cause);
    assert.equal(m.chamadas.length, 1);
  });
}

test("erro de transporte com campos forjados tambem e sanitizado", async () => {
  const m = mock(() => { throw Object.assign(Error("SEGREDO"), { respostaStatus: 400, resultadoIncerto: false }); });
  await assert.rejects(criarAdaptadorSubstituicaoCustos(m.cliente).substituir(9, 1, []),
    e => e.code === "CUSTOS_RESULTADO_INCERTO" && e.resultadoIncerto && !e.message.includes("SEGREDO"));
});

const respostasInvalidas = [
  () => null, () => [], () => Array(1), p => [{ ...sucesso(p).data[0], evento_id: 8 }],
  p => [{ ...sucesso(p).data[0], id: 0 }], p => [{ ...sucesso(p).data[0], valor_estimado: 1 }],
  p => [{ ...sucesso(p).data[0], valor_estimado: "1.01" }],
  p => [{ ...sucesso(p).data[0], descricao: "outro" }],
];
for (const [indice, resposta] of respostasInvalidas.entries()) {
  test(`resposta invalida ${indice}: resultado incerto preserva possibilidade de commit`, async () => {
    const m = mock(p => ({ data: resposta(p) }));
    await assert.rejects(criarAdaptadorSubstituicaoCustos(m.cliente).substituir(9, 1, [entrada(1)]),
      e => e.resultadoIncerto && e.respostaStatus === 500);
    assert.equal(m.chamadas.length, 1);
  });
}

test("IDs fora de ordem ou repetidos recusados", async () => {
  for (const transformar of [data => data.reverse(), data => data.map(item => ({ ...item, id: 10 }))]) {
    const m = mock(p => ({ data: transformar(sucesso(p).data) }));
    await assert.rejects(criarAdaptadorSubstituicaoCustos(m.cliente).substituir(9, 1, [entrada(1), entrada(2)]),
      e => e.resultadoIncerto);
    assert.equal(m.chamadas.length, 1);
  }
});

test("retorno independente: IDs gerados com lacunas, ordem e ator atual sem aceitar extras do corpo", async () => {
  const m = mock(p => {
    assert.deepEqual(p, { p_evento_id: 13, p_usuario_id: 10, p_custos: [
      { categoria: "Som", descricao: "PA", valor_estimado: "0.10" },
      { categoria: "Luz", descricao: "LED", valor_estimado: "9999999999.99" },
    ] });
    return { data: [
      { id: 102, evento_id: 13, categoria: "Som", descricao: "PA", valor_estimado: "0.10" },
      { id: 109, evento_id: 13, categoria: "Luz", descricao: "LED", valor_estimado: "9999999999.99" },
    ] };
  });
  const dados = [
    { id: 999, evento_id: 8, usuario_id: 999, categoria: "Som", descricao: "PA", valor_estimado: 0.1 },
    { categoria: "Luz", descricao: "LED", valor_estimado: "9999999999.99" },
  ];
  const resultado = await criarAdaptadorSubstituicaoCustos(m.cliente).substituir(13, 10, dados);
  assert.deepEqual(resultado.map(item => item.id), [102, 109]);
  assert.equal(m.chamadas.length, 1);
});

// SDK instalado com fetch inteiramente substituido: nenhum HTTP real.
// Diferentemente do mock fluente, verifica o metodo e o JSON serializado reais.
function clienteComFetch(fetchSimulado) {
  const { createClient } = require("@supabase/supabase-js");
  return createClient("https://exemplo.invalid", "sb_secret_exclusivamente_ficticio", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchSimulado },
  });
}

test("SDK instalado: POST unico com JSON textual e projecao independente da entrada", async () => {
  let chamadas = 0;
  const cliente = clienteComFetch(async (url, opcoes) => {
    chamadas++;
    assert.equal(String(url), "https://exemplo.invalid/rest/v1/rpc/substituir_custos_evento");
    assert.equal(opcoes.method, "POST");
    assert.deepEqual(JSON.parse(opcoes.body), { p_evento_id: 13, p_usuario_id: 10,
      p_custos: [{ categoria: "Segurança", descricao: "Equipe", valor_estimado: "0.20" }] });
    return new Response(JSON.stringify([{ id: 207, evento_id: 13, categoria: "Segurança", descricao: "Equipe", valor_estimado: "0.20" }]),
      { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const resultado = await criarAdaptadorSubstituicaoCustos(cliente).substituir(13, 10, [entrada(0.2)]);
  assert.equal(resultado[0].valor_estimado, "0.20");
  assert.equal(resultado[0].id, 207);
  assert.equal(chamadas, 1);
});

test("SDK instalado: resposta 503 e incerta sem retry de transporte", async () => {
  let chamadas = 0;
  const cliente = clienteComFetch(async () => {
    chamadas++;
    return new Response(JSON.stringify({ code: "53300", message: "SQL SEGREDO" }),
      { status: 503, headers: { "Content-Type": "application/json" } });
  });
  await assert.rejects(criarAdaptadorSubstituicaoCustos(cliente).substituir(13, 10, []),
    e => e.resultadoIncerto && e.respostaStatus === 500 && !e.message.includes("SEGREDO"));
  assert.equal(chamadas, 1);
});

test("SDK instalado: timeout aborta fetch pendente e nao reenvia", async () => {
  let chamadas = 0;
  let sinal;
  const cliente = clienteComFetch((_, opcoes) => {
    chamadas++;
    sinal = opcoes.signal;
    return new Promise((_, reject) => {
      sinal.addEventListener("abort", () => reject(new DOMException("Abortado", "AbortError")), { once: true });
    });
  });
  await assert.rejects(criarAdaptadorSubstituicaoCustos(cliente, { timeoutMs: 20 }).substituir(13, 10, []),
    e => e.code === "CUSTOS_TIMEOUT" && e.resultadoIncerto);
  assert.equal(sinal.aborted, true);
  assert.equal(chamadas, 1);
});

test("timeout aborta transporte, nao repete e ignora resposta atrasada", async () => {
  let resolver;
  const m = mock(() => new Promise(resolve => { resolver = resolve; }));
  const promessa = criarAdaptadorSubstituicaoCustos(m.cliente, { timeoutMs: 15 }).substituir(9, 1, []);
  await assert.rejects(promessa, e => e.code === "CUSTOS_TIMEOUT" && e.resultadoIncerto);
  assert.equal(m.sinal.aborted, true);
  resolver({ data: [] });
  await Promise.resolve();
  assert.equal(m.chamadas.length, 1);
});

test("fabrica existente e tardia, reutilizada; importacao/validacao nao inicializam SDK", async () => {
  let criacoes = 0;
  const m = mock(sucesso);
  const arquivo = path.join(__dirname, "../repositories/supabase/custos-transacao.cjs");
  const contexto = { module: { exports: {} }, AbortController, setTimeout, clearTimeout,
    require(nome) {
      if (nome === "./suporte-leitura.cjs") return require("../repositories/supabase/suporte-leitura.cjs");
      assert.equal(nome, "../../db-supabase.cjs");
      return { criarClienteSupabase() { criacoes++; return m.cliente; } };
    } };
  vm.runInNewContext(fs.readFileSync(arquivo, "utf8"), contexto);
  const a = contexto.module.exports.criarAdaptadorSubstituicaoCustos();
  assert.equal(criacoes, 0);
  await assert.rejects(a.substituir(0, 1, []));
  assert.equal(criacoes, 0);
  await a.substituir(9, 1, []);
  await a.substituir(9, 1, []);
  assert.equal(criacoes, 1);
});

test("timeout de configuracao invalido e recusado localmente", () => {
  for (const timeoutMs of [0, -1, Infinity, 60001, "100"]) {
    assert.throws(() => criarAdaptadorSubstituicaoCustos({}, { timeoutMs }), { code: "CUSTOS_CONFIG" });
  }
});

// Inspecao estatica do artefato: NAO compila PL/pgSQL nem prova locks/rollback.
test("SQL preparado: invoker, uma transacao da requisicao e nenhuma permissao alterada", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../../Banco de dados/rpc_substituir_custos_evento.preparacao.sql"), "utf8")
    .replace(/--[^\n]*/g, "");
  assert.match(sql, /CREATE FUNCTION public\.substituir_custos_evento/);
  assert.match(sql, /VOLATILE\s+SECURITY INVOKER\s+SET search_path = ''/);
  assert.doesNotMatch(sql, /\b(GRANT|REVOKE|ALTER|DROP|COMMIT|ROLLBACK)\b/i);
  assert.doesNotMatch(sql, /OR REPLACE|EXCEPTION\s+WHEN/i);
  assert.match(sql, /current_user <> 'service_role'/);
  const perfil = sql.indexOf("PERFORM u.id");
  const evento = sql.indexOf("PERFORM e.id");
  const excluir = sql.indexOf("DELETE FROM public.custos_evento");
  const inserir = sql.indexOf("INSERT INTO public.custos_evento");
  const reler = sql.indexOf("SELECT COALESCE(pg_catalog.jsonb_agg");
  assert.ok(sql.indexOf("v_valor !~") < perfil && perfil < evento && evento < excluir && excluir < inserir && inserir < reler);
  assert.match(sql.slice(evento, excluir), /e\.id = p_evento_id AND e\.usuario_id = p_usuario_id\s+FOR UPDATE/);
  assert.match(sql, /u\.id = p_usuario_id AND u\.perfil = 'organizador'/);
  assert.match(sql, /::numeric\(12,2\)/);
  assert.match(sql.slice(reler), /c\.valor_estimado::text/);
  assert.match(sql.slice(reler), /ORDER BY c\.id/);
  assert.match(sql.slice(reler), /WHERE c\.evento_id = p_evento_id/);
  assert.match(sql.slice(reler), /'\[\]'::jsonb/);
  assert.match(sql, /ERRCODE = 'TC404'/);
});
