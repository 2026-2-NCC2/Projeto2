"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { criarAdaptadorDecisaoAcesso: criar } = require("../repositories/supabase/solicitacoes-acesso-decisao.cjs");
const sucesso = status => ({ mensagem: status === "aprovado"
  ? "Solicitação aprovada com sucesso!" : "Solicitação rejeitada com sucesso!" });
const mensagemErro = "Erro interno ao analisar solicitação.";

// Somente transporte falso, nunca um executor PostgreSQL.
function mock(responder) {
  const chamadas = [];
  let sinal;
  return { chamadas, get sinal() { return sinal; }, cliente: { schema(esquema) {
    assert.equal(esquema, "public");
    return { rpc(nome, args, opcoes) {
      chamadas.push({ nome, args, opcoes });
      assert.deepEqual({ ...opcoes }, { get: false, head: false });
      return { retry(repetir) {
        assert.equal(repetir, false);
        return { abortSignal(signal) { sinal = signal; return Promise.resolve().then(() => responder(args)); } };
      } };
    } };
  } } };
}

// Oraculo: handler MySQL atual em VM. Repositorios e conexao sao falsos;
// rollback/snapshot aqui sao apenas modelo de teste, nao prova da RPC preparada.
function mysql(opcoes = {}) {
  const src = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const inicio = src.indexOf('app.patch("/solicitacoes-acesso/:id"');
  const fim = src.indexOf("// Evita o handler padrao", inicio);
  assert.ok(inicio >= 0 && fim > inicio);
  const estado = { perfil: opcoes.perfil ?? "participante", status: opcoes.status ?? "pendente" };
  const etapas = [];
  let pendente;
  let handler;
  const falhar = etapa => { if (opcoes.falharEm === etapa) throw Error("SQL SEGREDO"); };
  const conexao = {
    async beginTransaction() { etapas.push("begin"); falhar("begin"); pendente = { ...estado }; },
    async commit() { etapas.push("commit"); falhar("commit"); Object.assign(estado, pendente); },
    async rollback() { etapas.push("rollback"); pendente = undefined; }, release() { etapas.push("release"); },
  };
  const contextoHandler = {
    autenticar() {}, permitirPerfis: () => () => {}, console: { error() {} },
    app: { patch(_url, ...handlers) { handler = handlers.at(-1); } },
    db: { async getConnection() { etapas.push("conexao"); falhar("conexao"); return conexao; } },
    solicitacoesAcessoRepository: {
      async bloquearPorId(c, id) {
        assert.equal(c, conexao); etapas.push("lock"); falhar("lock");
        return opcoes.ausente || id !== 13 ? [] : [{ usuario_id: 9,
          perfil_solicitado: opcoes.perfilSolicitado ?? "fornecedor", status: pendente.status }];
      },
      async atualizarPerfilParticipante(c, perfil, usuario) {
        assert.equal(c, conexao); assert.equal(usuario, 9); etapas.push("perfil"); falhar("perfil");
        const afetados = opcoes.afetados ?? (pendente.perfil === "participante" ? 1 : 0);
        if (afetados === 1) pendente.perfil = perfil;
        return afetados;
      },
      async atualizarStatus(c, status, id) {
        assert.equal(c, conexao); assert.equal(id, 13); etapas.push("status"); falhar("status"); pendente.status = status;
      },
    },
  };
  contextoHandler.responderErroServico = require("./helpers/persistencia.cjs").responderErroServico;
  contextoHandler.servicos = { solicitacoesAcesso: require("../services/solicitacoes-acesso.cjs").criarServicoSolicitacoesAcesso({ db: contextoHandler.db, repositorios: { solicitacoesAcesso: contextoHandler.solicitacoesAcessoRepository } }) };
  vm.runInNewContext(src.slice(inicio, fim), contextoHandler);
  return { estado, etapas, async decidir(status, id) {
    if (arguments.length === 1) id = "13";
    const res = { statusCode: 200, status(n) { this.statusCode = n; return this; },
      json(data) { this.body = data; return this; } };
    await handler({ params: { id }, body: { status }, usuario: { id: 7, perfil: "admin" } }, res);
    return { status: res.statusCode, body: JSON.parse(JSON.stringify(res.body)) };
  } };
}

