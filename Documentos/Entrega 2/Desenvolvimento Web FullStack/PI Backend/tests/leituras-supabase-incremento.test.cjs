"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Tres consultas pontuais: somente mocks. Sem SDK, credenciais, .env ou sockets.
const casos = [
  { dominio: "usuarios", fabrica: "criarRepositorioUsuarios", metodo: "buscarParaLogin",
    args: [" Pessoa@example.invalid "], tabela: "usuarios", campos: "id, nome, email, senha, perfil",
    filtros: [["email", " Pessoa@example.invalid "]], unico: true,
    linha: { id: 7, nome: " Pessoa Á ", email: "pessoa@example.invalid",
      senha: "hash-exclusivamente-ficticio", perfil: "participante" },
    sql: "SELECT id, nome, email, senha, perfil FROM usuarios WHERE email = ?",
    code: "SUPABASE_USUARIO_RESPONSE" },
  { dominio: "inscricoes", fabrica: "criarRepositorioInscricoes", metodo: "buscarPorUsuarioEEvento",
    args: [7, 9], tabela: "inscricoes", campos: "id",
    filtros: [["usuario_id", 7], ["evento_id", 9]], unico: false, linha: { id: 2 },
    sql: "SELECT id FROM inscricoes WHERE usuario_id = ? AND evento_id = ?",
    code: "SUPABASE_INSCRICAO_RESPONSE" },
  { dominio: "custos", fabrica: "criarRepositorioCustos", metodo: "buscarEventoDoUsuario",
    args: [9, 7], tabela: "eventos", campos: "id",
    filtros: [["id", 9], ["usuario_id", 7]], unico: false, linha: { id: 9 },
    sql: "SELECT id FROM eventos WHERE id = ? AND usuario_id = ?",
    code: "SUPABASE_CUSTO_RESPONSE" },
];

function simular(caso, resposta, falha) {
  const chamadas = [];
  const cliente = {};
  for (const metodo of ["schema", "from", "select", "eq"]) {
    cliente[metodo] = (...args) => { chamadas.push([metodo, ...args]); return cliente; };
  }
  const executar = async () => {
    chamadas.push(["executar"]);
    if (falha) throw falha;
    return resposta;
  };
  cliente.then = (resolve, reject) => executar().then(resolve, reject);
  cliente.maybeSingle = () => { chamadas.push(["maybeSingle"]); return executar(); };
  const criar = require(`../repositories/supabase/${caso.dominio}.cjs`)[caso.fabrica];
  return { cliente, chamadas, repo: criar(cliente) };
}

for (const caso of casos) {
  const data = caso.unico ? caso.linha : [caso.linha];
  const vazio = caso.unico ? null : [];

  test(`${caso.metodo}: preserva filtros, projecao, campos, tipos e JSON do MySQL`, async () => {
    const criar = require(`../repositories/mysql/${caso.dominio}.cjs`)[caso.fabrica];
    const mysql = criar({ async execute(sql, parametros) {
      assert.equal(sql, caso.sql);
      assert.deepEqual(parametros, caso.args);
      return [[caso.linha]];
    } });
    const { repo, chamadas } = simular(caso, { data, error: null });
    const esperado = await mysql[caso.metodo](...caso.args);
    const recebido = await repo[caso.metodo](...caso.args);
    assert.deepEqual(recebido, esperado);
    assert.equal(JSON.stringify(recebido), JSON.stringify(esperado));
    assert.deepEqual(chamadas, [["schema", "public"], ["from", caso.tabela],
      ["select", caso.campos], ...caso.filtros.map(f => ["eq", ...f]),
      ...(caso.unico ? [["maybeSingle"]] : []), ["executar"]]);
  });

  test(`${caso.metodo}: preserva ausencia como undefined ou array vazio`, async () => {
    const { repo } = simular(caso, { data: vazio, error: null });
    assert.deepEqual(await repo[caso.metodo](...caso.args), caso.unico ? undefined : []);
  });

  test(`${caso.metodo}: falhas PostgREST prevalecem sem retry ou fallback`, async () => {
    for (const code of ["42501", "PGRST116", "PGRST205", "57014"]) {
      const erro = { code, message: "falha simulada" };
      for (const parcial of [null, data]) {
        const { repo, chamadas } = simular(caso, { data: parcial, error: erro });
        await assert.rejects(repo[caso.metodo](...caso.args), recebido => recebido === erro);
        assert.equal(chamadas.filter(c => c[0] === "executar").length, 1);
      }
    }
  });

  test(`${caso.metodo}: falha de transporte e propagada uma unica vez`, async () => {
    const erro = new Error("rede simulada indisponivel");
    const { repo, chamadas } = simular(caso, undefined, erro);
    await assert.rejects(repo[caso.metodo](...caso.args), recebido => recebido === erro);
    assert.equal(chamadas.filter(c => c[0] === "executar").length, 1);
  });

  test(`${caso.metodo}: respostas malformadas nao viram resultados validos`, async () => {
    const invalidas = caso.unico
      ? [undefined, [], "texto", {}, { ...caso.linha, id: "7" }]
      : [undefined, null, {}, "texto", [null], [[]], [{}], [{ id: "9" }], [caso.linha, caso.linha]];
    for (const invalida of invalidas) {
      const { repo } = simular(caso, { data: invalida, error: null });
      await assert.rejects(repo[caso.metodo](...caso.args), { code: caso.code });
    }
  });

  test(`${caso.metodo}: projecao nao vaza extras nem modifica a resposta`, async () => {
    const linha = Object.freeze({ ...caso.linha, token: "token-ficticio", extra: "nao retornar" });
    const original = caso.unico ? linha : Object.freeze([linha]);
    const { repo } = simular(caso, { data: original, error: null });
    assert.deepEqual(await repo[caso.metodo](...caso.args), data);
    assert.equal(linha.extra, "nao retornar");
  });

  test(`${caso.metodo}: sem cache, rele dados e ausencia a cada chamada`, async () => {
    const resposta = { data, error: null };
    const { repo, chamadas } = simular(caso, resposta);
    assert.deepEqual(await repo[caso.metodo](...caso.args), data);
    resposta.data = vazio;
    assert.deepEqual(await repo[caso.metodo](...caso.args), caso.unico ? undefined : []);
    assert.equal(chamadas.filter(c => c[0] === "executar").length, 2);
  });

  test(`${caso.metodo}: importacao inerte e fabrica existente sem configuracao alternativa`, async () => {
    const { cliente } = simular(caso, { data, error: null });
    const imports = [];
    let criacoes = 0;
    const contexto = { module: { exports: {} }, require(nome) {
      imports.push(nome);
      assert.equal(nome, "../../db-supabase.cjs");
      return { criarClienteSupabase() { criacoes++; return cliente; } };
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,
      `../repositories/supabase/${caso.dominio}.cjs`), "utf8"), contexto);
    assert.deepEqual(imports, []);
    const criar = contexto.module.exports[caso.fabrica];
    await criar(cliente)[caso.metodo](...caso.args);
    assert.deepEqual(imports, []);
    const recebido = await criar()[caso.metodo](...caso.args);
    assert.deepEqual(JSON.parse(JSON.stringify(recebido)), data);
    assert.equal(criacoes, 1);
    assert.deepEqual(imports, ["../../db-supabase.cjs"]);
  });
}
