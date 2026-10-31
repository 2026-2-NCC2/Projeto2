"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const configuracao = require("../config/banco.cjs");
const source = fs.readFileSync(path.join(__dirname, "../repositories/index.cjs"), "utf8");
const dominios = [
  ["usuarios", "usuarios", "criarRepositorioUsuarios"],
  ["eventos", "eventos", "criarRepositorioEventos"],
  ["custos", "custos", "criarRepositorioCustos"],
  ["cotacoes", "cotacoes", "criarRepositorioCotacoes"],
  ["propostas", "propostas", "criarRepositorioPropostas"],
  ["inscricoes", "inscricoes", "criarRepositorioInscricoes"],
  ["solicitacoesAcesso", "solicitacoes-acesso", "criarRepositorioSolicitacoesAcesso"],
];
const supabase = () => ({ DB_PROVIDER: "supabase", SUPABASE_URL: "https://projeto.invalid",
  SUPABASE_SECRET_KEY: "sb_secret_ficticia_exclusiva_de_teste" });

// Require fechado: somente configuracao pura e construtores reais dos repos.
// Nenhum driver, .env, SDK, socket ou executor de consultas pode ser carregado.
function carregar(env = {}, opcoes = {}) {
  const imports = [], construidos = [];
  const adapter = new Proxy({}, { get() { throw Error("Consulta/cliente inicializado indevidamente"); } });
  let clientes = 0;
  const context = { module: { exports: {} }, process: { env }, require(name) {
    imports.push(name);
    if (name === "../config/banco.cjs") return configuracao;
    if (name === "../isolamento.cjs") return { modoExecucao() {
      if (opcoes.falhaModo) throw opcoes.falhaModo;
      return opcoes.modo ?? "principal";
    } };
    const provider = env.DB_PROVIDER ?? "mysql";
    if (name === "../db") {
      assert.equal(provider, "mysql", "Supabase nao pode importar db.js");
      if (opcoes.falhaCliente) throw opcoes.falhaCliente;
      return adapter;
    }
    if (name === "../db-supabase.cjs") {
      assert.equal(provider, "supabase", "MySQL nao pode importar cliente Supabase");
      return { criarClienteSupabase(received) {
        assert.equal(received, env); clientes++;
        if (opcoes.falhaCliente) throw opcoes.falhaCliente;
        return adapter;
      } };
    }
    const dominio = dominios.find(([, arquivo]) => name === `./${provider}/${arquivo}.cjs`);
    assert.ok(dominio, `Importacao inesperada: ${name}`);
    if (opcoes.falhaRepositorio) throw opcoes.falhaRepositorio;
    const real = require(path.join(__dirname, "../repositories", provider, dominio[1] + ".cjs"));
    return { [dominio[2]](received) {
      assert.equal(received, adapter);
      const repo = real[dominio[2]](received);
      construidos.push({ dominio: dominio[0], repo, real });
      return repo;
    } };
  } };
  vm.runInNewContext(source, context);
  return { criar: context.module.exports.criarRepositorios, imports, construidos, adapter,
    clientes: () => clientes };
}

test("importacao e inerte: nao le ambiente nem importa dependencias", () => {
  const a = carregar(new Proxy({}, { get() { throw Error("Leitura antecipada do ambiente"); } }));
  assert.deepEqual(a.imports, []); assert.equal(a.clientes(), 0); assert.equal(a.construidos.length, 0);
});

for (const provider of [undefined, "mysql"]) {
  test(`MySQL ${provider ?? "padrao"}: sete repos existentes, um adaptador, nenhum Supabase`, () => {
    const env = provider ? { DB_PROVIDER: provider } : {};
    const before = { ...env }, a = carregar(env), bundle = a.criar();
    assert.equal(bundle.provider, "mysql"); assert.equal(a.construidos.length, 7);
    assert.equal(a.imports.filter(n => n === "../db").length, 1);
    assert.equal(a.imports.some(n => n.includes("supabase")), false); assert.equal(a.clientes(), 0);
    assert.deepEqual(env, before);
    for (const { dominio, repo, real } of a.construidos) {
      assert.equal(bundle[dominio], repo);
      const fabrica = dominios.find(d => d[0] === dominio)[2];
      assert.deepEqual(Object.keys(repo), Object.keys(real[fabrica](a.adapter)));
    }
  });
}