for (const perfil of ["organizador", "fornecedor"]) {
  test(`aprovacao para ${perfil}: resposta e fluxo coincidem com contrato MySQL`, async () => {
    const origem = mysql({ perfilSolicitado: perfil });
    const resultado = await origem.decidir("aprovado");
    assert.equal(resultado.status, 200);
    assert.deepEqual(origem.estado, { perfil, status: "aprovado" });
    assert.deepEqual(origem.etapas, ["conexao", "begin", "lock", "perfil", "status", "commit", "release"]);
    const m = mock(args => {
      assert.deepEqual(args, { p_admin_id: 7, p_solicitacao_id: "13", p_status: "aprovado" });
      return { data: { mensagem: "Solicitação aprovada com sucesso!" } };
    });
    assert.deepEqual(await criar(m.cliente).decidir(7, "13", "aprovado"), resultado.body);
    assert.equal(m.chamadas[0].nome, "decidir_solicitacao_acesso"); assert.equal(m.chamadas.length, 1);
  });
}

test("rejeicao nao altera nem exige perfil participante no contrato atual", async () => {
  for (const perfil of ["participante", "organizador", "fornecedor", "admin"]) {
    const origem = mysql({ perfil });
    const resultado = await origem.decidir("rejeitado");
    assert.equal(resultado.status, 200);
    assert.deepEqual(origem.estado, { perfil, status: "rejeitado" });
    assert.ok(!origem.etapas.includes("perfil"));
    const m = mock(() => ({ data: sucesso("rejeitado") }));
    assert.deepEqual(await criar(m.cliente).decidir(7, 13, "rejeitado"), resultado.body);
  }
});

test("solicitacao ausente preserva 404 e mensagem MySQL sem repetir RPC", async () => {
  const origem = mysql({ ausente: true }); const resultado = await origem.decidir("aprovado");
  const m = mock(() => ({ error: { code: "TA404", message: "SEGREDO" } }));
  await assert.rejects(criar(m.cliente).decidir(7, 13, "aprovado"), e =>
    e.respostaStatus === resultado.status && e.message === resultado.body.erro && !e.resultadoIncerto);
  assert.equal(resultado.status, 404); assert.equal(m.chamadas.length, 1);
});

for (const primeira of ["aprovado", "rejeitado"]) {
  test(`decisao repetida apos ${primeira}: conserva 409 sem nova mudanca de perfil`, async () => {
    const origem = mysql(); const resultado1 = await origem.decidir(primeira);
    const anterior = { ...origem.estado };
    const resultado2 = await origem.decidir(primeira === "aprovado" ? "rejeitado" : "aprovado");
    assert.equal(resultado1.status, 200); assert.equal(resultado2.status, 409);
    assert.deepEqual(origem.estado, anterior);
    let chamadas = 0;
    const m = mock(() => ++chamadas === 1 ? { data: resultado1.body } : { error: { code: "TA409" } });
    const a = criar(m.cliente);
    assert.deepEqual(await a.decidir(7, 13, primeira), resultado1.body);
    await assert.rejects(a.decidir(7, 13, primeira === "aprovado" ? "rejeitado" : "aprovado"),
      e => e.respostaStatus === 409 && e.message === resultado2.body.erro && !e.resultadoIncerto);
    assert.equal(m.chamadas.length, 2); // duas acoes explicitas, nao retry
  });
}

test("usuario nao participante e contagem diferente de uma preservam o outro conflito 409", async () => {
  for (const opcoes of [{ perfil: "organizador" }, { perfil: "fornecedor" }, { perfil: "admin" }, { afetados: 2 }]) {
    const origem = mysql(opcoes); const anterior = { ...origem.estado };
    const resultado = await origem.decidir("aprovado"); assert.equal(resultado.status, 409);
    assert.deepEqual(origem.estado, anterior); assert.ok(!origem.etapas.includes("status"));
    const m = mock(() => ({ error: { code: "TA412" } }));
    await assert.rejects(criar(m.cliente).decidir(7, 13, "aprovado"),
      e => e.respostaStatus === 409 && e.message === resultado.body.erro && !e.resultadoIncerto);
  }
});

