"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const casos = [
  { dominio: "usuarios", fabrica: "criarRepositorioUsuarios", metodo: "listar", args: [],
    campos: "id, nome, email, perfil", filtros: [], crescente: false,
    sql: "SELECT id, nome, email, perfil FROM usuarios ORDER BY id DESC",
    code: "SUPABASE_USUARIO_RESPONSE",
    linha: id => ({ id, nome: " Pessoa Á ", email: "PESSOA@example.invalid", perfil: "participante" }) },
  { dominio: "solicitacoes-acesso", tabela: "solicitacoes_acesso",
    fabrica: "criarRepositorioSolicitacoesAcesso", metodo: "buscarPendentesPorUsuario", args: [7],
    campos: "id", filtros: [["usuario_id", 7], ["status", "pendente"]], crescente: true,
    sql: "SELECT id FROM solicitacoes_acesso WHERE usuario_id = ? AND status = 'pendente'",
    code: "SUPABASE_SOLICITACAO_RESPONSE", linha: id => ({ id }) },
];

// Mocks estritos: sem SDK, .env, drivers, HTTP ou metodos de escrita.
function simular(caso, paginas) {
  const chamadas = [];
  let indice = 0;
  const cliente = { schema(...args) {
    const passos = [["schema", ...args]];
    chamadas.push(passos);
    const consulta = {};
    for (const metodo of ["from", "select", "eq", "order", "range"]) {
      consulta[metodo] = (...valores) => { passos.push([metodo, ...valores]); return consulta; };
    }
    consulta.then = (resolve, reject) => {
      const pagina = paginas[indice++];
      if (pagina === undefined) return Promise.reject(Error("Consulta adicional inesperada")).then(resolve, reject);
      return (pagina instanceof Error ? Promise.reject(pagina) : Promise.resolve(pagina)).then(resolve, reject);
    };
    return consulta;
  } };
  const criar = require(`../repositories/supabase/${caso.dominio}.cjs`)[caso.fabrica];
  return { cliente, chamadas, repo: criar(cliente) };
}

