"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const isolamento = require("../isolamento.cjs");

const raiz = path.resolve(__dirname, "..");
const config = () => ({ ...isolamento.ESPERADO, password: "senha-ficticia-apenas-para-unitarios" });
const erro = code => Object.assign(new Error("SQL e dados sensiveis que nao podem sair do adaptador"), { code, sql: "SQL PRIVADO", password: "SEGREDO" });
const nunca = () => new Promise(() => {});

// Nenhum fake possui acesso a driver, rede, banco ou processos externos.
function bancoFake(opcoes = {}) {
  const estado = {
    raws: [], sql: [], metodos: [], verificacoes: 0, processo: 0, alternativas: [],
    processoAtual: opcoes.processo ?? { pid: 4321, nome: "mysqld" },
  };
  const deps = {
    tempoMs: opcoes.tempoMs ?? 100,
    criarConexao(settings) {
      estado.alternativas.push(settings);
      const raw = new EventEmitter();
      raw.threadId = 123;
      raw.destruicoes = 0;
      raw.destroy = () => { raw.destruicoes++; };
      raw.connect = callback => {
        raw.concluirConexao = callback;
        if (!opcoes.conexaoPendente) queueMicrotask(() => callback(opcoes.erroConectar));
      };
      const id = {
        porta: 3307, diretorio: `${isolamento.ESPERADO.datadir}\\`, banco: "trocaticket",
        versao: "10.4.32-MariaDB", arquivo_pid: isolamento.ESPERADO.pidFile,
        endereco: "127.0.0.1", conexao_id: 123, usuario: "trocaticket_isolado@localhost",
        ...opcoes.identidade,
      };
      async function executar(metodo, ...args) {
        if (args[0] === isolamento.SQL_IDENTIDADE) {
          estado.verificacoes++;
          if (opcoes.identidadePendente) return nunca();
          return [opcoes.linhas ?? [id], []];
        }
        estado.metodos.push(metodo);
        estado.sql.push(args);
        if (opcoes.operacao) return opcoes.operacao(metodo, ...args);
        return [[{ resultado: "simulado" }], ["campos"]];
      }
      raw.promise = () => Object.fromEntries(["query", "execute", "beginTransaction", "commit", "rollback"]
        .map(metodo => [metodo, (...args) => executar(metodo, ...args)]));
      estado.raws.push(raw);
      return raw;
    },
    realpath: async caminho => opcoes.junction ? "C:\\xampp\\mysql\\data" : caminho,
    readFile: async () => opcoes.pidTexto ?? "4321\r\n",
    consultarProcesso: async signal => {
      estado.processo++;
      estado.signal = signal;
      if (opcoes.processoPendente) return nunca();
      return estado.processoAtual;
    },
  };
  return { deps, estado };
}

function moduloSimulado(nome, { env = {}, stubs = {}, principal = false, mainFile } = {}) {
  const arquivo = path.join(raiz, nome);
  const modulo = { exports: {}, filename: arquivo };
  const processo = new EventEmitter();
  processo.env = env;
  processo.argv = ["node", arquivo];
  const logs = [];
  const carregar = id => Object.hasOwn(stubs, id) ? stubs[id] : require(id);
  carregar.main = principal ? modulo : { filename: mainFile ?? path.join(raiz, "scripts", "iniciar-backend-isolado.cjs") };
  const contexto = vm.createContext({
    require: carregar, module: modulo, exports: modulo.exports, __dirname: path.dirname(arquivo),
    __filename: arquivo, process: processo, setTimeout, clearTimeout, AbortController,
    console: { log: (...args) => logs.push(args), error: (...args) => logs.push(args) },
  });
  vm.runInContext(readFileSync(arquivo, "utf8"), contexto, { filename: arquivo });
  return { modulo: modulo.exports, processo, logs };
}