test("validacao de ID/status conserva erros MySQL antes de criar cliente", async () => {
  for (const [id, status] of [[0, "aprovado"], [-1, "rejeitado"], [1.5, "aprovado"], [Infinity, "aprovado"],
    ["abc", "aprovado"], [undefined, "aprovado"], [13, "pendente"], [13, "Aprovado"], [13, "rejeitado "],
    [13, null], [13, { status: "aprovado", admin_id: 7 }]]) {
    const resultado = await mysql().decidir(status, id);
    const m = mock(() => { throw Error("Nao deve chamar"); });
    await assert.rejects(criar(m.cliente).decidir(7, id, status),
      e => e.respostaStatus === resultado.status && e.message === resultado.body.erro && !e.resultadoIncerto);
    assert.equal(m.chamadas.length, 0);
  }
});

test("ID permissivo mantido: coercoes e inteiros grandes delegados em texto ao parametro NUMERIC", async () => {
  for (const id of [" 13 ", "1.3e1", "0xd"]) {
    const m = mock(args => { assert.equal(args.p_solicitacao_id, "13"); return { data: sucesso("aprovado") }; });
    const origem = await mysql().decidir("aprovado", id);
    assert.deepEqual(await criar(m.cliente).decidir(7, id, "aprovado"), origem.body);
  }
  for (const id of [2147483648, Number.MAX_SAFE_INTEGER + 1, Number.MAX_VALUE]) {
    const origem = await mysql().decidir("aprovado", id); assert.equal(origem.status, 404);
    const m = mock(args => {
      assert.equal(typeof args.p_solicitacao_id, "string"); assert.equal(args.p_solicitacao_id, String(id));
      return { error: { code: "TA404" } };
    });
    await assert.rejects(criar(m.cliente).decidir(7, id, "aprovado"),
      e => e.respostaStatus === 404 && e.message === origem.body.erro);
  }
});

