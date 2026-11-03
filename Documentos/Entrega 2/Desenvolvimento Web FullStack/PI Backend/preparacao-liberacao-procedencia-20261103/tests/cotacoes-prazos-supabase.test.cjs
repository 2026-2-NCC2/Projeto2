"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const cotacao = id => ({ id, evento_id: 9, prazo: "2030-02-01", modalidade: "Fechada", observacoes: null,
  status: "Aberta", criada_em: "2030-01-01T10:00:00-03:00",
  evento: { nome: " Evento Á ", data: "2030-02-02", local: " Local " } });
const casos = [
  { dominio: "cotacoes", fabrica: "criarRepositorioCotacoes", metodo: "listarDisponiveisParaFornecedor", args: [],
    lista: true, code: "SUPABASE_COTACAO_RESPONSE",
    selecao: "id, evento_id, prazo, modalidade, observacoes, status, criada_em, evento:eventos!inner(nome, data, local)",
    filtros: [], linha: cotacao,
    esperado: id => ({ id, evento_id: 9, evento_nome: " Evento Á ", evento_data: new Date(2030, 1, 2),
      evento_local: " Local ", prazo: new Date(2030, 1, 1), modalidade: "Fechada", observacoes: null,
      status: "Aberta", criada_em: new Date("2030-01-01T13:00:00Z") }) },
  { dominio: "propostas", fabrica: "criarRepositorioPropostas", metodo: "buscarCotacaoDisponivel", args: ["013"],
    lista: false, code: "SUPABASE_PROPOSTA_RESPONSE", selecao: "id", filtros: [["id", "013"]],
    linha: id => ({ id }), esperado: id => ({ id }) },
];