function appFake(opcoes = {}) {
  const estado = { chamadas: [], fechamentos: 0, idle: 0, todas: 0 };
  const servidor = new EventEmitter();
  servidor.listening = false;
  servidor.close = callback => {
    estado.fechamentos++;
    servidor.listening = false;
    if (!opcoes.fechamentoPendente) queueMicrotask(() => callback?.());
  };
  servidor.closeIdleConnections = () => { estado.idle++; };
  servidor.closeAllConnections = () => { estado.todas++; };
  const app = {
    listen(port, host) {
      estado.chamadas.push([port, host]);
      if (!opcoes.escutaPendente) queueMicrotask(() => {
        if (opcoes.erroEscuta) servidor.emit("error", opcoes.erroEscuta);
        else { servidor.listening = true; servidor.emit("listening"); }
      });
      return servidor;
    },
  };
  return { app, servidor, estado };
}

function startupFake(opcoes = {}) {
  const carregado = moduloSimulado("isolamento.cjs", { env: opcoes.env ?? {} });
  const banco = bancoFake(opcoes.banco);
  const http = appFake(opcoes.http);
  let carregamentos = 0;
  const deps = {
    banco: banco.deps, tempoMs: opcoes.tempoMs ?? 100, eventos: carregado.processo,
    gerarJwt: () => "a".repeat(64),
    carregarApp: () => {
      carregamentos++;
      assert.equal(carregado.modulo.modoExecucao(), "isolado");
      assert.ok(carregado.modulo.obterBancoIsolado());
      assert.equal(banco.estado.verificacoes, 1);
      return http.app;
    },
  };
  return { iso: carregado.modulo, processo: carregado.processo, banco, http, deps, carregamentos: () => carregamentos };
}

test("valida somente configuracao completa, fixa e sem opcoes alternativas", () => {
  const valida = isolamento.validarConfiguracao(config());
  assert.ok(Object.isFrozen(valida));
  for (const invalida of [undefined, null, [], {}, { ...config(), port: 3306 },
    { ...config(), port: "3307" }, { ...config(), host: "localhost" },
    { ...config(), httpHost: "0.0.0.0" }, { ...config(), httpPort: 3001 },
    { ...config(), database: "mysql" }, { ...config(), user: "root" },
    { ...config(), password: "" }, { ...config(), password: "curta" },
    { ...config(), version: "10.4.31" }, { ...config(), datadir: "C:\\xampp\\mysql\\data" },
    { ...config(), socketPath: "socket" }, { ...config(), uri: "mysql://localhost:3306" },
    { ...config(), ssl: {} }, { ...config(), stream: {} }, { ...config(), jwtSecret: "herdado" },
  ]) assert.throws(() => isolamento.validarConfiguracao(invalida), { code: "ISOLATED_CONFIG" });
})

test("recusa variaveis herdadas, preloads e modos conflitantes", () => {
  isolamento.validarAmbiente({ PATH: "simulado" });
  for (const chave of ["DB_HOST", "db_password", "DB_PORT", "DB_NAME", "JWT_SECRET", "PORT", "DOTENV_CONFIG_PATH", "NODE_OPTIONS", "NODE_PATH"]) {
    assert.throws(() => isolamento.validarAmbiente({ [chave]: "qualquer" }), { code: "ISOLATED_ENV" });
  }
  assert.throws(() => isolamento.validarAmbiente({ TROCATICKET_AMBIENTE: "principal" }), { code: "ISOLATED_ENV" });
})

