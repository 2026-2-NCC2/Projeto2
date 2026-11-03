"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { lerConfiguracaoBanco, validarInicializacaoBanco } = require("../config/banco.cjs");

const json = valor => JSON.parse(JSON.stringify(valor));
const supabase = () => ({ DB_PROVIDER: "supabase", SUPABASE_URL: "https://projeto.example.invalid/",
  SUPABASE_SECRET_KEY: "sb_secret_exclusivamente_ficticia_para_testes" });

test("provider ausente ou mysql preserva selecao MySQL sem exigir Supabase", () => {
  for (const env of [{}, { DB_PROVIDER: "mysql" }, { SUPABASE_URL: "invalida", SUPABASE_SECRET_KEY: "invalida" }]) {
    assert.deepEqual(validarInicializacaoBanco(env), { provider: "mysql" });
    assert.ok(Object.isFrozen(lerConfiguracaoBanco(env)));
  }
});

test("provider invalido nunca e normalizado ou substituido por MySQL", () => {
  for (const DB_PROVIDER of ["", " ", "MYSQL", "Supabase", " mysql", "supabase ", "postgres", null, 0, false, []]) {
    assert.throws(() => validarInicializacaoBanco({ DB_PROVIDER }), { code: "DB_PROVIDER_INVALID" });
  }
});

test("configuracao ou modo de execucao invalido e recusado", () => {
  for (const env of [null, [], "mysql"]) assert.throws(() => lerConfiguracaoBanco(env), { code: "DB_CONFIG_MODE" });
  for (const modo of ["", "teste", null]) assert.throws(() => lerConfiguracaoBanco({}, modo), { code: "DB_CONFIG_MODE" });
});

test("configuracao Supabase valida usa apenas URL e secret key explicitas", () => {
  const env = { ...supabase(), DB_HOST: "nao-usar", DB_PASSWORD: "nao-usar", JWT_SECRET: "nao-usar" };
  const copia = { ...env };
  assert.deepEqual(lerConfiguracaoBanco(env), { provider: "supabase", url: "https://projeto.example.invalid",
    secretKey: env.SUPABASE_SECRET_KEY });
  assert.deepEqual(env, copia);
  assert.ok(Object.isFrozen(lerConfiguracaoBanco(env)));
});

test("Supabase sem URL ou secret key nao usa variaveis alternativas", () => {
  for (const chave of ["SUPABASE_URL", "SUPABASE_SECRET_KEY"]) {
    for (const valor of [undefined, null, "", " ", 123]) {
      assert.throws(() => lerConfiguracaoBanco({ ...supabase(), [chave]: valor,
        SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "legada", DATABASE_URL: "nao-usar" }), { code: "SUPABASE_CONFIG" });
    }
  }
});

test("URL Supabase recusa HTTP, credenciais, caminho, query, fragmento e espacos", () => {
  for (const SUPABASE_URL of ["invalida", "http://projeto.example.invalid", "file:///privado", "//projeto.example.invalid",
    "https://usuario:senha@projeto.example.invalid", "https://projeto.example.invalid/rest/v1",
    "https://projeto.example.invalid?segredo=privado", "https://projeto.example.invalid#privado", " https://projeto.example.invalid"]) {
    assert.throws(() => lerConfiguracaoBanco({ ...supabase(), SUPABASE_URL }), erro => {
      assert.equal(erro.code, "SUPABASE_CONFIG");
      assert.ok(!erro.message.includes(SUPABASE_URL));
      return true;
    });
  }
});

test("secret key recusa chave publica, JWT e formatos malformados sem revelar valores", () => {
  for (const SUPABASE_SECRET_KEY of ["sb_publishable_ficticia", "eyJhbGciOiJIUzI1NiJ9.usuario.assinatura",
    "sb_secret_", "sb_secret_espaco final", "sb_secret_privado\n", "sb_secret_privado\0"]) {
    assert.throws(() => lerConfiguracaoBanco({ ...supabase(), SUPABASE_SECRET_KEY }), erro => {
      assert.equal(erro.code, "SUPABASE_CONFIG");
      assert.ok(!erro.message.includes(SUPABASE_SECRET_KEY));
      return true;
    });
  }
});

test("TLS desativado e recusado sem alterar o ambiente", () => {
  const env = { ...supabase(), NODE_TLS_REJECT_UNAUTHORIZED: "0" };
  assert.throws(() => lerConfiguracaoBanco(env), { code: "SUPABASE_TLS" });
  assert.equal(env.NODE_TLS_REJECT_UNAUTHORIZED, "0");
});

