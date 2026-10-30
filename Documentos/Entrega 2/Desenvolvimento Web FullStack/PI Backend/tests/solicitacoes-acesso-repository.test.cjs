"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { criarRepositorioSolicitacoesAcesso } = require("../repositories/mysql/solicitacoes-acesso.cjs");

const casos = [
  { metodo: "buscarPendentesPorUsuario", args: [9], params: [9], lista: true,
    sql: "SELECT id FROM solicitacoes_acesso WHERE usuario_id = ? AND status = 'pendente'" },
  { metodo: "criar", args: [9, "fornecedor", " justificativa "], params: [9, "fornecedor", " justificativa "],
    sql: "INSERT INTO solicitacoes_acesso (usuario_id, perfil_solicitado, justificativa) VALUES (?, ?, ?)",
    valor: { insertId: "9007199254740993" }, retorno: v => v.insertId },
  { metodo: "listar", args: [], lista: true,
    sql: "SELECT s.id, s.usuario_id, u.nome, u.email, s.perfil_solicitado, s.justificativa, s.status, s.criada_em FROM solicitacoes_acesso s INNER JOIN usuarios u ON u.id = s.usuario_id ORDER BY s.criada_em DESC, s.id DESC" },
  { metodo: "bloquearPorId", tx: true, args: [13], params: [13], lista: true,
    sql: "SELECT usuario_id, perfil_solicitado, status FROM solicitacoes_acesso WHERE id = ? FOR UPDATE" },
  { metodo: "atualizarPerfilParticipante", tx: true, args: ["fornecedor", 9], params: ["fornecedor", 9],
    sql: "UPDATE usuarios SET perfil = ? WHERE id = ? AND perfil = 'participante'",
    valor: { affectedRows: 1 }, retorno: v => v.affectedRows },
  { metodo: "atualizarStatus", tx: true, args: ["aprovado", 13], params: ["aprovado", 13],
    sql: "UPDATE solicitacoes_acesso SET status = ? WHERE id = ?", valor: { affectedRows: 1 } },
];

for (const caso of casos) {
  test(`${caso.metodo}: preserva SQL, parametros, campos, filtros, ordem e tipos`, async () => {
    const valor = caso.valor ?? [{ id: 13, usuario_id: 9, nome: "Pessoa", email: "teste@example.invalid",
      perfil_solicitado: "fornecedor", justificativa: "Motivo", status: "pendente",
      criada_em: new Date("2030-01-01T00:00:00Z") }];
    let chamadas = 0;
    const conexao = { async execute(sql, ...args) {
      chamadas++;
      assert.equal(sql.replace(/\s+/g, " ").trim(), caso.sql);
      assert.deepEqual(args, caso.params === undefined ? [] : [caso.params]);
      return [valor, ["metadados"]];
    } };
    const db = caso.tx ? { execute() { throw Error("Transacao nao pode usar pool"); } } : conexao;
    const repo = criarRepositorioSolicitacoesAcesso(db);
    assert.strictEqual(await repo[caso.metodo](...(caso.tx ? [conexao, ...caso.args] : caso.args)),
      caso.retorno ? caso.retorno(valor) : valor);
    assert.equal(chamadas, 1);
  });

  test(`${caso.metodo}: propaga falha original sem retry ou fallback`, async () => {
    const erro = Object.assign(Error("falha simulada"), { code: "ER_DUP_ENTRY" });
    let chamadas = 0;
    const conexao = { async execute() { chamadas++; throw erro; } };
    const repo = criarRepositorioSolicitacoesAcesso(conexao);
    await assert.rejects(() => repo[caso.metodo](...(caso.tx ? [conexao, ...caso.args] : caso.args)), e => e === erro);
    assert.equal(chamadas, 1);
  });

  if (caso.lista) test(`${caso.metodo}: preserva array vazio`, async () => {
    const vazio = [];
    const conexao = { async execute() { return [vazio]; } };
    const repo = criarRepositorioSolicitacoesAcesso(conexao);
    assert.strictEqual(await repo[caso.metodo](...(caso.tx ? [conexao, ...caso.args] : caso.args)), vazio);
  });
}

test("perfil condicional: zero ou mais de uma linha afetada permanece para decisao do handler", async () => {
  for (const affectedRows of [0, 2]) {
    const conexao = { async execute() { return [{ affectedRows }]; } };
    const repo = criarRepositorioSolicitacoesAcesso({});
    assert.equal(await repo.atualizarPerfilParticipante(conexao, "organizador", 9), affectedRows);
  }
});

const diferido = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