test("carrega somente arquivo externo esperado e recusa redirecionamentos e JSON invalido", async () => {
  const deps = { realpath: async p => p, readFile: async () => JSON.stringify(config()) };
  assert.equal((await isolamento.carregarConfiguracao(isolamento.ARQUIVO_CONFIG, deps)).port, 3307);
  for (const arquivo of [undefined, ".env", "C:\\xampp\\backend-isolado.json"]) {
    await assert.rejects(() => isolamento.carregarConfiguracao(arquivo, deps), { code: "ISOLATED_CONFIG" });
  }
  await assert.rejects(() => isolamento.carregarConfiguracao(isolamento.ARQUIVO_CONFIG, {
    ...deps, realpath: async () => "C:\\xampp\\.env",
  }), { code: "ISOLATED_CONFIG" });
  for (const texto of ["invalido", "{}", "x".repeat(16385)]) {
    await assert.rejects(() => isolamento.carregarConfiguracao(isolamento.ARQUIVO_CONFIG, {
      ...deps, readFile: async () => texto,
    }), { code: "ISOLATED_CONFIG" });
  }
})

test("timeout da leitura de configuracao aborta a propria operacao", async () => {
  let signal;
  await assert.rejects(() => isolamento.carregarConfiguracao(isolamento.ARQUIVO_CONFIG, {
    realpath: async p => p, tempoMs: 5,
    readFile: (_, opcoes) => { signal = opcoes.signal; return nunca(); },
  }), { code: "ISOLATED_CONFIG" });
  assert.equal(signal.aborted, true);
})

test("query e execute validam cada conexao, preservam parametros e fecham somente recursos proprios", async () => {
  const fake = bancoFake();
  const db = isolamento.criarAdaptadorProtegido(config(), fake.deps);
  for (const metodo of ["query", "execute"]) {
    const parametros = [42, "categoria simulada"];
    const resultado = await db[metodo]("SQL SIMULADO ?", parametros);
    assert.deepEqual(resultado, [[{ resultado: "simulado" }], ["campos"]]);
    assert.equal(fake.estado.sql.at(-1)[1], parametros);
  }
  assert.equal(fake.estado.verificacoes, 2);
  assert.equal(fake.estado.processo, 2);
  assert.ok(fake.estado.raws.every(raw => raw.destruicoes === 1));
  assert.equal(db.pool, undefined);
  assert.equal(db.connection, undefined);
  assert.ok(fake.estado.alternativas.every(op => op.port === 3307 && op.host === "127.0.0.1" && op.multipleStatements === false));
  await db.end();
})

test("getConnection preserva transacoes e esconde a conexao bruta", async () => {
  const fake = bancoFake();
  const db = isolamento.criarAdaptadorProtegido(config(), fake.deps);
  const conn = await db.getConnection();
  assert.ok(Object.isFrozen(conn));
  assert.equal(conn.connection, undefined);
  assert.equal(conn.raw, undefined);
  await conn.beginTransaction();
  await conn.execute("SQL SIMULADO", [1]);
  await conn.commit();
  await conn.beginTransaction();
  await conn.query("OUTRO SQL SIMULADO", [2]);
  await conn.rollback();
  assert.deepEqual(fake.estado.metodos, ["beginTransaction", "execute", "commit", "beginTransaction", "query", "rollback"]);
  conn.release(); conn.release();
  assert.equal(fake.estado.raws[0].destruicoes, 1);
  await assert.rejects(() => conn.query("IGNORADO"), { code: "ISOLATED_CLOSED" });
  await db.end();
})

test("divergencias de identidade nunca liberam consultas da aplicacao", async () => {
  for (const identidade of [
    { porta: 3306 }, { porta: "3307" }, { banco: "outro" }, { endereco: "0.0.0.0" },
    { diretorio: "C:\\xampp\\mysql\\data" }, { versao: "10.4.31-MariaDB" },
    { arquivo_pid: "C:\\xampp\\mysql\\data\\mysql.pid" }, { conexao_id: 999 },
    { usuario: "root@localhost" }, { versao: null },
  ]) {
    const fake = bancoFake({ identidade });
    const db = isolamento.criarAdaptadorProtegido(config(), fake.deps);
    await assert.rejects(() => db.execute("NAO EXECUTAR"), { code: "ISOLATED_IDENTITY" });
    assert.equal(fake.estado.sql.length, 0);
    assert.equal(fake.estado.raws[0].destruicoes, 1);
    await assert.rejects(() => db.getConnection(), { code: "ISOLATED_CLOSED" });
    await db.end();
  }
})

