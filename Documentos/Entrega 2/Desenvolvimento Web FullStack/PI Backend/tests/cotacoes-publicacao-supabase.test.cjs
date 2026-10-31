"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { criarAdaptadorPublicacaoCotacoes: criar } = require("../repositories/supabase/cotacoes-publicacao.cjs");
const item = { categoria: "Som", descricao: "Locação", valor_estimado: "0.10" };
const payload = () => ({ evento_id: "13", prazo: "2026-10-30", itens: [{ ...item }] });
const agora = () => new Date("2026-10-30T23:59:59.999Z");
function resposta(p) {
  return { data: { id: 207, evento_id: p.p_evento_id, prazo: p.p_prazo,
    modalidade: "Fechada", observacoes: p.p_observacoes, status: "Aberta", itens: p.p_itens } };
}
function mock(acao = resposta) {
  const chamadas = [];
  let sinal;
  return { chamadas, get sinal() { return sinal; }, cliente: { schema(s) {
    assert.equal(s, "public");
    return { rpc(nome, p, opcoes) {
      chamadas.push({ nome, p });
      assert.deepEqual({ ...opcoes }, { get: false, head: false });
      return { retry(v) { assert.equal(v, false); return this; }, abortSignal(s) { sinal = s; return Promise.resolve().then(() => acao(p)); } };
    } };
  } } };
}
test("publicação projeta contrato e ignora ator/IDs do corpo; normaliza dinheiro sem float", async () => {
  const m = mock();
  const p = payload(); p.usuario_id = 999; p.itens[0] = { ...item, id: 444, valor_estimado: "000.1", categoria: " Som " };
  const r = await criar(m.cliente, { agora }).publicar(10, p);
  assert.deepEqual(m.chamadas, [{ nome: "publicar_cotacao", p: { p_usuario_id: 10, p_evento_id: 13,
    p_prazo: p.prazo, p_hoje_utc: "2026-10-30", p_observacoes: "", p_itens: [item] } }]);
  assert.deepEqual(r, { mensagem: "Cotação publicada com sucesso!", cotacao: { id: 207, evento_id: 13,
    prazo: p.prazo, modalidade: "Fechada", observacoes: "", status: "Aberta", itens: [item] } });
});
for (const [nome, alterar] of [
  ["evento", p => p.evento_id = 0], ["calendário", p => p.prazo = "2026-02-30"],
  ["passado UTC", p => p.prazo = "2026-10-29"], ["observações", p => p.observacoes = null],
  ["esparso", p => p.itens = new Array(2)], ["negativo", p => p.itens[0].valor_estimado = "-1"],
  ["escala", p => p.itens[0].valor_estimado = "0.001"], ["limite", p => p.itens[0].valor_estimado = "10000000000"],
  ["NaN", p => p.itens[0].valor_estimado = NaN], ["descrição", p => p.itens[0].descricao = " "],
]) test(`rejeita ${nome} antes do transporte`, async () => {
  const m = mock(); const p = payload(); alterar(p);
  await assert.rejects(criar(m.cliente, { agora }).publicar(10, p), e => e.respostaStatus === 400 && !e.resultadoIncerto);
  assert.equal(m.chamadas.length, 0);
});
test("ator inválido não inicializa cliente", async () => {
  await assert.rejects(criar(undefined, { agora }).publicar(0, payload()), e => e.respostaStatus === 403);
});
test("vazio é enviado para resolver propriedade e ausência de custos sob lock", async () => {
  const m = mock(() => ({ error: { code: "TP402" } }));
  await assert.rejects(criar(m.cliente, { agora }).publicar(10, { ...payload(), itens: [] }), e => e.respostaStatus === 400);
  assert.equal(m.chamadas.length, 1);
});
for (const [code, status] of [["TP400",400],["TP401",400],["TP402",400],["TP403",403],["TP404",404],["TP409",409],
  ["TP500",500],["23505",500],["40P01",500],["57014",500]]) test(`mapeia ${code} sem expor SQL ou repetir`, async () => {
  const m = mock(() => ({ error: { code, message: "SEGREDO", details: "SQL" } }));
  await assert.rejects(criar(m.cliente, { agora }).publicar(10, payload()), e =>
    e.respostaStatus === status && e.resultadoIncerto === (status === 500) && !e.message.includes("SEGREDO"));
  assert.equal(m.chamadas.length, 1);
});
for (const alterar of [r => r.data.id = "207", r => r.data.itens = new Array(1),
  r => r.data.itens = [{ ...item, valor_estimado: 0.1 }], r => r.data.evento_id = 14,
  r => r.data.status = "Fechada", r => r.data.itens = []]) test("resposta malformada é incerta", async () => {
  const m = mock(p => { const r = resposta(p); alterar(r); return r; });
  await assert.rejects(criar(m.cliente, { agora }).publicar(10, payload()), e => e.resultadoIncerto && e.respostaStatus === 500);
});
test("timeout aborta e resposta tardia não vira sucesso", async () => {
  let resolver;
  const m = mock(p => new Promise(resolve => { resolver = () => resolve(resposta(p)); }));
  await assert.rejects(criar(m.cliente, { agora, timeoutMs: 15 }).publicar(10, payload()), e => e.code === "PUBLICACAO_TIMEOUT" && e.resultadoIncerto);
  assert.equal(m.sinal.aborted, true); resolver(); await Promise.resolve(); assert.equal(m.chamadas.length, 1);
});
test("SDK real usa POST uma vez com fetch falso, inclusive 503", async () => {
  const { createClient } = require("@supabase/supabase-js");
  for (const status of [200, 503]) {
    let chamadas = 0;
    const cliente = createClient("https://exemplo.invalid", "chave-ficticia", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (url, opcoes) => {
        chamadas++; assert.equal(opcoes.method, "POST"); assert.match(String(url), /\/rpc\/publicar_cotacao$/);
        const p = JSON.parse(opcoes.body); assert.equal(p.p_itens[0].valor_estimado, "0.10");
        return new Response(JSON.stringify(status === 200 ? resposta(p).data : { code: "53300", message: "SEGREDO" }),
          { status, headers: { "Content-Type": "application/json" } });
      } },
    });
    const tentativa = criar(cliente, { agora }).publicar(10, payload());
    if (status === 200) assert.equal((await tentativa).cotacao.id, 207);
    else await assert.rejects(tentativa, e => e.resultadoIncerto);
    assert.equal(chamadas, 1);
  }
});
test("SQL: inspeção estática do protocolo, sem compilar ou provar rollback", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../../Banco de dados/rpc_publicar_cotacao.preparacao.sql"), "utf8").replace(/--[^\n]*/g, "");
  assert.match(sql, /VOLATILE\s+SECURITY INVOKER\s+SET search_path = ''/);
  assert.doesNotMatch(sql, /\b(GRANT|REVOKE|ALTER|DROP|COMMIT|ROLLBACK|NOWAIT|SKIP LOCKED|CURRENT_DATE)\b|OR REPLACE/i);
  assert.equal((sql.match(/EXCEPTION WHEN/g) || []).length, 1);
  assert.ok(sql.indexOf("EXCEPTION WHEN SQLSTATE '22007' OR SQLSTATE '22008'") < sql.indexOf("PERFORM e.id"));
  assert.doesNotMatch(sql.slice(sql.indexOf("PERFORM e.id")), /EXCEPTION WHEN/);
  const evento = sql.indexOf("PERFORM e.id"), custos = sql.indexOf("FOR v_custo IN"), comparar = sql.indexOf("IF v_normalizados::text COLLATE"),
    inserir = sql.indexOf("INSERT INTO public.cotacoes"), itens = sql.indexOf("INSERT INTO public.itens_cotacao");
  assert.ok(evento < custos && custos < comparar && comparar < inserir && inserir < itens);
  assert.match(sql.slice(evento, custos), /e.id = p_evento_id AND e.usuario_id = p_usuario_id FOR UPDATE/);
  assert.match(sql.slice(custos, comparar), /ORDER BY c.id FOR UPDATE/);
  assert.match(sql.slice(inserir), /jsonb_array_elements\(v_persistidos\)/);
  assert.match(sql, /v_custo.valor_estimado::text/);
  assert.match(sql, /v_hoje := p_hoje_utc::date/);
  assert.match(sql, /v_prazo < v_hoje/);
  assert.match(sql.slice(comparar, inserir), /COLLATE pg_catalog\."C"/);
  assert.match(sql, /current_user <> 'service_role'/);
});

