"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");

// Driver substituido: nenhum teste tem acesso a sockets ou banco.
function carregar(lerCertificado = () => { throw Error("Arquivo privado"); }) {
  const pools = [];
  const logs = [];
  class Pool extends EventEmitter {
    constructor(config) { super(); this.config = config; pools.push(this); }
    query() { throw Error("Consulta proibida neste teste"); }
    connect() { throw Error("Conexao proibida neste teste"); }
  }
  const contexto = {
    module: { exports: {} }, process: { env: {} },
    console: { error: (...args) => logs.push(args) },
    require(nome) {
      if (nome === "pg") return { Pool };
      if (nome === "node:fs") return { readFileSync: lerCertificado };
      throw Error(`Dependencia inesperada: ${nome}`);
    },
  };
  vm.runInNewContext(readFileSync(path.join(__dirname, "../db-postgres.js"), "utf8"), contexto);
  return { ...contexto.module.exports, pools, logs, env: contexto.process.env };
}

const ambiente = () => ({ PGHOST: "postgres.example.invalid", PGDATABASE: "exemplo", PGUSER: "exemplo", PGPASSWORD: "ficticia" });

test("importacao nao cria pool; criacao e inerte e exige TLS com verificacao", () => {
  const mod = carregar();
  assert.equal(mod.pools.length, 0);
  const pool = mod.criarPoolPostgres(ambiente());
  assert.equal(mod.pools.length, 1);
  assert.equal(pool.config.port, 5432);
  assert.equal(pool.config.max, 10);
  assert.equal(pool.config.connectionTimeoutMillis, 10000);
  assert.equal(pool.config.idleTimeoutMillis, 30000);
  assert.equal(pool.config.ssl.rejectUnauthorized, true);
  assert.equal(pool.config.ssl.minVersion, "TLSv1.2");
  assert.equal(pool.listenerCount("error"), 1);
});

test("usa ambiente e limites customizados sem permitir override TLS por URL ou sslmode", () => {
  const mod = carregar();
  Object.assign(mod.env, ambiente(), {
    PGPORT: "6543", PGPOOL_MAX: "3", PGCONNECT_TIMEOUT_MS: "5000", PGIDLE_TIMEOUT_MS: "15000",
    PGSSLMODE: "disable", DATABASE_URL: "postgres://exemplo.invalid/?sslmode=disable",
  });
  const { config } = mod.criarPoolPostgres();
  assert.equal(config.host, mod.env.PGHOST);
  assert.equal(config.user, mod.env.PGUSER);
  assert.equal(config.database, mod.env.PGDATABASE);
  assert.equal(config.password, mod.env.PGPASSWORD);
  assert.equal(config.port, 6543);
  assert.equal(config.max, 3);
  assert.equal(config.connectionTimeoutMillis, 5000);
  assert.equal(config.idleTimeoutMillis, 15000);
  assert.equal(config.connectionString, undefined);
  assert.equal(config.ssl.rejectUnauthorized, true);
});

test("recusa configuracao ausente sem revelar valores nem construir pool", () => {
  const mod = carregar();
  for (const nome of ["PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD"]) {
    for (const valor of [undefined, "", "   "]) {
      assert.throws(() => mod.criarPoolPostgres({ ...ambiente(), [nome]: valor }), { code: "POSTGRES_CONFIG" });
    }
  }
  assert.equal(mod.pools.length, 0);
});

test("recusa portas e limites invalidos antes de criar pool", () => {
  const mod = carregar();
  for (const nome of ["PGPORT", "PGPOOL_MAX", "PGCONNECT_TIMEOUT_MS", "PGIDLE_TIMEOUT_MS"]) {
    for (const valor of ["", "0", "-1", "1.5", "10ms", "Infinity", "9007199254740992"]) {
      assert.throws(() => mod.criarPoolPostgres({ ...ambiente(), [nome]: valor }), { code: "POSTGRES_CONFIG" });
    }
  }
  assert.throws(() => mod.criarPoolPostgres({ ...ambiente(), PGPORT: "65536" }), { code: "POSTGRES_CONFIG" });
  assert.equal(mod.pools.length, 0);
});

test("CA personalizada preserva verificacao TLS e falhas de leitura nao vazam caminho", () => {
  const mod = carregar((arquivo, encoding) => {
    assert.equal(arquivo, "ca-simulada.pem");
    assert.equal(encoding, "utf8");
    return "CA simulada";
  });
  const pool = mod.criarPoolPostgres({ ...ambiente(), PGSSLROOTCERT: "ca-simulada.pem" });
  assert.equal(pool.config.ssl.ca, "CA simulada");
  assert.equal(pool.config.ssl.rejectUnauthorized, true);
  for (const leitura of [() => { throw Error("caminho privado"); }, () => ""]) {
    const falha = carregar(leitura);
    assert.throws(() => falha.criarPoolPostgres({ ...ambiente(), PGSSLROOTCERT: "privado" }), erro => {
      assert.equal(erro.code, "POSTGRES_CONFIG");
      assert.doesNotMatch(erro.message, /privado/);
      return true;
    });
    assert.equal(falha.pools.length, 0);
  }
});

test("erros ociosos sao tratados sem expor erro bruto ou credenciais", () => {
  const mod = carregar();
  const pool = mod.criarPoolPostgres(ambiente());
  pool.emit("error", Object.assign(Error("SQL e senha privados"), { code: "SEGREDO" }));
  assert.equal(mod.logs.length, 1);
  assert.equal(mod.logs[0].length, 1);
  assert.match(mod.logs[0][0], /PostgreSQL/);
  assert.doesNotMatch(JSON.stringify(mod.logs), /SQL e senha privados|SEGREDO|ficticia/);
});