test("PID inconsistente, linhas invalidas e junctions sao recusados", async () => {
  for (const opcoes of [
    { pidTexto: "0" }, { pidTexto: "4321 segredo" }, { processo: { pid: 99, nome: "mysqld" } },
    { processo: { pid: 4321, nome: "outro" } }, { junction: true }, { linhas: [] }, { linhas: [{}, {}] },
  ]) {
    const fake = bancoFake(opcoes);
    const db = isolamento.criarAdaptadorProtegido(config(), fake.deps);
    await assert.rejects(() => db.getConnection(), { code: "ISOLATED_IDENTITY" });
    assert.equal(fake.estado.raws[0].destruicoes, 1);
    await db.end();
  }
})

test("conexao recusada e sanitizada e liberada sem tentativa alternativa", async () => {
  const fake = bancoFake({ erroConectar: erro("ECONNREFUSED") });
  const db = isolamento.criarAdaptadorProtegido(config(), fake.deps);
  await assert.rejects(() => db.query("SQL PRIVADO"), e => {
    assert.equal(e.code, "ECONNREFUSED");
    assert.equal(e.sql, undefined);
    assert.equal(e.password, undefined);
    assert.doesNotMatch(e.stack, /SQL PRIVADO|SEGREDO/u);
    return true;
  });
  assert.equal(fake.estado.raws.length, 1);
  assert.equal(fake.estado.raws[0].destruicoes, 1);
  assert.equal(fake.estado.verificacoes, 0);
  await db.end();
})

test("timeout de conexao impede verificacao atrasada e destroi o socket proprio", async () => {
  const fake = bancoFake({ conexaoPendente: true, tempoMs: 5 });
  const db = isolamento.criarAdaptadorProtegido(config(), fake.deps);
  await assert.rejects(() => db.getConnection(), { code: "ISOLATED_TIMEOUT" });
  fake.estado.raws[0].concluirConexao();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fake.estado.verificacoes, 0);
  assert.equal(fake.estado.raws[0].destruicoes, 1);
  await db.end();
})

test("timeouts de identidade e PID liberam conexao e abortam a verificacao", async () => {
  for (const opcoes of [{ identidadePendente: true }, { processoPendente: true }]) {
    const fake = bancoFake({ ...opcoes, tempoMs: 5 });
    const db = isolamento.criarAdaptadorProtegido(config(), fake.deps);
    await assert.rejects(() => db.getConnection(), { code: "ISOLATED_TIMEOUT" });
    assert.equal(fake.estado.raws[0].destruicoes, 1);
    if (fake.estado.signal) assert.equal(fake.estado.signal.aborted, true);
    await db.end();
  }
})

test("timeout de operacao nao repete SQL e invalida a conexao", async () => {
  const fake = bancoFake({ tempoMs: 5, operacao: nunca });
  const db = isolamento.criarAdaptadorProtegido(config(), fake.deps);
  const conn = await db.getConnection();
  await assert.rejects(() => conn.execute("SQL SIMULADO"), { code: "ISOLATED_TIMEOUT" });
  await assert.rejects(() => conn.rollback(), { code: "ISOLATED_CLOSED" });
  conn.release();
  assert.equal(fake.estado.sql.length, 1);
  assert.equal(fake.estado.raws[0].destruicoes, 1);
  await db.end();
})