// Oraculo do handler atual, com persistencia substituida. Nao executa SQL,
// middleware ou autenticacao; compara a logica real de validacao/resposta.
async function contratoMySQL(entrada, persistidos = [item]) {
  const src = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const inicio = src.indexOf("function normalizarItemCotacao(");
  const fim = src.indexOf('app.get("/cotacoes"', inicio);
  assert.ok(inicio >= 0 && fim > inicio);
  let handler;
  const conexao = { async beginTransaction() {}, async commit() {}, async rollback() {}, release() {} };
  class DataFixa extends Date { constructor(...args) { super(...(args.length ? args : [agora().toISOString()])); } }
  vm.runInNewContext(src.slice(inicio, fim), {
    Date: DataFixa, console: { error() {} }, autenticar() {}, permitirPerfis: () => () => {},
    app: { post(_url, ...handlers) { handler = handlers.at(-1); } },
    db: { async getConnection() { return conexao; } },
    custosRepository: { async bloquearEventoDoUsuario(c, evento, usuario) {
      assert.equal(c, conexao); assert.equal(usuario, 10); return [{ id: evento }];
    } },
    cotacoesRepository: {
      async bloquearCustosDoEvento(c) { assert.equal(c, conexao); return persistidos; },
      async criar(c) { assert.equal(c, conexao); return 207; },
      async inserirItem(c, id) { assert.equal(c, conexao); assert.equal(id, 207); },
    },
  });
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(dados) { this.body = dados; return this; } };
  await handler({ body: entrada, usuario: { id: 10 } }, res);
  return { status: res.statusCode, body: JSON.parse(JSON.stringify(res.body)) };
}

