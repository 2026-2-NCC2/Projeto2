"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { criarRepositorioInscricoes } = require("../repositories/supabase/inscricoes.cjs");
const { criarRepositorioInscricoes: criarMySQL } = require("../repositories/mysql/inscricoes.cjs");

// Somente mocks: sem drivers, SDK, .env, sockets ou metodos de escrita.
function simular(resposta = { data: [{ id: 9 }], error: null }, falha) {
  const chamadas = [];
  const cliente = {};
  for (const metodo of ["schema", "from", "select", "eq"]) {
    cliente[metodo] = (...args) => { chamadas.push([metodo, ...args]); return cliente; };
  }
  cliente.then = (resolve, reject) => {
    chamadas.push(["executar"]);
    return (falha ? Promise.reject(falha) : Promise.resolve(resposta)).then(resolve, reject);
  };
  return { cliente, chamadas, repo: criarRepositorioInscricoes(cliente) };
}

test("evento ativo: preserva schema, projecao e os dois filtros", async () => {
  const { repo, chamadas } = simular();
  assert.deepEqual(await repo.buscarEventoAtivo(9), [{ id: 9 }]);
  assert.deepEqual(chamadas, [["schema", "public"], ["from", "eventos"],
    ["select", "id"], ["eq", "id", 9], ["eq", "status", "Ativo"], ["executar"]]);
});

test("evento ativo: preserva array, tipos, campos e JSON do MySQL", async () => {
  const mysql = criarMySQL({ async execute(sql, parametros) {
    assert.equal(sql, "SELECT id FROM eventos WHERE id = ? AND status = 'Ativo'");
    assert.deepEqual(parametros, [9]);
    return [[{ id: 9 }]];
  } });
  const esperado = await mysql.buscarEventoAtivo(9);
  const recebido = await simular().repo.buscarEventoAtivo(9);
  assert.deepEqual(recebido, esperado);
  assert.equal(JSON.stringify(recebido), JSON.stringify(esperado));
});

test("evento ativo: indisponivel ou inexistente retorna array vazio como no MySQL", async () => {
  const mysql = criarMySQL({ async execute() { return [[]]; } });
  const { repo } = simular({ data: [], error: null });
  assert.deepEqual(await repo.buscarEventoAtivo(9), await mysql.buscarEventoAtivo(9));
});

test("evento ativo: propaga erros PostgREST sem confundir com indisponibilidade", async () => {
  for (const code of ["42501", "PGRST205", "57014"]) {
    const erro = { code, message: "falha simulada" };
    const { repo, chamadas } = simular({ data: null, error: erro });
    await assert.rejects(repo.buscarEventoAtivo(9), recebido => recebido === erro);
    assert.equal(chamadas.filter(c => c[0] === "executar").length, 1);
  }
});

test("evento ativo: transporte falha sem retry ou fallback", async () => {
  const erro = new Error("rede simulada indisponivel");
  const { repo, chamadas } = simular(undefined, erro);
  await assert.rejects(repo.buscarEventoAtivo(9), recebido => recebido === erro);
  assert.equal(chamadas.length, 6);
});

test("evento ativo: erro tem prioridade sobre dados parciais ou lista vazia", async () => {
  const erro = { code: "42501" };
  for (const data of [[], [{ id: 9 }]]) {
    await assert.rejects(simular({ data, error: erro }).repo.buscarEventoAtivo(9),
      recebido => recebido === erro);
  }
});

test("evento ativo: rejeita resposta malformada, multiplicidade ou outro evento", async () => {
  for (const data of [undefined, null, {}, "texto", [null], [[]], [{}],
    [{ id: "9" }], [{ id: 10 }], [{ id: 9 }, { id: 9 }]]) {
    await assert.rejects(simular({ data, error: null }).repo.buscarEventoAtivo(9),
      { code: "SUPABASE_INSCRICAO_RESPONSE" });
  }
});

test("evento ativo: nao retorna campos extras nem modifica resposta", async () => {
  const data = Object.freeze([Object.freeze({ id: 9, nome: "Evento ficticio", usuario_id: 7 })]);
  const recebido = await simular({ data, error: null }).repo.buscarEventoAtivo(9);
  assert.deepEqual(recebido, [{ id: 9 }]);
  assert.equal(data[0].nome, "Evento ficticio");
});

function carregarFabrica(falha) {
  const { cliente } = simular();
  const imports = [];
  let criacoes = 0;
  const contexto = { module: { exports: {} }, require(nome) {
    imports.push(nome);
    assert.equal(nome, "../../db-supabase.cjs");
    return { criarClienteSupabase() {
      criacoes++;
      if (falha) throw falha;
      return cliente;
    } };
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,
    "../repositories/supabase/inscricoes.cjs"), "utf8"), contexto);
  return { criar: contexto.module.exports.criarRepositorioInscricoes,
    imports, criacoes: () => criacoes };
}

test("evento ativo: importacao inerte e reutilizacao da fabrica existente", async () => {
  const a = carregarFabrica();
  assert.deepEqual(a.imports, []);
  assert.equal(a.criacoes(), 0);
  const repo = a.criar();
  assert.deepEqual(JSON.parse(JSON.stringify(await repo.buscarEventoAtivo(9))), [{ id: 9 }]);
  assert.equal(a.criacoes(), 1);
  assert.deepEqual(a.imports, ["../../db-supabase.cjs"]);
  assert.deepEqual(Object.keys(repo), ["buscarPorUsuarioEEvento", "buscarEventoAtivo", "listarPorUsuario"]);
});

test("evento ativo: cliente injetado nao inicializa fabrica ou SDK", async () => {
  const a = carregarFabrica(new Error("fabrica nao deve ser chamada"));
  const { cliente } = simular({ data: [], error: null });
  assert.deepEqual(JSON.parse(JSON.stringify(await a.criar(cliente).buscarEventoAtivo(9))), []);
  assert.deepEqual(a.imports, []);
  assert.equal(a.criacoes(), 0);
});

test("evento ativo: recusa configuracao/isolamento sem fallback", () => {
  for (const code of ["SUPABASE_CONFIG", "SUPABASE_PROVIDER", "DB_PROVIDER_ISOLATED"]) {
    const erro = Object.assign(new Error("configuracao simulada recusada"), { code });
    const a = carregarFabrica(erro);
    assert.throws(() => a.criar(), recebido => recebido === erro);
    assert.equal(a.criacoes(), 1);
    assert.deepEqual(a.imports, ["../../db-supabase.cjs"]);
  }
});