test("falha SQL permite rollback, preserva codigo e remove detalhes privados", async () => {
  const fake = bancoFake({ operacao: async metodo => {
    if (metodo === "execute") throw erro("ER_DUP_ENTRY");
    return [[], []];
  } });
  const db = isolamento.criarAdaptadorProtegido(config(), fake.deps);
  const conn = await db.getConnection();
  await conn.beginTransaction();
  await assert.rejects(() => conn.execute("SQL PRIVADO", ["DADO PRIVADO"]), e =>
    e.code === "ER_DUP_ENTRY" && !e.sql && !e.stack.includes("DADO PRIVADO"));
  await conn.rollback();
  conn.release();
  assert.deepEqual(fake.estado.metodos, ["beginTransaction", "execute", "rollback"]);
  await db.end();
})

test("erro fatal de socket fecha recursos sem emitir detalhes nem continuar consultas", async () => {
  const fake = bancoFake();
  const db = isolamento.criarAdaptadorProtegido(config(), fake.deps);
  const conn = await db.getConnection();
  assert.doesNotThrow(() => fake.estado.raws[0].emit("error", erro("ECONNREFUSED")));
  await assert.rejects(() => conn.query("IGNORADO"), { code: "ISOLATED_CLOSED" });
  assert.equal(fake.estado.raws[0].destruicoes, 1);
  await db.end();
})

test("limite de conexoes e encerramento idempotente nao deixam recursos pendentes", async () => {
  const fake = bancoFake({ tempoMs: 5 });
  const db = isolamento.criarAdaptadorProtegido(config(), fake.deps);
  const conexoes = [];
  for (let n = 0; n < 10; n++) conexoes.push(await db.getConnection());
  await assert.rejects(() => db.getConnection(), { code: "ISOLATED_BUSY" });
  const fim = db.end();
  assert.equal(db.end(), fim);
  await assert.rejects(() => fim, { code: "ISOLATED_TIMEOUT" });
  assert.ok(fake.estado.raws.every(raw => raw.destruicoes === 1));
  conexoes.forEach(conn => conn.release());
})

test("startup valida banco antes de carregar app, fixa bind e encerra apenas seus recursos", async () => {
  const fake = startupFake();
  const controle = await fake.iso.iniciarBackendIsolado(config(), fake.deps);
  assert.equal(fake.carregamentos(), 1);
  assert.deepEqual(fake.http.estado.chamadas, [[3107, "127.0.0.1"]]);
  assert.equal(fake.processo.env.PORT, "3107");
  assert.equal(fake.processo.env.JWT_SECRET.length, 64);
  assert.equal(fake.processo.listenerCount("SIGINT"), 1);
  assert.equal(controle.encerrar(), controle.encerrar());
  await controle.encerrar();
  assert.equal(fake.http.estado.fechamentos, 1);
  assert.equal(fake.http.estado.idle, 1);
  assert.equal(fake.http.estado.todas, 0);
  assert.deepEqual(fake.processo.env, {});
  assert.equal(fake.processo.listenerCount("SIGINT"), 0);
})

test("falhas de configuracao e ambiente nao criam conexoes nem abrem HTTP", async () => {
  for (const opcoes of [{ env: { DB_PORT: "3306" } }, { env: { JWT_SECRET: "principal" } }, {}]) {
    const fake = startupFake(opcoes);
    const entrada = Object.keys(opcoes).length ? config() : { ...config(), port: 3306 };
    await assert.rejects(() => fake.iso.iniciarBackendIsolado(entrada, fake.deps));
    assert.equal(fake.banco.estado.raws.length, 0);
    assert.equal(fake.carregamentos(), 0);
    assert.equal(fake.http.estado.chamadas.length, 0);
  }
})

test("identidade divergente e conexao recusada impedem carregamento do app e HTTP", async () => {
  for (const banco of [{ identidade: { porta: 3306 } }, { erroConectar: erro("ECONNREFUSED") },
    { conexaoPendente: true, tempoMs: 5 }]) {
    const fake = startupFake({ banco });
    await assert.rejects(() => fake.iso.iniciarBackendIsolado(config(), fake.deps));
    assert.equal(fake.carregamentos(), 0);
    assert.equal(fake.http.estado.chamadas.length, 0);
    assert.equal(fake.banco.estado.raws[0].destruicoes, 1);
    assert.deepEqual(fake.processo.env, {});
  }
})