test("resposta independente coincide com MySQL: zero, limite, Unicode, trim e ordem", async () => {
  const persistidos = [{ ...item, valor_estimado: "0.00" },
    { categoria: " Áudio 😀 ", descricao: " PA ", valor_estimado: "9999999999.99" }];
  const p = { ...payload(), observacoes: "  'Cotação'\n😀  ", usuario_id: 999,
    itens: [{ ...item, valor_estimado: 0, id: 99 }, { ...persistidos[1], valor_estimado: "09999999999.99" }] };
  const esperado = await contratoMySQL(p, persistidos);
  assert.equal(esperado.status, 201);
  const retorno = structuredClone(esperado.body.cotacao);
  retorno.criada_em = "extra"; retorno.itens[0].id = 999;
  const original = structuredClone(retorno);
  const m = mock(args => {
    assert.equal(args.p_usuario_id, 10);
    assert.deepEqual(args.p_itens.map(i => i.valor_estimado), ["0.00", "9999999999.99"]);
    return { data: retorno };
  });
  assert.deepEqual(await criar(m.cliente, { agora }).publicar(10, p), esperado.body);
  assert.deepEqual(retorno, original);
});

test("validacao e prioridade dos erros coincidem com handler MySQL antes da RPC", async () => {
  for (const extra of [{ evento_id: true }, { evento_id: "" }, { evento_id: 9007199254740992 },
    { prazo: "2026-2-01" }, { prazo: "2099-02-29" }, { prazo: "2026-10-29" },
    { observacoes: null }, { itens: null }, { itens: Array(1) },
    { itens: [{ ...item, categoria: "😀".repeat(101) }] },
    { prazo: "2000-01-01", itens: [{ ...item, valor_estimado: "" }] }]) {
    const p = { ...payload(), ...extra };
    const esperado = await contratoMySQL(p);
    assert.equal(esperado.status, 400);
    const m = mock();
    await assert.rejects(criar(m.cliente, { agora }).publicar(10, p),
      e => e.respostaStatus === 400 && e.message === esperado.body.erro && !e.resultadoIncerto);
    assert.equal(m.chamadas.length, 0);
  }
});

