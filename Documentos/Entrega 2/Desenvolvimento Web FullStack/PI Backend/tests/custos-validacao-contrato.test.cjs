"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { normalizarCustos } = require("../repositories/supabase/validacao-custos.cjs");
const { criarAdaptadorPublicacaoCotacoes } = require("../repositories/supabase/cotacoes-publicacao.cjs");
const item = { categoria: "Som", descricao: "PA", valor_estimado: "0.10" };

// Executa somente o handler PUT atual em VM, com persistencia falsa.
// Nao importa server.js, dotenv, SDK ou driver; nao simula um motor SQL.
async function contratoPut(custos, id = "13") {
  const src = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const inicio = src.indexOf('app.put("/eventos/:id/custos"');
  const fim = src.indexOf('app.get("/eventos/:id"', inicio);
  assert.ok(inicio >= 0 && fim > inicio);
  let handler;
  const gravados = [];
  const conexao = { async beginTransaction() {}, async commit() {}, async rollback() {}, release() {} };
  const contextoHandler = {
    autenticar() {}, permitirPerfis: () => () => {}, console: { error() {} },
    app: { put(_url, ...handlers) { handler = handlers.at(-1); } },
    db: { async getConnection() { return conexao; } },
    custosRepository: {
      async bloquearEventoDoUsuario(c, evento, usuario) {
        assert.equal(c, conexao); assert.equal(evento, Number(id)); assert.equal(usuario, 10); return [{ id: evento }];
      },
      async excluirPorEvento() {},
      async inserir(c, evento, dados) { assert.equal(c, conexao); assert.equal(evento, Number(id)); gravados.push(dados); },
      async listarPorEvento(evento, c) { assert.equal(c, conexao); return gravados; },
    },
  };
  contextoHandler.responderErroServico = require("./helpers/persistencia.cjs").responderErroServico;
  contextoHandler.servicos = { custos: require("../services/custos.cjs").criarServicoCustos({ db: contextoHandler.db, repositorios: { custos: contextoHandler.custosRepository } }) };
  vm.runInNewContext(src.slice(inicio, fim), contextoHandler);
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(dados) { this.body = dados; return this; } };
  await handler({ body: { custos }, params: { id }, usuario: { id: 10, perfil: "organizador" } }, res);
  return { status: res.statusCode, body: JSON.parse(JSON.stringify(res.body)) };
}

test("validacao compartilhada conserva normalizacao e contrato do PUT MySQL", async () => {
  const entrada = [
    { ...item, categoria: "\uFEFF Áudio 😀 \u00A0", descricao: "\u2000 PA \u3000", valor_estimado: "000.1", id: 999 },
    { ...item, valor_estimado: 0 }, { ...item, valor_estimado: 0.2 },
    { ...item, categoria: "😀".repeat(100), descricao: "é".repeat(255), valor_estimado: "9999999999.99" },
  ];
  const original = structuredClone(entrada);
  const mysql = await contratoPut(entrada);
  assert.equal(mysql.status, 200);
  assert.deepEqual(normalizarCustos(13, 10, entrada), mysql.body);
  assert.deepEqual(mysql.body.map(c => c.valor_estimado), ["0.10", "0.00", "0.20", "9999999999.99"]);
  assert.equal(mysql.body[0].categoria, "Áudio 😀");
  assert.equal(mysql.body[0].descricao, "PA");
  assert.deepEqual(entrada, original);
});

test("cada classe de erro do normalizador conserva a mensagem exata do PUT", async () => {
  const invalidos = [null, {}, Array(1), [null], [[]], [{ ...item, categoria: " " }],
    [{ ...item, descricao: "" }], [{ ...item, categoria: "😀".repeat(101) }],
    [{ ...item, descricao: "x".repeat(256) }],
    ...[null, true, NaN, Infinity, -Infinity, "", " ", -1, "-0", "+1", "1,10", "1e2", "1.001",
      0.1 + 0.2, "10000000000.00"].map(valor => [{ ...item, valor_estimado: valor }])];
  for (const entrada of invalidos) {
    const mysql = await contratoPut(entrada);
    assert.equal(mysql.status, 400);
    assert.throws(() => normalizarCustos(13, 10, entrada), e =>
      e.respostaStatus === mysql.status && e.message === mysql.body.erro && !e.resultadoIncerto);
  }
  const mysql = await contratoPut([], "0");
  assert.throws(() => normalizarCustos(0, 10, []), e => e.respostaStatus === mysql.status && e.message === mysql.body.erro);
});

