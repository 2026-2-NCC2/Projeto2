"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { decimalTexto } = require("../repositories/supabase/suporte-leitura.cjs");

const projecaoPropostas = "id, cotacao_id, fornecedor_id, valor::text, condicoes_pagamento, detalhes_tecnicos, status, criada_em, " +
  "cotacao:cotacoes!inner(evento:eventos!inner(id, nome, usuario_id)), fornecedor:usuarios!inner(nome)";
const proposta = id => ({ id, cotacao_id: 6, fornecedor_id: 4, valor: "9999999999.99",
  condicoes_pagamento: " Pix ", detalhes_tecnicos: " Som Á ", status: "Em avaliação",
  criada_em: "2030-01-01T10:00:00-03:00", cotacao: { evento: { id: 9, nome: " Evento ", usuario_id: 7 } },
  fornecedor: { nome: " Fornecedor " } });
const esperada = id => ({ id, cotacao_id: 6, fornecedor_id: 4, valor: "9999999999.99",
  condicoes_pagamento: " Pix ", detalhes_tecnicos: " Som Á ", status: "Em avaliação",
  criada_em: new Date("2030-01-01T13:00:00Z"), evento_id: 9, evento_nome: " Evento ", fornecedor_nome: " Fornecedor " });
const casos = [
  { dominio: "propostas", fabrica: "criarRepositorioPropostas", metodo: "listarPorOrganizador", args: [7],
    tabela: "propostas", projecao: projecaoPropostas, filtros: [["cotacao.evento.usuario_id", 7]],
    ordens: [["criada_em", { ascending: false }], ["id", { ascending: false }]],
    code: "SUPABASE_PROPOSTA_RESPONSE", dinheiro: "valor", linha: proposta, esperado: esperada, organizador: true },
  { dominio: "propostas", fabrica: "criarRepositorioPropostas", metodo: "listarAdministrativo", args: [],
    tabela: "propostas", projecao: projecaoPropostas, filtros: [],
    ordens: [["criada_em", { ascending: false }], ["id", { ascending: false }]],
    code: "SUPABASE_PROPOSTA_RESPONSE", dinheiro: "valor", linha: proposta, esperado: esperada },
  { dominio: "cotacoes", fabrica: "criarRepositorioCotacoes", metodo: "listarItens", args: [6],
    tabela: "itens_cotacao", projecao: "id, categoria, descricao, valor_estimado::text",
    filtros: [["cotacao_id", 6]], ordens: [["id", { ascending: true }]],
    code: "SUPABASE_COTACAO_RESPONSE", dinheiro: "valor_estimado",
    linha: id => ({ id, categoria: " Som Á ", descricao: " sem trim ", valor_estimado: "9999999999.99" }),
    esperado: id => ({ id, categoria: " Som Á ", descricao: " sem trim ", valor_estimado: "9999999999.99" }) },
];