test("UTC e capturado uma vez; IDs permissivos e bissexto preservam contrato MySQL", async () => {
  let relogios = 0;
  for (const extra of [{ evento_id: " 13 " }, { evento_id: "1.3e1" }, { evento_id: "0xd" }, { prazo: "2096-02-29" }]) {
    const p = { ...payload(), ...extra, p_hoje_utc: "1900-01-01" };
    const esperado = await contratoMySQL(p);
    assert.equal(esperado.status, 201);
    const m = mock(args => {
      assert.equal(args.p_hoje_utc, "2026-10-30"); return { data: esperado.body.cotacao };
    });
    assert.deepEqual(await criar(m.cliente, { agora: () => {
      relogios++; return new Date("2026-10-29T23:30:00-03:00");
    } }).publicar(10, p), esperado.body);
  }
  assert.equal(relogios, 4);
});

test("relogio invalido ou falho nao expoe detalhes nem envia requisicao", async () => {
  for (const opcoes of [{ timeoutMs: 0 }, { timeoutMs: 60001 }, { agora: null }]) {
    assert.throws(() => criar({}, opcoes), { code: "PUBLICACAO_CONFIG" });
  }
  for (const relogio of [() => new Date(NaN), () => { throw Error("SEGREDO"); }]) {
    const m = mock();
    await assert.rejects(criar(m.cliente, { agora: relogio }).publicar(10, payload()),
      e => e.code === "PUBLICACAO_RELOGIO" && e.respostaStatus === 500 && !e.resultadoIncerto && !e.message.includes("SEGREDO"));
    assert.equal(m.chamadas.length, 0);
  }
});

test("duas acoes explicitas continuam permitidas: nenhuma idempotencia imposta", async () => {
  let id = 207;
  const m = mock(p => ({ data: { ...resposta(p).data, id: id++ } }));
  const a = criar(m.cliente, { agora });
  assert.equal((await a.publicar(10, payload())).cotacao.id, 207);
  assert.equal((await a.publicar(10, payload())).cotacao.id, 208);
  assert.equal(m.chamadas.length, 2);
});

test("transporte nao forja erro de negocio nem usa propriedades herdadas como SQLSTATE", async () => {
  for (const acao of [() => ({ error: { code: "toString", message: "SEGREDO" } }),
    () => { throw Object.assign(Error("SEGREDO"), { respostaStatus: 409, resultadoIncerto: false }); }]) {
    const m = mock(acao);
    await assert.rejects(criar(m.cliente, { agora }).publicar(10, payload()),
      e => e.respostaStatus === 500 && e.resultadoIncerto && !e.message.includes("SEGREDO"));
    assert.equal(m.chamadas.length, 1);
  }
});

test("SQLSTATE de publicacao exige string, sem converter array/objeto em conflito confirmado", async () => {
  for (const code of [["TP409"], ["TP404"], ["TP400"], { toString: () => "TP403" }]) {
    const m = mock(() => ({ error: { code, message: "SEGREDO" } }));
    await assert.rejects(criar(m.cliente, { agora }).publicar(10, payload()),
      e => e.respostaStatus === 500 && e.resultadoIncerto && !e.message.includes("SEGREDO"));
    assert.equal(m.chamadas.length, 1);
  }
});