test("ator vem do argumento confiavel, sem aceitar identidade/status embutidos em corpo", async () => {
  for (const admin of [0, "7", null, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(criar().decidir(admin, 13, "aprovado"), e => e.respostaStatus === 403 && !e.resultadoIncerto);
  }
  const m = mock(args => { assert.equal(args.p_admin_id, 7); return { data: sucesso("aprovado") }; });
  await criar(m.cliente).decidir(7, 13, "aprovado", { admin_id: 999 });
  const semPermissao = mock(() => ({ error: { code: "TA403" } }));
  await assert.rejects(criar(semPermissao.cliente).decidir(7, 13, "aprovado"),
    e => e.respostaStatus === 403 && !e.resultadoIncerto);
});

for (const etapa of ["conexao", "begin", "lock", "perfil", "status", "commit"]) {
  test(`falha simulada em ${etapa}: contrato de erro, nenhuma confirmacao ou retry`, async () => {
    const origem = mysql({ falharEm: etapa }); const antes = { ...origem.estado };
    const resultado = await origem.decidir("aprovado");
    assert.equal(resultado.status, 500); assert.deepEqual(origem.estado, antes);
    if (etapa !== "conexao") assert.deepEqual(origem.etapas.slice(-2), ["rollback", "release"]);
    const m = mock(() => ({ error: { code: "XX000", message: `SQL SEGREDO ${etapa}`, details: "SEGREDO" } }));
    await assert.rejects(criar(m.cliente).decidir(7, 13, "aprovado"), e =>
      e.respostaStatus === 500 && e.message === resultado.body.erro && e.resultadoIncerto && !e.cause);
    assert.equal(m.chamadas.length, 1);
  });
}

test("erros de negocio/tecnicos e falha forjada sao sanitizados", async () => {
  for (const [code, status] of [["TA400", 400], ["TA403", 403], ["TA404", 404], ["TA409", 409],
    ["TA412", 409], ["23503", 500], ["40P01", 500], ["40001", 500], ["57014", 500], ["toString", 500]]) {
    const m = mock(() => ({ data: sucesso("aprovado"), error: { code, message: "SEGREDO" } }));
    await assert.rejects(criar(m.cliente).decidir(7, 13, "aprovado"), e =>
      e.respostaStatus === status && e.resultadoIncerto === (status === 500) && !e.message.includes("SEGREDO"));
    assert.equal(m.chamadas.length, 1);
  }
  const m = mock(() => { throw Object.assign(Error("SEGREDO"), { respostaStatus: 409, resultadoIncerto: false }); });
  await assert.rejects(criar(m.cliente).decidir(7, 13, "aprovado"),
    e => e.respostaStatus === 500 && e.resultadoIncerto && e.message === mensagemErro);
});

test("SQLSTATE malformado nao pode virar conflito confirmado por coercao de chave", async () => {
  for (const code of [["TA409"], ["TA404"], ["TA400"], { toString: () => "TA412" }]) {
    const m = mock(() => ({ error: { code, message: "SEGREDO" } }));
    await assert.rejects(criar(m.cliente).decidir(7, 13, "aprovado"), e =>
      e.code === "DECISAO_RPC" && e.respostaStatus === 500 && e.resultadoIncerto && e.message === mensagemErro);
    assert.equal(m.chamadas.length, 1);
  }
});

test("respostas malformadas ou de outra decisao ficam incertas, sem reenvio", async () => {
  for (const data of [null, undefined, [], Array(1), "sucesso", 1, {}, { mensagem: null },
    sucesso("rejeitado"), { mensagem: new String("Solicitação aprovada com sucesso!") },
    Object.create(sucesso("aprovado")), { mensagem: "Solicitação aprovada com sucesso!\n" }]) {
    const m = mock(() => ({ data }));
    await assert.rejects(criar(m.cliente).decidir(7, 13, "aprovado"),
      e => e.respostaStatus === 500 && e.resultadoIncerto && e.message === mensagemErro);
    assert.equal(m.chamadas.length, 1);
  }
});

test("retorno preserva somente mensagem, sem propagar dados do usuario", async () => {
  const data = { ...sucesso("aprovado"), usuario_id: 9, perfil: "fornecedor", extra: "privado" };
  const original = structuredClone(data);
  const m = mock(() => ({ data }));
  assert.deepEqual(await criar(m.cliente).decidir(7, 13, "aprovado"), sucesso("aprovado"));
  assert.deepEqual(data, original);
});

test("timeout aborta, nao repete e ignora sucesso tardio apos possivel commit", async () => {
  let resolver;
  const m = mock(() => new Promise(resolve => { resolver = resolve; }));
  await assert.rejects(criar(m.cliente, { timeoutMs: 15 }).decidir(7, 13, "aprovado"),
    e => e.code === "DECISAO_TIMEOUT" && e.resultadoIncerto && e.message === mensagemErro);
  assert.equal(m.sinal.aborted, true);
  resolver({ data: sucesso("aprovado") }); await Promise.resolve(); assert.equal(m.chamadas.length, 1);
});

test("fabrica tardia reutilizada e configuracao invalida nao inicializa SDK", async () => {
  let criacoes = 0;
  const m = mock(args => ({ data: sucesso(args.p_status) }));
  const contexto = { module: { exports: {} }, AbortController, setTimeout, clearTimeout, require(nome) {
    assert.equal(nome, "../../db-supabase.cjs"); return { criarClienteSupabase() { criacoes++; return m.cliente; } };
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../repositories/supabase/solicitacoes-acesso-decisao.cjs"), "utf8"), contexto);
  const criarEmVM = contexto.module.exports.criarAdaptadorDecisaoAcesso;
  for (const timeoutMs of [0, -1, Infinity, 60001, "15"]) assert.throws(() => criarEmVM(undefined, { timeoutMs }));
  const a = criarEmVM(); assert.equal(criacoes, 0);
  await assert.rejects(a.decidir(7, 0, "aprovado")); assert.equal(criacoes, 0);
  await a.decidir(7, 13, "aprovado"); await a.decidir(7, 14, "rejeitado"); assert.equal(criacoes, 1);
});

test("SDK instalado: POST unico com JSON correto e 503 sem reenvio", async () => {
  const { createClient } = require("@supabase/supabase-js");
  for (const status of [200, 503]) {
    let chamadas = 0;
    const cliente = createClient("https://exemplo.invalid", "sb_secret_exclusivamente_ficticio", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (url, opcoes) => {
        chamadas++; assert.equal(String(url), "https://exemplo.invalid/rest/v1/rpc/decidir_solicitacao_acesso");
        assert.equal(opcoes.method, "POST"); assert.deepEqual(JSON.parse(opcoes.body),
          { p_admin_id: 7, p_solicitacao_id: "13", p_status: "aprovado" });
        return new Response(JSON.stringify(status === 200 ? sucesso("aprovado") : { code: "53300", message: "SEGREDO" }),
          { status, headers: { "Content-Type": "application/json" } });
      } },
    });
    const p = criar(cliente).decidir(7, 13, "aprovado");
    if (status === 200) assert.deepEqual(await p, sucesso("aprovado"));
    else await assert.rejects(p, e => e.respostaStatus === 500 && e.resultadoIncerto);
    assert.equal(chamadas, 1);
  }
});

// Inspecao estrutural: nao compila PL/pgSQL nem comprova locks/rollback.
test("SQL preparado: administracao, lock antes do estado, perfil condicional e enums distintos", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../../Banco de dados/rpc_decidir_solicitacao_acesso.preparacao.sql"), "utf8").replace(/--[^\n]*/g, "");
  assert.match(sql, /VOLATILE\s+SECURITY INVOKER\s+SET search_path = ''/);
  assert.match(sql, /current_user <> 'service_role'/);
  assert.match(sql, /u\.id = p_admin_id AND u\.perfil = 'admin'/);
  const lock = sql.indexOf("SELECT s.usuario_id"); const estado = sql.indexOf("IF v_solicitacao.status");
  const aprovar = sql.indexOf("IF p_status = 'aprovado'"); const perfil = sql.indexOf("UPDATE public.usuarios");
  const finalizar = sql.indexOf("UPDATE public.solicitacoes_acesso");
  assert.ok(sql.indexOf("PERFORM u.id") < lock && lock < estado && estado < aprovar && aprovar < perfil && perfil < finalizar);
  assert.match(sql.slice(lock, estado), /WHERE s\.id = p_solicitacao_id::integer\s+FOR UPDATE/);
  assert.match(sql.slice(lock, estado), /IF NOT FOUND/);
  assert.match(sql.slice(aprovar, finalizar), /perfil_solicitado::text\)::public\.usuarios_perfil_enum/);
  assert.match(sql.slice(aprovar, finalizar), /WHERE id = v_solicitacao.usuario_id AND perfil = 'participante'/);
  assert.match(sql.slice(aprovar, finalizar), /GET DIAGNOSTICS v_usuarios_afetados = ROW_COUNT/);
  assert.match(sql.slice(aprovar, finalizar), /IF v_usuarios_afetados <> 1/);
  assert.match(sql.slice(aprovar, finalizar), /END IF;\s+END IF;/);
  assert.equal((sql.match(/UPDATE public\.usuarios/g) || []).length, 1);
  assert.match(sql.slice(finalizar), /SET status = p_status::public\.solicitacoes_acesso_status_enum/);
  assert.doesNotMatch(sql, /\b(GRANT|REVOKE|ALTER|DROP|COMMIT|ROLLBACK|NOWAIT|SKIP LOCKED)\b|OR REPLACE|EXCEPTION\s+WHEN/i);
  assert.match(sql, /p_solicitacao_id numeric/);
  assert.match(sql, /p_solicitacao_id > 2147483647/);
});

test("schema esperado mantem INTEGER e os rotulos dos tres ENUMs sem alteracoes", () => {
  const schema = fs.readFileSync(path.join(__dirname, "../../Banco de dados/trocaticket_supabase.sql"), "utf8");
  for (const [tipo, rotulos] of [["usuarios_perfil_enum", "'organizador','fornecedor','participante','admin'"],
    ["solicitacoes_acesso_perfil_solicitado_enum", "'organizador','fornecedor'"],
    ["solicitacoes_acesso_status_enum", "'pendente','aprovado','rejeitado'"]]) {
    assert.ok(schema.includes(`CREATE TYPE public."${tipo}" AS ENUM (${rotulos});`));
  }
  // Nao passar o dump completo ao assert: uma falha nao pode imprimir registros.
  assert.ok(/CREATE TABLE public\."solicitacoes_acesso"\s*\(\s*"id" integer/.test(schema), "PK esperada: INTEGER");
});