test("porta ocupada falha sem escolher outra porta e fecha o banco proprio", async () => {
  const fake = startupFake({ http: { erroEscuta: erro("EADDRINUSE") } });
  await assert.rejects(() => fake.iso.iniciarBackendIsolado(config(), fake.deps), e => e.code === "EADDRINUSE");
  assert.deepEqual(fake.http.estado.chamadas, [[3107, "127.0.0.1"]]);
  assert.equal(fake.banco.estado.raws[0].destruicoes, 1);
  assert.deepEqual(fake.processo.env, {});
})

test("timeout de escuta encerra somente o servidor que tentou iniciar", async () => {
  const fake = startupFake({ http: { escutaPendente: true }, tempoMs: 5 });
  await assert.rejects(() => fake.iso.iniciarBackendIsolado(config(), fake.deps), e => e.code === "ISOLATED_TIMEOUT");
  assert.equal(fake.http.estado.fechamentos, 1);
  assert.deepEqual(fake.processo.env, {});
  // Um evento atrasado tambem deve fechar o listener, nunca deixa-lo disponivel.
  fake.http.servidor.listening = true;
  fake.http.servidor.emit("listening");
  assert.equal(fake.http.servidor.listening, false);
  assert.equal(fake.http.estado.todas, 1);
})

test("encerramento com HTTP pendente e limitado e fecha somente suas conexoes", async () => {
  const fake = startupFake({ http: { fechamentoPendente: true }, tempoMs: 5 });
  const controle = await fake.iso.iniciarBackendIsolado(config(), fake.deps);
  await assert.rejects(() => controle.encerrar(), e => e.code === "ISOLATED_TIMEOUT");
  assert.equal(fake.http.estado.todas, 1);
  assert.deepEqual(fake.processo.env, {});
})

test("novo PID divergente apos startup recusa consultas e encerra o backend isolado", async () => {
  const fake = startupFake();
  const controle = await fake.iso.iniciarBackendIsolado(config(), fake.deps);
  const db = fake.iso.obterBancoIsolado();
  fake.banco.estado.processoAtual = { pid: 99, nome: "mysqld" };
  await assert.rejects(() => db.query("NAO EXECUTAR"), e => e.code === "ISOLATED_IDENTITY");
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(() => db.query("IGNORADO"), e => e.code === "ISOLATED_CLOSED");
  await controle.encerrar();
  assert.equal(fake.http.estado.fechamentos, 1);
})

test("modo isolado sem inicializador ou com segredo adulterado nao tem fallback", async () => {
  const fora = moduloSimulado("isolamento.cjs", { env: { TROCATICKET_AMBIENTE: "isolado" }, mainFile: "outro.cjs" });
  assert.throws(() => fora.modulo.modoExecucao(), e => e.code === "ISOLATED_ENTRY");
  await assert.rejects(() => fora.modulo.iniciarBackendIsolado(config()), e => e.code === "ISOLATED_ENTRY");
  const fake = startupFake();
  const controle = await fake.iso.iniciarBackendIsolado(config(), fake.deps);
  fake.processo.env.JWT_SECRET = "adulterado";
  assert.throws(() => fake.iso.obterBancoIsolado(), e => e.code === "ISOLATED_ENTRY");
  await controle.encerrar();
})

test("portas reservadas nao podem iniciar pelo caminho principal sem marcador", () => {
  for (const env of [{ PORT: "3107" }, { DB_PORT: "3307" }, { TROCATICKET_AMBIENTE: "desconhecido" }]) {
    const fake = moduloSimulado("isolamento.cjs", { env });
    assert.throws(() => fake.modulo.modoExecucao(), e => e.code === "ISOLATED_ENTRY");
  }
})