test("Supabase explicito: cliente unico compartilhado, contratos reais e nenhum MySQL/db.js", () => {
  const env = supabase(), before = { ...env }, a = carregar(env), bundle = a.criar();
  assert.equal(bundle.provider, "supabase"); assert.equal(a.clientes(), 1);
  assert.equal(a.construidos.length, 7);
  assert.equal(a.imports.some(n => n === "../db" || n.includes("/mysql/")), false);
  assert.deepEqual(env, before);
  for (const { dominio, repo, real } of a.construidos) {
    assert.equal(bundle[dominio], repo);
    const fabrica = dominios.find(d => d[0] === dominio)[2];
    assert.deepEqual(Object.keys(repo), Object.keys(real[fabrica](a.adapter)));
  }
  assert.equal(bundle.custos.excluirPorEvento, undefined); // nao fingir transacao REST
  assert.equal(bundle.cotacoes.inserirItem, undefined);
  assert.equal(typeof bundle.solicitacoesAcesso.decidir, "function");
});

test("provider invalido e recusado antes de importar clientes/repositorios", () => {
  for (const provider of ["", "postgres", "MYSQL", "Supabase", null, "../mysql", 1]) {
    const a = carregar({ DB_PROVIDER: provider });
    assert.throws(() => a.criar(), e => e.code === "DB_PROVIDER_INVALID");
    assert.equal(a.imports.some(n => n === "../db" || n.includes("supabase") || n.startsWith("./")), false);
  }
});

test("Supabase sem credenciais, URL insegura ou TLS desativado nao faz fallback", () => {
  for (const patch of [{ SUPABASE_URL: undefined }, { SUPABASE_SECRET_KEY: undefined },
    { SUPABASE_URL: "http://projeto.invalid" }, { SUPABASE_SECRET_KEY: "anon-ficticia" },
    { NODE_TLS_REJECT_UNAUTHORIZED: "0" }]) {
    const a = carregar({ ...supabase(), ...patch });
    assert.throws(() => a.criar(), e => ["SUPABASE_CONFIG", "SUPABASE_TLS"].includes(e.code));
    assert.equal(a.imports.length, 2); assert.equal(a.clientes(), 0);
  }
});

test("isolado: Supabase recusado; MySQL usa somente o adaptador db.js existente", () => {
  const sb = carregar(supabase(), { modo: "isolado" });
  assert.throws(() => sb.criar(), e => e.code === "DB_PROVIDER_ISOLATED");
  assert.equal(sb.imports.length, 2);
  const my = carregar({}, { modo: "isolado" });
  assert.equal(my.criar().provider, "mysql"); assert.equal(my.clientes(), 0);
  assert.equal(my.imports.includes("../db"), true);
});

test("falha do inicializador isolado propaga sem importar driver/repositorios", () => {
  const erro = Object.assign(Error("simulado"), { code: "ISOLATED_ENTRY" });
  const a = carregar({}, { falhaModo: erro });
  assert.throws(() => a.criar(), e => e === erro); assert.equal(a.imports.length, 2);
});

test("falha de cliente ou construtor nao troca provedor nem devolve conjunto parcial", () => {
  for (const env of [{}, supabase()]) {
    for (const etapa of ["falhaCliente", "falhaRepositorio"]) {
      const erro = Error("falha simulada"), a = carregar(env, { [etapa]: erro });
      assert.throws(() => a.criar(), e => e === erro);
      assert.equal(a.imports.some(n => (env.DB_PROVIDER === "supabase"
        ? n === "../db" || n.includes("/mysql/") : n.includes("supabase"))), false);
    }
  }
});

test("preparar repositorios nao remove o bloqueio de ativacao Supabase", () => {
  const env = supabase();
  assert.equal(carregar(env).criar().provider, "supabase");
  assert.throws(() => configuracao.validarInicializacaoBanco(env), e => e.code === "DB_PROVIDER_NOT_IMPLEMENTED");
  assert.equal(configuracao.validarInicializacaoBanco({}).provider, "mysql");
});