test("Supabase valido continua proibido na inicializacao ate implementar repositorios", () => {
  assert.throws(() => validarInicializacaoBanco(supabase()), erro => {
    assert.equal(erro.code, "DB_PROVIDER_NOT_IMPLEMENTED");
    assert.match(erro.message, /Repositorios Supabase ainda nao implementados/);
    assert.ok(!erro.message.includes(supabase().SUPABASE_SECRET_KEY));
    return true;
  });
});

test("isolado aceita apenas MySQL e ignora credenciais Supabase sem utiliza-las", () => {
  assert.deepEqual(validarInicializacaoBanco({ ...supabase(), DB_PROVIDER: undefined }, "isolado"), { provider: "mysql" });
  assert.deepEqual(validarInicializacaoBanco({ DB_PROVIDER: "mysql" }, "isolado"), { provider: "mysql" });
  assert.throws(() => validarInicializacaoBanco(supabase(), "isolado"), { code: "DB_PROVIDER_ISOLATED" });
});

function carregarCliente({ env = supabase(), modo = "principal", browser = false, falhaSDK = false, sdkAusente = false } = {}) {
  const imports = [], criacoes = [], cliente = {};
  const contexto = { module: { exports: {} }, process: { env }, ...(browser ? { window: {} } : {}),
    require(nome) {
      imports.push(nome);
      if (nome === "./config/banco.cjs") return { lerConfiguracaoBanco };
      if (nome === "./isolamento.cjs") return { modoExecucao: () => modo };
      assert.equal(nome, "@supabase/supabase-js");
      if (sdkAusente) throw Object.assign(Error("caminho privado"), { code: "MODULE_NOT_FOUND" });
      return { createClient(...args) {
        criacoes.push(args);
        if (falhaSDK) throw Error("SDK: " + env.SUPABASE_SECRET_KEY);
        return cliente;
      } };
    },
  };
  vm.runInNewContext(readFileSync(path.join(__dirname, "../db-supabase.cjs"), "utf8"), contexto);
  return { criar: contexto.module.exports.criarClienteSupabase, imports, criacoes, cliente };
}

test("importar fabrica Supabase nao importa SDK, le .env ou cria cliente", () => {
  const a = carregarCliente();
  assert.deepEqual(a.imports, ["./config/banco.cjs"]);
  assert.deepEqual(a.criacoes, []);
});

test("cliente backend desativa persistencia, renovacao e deteccao na URL", () => {
  const a = carregarCliente();
  assert.strictEqual(a.criar(), a.cliente);
  assert.equal(a.criacoes.length, 1);
  assert.deepEqual(json(a.criacoes[0]), ["https://projeto.example.invalid", supabase().SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }]);
});

test("cliente nao encaminha JWT proprio, token de usuario ou headers externos", () => {
  const a = carregarCliente({ env: { ...supabase(), JWT_SECRET: "jwt-proprio-ficticio",
    Authorization: "Bearer usuario-ficticio", accessToken: "usuario-ficticio", headers: { Authorization: "usuario-ficticio" } } });
  a.criar();
  assert.doesNotMatch(JSON.stringify(a.criacoes), /usuario-ficticio|jwt-proprio-ficticio/);
  assert.deepEqual(Object.keys(a.criacoes[0][2]), ["auth"]);
});

test("fabrica recusa modo MySQL, isolado, browser e TLS inseguro antes de importar SDK", () => {
  for (const [opcoes, code] of [[{ env: {} }, "SUPABASE_PROVIDER"], [{ modo: "isolado" }, "DB_PROVIDER_ISOLATED"],
    [{ browser: true }, "SUPABASE_BACKEND_ONLY"], [{ env: { ...supabase(), NODE_TLS_REJECT_UNAUTHORIZED: "0" } }, "SUPABASE_TLS"]]) {
    const a = carregarCliente(opcoes);
    assert.throws(() => a.criar(), { code });
    assert.ok(!a.imports.includes("@supabase/supabase-js"));
    assert.deepEqual(a.criacoes, []);
  }
});

test("falha de criacao do SDK e sanitizada sem fallback ou repeticao", () => {
  const a = carregarCliente({ falhaSDK: true });
  assert.throws(() => a.criar(), erro => {
    assert.equal(erro.code, "SUPABASE_CLIENT");
    assert.ok(!erro.message.includes(supabase().SUPABASE_SECRET_KEY));
    assert.equal(erro.cause, undefined);
    return true;
  });
  assert.equal(a.criacoes.length, 1);
});