// Handlers reais, repositorios reais e dependencias fechadas. Sem driver ou rede.
// A fila simula o bloqueio da mesma solicitacao ate commit/rollback/release.
function ambiente(opcoes = {}) {
  const rotas = new Map();
  const estado = { perfil: opcoes.perfil ?? "participante", status: opcoes.status ?? "pendente",
    conexoes: [], consultasPool: 0 };
  let fila = Promise.resolve();
  const falhar = etapa => { if (opcoes.falharEm === etapa) throw Error("falha simulada"); };
  const db = {
    async execute(sql, params) {
      estado.consultasPool++;
      assert.equal(sql, "SELECT id, nome, email, perfil FROM usuarios WHERE id = ?");
      assert.deepEqual(Array.from(params), [7]);
      return [[{ id: 7, perfil: "admin" }]];
    },
    async getConnection() {
      falhar("conexao");
      const etapas = [];
      estado.conexoes.push(etapas);
      const primeira = estado.conexoes.length === 1;
      let soltar, copia;
      function liberarLock() { soltar?.(); soltar = null; }
      return {
        async beginTransaction() { etapas.push("begin"); falhar("begin"); },
        async execute(sql, params) {
          const texto = sql.replace(/\s+/g, " ").trim();
          if (texto.startsWith("SELECT usuario_id")) {
            etapas.push("lock"); falhar("lock");
            assert.equal(texto, casos[3].sql);
            assert.deepEqual(Array.from(params), [13]);
            const anterior = fila;
            const espera = diferido();
            fila = espera.promise;
            soltar = espera.resolve;
            if (!primeira) opcoes.segundaEsperando?.resolve();
            await anterior;
            copia = { perfil: estado.perfil, status: estado.status };
            if (primeira && opcoes.pausa) {
              opcoes.pausa.entrou.resolve();
              await opcoes.pausa.continuar.promise;
            }
            return [opcoes.ausente ? [] : [{ usuario_id: 9, perfil_solicitado: "fornecedor", status: copia.status }]];
          }
          assert.ok(copia, "UPDATE exige lock na mesma conexao");
          if (texto.startsWith("UPDATE usuarios")) {
            etapas.push("perfil"); falhar("perfil");
            assert.equal(texto, casos[4].sql);
            assert.deepEqual(Array.from(params), ["fornecedor", 9]);
            const affectedRows = copia.perfil === "participante" ? 1 : 0;
            if (affectedRows) copia.perfil = params[0];
            return [{ affectedRows }];
          }
          assert.equal(texto, casos[5].sql);
          assert.equal(params[1], 13);
          etapas.push("status"); falhar("status");
          copia.status = params[0];
          return [{ affectedRows: 1 }];
        },
        async commit() {
          etapas.push("commit"); falhar("commit");
          Object.assign(estado, copia); liberarLock();
        },
        async rollback() {
          etapas.push("rollback"); falhar("rollback");
          copia = null; liberarLock();
        },
        release() { etapas.push("release"); liberarLock(); falhar("release"); },
      };
    },
  };
  const app = { use() {} };
  for (const metodo of ["get", "post", "put", "patch", "delete"]) {
    app[metodo] = (rota, ...handlers) => rotas.set(`${metodo} ${rota}`, handlers);
  }
  const dependencias = {
    express: Object.assign(() => app, { json: () => () => {} }), cors: () => () => {},
    bcryptjs: {}, jsonwebtoken: { verify: () => ({ id: 7 }) },
    dotenv: { config() {} }, "./isolamento.cjs": { modoExecucao: () => "principal" }, "./db": db,
  };
  for (const dominio of ["usuarios", "eventos", "custos", "cotacoes", "propostas", "inscricoes", "solicitacoes-acesso"]) {
    dependencias[`./repositories/mysql/${dominio}.cjs`] = require(`../repositories/mysql/${dominio}.cjs`);
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../server.js"), "utf8"), {
    Buffer, module: { exports: {} }, process: { env: { JWT_SECRET: "segredo-ficticio-exclusivo-da-suite-de-acesso" } },
    console: { log() {}, error() {} },
    require(nome) { assert.ok(Object.hasOwn(dependencias, nome), nome); return dependencias[nome]; },
  });
  return { estado, async request(status) {
    const req = { params: { id: "13" }, body: { status }, headers: { authorization: "Bearer simulado" } };
    const res = { statusCode: 200, status(n) { this.statusCode = n; return this; },
      json(dados) { this.body = JSON.parse(JSON.stringify(dados)); return this; } };
    for (const handler of rotas.get("patch /solicitacoes-acesso/:id")) {
      let next = false;
      await handler(req, res, () => { next = true; });
      if (!next) break;
    }
    return res;
  } };
}