// Sem SDK, credenciais, drivers, .env, rede ou metodos de escrita.
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
  test(`${caso.dominio}.${caso.metodo}: joins, filtros, campos, ordem e JSON do MySQL`, async () => {
    const criar = require(`../repositories/mysql/${caso.dominio}.cjs`)[caso.fabrica];
    const mysql = criar({ async [caso.dominio === "propostas" ? "query" : "execute"](sql, parametros) {
      assert.match(sql, /ORDER BY/);
      if (caso.dominio === "propostas") {
        assert.match(sql, /INNER JOIN cotacoes/);
        assert.match(sql, /INNER JOIN eventos/);
        assert.match(sql, /INNER JOIN usuarios/);
        if (caso.organizador) assert.match(sql, /WHERE e.usuario_id = \?/);
      }
      assert.deepEqual(parametros, caso.args.length ? caso.args : undefined);
      return [[caso.esperado(2)]];
    } });
    const { repo, chamadas } = simular(caso, [{ data: [caso.linha(2)], count: 1, error: null }]);
    const recebido = await repo[caso.metodo](...caso.args);
    const esperado = await mysql[caso.metodo](...caso.args);
    assert.deepEqual(recebido, esperado);
    assert.equal(JSON.stringify(recebido), JSON.stringify(esperado));
    assert.deepEqual(chamadas, [[["schema", "public"], ["from", caso.tabela],
      ["select", caso.projecao, { count: "exact" }], ...caso.filtros.map(f => ["eq", ...f]),
      ...caso.ordens.map(o => ["order", ...o]), ["range", 0, 999]]]);
  });

  test(`${caso.metodo}: ausencia retorna array vazio sem consultas extras`, async () => {
    const { repo, chamadas } = simular(caso, [{ data: [], count: 0, error: null }]);
    assert.deepEqual(await repo[caso.metodo](...caso.args), []);
    assert.equal(chamadas.length, 1);
  });

  test(`${caso.metodo}: preserva ordem/filtros em paginas menores`, async () => {
    const ids = caso.dominio === "cotacoes" ? [1, 2] : [2, 1];
    const { repo, chamadas } = simular(caso, ids.map(id => ({ data: [caso.linha(id)], count: 2, error: null })));
    assert.deepEqual(await repo[caso.metodo](...caso.args), ids.map(caso.esperado));
    assert.deepEqual(chamadas.map(p => p.at(-1)), [["range", 0, 999], ["range", 1, 1000]]);
    assert.deepEqual(chamadas[0].slice(0, -1), chamadas[1].slice(0, -1));
  });

  test(`${caso.metodo}: mais de mil linhas nao sao truncadas`, async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => caso.dominio === "cotacoes" ? i + 1 : 1001 - i);
    const { repo } = simular(caso, [
      { data: ids.slice(0, 1000).map(caso.linha), count: 1001, error: null },
      { data: ids.slice(1000).map(caso.linha), count: 1001, error: null },
    ]);
    assert.deepEqual(await repo[caso.metodo](...caso.args), ids.map(caso.esperado));
  });

  test(`${caso.metodo}: erros PostgREST prevalecem sem retry ou resultado parcial`, async () => {
    for (const code of ["42501", "PGRST200", "57014"]) {
      const erro = { code, message: "falha simulada" };
      const { repo, chamadas } = simular(caso, [
        { data: [caso.linha(2)], count: 2, error: null }, { data: [caso.linha(1)], count: 2, error: erro },
      ]);
      await assert.rejects(repo[caso.metodo](...caso.args), e => e === erro);
      assert.equal(chamadas.length, 2);
    }
  });

  test(`${caso.metodo}: falha de transporte nao gera fallback`, async () => {
    const erro = new Error("rede simulada indisponivel");
    const { repo, chamadas } = simular(caso, [erro]);
    await assert.rejects(repo[caso.metodo](...caso.args), e => e === erro);
    assert.equal(chamadas.length, 1);
  });

  test(`${caso.metodo}: rejeita respostas malformadas e relacoes ausentes`, async () => {
    const semCampo = caso.linha(1);
    delete semCampo[caso.dinheiro];
    const invalidos = [null, {}, semCampo];
    if (caso.dominio === "propostas") invalidos.push(
      { ...caso.linha(1), cotacao: null }, { ...caso.linha(1), fornecedor: [] },
      { ...caso.linha(1), cotacao: { evento: null } });
    for (const row of invalidos) {
      await assert.rejects(simular(caso, [{ data: [row], count: 1, error: null }]).repo[caso.metodo](...caso.args),
        { code: caso.code });
    }
    await assert.rejects(simular(caso, [{ data: [], count: 1, error: null }]).repo[caso.metodo](...caso.args),
      { code: caso.code });
  });

  test(`${caso.metodo}: DECIMAL preserva strings, centavos, limite e sinal historico`, async () => {
    for (const valor of ["0.00", "0.10", "0.20", "12.30", "9999999999.99", "-10.25"]) {
      const row = { ...caso.linha(1), [caso.dinheiro]: valor };
      const [r] = await simular(caso, [{ data: [row], count: 1, error: null }]).repo[caso.metodo](...caso.args);
      assert.equal(r[caso.dinheiro], valor);
      assert.equal(typeof r[caso.dinheiro], "string");
    }
    for (const valor of [0.1, "", "NaN", "Infinity", "1.001", "1e2", "10000000000.00"]) {
      const row = { ...caso.linha(1), [caso.dinheiro]: valor };
      await assert.rejects(simular(caso, [{ data: [row], count: 1, error: null }]).repo[caso.metodo](...caso.args),
        { code: caso.code });
    }
  });

  test(`${caso.metodo}: contagem divergente e IDs repetidos nao viram lista valida`, async () => {
    for (const segunda of [{ data: [caso.linha(1)], count: 3, error: null },
      { data: [caso.linha(2)], count: 2, error: null }]) {
      await assert.rejects(simular(caso, [{ data: [caso.linha(2)], count: 2, error: null }, segunda])
        .repo[caso.metodo](...caso.args), { code: caso.code });
    }
  });

  test(`${caso.metodo}: nao modifica resposta nem retorna campos extras`, async () => {
    const row = Object.freeze({ ...caso.linha(1), extra: "nao retornar" });
    const recebido = await simular(caso, [{ data: Object.freeze([row]), count: 1, error: null }])
      .repo[caso.metodo](...caso.args);
    assert.deepEqual(recebido, [caso.esperado(1)]);
    assert.equal(row.extra, "nao retornar");
  });

  test(`${caso.metodo}: importacao inerte e reutilizacao da fabrica existente`, async () => {
    const { cliente } = simular(caso, [{ data: [], count: 0, error: null }]);
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
    assert.deepEqual(imports, ["../../db-supabase.cjs", "./suporte-leitura.cjs"]);
  });
}

test("propostas: usuario ausente ou evento alheio nunca libera consulta administrativa", async () => {
  const caso = casos[0];
  const semId = simular(caso, []);
  await assert.rejects(semId.repo.listarPorOrganizador(), { code: caso.code });
  assert.deepEqual(semId.chamadas, []);
  const row = proposta(1);
  row.cotacao.evento.usuario_id = 8;
  await assert.rejects(simular(caso, [{ data: [row], count: 1, error: null }]).repo.listarPorOrganizador(7),
    { code: caso.code });
});

test("decimalTexto e puro e nao arredonda/converte resposta numerica", () => {
  assert.equal(decimalTexto("9999999999.99", "TEST"), "9999999999.99");
  for (const valor of [NaN, Infinity, null, undefined, [], {}, " 1.00", "1.0", "01.00", "-10000000000.00"]) {
    assert.throws(() => decimalTexto(valor, "TEST"), { code: "TEST" });
  }
});