// Somente mocks. O relogio do Node nao e usado para construir o filtro.
function simular(caso, paginas) {
  const chamadas = [];
  let indice = 0;
  const cliente = { schema(...args) {
    const passos = [["schema", ...args]];
    chamadas.push(passos);
    const consulta = {};
    for (const metodo of ["from", "select", "eq", "gte", "order", "range"]) {
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
  test(`${caso.metodo}: campos, tipos, JSON e filtros inclusivos correspondem ao contrato`, async () => {
    const criar = require(`../repositories/mysql/${caso.dominio}.cjs`)[caso.fabrica];
    const sqlMock = async (sql, parametros) => {
      assert.match(sql, /status = 'Aberta'/);
      assert.match(sql, /prazo >= CURDATE\(\)/);
      assert.deepEqual(parametros, caso.args.length ? caso.args : undefined);
      return [[caso.esperado(13)]];
    };
    const mysql = criar({ query: sqlMock, execute: sqlMock });
    const { repo, chamadas } = simular(caso, [{ data: [caso.linha(13)], error: null, count: 1 }]);
    const recebido = await repo[caso.metodo](...caso.args);
    const esperado = await mysql[caso.metodo](...caso.args);
    assert.deepEqual(recebido, esperado);
    assert.equal(JSON.stringify(recebido), JSON.stringify(esperado));
    assert.deepEqual(chamadas, [[["schema", "public"], ["from", "cotacoes"],
      ...(caso.lista ? [["select", caso.selecao, { count: "exact" }]] : [["select", "id"]]),
      ...caso.filtros.map(f => ["eq", ...f]), ["eq", "status", "Aberta"], ["gte", "prazo", "today"],
      ...(caso.lista ? [["order", "id", { ascending: false }], ["range", 0, 999]] : [])]]);
  });

  test(`${caso.metodo}: ausencia retorna array vazio`, async () => {
    const { repo, chamadas } = simular(caso, [{ data: [], error: null, count: 0 }]);
    assert.deepEqual(await repo[caso.metodo](...caso.args), []);
    assert.equal(chamadas.length, 1);
  });

  test(`${caso.metodo}: falhas de API nao viram indisponibilidade nem repeticao`, async () => {
    for (const code of ["42501", "PGRST200", "57014"]) {
      const erro = { code, message: "falha simulada" };
      const { repo, chamadas } = simular(caso, [{ data: [caso.linha(13)], error: erro, count: 1 }]);
      await assert.rejects(repo[caso.metodo](...caso.args), e => e === erro);
      assert.equal(chamadas.length, 1);
    }
  });

  test(`${caso.metodo}: falha de transporte nao gera retry/fallback`, async () => {
    const erro = new Error("rede simulada indisponivel");
    const { repo, chamadas } = simular(caso, [erro]);
    await assert.rejects(repo[caso.metodo](...caso.args), e => e === erro);
    assert.equal(chamadas.length, 1);
  });

  test(`${caso.metodo}: respostas malformadas sao recusadas`, async () => {
    for (const data of [null, {}, [null], [{}], [{ id: "13" }]]) {
      await assert.rejects(simular(caso, [{ data, error: null, count: 1 }]).repo[caso.metodo](...caso.args),
        { code: caso.code });
    }
  });

  test(`${caso.metodo}: nao retorna extras nem modifica resposta`, async () => {
    const row = Object.freeze({ ...caso.linha(13), extra: "nao retornar" });
    const { repo } = simular(caso, [{ data: Object.freeze([row]), error: null, count: 1 }]);
    assert.deepEqual(await repo[caso.metodo](...caso.args), [caso.esperado(13)]);
    assert.equal(row.extra, "nao retornar");
  });

  test(`${caso.metodo}: cada chamada reenvia today sem congelar a data no cliente`, async () => {
    const { repo, chamadas } = simular(caso, [{ data: [], error: null, count: 0 }, { data: [], error: null, count: 0 }]);
    await repo[caso.metodo](...caso.args);
    await repo[caso.metodo](...caso.args);
    assert.equal(chamadas.length, 2);
    for (const passos of chamadas) assert.deepEqual(passos.filter(p => p[0] === "gte"), [["gte", "prazo", "today"]]);
  });

  test(`${caso.metodo}: importacao inerte e fabrica existente`, async () => {
    const { cliente } = simular(caso, [{ data: [], error: null, count: 0 }]);
    const imports = [];
    let criacoes = 0;
    const contexto = { module: { exports: {} }, require(nome) {
      imports.push(nome);
      if (nome === "./suporte-leitura.cjs") return require("../repositories/supabase/suporte-leitura.cjs");
      assert.equal(nome, "../../db-supabase.cjs");
      return { criarClienteSupabase() { criacoes++; return cliente; } };
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,
      `../repositories/supabase/${caso.dominio}.cjs`), "utf8"), contexto);
    assert.deepEqual(imports, []);
    const repo = contexto.module.exports[caso.fabrica]();
    assert.deepEqual(JSON.parse(JSON.stringify(await repo[caso.metodo](...caso.args))), []);
    assert.equal(criacoes, 1);
    assert.equal(imports[0], "../../db-supabase.cjs");
  });
}

test("fornecedor: paginacao preserva filtros, datas, ordem e mais de mil linhas", async () => {
  const caso = casos[0];
  const ids = Array.from({ length: 1001 }, (_, i) => 1001 - i);
  const { repo, chamadas } = simular(caso, [
    { data: ids.slice(0, 1000).map(cotacao), error: null, count: 1001 },
    { data: ids.slice(1000).map(cotacao), error: null, count: 1001 },
  ]);
  assert.deepEqual(await repo.listarDisponiveisParaFornecedor(), ids.map(caso.esperado));
  assert.deepEqual(chamadas[0].slice(0, -1), chamadas[1].slice(0, -1));
  assert.deepEqual(chamadas.map(p => p.at(-1)), [["range", 0, 999], ["range", 1000, 1999]]);
});

test("fornecedor: falha na segunda pagina nao devolve lista parcial", async () => {
  const caso = casos[0];
  const erro = { code: "57014" };
  const { repo, chamadas } = simular(caso, [
    { data: [cotacao(2)], error: null, count: 2 }, { data: null, error: erro },
  ]);
  await assert.rejects(repo.listarDisponiveisParaFornecedor(), e => e === erro);
  assert.equal(chamadas.length, 2);
});