for (const status of ["aprovado", "rejeitado"]) test(`PATCH ${status}: unica conexao, lock, commit e release`, async () => {
  const a = ambiente();
  const r = await a.request(status);
  assert.equal(r.statusCode, 200);
  assert.equal(a.estado.status, status);
  assert.equal(a.estado.perfil, status === "aprovado" ? "fornecedor" : "participante");
  assert.deepEqual(a.estado.conexoes, [["begin", "lock", ...(status === "aprovado" ? ["perfil"] : []), "status", "commit", "release"]]);
  assert.equal(a.estado.consultasPool, 1, "Pool so autentica; transacao usa conexao exclusiva");
});

for (const etapa of ["conexao", "begin", "lock", "perfil", "status", "commit"]) {
  test(`PATCH falha em ${etapa}: preserva dados, rollback e release sem retry`, async () => {
    const a = ambiente({ falharEm: etapa });
    const r = await a.request("aprovado");
    assert.equal(r.statusCode, 500);
    assert.deepEqual(r.body, { erro: "Erro interno ao analisar solicitação." });
    assert.equal(a.estado.perfil, "participante");
    assert.equal(a.estado.status, "pendente");
    assert.equal(a.estado.conexoes.length, etapa === "conexao" ? 0 : 1);
    if (etapa !== "conexao") {
      const etapas = ["begin", "lock", "perfil", "status", "commit"];
      assert.deepEqual(a.estado.conexoes[0], [...etapas.slice(0, etapas.indexOf(etapa) + 1), "rollback", "release"]);
    }
  });
}

test("PATCH ausente, ja analisada e perfil atual diferente revertem sem atualizar", async () => {
  for (const [opcoes, codigo] of [[{ ausente: true }, 404], [{ status: "rejeitado" }, 409], [{ perfil: "organizador" }, 409]]) {
    const a = ambiente(opcoes);
    const anterior = { perfil: a.estado.perfil, status: a.estado.status };
    assert.equal((await a.request("aprovado")).statusCode, codigo);
    assert.deepEqual({ perfil: a.estado.perfil, status: a.estado.status }, anterior);
    assert.deepEqual(a.estado.conexoes[0].slice(-2), ["rollback", "release"]);
    assert.ok(!a.estado.conexoes[0].includes("status"));
  }
});

for (const primeiroStatus of ["aprovado", "rejeitado"]) test(`concorrencia: ${primeiroStatus} bloqueia segunda avaliacao da mesma solicitacao`, { timeout: 2000 }, async () => {
  const pausa = { entrou: diferido(), continuar: diferido() }, segundaEsperando = diferido();
  const a = ambiente({ pausa, segundaEsperando });
  const primeira = a.request(primeiroStatus);
  await pausa.entrou.promise;
  const segunda = a.request(primeiroStatus === "aprovado" ? "rejeitado" : "aprovado");
  try {
    await segundaEsperando.promise;
    assert.equal(a.estado.status, "pendente");
    assert.deepEqual(a.estado.conexoes[1], ["begin", "lock"]);
  } finally { pausa.continuar.resolve(); }
  assert.equal((await primeira).statusCode, 200);
  const r = await segunda;
  assert.equal(r.statusCode, 409);
  assert.deepEqual(r.body, { erro: "Esta solicitação já foi analisada." });
  assert.equal(a.estado.status, primeiroStatus);
  assert.equal(a.estado.perfil, primeiroStatus === "aprovado" ? "fornecedor" : "participante");
  assert.deepEqual(a.estado.conexoes[1], ["begin", "lock", "rollback", "release"]);
});

test("falha do rollback continua propagada, com release no finally", async () => {
  const a = ambiente({ ausente: true, falharEm: "rollback" });
  await assert.rejects(() => a.request("aprovado"), /falha simulada/);
  assert.equal(a.estado.status, "pendente");
  assert.deepEqual(a.estado.conexoes[0], ["begin", "lock", "rollback", "rollback", "release"]);
});

test("falha do release apos commit continua propagada sem repetir a escrita", async () => {
  const a = ambiente({ falharEm: "release" });
  await assert.rejects(() => a.request("aprovado"), /falha simulada/);
  assert.equal(a.estado.status, "aprovado");
  assert.equal(a.estado.perfil, "fornecedor");
  assert.deepEqual(a.estado.conexoes[0], ["begin", "lock", "perfil", "status", "commit", "release"]);
});