for (const caso of casos) {
  test(`${caso.dominio}.${caso.metodo}: preserva filtros, campos, retorno e JSON do MySQL`, async () => {
    const ids = caso.crescente ? [1, 2] : [2, 1];
    const data = ids.map(caso.linha);
    const criar = require(`../repositories/mysql/${caso.dominio}.cjs`)[caso.fabrica];
    const mysql = criar({ async execute(sql, parametros) {
      assert.equal(sql.replace(/\s+/g, " ").trim(), caso.sql);
      assert.deepEqual(parametros, caso.args.length ? caso.args : undefined);
      return [data];
    } });
    const { repo, chamadas } = simular(caso, [{ data, count: 2, error: null }]);
    const esperado = await mysql[caso.metodo](...caso.args);
    const recebido = await repo[caso.metodo](...caso.args);
    assert.deepEqual(recebido, esperado);
    assert.equal(JSON.stringify(recebido), JSON.stringify(esperado));
    assert.deepEqual(chamadas, [[["schema", "public"], ["from", caso.tabela || caso.dominio],
      ["select", caso.campos, { count: "exact" }], ...caso.filtros.map(f => ["eq", ...f]),
      ["order", "id", { ascending: caso.crescente }], ["range", 0, 999]]]);
  });

  test(`${caso.metodo}: lista vazia nao gera consultas extras`, async () => {
    const { repo, chamadas } = simular(caso, [{ data: [], count: 0, error: null }]);
    assert.deepEqual(await repo[caso.metodo](...caso.args), []);
    assert.equal(chamadas.length, 1);
  });

  test(`${caso.metodo}: le todas as paginas mesmo com limite remoto menor`, async () => {
    const ids = caso.crescente ? [1, 2, 3] : [3, 2, 1];
    const { repo, chamadas } = simular(caso, ids.map(id => ({ data: [caso.linha(id)], count: 3, error: null })));
    assert.deepEqual(await repo[caso.metodo](...caso.args), ids.map(caso.linha));
    assert.deepEqual(chamadas.map(p => p.at(-1)), [["range", 0, 999], ["range", 1, 1000], ["range", 2, 1001]]);
    for (const pagina of chamadas) assert.deepEqual(pagina.slice(0, -1), chamadas[0].slice(0, -1));
  });

  test(`${caso.metodo}: retorna mais de mil registros sem truncar`, async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => caso.crescente ? i + 1 : 1001 - i);
    const { repo, chamadas } = simular(caso, [
      { data: ids.slice(0, 1000).map(caso.linha), count: 1001, error: null },
      { data: ids.slice(1000).map(caso.linha), count: 1001, error: null },
    ]);
    assert.deepEqual(await repo[caso.metodo](...caso.args), ids.map(caso.linha));
    assert.equal(chamadas.length, 2);
  });

  test(`${caso.metodo}: propaga falhas PostgREST sem retry ou resultado parcial`, async () => {
    for (const code of ["42501", "PGRST205", "57014"]) {
      const erro = { code, message: "falha simulada" };
      const { repo, chamadas } = simular(caso, [
        { data: [caso.linha(1)], count: 2, error: null },
        { data: [caso.linha(2)], count: 2, error: erro },
      ]);
      await assert.rejects(repo[caso.metodo](...caso.args), e => e === erro);
      assert.equal(chamadas.length, 2);
    }
  });

  test(`${caso.metodo}: falha de transporte e propagada sem fallback`, async () => {
    const erro = new Error("rede simulada indisponivel");
    const { repo, chamadas } = simular(caso, [erro]);
    await assert.rejects(repo[caso.metodo](...caso.args), e => e === erro);
    assert.equal(chamadas.length, 1);
  });

  test(`${caso.metodo}: rejeita resposta invalida e pagina incompleta`, async () => {
    for (const pagina of [{ data: [], count: null }, { data: [], count: -1 },
      { data: null, count: 0 }, { data: [], count: 1 }, { data: [null], count: 1 },
      { data: [{}], count: 1 }, { data: [{ id: "1" }], count: 1 },
      { data: [caso.linha(1)], count: 0 }]) {
      await assert.rejects(simular(caso, [{ ...pagina, error: null }]).repo[caso.metodo](...caso.args),
        { code: caso.code });
    }
  });

  test(`${caso.metodo}: detecta contagem divergente e IDs repetidos entre paginas`, async () => {
    for (const segunda of [{ data: [caso.linha(2)], count: 3, error: null },
      { data: [caso.linha(1)], count: 2, error: null }]) {
      const { repo, chamadas } = simular(caso, [{ data: [caso.linha(1)], count: 2, error: null }, segunda]);
      await assert.rejects(repo[caso.metodo](...caso.args), { code: caso.code });
      assert.equal(chamadas.length, 2);
    }
  });

  test(`${caso.metodo}: projecao nao vaza extras nem modifica os dados`, async () => {
    const row = Object.freeze({ ...caso.linha(1), senha: "hash-ficticio", extra: "nao retornar" });
    const { repo } = simular(caso, [{ data: Object.freeze([row]), count: 1, error: null }]);
    assert.deepEqual(await repo[caso.metodo](...caso.args), [caso.linha(1)]);
    assert.equal(row.extra, "nao retornar");
  });

  test(`${caso.metodo}: importacao inerte e reutilizacao da fabrica existente`, async () => {
    const { cliente } = simular(caso, [{ data: [], count: 0, error: null }]);
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
    assert.equal(criacoes, 0);
    const repo = contexto.module.exports[caso.fabrica]();
    assert.deepEqual(JSON.parse(JSON.stringify(await repo[caso.metodo](...caso.args))), []);
    assert.equal(criacoes, 1);
    assert.deepEqual(imports, ["../../db-supabase.cjs"]);
  });
}