test("fabrica e inerte e reutilizada; validacao falha sem inicializar SDK", async () => {
  let criacoes = 0;
  const m = mock();
  const contexto = { module: { exports: {} }, Date, AbortController, setTimeout, clearTimeout, require(nome) {
    if (nome === "../../services/validacao-publicacao.cjs") return require("../services/validacao-publicacao.cjs");
    if (nome === "./suporte-leitura.cjs") return require("../repositories/supabase/suporte-leitura.cjs");
    assert.equal(nome, "../../db-supabase.cjs"); return { criarClienteSupabase() { criacoes++; return m.cliente; } };
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../repositories/supabase/cotacoes-publicacao.cjs"), "utf8"), contexto);
  const a = contexto.module.exports.criarAdaptadorPublicacaoCotacoes(undefined, { agora });
  assert.equal(criacoes, 0);
  await assert.rejects(a.publicar(10, { ...payload(), itens: null })); assert.equal(criacoes, 0);
  await a.publicar(10, payload()); await a.publicar(10, payload()); assert.equal(criacoes, 1);
});

test("SQL usa o mesmo lock do PUT e nunca usa revisados como fonte de INSERT", () => {
  const ler = nome => fs.readFileSync(path.join(__dirname, "../../Banco de dados", nome), "utf8").replace(/--[^\n]*/g, "");
  const sql = ler("rpc_publicar_cotacao.preparacao.sql");
  const custos = ler("rpc_substituir_custos_evento.preparacao.sql");
  const lock = /PERFORM e\.id FROM public\.eventos AS e\s+WHERE e\.id = p_evento_id AND e\.usuario_id = p_usuario_id\s+FOR UPDATE;/;
  assert.match(sql, lock); assert.match(custos, lock);
  const escritas = sql.slice(sql.indexOf("INSERT INTO public.cotacoes"));
  assert.match(escritas, /jsonb_array_elements\(v_persistidos\)/);
  assert.doesNotMatch(escritas, /jsonb_array_elements\(p_itens\)|jsonb_array_elements\(v_normalizados\)/);
  assert.match(escritas, /'itens', v_persistidos/);
  assert.match(sql, /u\.id = p_usuario_id AND u\.perfil = 'organizador'/);
});

test("resposta completa: campos ausentes, ordem e buracos em qualquer posicao sao incertos", async () => {
  const p = { ...payload(), itens: [{ ...item }, { ...item, descricao: "Luz", valor_estimado: "0.20" }] };
  const mudar = [
    () => null, () => [],
    r => ({ ...r, id: Number.MAX_SAFE_INTEGER + 1 }),
    r => ({ ...r, evento_id: "13" }),
    r => ({ ...r, prazo: "2026-10-31" }),
    r => ({ ...r, modalidade: "Aberta" }),
    r => ({ ...r, observacoes: null }),
    r => ({ ...r, itens: r.itens.slice(0, 1) }),
    r => ({ ...r, itens: r.itens.reverse() }),
    r => { delete r.itens[0]; return r; },
    r => { delete r.itens[1]; return r; },
    r => { delete r.itens[0].descricao; return r; },
    r => { r.itens[0] = null; return r; },
    r => { r.itens[0] = []; return r; },
    r => { r.itens[0].categoria = new String("Som"); return r; },
    ...["0.100", "00.10", "0.10\n", NaN].map(valor => r => { r.itens[0].valor_estimado = valor; return r; }),
  ];
  const original = structuredClone(p);
  for (const transformar of mudar) {
    // Fixture independente: nao ecoar/mutar o array revisado do adaptador.
    const r = transformar({ id: 207, evento_id: 13, prazo: p.prazo, modalidade: "Fechada",
      observacoes: "", status: "Aberta", itens: structuredClone(p.itens) });
    const m = mock(() => ({ data: r }));
    await assert.rejects(criar(m.cliente, { agora }).publicar(10, p),
      e => e.respostaStatus === 500 && e.resultadoIncerto);
    assert.equal(m.chamadas.length, 1);
    assert.deepEqual(p, original);
  }
});