test("JWT e gerado exclusivamente por execucao sem valor padrao nem segredo herdado", async () => {
  const segredos = [];
  for (let n = 0; n < 2; n++) {
    const fake = startupFake();
    delete fake.deps.gerarJwt;
    const controle = await fake.iso.iniciarBackendIsolado(config(), fake.deps);
    segredos.push(fake.processo.env.JWT_SECRET);
    assert.match(segredos[n], /^[a-f0-9]{64}$/u);
    await controle.encerrar();
  }
  assert.notEqual(segredos[0], segredos[1]);
})

test("SIGINT e SIGTERM encerram somente o servidor e as conexoes simuladas pertencentes ao processo", async () => {
  for (const sinal of ["SIGINT", "SIGTERM"]) {
    const fake = startupFake();
    const controle = await fake.iso.iniciarBackendIsolado(config(), fake.deps);
    fake.processo.emit(sinal);
    await controle.encerrar();
    assert.equal(fake.http.estado.fechamentos, 1);
    assert.equal(fake.processo.listenerCount(sinal), 0);
    assert.deepEqual(fake.processo.env, {});
  }
})

test("startup concorrente ou repetido e rejeitado sem reutilizar app em cache", async () => {
  const fake = startupFake();
  const primeiro = fake.iso.iniciarBackendIsolado(config(), fake.deps);
  await assert.rejects(() => fake.iso.iniciarBackendIsolado(config(), fake.deps), e => e.code === "ISOLATED_ENTRY");
  const controle = await primeiro;
  await controle.encerrar();
  await assert.rejects(() => fake.iso.iniciarBackendIsolado(config(), fake.deps), e => e.code === "ISOLATED_ENTRY");
})

test("db principal preserva dotenv, configuracao e fallback historico", () => {
  let dotenv = 0;
  let settings;
  const pool = {};
  const env = { DB_HOST: "host-principal-simulado", DB_USER: "usuario-simulado", DB_PASSWORD: "senha-simulada", DB_NAME: "banco-simulado" };
  const carregado = moduloSimulado("db.js", { env, stubs: {
    "./isolamento.cjs": { modoExecucao: () => "principal" },
    dotenv: { config: () => { dotenv++; } },
    "mysql2/promise": { createPool: opcoes => { settings = opcoes; return pool; } },
  } });
  assert.equal(carregado.modulo, pool);
  assert.equal(dotenv, 1);
  assert.equal(settings.port, 3306);
  assert.equal(settings.host, env.DB_HOST);
  assert.equal(settings.user, env.DB_USER);
  assert.equal(settings.password, env.DB_PASSWORD);
  assert.equal(settings.database, env.DB_NAME);
  assert.equal(settings.connectionLimit, 10);
})

test("db isolado nao carrega dotenv ou mysql2/promise e exige adaptador pronto", () => {
  const db = {};
  const bloquear = () => { throw new Error("Nao deveria carregar dependencias principais"); };
  const carregado = moduloSimulado("db.js", { stubs: {
    "./isolamento.cjs": { modoExecucao: () => "isolado", obterBancoIsolado: () => db },
    dotenv: { config: bloquear }, "mysql2/promise": { createPool: bloquear },
  } });
  assert.equal(carregado.modulo, db);
  assert.throws(() => moduloSimulado("db.js", { stubs: {
    "./isolamento.cjs": { modoExecucao: () => { throw erro("ISOLATED_ENTRY"); } },
    dotenv: { config: bloquear }, "mysql2/promise": { createPool: bloquear },
  } }), e => e.code === "ISOLATED_ENTRY");
})