test("SDK ausente resulta em erro sanitizado, sem fallback MySQL", () => {
  const a = carregarCliente({ sdkAusente: true });
  assert.throws(() => a.criar(), erro => {
    assert.equal(erro.code, "SUPABASE_CLIENT");
    assert.doesNotMatch(erro.message, /caminho privado|MODULE_NOT_FOUND/);
    return true;
  });
  assert.deepEqual(a.criacoes, []);
  assert.ok(!a.imports.some(nome => /mysql|\.\/db$/.test(nome)));
});

// Executa server.js e db.js reais, com drivers, dotenv e HTTP substituidos.
// Nenhum require fora da lista fechada pode carregar SDK, rede ou arquivos privados.
function iniciarSimulado({ env = {}, modo = "principal", dotenv = {} } = {}) {
  env = { JWT_SECRET: "segredo-ficticio-exclusivo-dos-testes-de-provider-12345", ...env };
  const estado = { imports: [], dotenv: 0, pools: [], isolados: 0, escutas: [], rotas: [] };
  const pool = { getConnection() { throw Error("Consulta inesperada"); } }, isolado = { getConnection() { throw Error("Consulta inesperada"); } };
  const app = { use() {}, listen(...args) { estado.escutas.push(args); } };
  for (const metodo of ["get", "post", "put", "patch", "delete"]) app[metodo] = rota => estado.rotas.push(`${metodo} ${rota}`);
  const dependencias = {
    express: Object.assign(() => app, { json: () => () => {} }), bcryptjs: {}, jsonwebtoken: {}, cors: () => () => {},
    "./config/banco.cjs": require("../config/banco.cjs"),
    "./isolamento.cjs": { modoExecucao: () => modo, obterBancoIsolado() { estado.isolados++; return isolado; } },
    dotenv: { config() { estado.dotenv++; for (const [k, v] of Object.entries(dotenv)) if (env[k] === undefined) env[k] = v; } },
    "mysql2/promise": { createPool(opcoes) { estado.pools.push(opcoes); return pool; } },
  };
  for (const dominio of ["usuarios", "eventos", "custos", "cotacoes", "propostas", "inscricoes", "solicitacoes-acesso"]) {
    dependencias[`./repositories/mysql/${dominio}.cjs`] = require(`../repositories/mysql/${dominio}.cjs`);
  }
  function carregar(arquivo, principal = false) {
    const modulo = { exports: {} };
    const requerer = nome => {
      if (arquivo === "repositories/index.cjs") {
        if (nome.startsWith("../")) nome = nome.slice(1);
        else if (nome.startsWith("./mysql/")) nome = "./repositories/" + nome.slice(2);
      }
      estado.imports.push(nome);
      if (nome === "./config/supervisor-cutover.cjs") return { criarSupervisor: () => require("../config/supervisor-cutover.cjs").criarSupervisor({ estado: { ler: () => ({versao:1,congelado:false,selado:false,instancias:[]}), gravar() { throw Error("Escrita privada proibida no harness"); } } }) };
      if (nome === "./db") return carregar("db.js");
      if (nome === "./repositories/index.cjs") return carregar("repositories/index.cjs");
      if (nome.startsWith("./services/")) return require("../" + nome.slice(2));
      assert.ok(Object.hasOwn(dependencias, nome), "Importacao proibida: " + nome);
      return dependencias[nome];
    };
    requerer.main = principal ? modulo : {};
    vm.runInNewContext(readFileSync(path.join(__dirname, "..", arquivo), "utf8"), {
      module: modulo, require: requerer, process: { env }, Buffer, console: { log() {}, error() {} },
    });
    return modulo.exports;
  }
  try { return { estado, app: carregar("server.js", true) }; }
  catch (erro) { return { estado, erro }; }
}