test("publicacao traduz erro compartilhado sem substituir sua mensagem pelo contrato do PUT", async () => {
  const entrada = [{ ...item, valor_estimado: "1.001" }];
  const mysql = await contratoPut(entrada);
  let chamadas = 0;
  const cliente = { schema() { chamadas++; throw Error("Nao deve chamar"); } };
  await assert.rejects(criarAdaptadorPublicacaoCotacoes(cliente).publicar(10,
    { evento_id: "13", prazo: "2099-12-31", itens: entrada }), e =>
    e.respostaStatus === 400 && !e.resultadoIncerto &&
    e.message === "Informe evento, prazo válido e itens da cotação." && e.message !== mysql.body.erro);
  assert.equal(chamadas, 0);
});

test("vazio e permitido no normalizador e no PUT, sem ser considerado publicavel", async () => {
  const mysql = await contratoPut([]);
  assert.equal(mysql.status, 200);
  assert.deepEqual(normalizarCustos(13, 10, []), mysql.body);
  assert.deepEqual(mysql.body, []);
  let chamadas = 0;
  const cliente = { schema() { return { rpc(nome, args) {
    chamadas++; assert.equal(nome, "publicar_cotacao"); assert.deepEqual(args.p_itens, []);
    return { retry(valor) { assert.equal(valor, false); return this; },
      abortSignal() { return Promise.resolve({ error: { code: "TP402" } }); } };
  } }; } };
  await assert.rejects(criarAdaptadorPublicacaoCotacoes(cliente).publicar(10,
    { evento_id: 13, prazo: "2099-12-31", itens: [] }), e => e.respostaStatus === 400 && !e.resultadoIncerto);
  assert.equal(chamadas, 1);
});

test("referencias locais da preparacao consolidada resolvem sem executar modulos", () => {
  const base = path.join(__dirname, "..");
  for (const relativo of ["repositories/supabase/cotacoes-publicacao.cjs", "repositories/supabase/custos-transacao.cjs",
    "repositories/supabase/validacao-custos.cjs", "tests/cotacoes-publicacao-supabase.test.cjs",
    "tests/custos-transacao-supabase.test.cjs"]) {
    const arquivo = path.join(base, relativo);
    const texto = fs.readFileSync(arquivo, "utf8");
    for (const [, destino] of texto.matchAll(/require\(["'](\.[^"']+)["']\)/g)) {
      assert.ok(fs.existsSync(path.resolve(path.dirname(arquivo), destino)), `${relativo}: ${destino}`);
    }
    assert.doesNotMatch(texto, /publicacao-cotacao\.cjs|publicar_cotacao_evento|publicacao-cotacao-supabase/);
  }
  for (const relativo of ["../Banco de dados/rpc_publicar_cotacao.preparacao.sql",
    "../Banco de dados/rpc_substituir_custos_evento.preparacao.sql"]) {
    assert.ok(fs.existsSync(path.resolve(base, relativo)));
  }
  for (const relativo of ["PLANO_TRANSACOES_SUPABASE.md", "repositories/supabase/LEITURAS_PENDENTES.md"]) {
    const arquivo = path.join(base, relativo);
    for (const [, link] of fs.readFileSync(arquivo, "utf8").matchAll(/\]\(([^)]+)\)/g)) {
      if (/^https?:/.test(link)) continue;
      const caminho = decodeURIComponent(link.split("#")[0]);
      assert.ok(fs.existsSync(path.resolve(path.dirname(arquivo), caminho)), `${relativo}: ${link}`);
    }
  }
});