function carregarServidor(principal, modo) {
  const estado = { dotenv: 0, escutas: [], rotas: [] };
  const app = { use() {}, listen: (...args) => { estado.escutas.push(args); } };
  for (const metodo of ["get", "post", "put", "patch", "delete"]) {
    app[metodo] = rota => estado.rotas.push([metodo, rota]);
  }
  const express = () => app;
  express.json = () => () => {};
  const carregado = moduloSimulado("server.js", {
    principal, env: { JWT_SECRET: "segredo-simulado-de-mais-de-32-caracteres" },
    stubs: {
      express, bcryptjs: {}, jsonwebtoken: {}, cors: () => () => {},
      dotenv: { config: () => { estado.dotenv++; } }, "./db": {},
      "./repositories/mysql/usuarios.cjs": require("../repositories/mysql/usuarios.cjs"),
      "./isolamento.cjs": { modoExecucao: () => modo },
    },
  });
  return { ...carregado, estado, app };
}

test("node server.js principal preserva escuta e todas as rotas, importacao nao inicia HTTP", () => {
  const principal = carregarServidor(true, "principal");
  const isolado = carregarServidor(false, "isolado");
  const importado = carregarServidor(false, "principal");
  assert.equal(principal.estado.dotenv, 1);
  assert.equal(principal.estado.escutas[0][0], 3001);
  assert.equal(principal.estado.escutas[0].length, 2);
  assert.equal(principal.modulo, principal.app);
  assert.equal(isolado.estado.dotenv, 0);
  assert.equal(isolado.estado.escutas.length, 0);
  assert.equal(importado.estado.escutas.length, 0);
  assert.deepEqual(isolado.estado.rotas, principal.estado.rotas);
  assert.ok(principal.estado.rotas.some(([metodo, rota]) => metodo === "put" && rota === "/eventos/:id/custos"));
})

test("startup com server.js e db.js reais usa apenas o adaptador simulado e nunca dotenv", async () => {
  const fake = startupFake();
  const proibido = () => { throw new Error("Dependencia principal indevida"); };
  const app = fake.http.app;
  app.use = () => {};
  for (const metodo of ["get", "post", "put", "patch", "delete"]) app[metodo] = () => {};
  const express = () => app;
  express.json = () => () => {};
  fake.deps.carregarApp = () => {
    const db = moduloSimulado("db.js", { env: fake.processo.env, stubs: {
      "./isolamento.cjs": fake.iso, dotenv: { config: proibido },
      "mysql2/promise": { createPool: proibido },
    } }).modulo;
    assert.equal(db, fake.iso.obterBancoIsolado());
    return moduloSimulado("server.js", { env: fake.processo.env, stubs: {
      express, bcryptjs: {}, jsonwebtoken: {}, cors: () => () => {},
      "./isolamento.cjs": fake.iso, "./db": db, dotenv: { config: proibido },
      "./repositories/mysql/usuarios.cjs": require("../repositories/mysql/usuarios.cjs"),
    } }).modulo;
  };
  const controle = await fake.iso.iniciarBackendIsolado(config(), fake.deps);
  assert.deepEqual(fake.http.estado.chamadas, [[3107, "127.0.0.1"]]);
  const { criarRepositorioUsuarios } = require("../repositories/mysql/usuarios.cjs");
  const repo = criarRepositorioUsuarios(fake.iso.obterBancoIsolado());
  assert.deepEqual(await repo.listar(), [{ resultado: "simulado" }]);
  assert.equal(fake.banco.estado.sql.at(-1)[0],
    "SELECT id, nome, email, perfil FROM usuarios ORDER BY id DESC");
  await controle.encerrar();
})

test("importar inicializador nao inicia app, le arquivos privados ou acessa banco", () => {
  const carregado = moduloSimulado("scripts/iniciar-backend-isolado.cjs", { stubs: {
    "../isolamento.cjs": {
      carregarConfiguracao: () => { throw new Error("Nao executar"); },
      iniciarBackendIsolado: () => { throw new Error("Nao executar"); },
      sanitizar: isolamento.sanitizar,
    },
  } });
  assert.equal(typeof carregado.modulo.executar, "function");
  return assert.rejects(() => carregado.modulo.executar([]), e => e.code === "ISOLATED_CONFIG");
})