for (const DB_PROVIDER of [undefined, "mysql"]) test(`startup ${DB_PROVIDER ?? "padrao"}: sete repositorios MySQL e 29 rotas preservados`, () => {
  const a = iniciarSimulado({ env: { DB_PROVIDER, DB_HOST: "host-ficticio", DB_PORT: "3306", DB_USER: "usuario-ficticio",
    DB_PASSWORD: "senha-ficticia", DB_NAME: "trocaticket" } });
  assert.equal(a.erro, undefined);
  assert.equal(a.estado.pools.length, 1);
  assert.deepEqual(json(a.estado.pools[0]), { host: "host-ficticio", port: 3306, user: "usuario-ficticio",
    password: "senha-ficticia", database: "trocaticket", waitForConnections: true, connectionLimit: 10 });
  assert.equal(a.estado.rotas.length, 29);
  assert.equal(a.estado.imports.filter(nome => nome.startsWith("./repositories/mysql/")).length, 7);
  assert.equal(a.estado.escutas.length, 1);
  assert.equal(a.estado.escutas[0][0], 3001);
  assert.ok(!a.estado.imports.some(nome => /supabase/.test(nome)));
});

for (const [env, code] of [[{ DB_PROVIDER: "invalid" }, "DB_PROVIDER_INVALID"], [supabase(), "DB_PROVIDER_NOT_IMPLEMENTED"],
  [{ DB_PROVIDER: "supabase" }, "SUPABASE_CONFIG"]]) test(`startup recusa ${code} antes de pool, SDK, repositorios ou HTTP`, () => {
  const a = iniciarSimulado({ env });
  assert.equal(a.erro?.code, code);
  assert.deepEqual(a.estado.pools, []);
  assert.deepEqual(a.estado.escutas, []);
  assert.deepEqual(a.estado.rotas, []);
  assert.ok(!a.estado.imports.includes("mysql2/promise"));
  assert.ok(!a.estado.imports.some(nome => /supabase|repositories/.test(nome)));
});

test("selecao considera configuracao carregada por dotenv antes de criar o pool", () => {
  const a = iniciarSimulado({ dotenv: supabase() });
  assert.equal(a.erro?.code, "DB_PROVIDER_NOT_IMPLEMENTED");
  assert.deepEqual(a.estado.pools, []);
  assert.deepEqual(a.estado.escutas, []);
});

test("variaveis HOMOLOG_ no dotenv preservam startup MySQL e bloqueio Supabase normal", () => {
  const dotenv = { HOMOLOG_SUPABASE_URL: "https://gnwybroqfvwosiqzsfla.supabase.co",
    HOMOLOG_SUPABASE_SECRET_KEY: "sb_secret_homologacao_ficticia", HOMOLOG_JWT_SECRET: "exclusivo_ficticio" };
  const mysql = iniciarSimulado({ dotenv });
  assert.equal(mysql.erro, undefined); assert.equal(mysql.estado.pools.length, 1);
  assert.ok(!mysql.estado.imports.some(n => /supabase|homologacao/.test(n)));
  const bloqueado = iniciarSimulado({ dotenv: { ...dotenv, ...supabase() } });
  assert.equal(bloqueado.erro?.code, "DB_PROVIDER_NOT_IMPLEMENTED");
  assert.deepEqual(bloqueado.estado.pools, []); assert.deepEqual(bloqueado.estado.escutas, []);
});

test("provider explicito do processo prevalece sobre dotenv sem fallback entre bancos", () => {
  const a = iniciarSimulado({ env: { DB_PROVIDER: "mysql" }, dotenv: supabase() });
  assert.equal(a.erro, undefined);
  assert.equal(a.estado.pools.length, 1);
  assert.ok(!a.estado.imports.some(nome => /supabase/.test(nome)));
});

test("isolado usa so adaptador validado, sem dotenv, pool principal ou importacao Supabase", () => {
  const a = iniciarSimulado({ modo: "isolado", env: { ...supabase(), DB_PROVIDER: undefined, PORT: "3107" } });
  assert.equal(a.erro, undefined);
  assert.equal(a.estado.isolados, 1);
  assert.equal(a.estado.dotenv, 0);
  assert.deepEqual(a.estado.pools, []);
  assert.deepEqual(a.estado.escutas, []);
  assert.equal(a.estado.rotas.length, 29);
  assert.ok(!a.estado.imports.some(nome => /supabase|mysql2|dotenv/.test(nome)));
});

test("isolado com provider Supabase falha antes de entregar adaptador ou aceitar requisicoes", () => {
  const a = iniciarSimulado({ modo: "isolado", env: supabase() });
  assert.equal(a.erro?.code, "DB_PROVIDER_ISOLATED");
  assert.equal(a.estado.isolados, 0);
  assert.equal(a.estado.dotenv, 0);
  assert.deepEqual(a.estado.pools, []);
  assert.deepEqual(a.estado.escutas, []);
  assert.ok(!a.estado.imports.some(nome => /supabase|mysql2|dotenv/.test(nome)));
});
