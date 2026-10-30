"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { criarRepositorioCustos } = require("../repositories/supabase/custos.cjs");
const { criarRepositorioCustos: criarMySQL } = require("../repositories/mysql/custos.cjs");
const linha = (id = 1, valor_estimado = "0.10") => ({ id, evento_id: 13,
  categoria: " Áudio 😀 ", descricao: " PA \n ", valor_estimado });
const code = "SUPABASE_CUSTO_RESPONSE";

// Consultas inteiramente falsas: nenhum driver, arquivo privado ou servidor.
function mock(responder) {
  const chamadas = [];
  let paginas = 0;
  const cliente = { schema(esquema) {
    chamadas.push(["schema", esquema]);
    const consulta = {};
    for (const metodo of ["from", "select", "eq", "order", "retry"]) {
      consulta[metodo] = (...args) => { chamadas.push([metodo, ...args]); return consulta; };
    }
    consulta.range = async (inicio, fim) => {
      paginas++; chamadas.push(["range", inicio, fim]); return responder(inicio, fim, paginas);
    };
    return consulta;
  } };
  return { chamadas, cliente, get paginas() { return paginas; }, repo: criarRepositorioCustos(cliente) };
}

test("GET independente: mesmo contrato MySQL, cinco campos, filtro e ordem ascendente", async () => {
  const rows = [linha(2, "0.00"), linha(7, "0.10"), linha(9, "0.20"), linha(11, "9999999999.99")];
  const mysql = criarMySQL({ async execute(sql, args) {
    assert.equal(sql.replace(/\s+/g, " ").trim(),
      "SELECT id, evento_id, categoria, descricao, valor_estimado FROM custos_evento WHERE evento_id = ? ORDER BY id");
    assert.deepEqual(args, [13]); return [rows];
  } });
  const m = mock(() => ({ data: rows, count: rows.length, error: null }));
  assert.deepEqual(await m.repo.listarPorEvento(13), await mysql.listarPorEvento(13));
  assert.deepEqual(m.chamadas, [["schema", "public"], ["from", "custos_evento"],
    ["select", "id, evento_id, categoria, descricao, valor_estimado::text", { count: "exact" }],
    ["eq", "evento_id", 13], ["order", "id", { ascending: true }], ["retry", false], ["range", 0, 999]]);
});

test("leitura preserva negativos historicos, strings vazias, Unicode e espacos", async () => {
  const rows = [linha(1, "-9999999999.99"), { ...linha(2, "-0.10"), categoria: "", descricao: "" }];
  const original = structuredClone(rows);
  const m = mock(() => ({ data: rows, count: 2 }));
  assert.deepEqual(await m.repo.listarPorEvento(13), original);
  assert.deepEqual(rows, original); // nao normalizar pela validacao de gravacao
});

test("lista vazia confirma ausencia de custos, sem confundir com ausencia do evento", async () => {
  const m = mock(() => ({ data: [], count: 0 }));
  assert.deepEqual(await m.repo.listarPorEvento(13), []);
  assert.equal(m.paginas, 1); // propriedade pertence ao chamador, nao a esta query
});

test("projeta somente os cinco campos sem modificar resposta congelada", async () => {
  const row = Object.freeze({ ...linha(), extra: "nao retornar", token: "ficticio" });
  const rows = Object.freeze([row]);
  const m = mock(() => ({ data: rows, count: 1 }));
  assert.deepEqual(await m.repo.listarPorEvento(13), [linha()]);
  assert.equal(row.extra, "nao retornar");
});

test("paginacao recupera a lista inteira, inclusive se a API limita paginas a 500", async () => {
  const rows = Array.from({ length: 1205 }, (_, i) => linha(i + 1));
  const m = mock(inicio => ({ data: rows.slice(inicio, inicio + 500), count: rows.length }));
  assert.deepEqual(await m.repo.listarPorEvento(13), rows);
  assert.deepEqual(m.chamadas.filter(c => c[0] === "range"),
    [["range", 0, 999], ["range", 500, 1499], ["range", 1000, 1999]]);
  assert.equal(m.chamadas.filter(c => c[0] === "eq").length, 3);
});

test("falhas PostgREST, rede ou pagina posterior propagam sem devolver lista parcial", async () => {
  for (const etapa of [1, 2]) {
    for (const transporte of [false, true]) {
      const erro = Object.assign(Error("falha sintetica"), { code: "42501" });
      const m = mock((_inicio, _fim, pagina) => {
        if (pagina === etapa) {
          if (transporte) throw erro;
          return { data: [linha()], count: 2, error: erro }; // erro prevalece
        }
        return { data: [linha()], count: 2 };
      });
      await assert.rejects(m.repo.listarPorEvento(13), e => e === erro);
      assert.equal(m.paginas, etapa);
    }
  }
});

test("paginacao inconsistente falha: contagem alterada, pagina vazia, IDs repetidos ou fora de ordem", async () => {
  for (const segunda of [{ data: [], count: 2 }, { data: [linha(2)], count: 3 },
    { data: [linha(4)], count: 2 }, { data: [linha(3)], count: 2 }]) {
    const m = mock((_inicio, _fim, n) => n === 1 ? { data: [linha(4)], count: 2 } : segunda);
    await assert.rejects(m.repo.listarPorEvento(13), { code });
  }
  for (const resposta of [{ data: [linha(4), linha(3)], count: 2 }, { data: [linha()], count: 0 }, { data: [], count: undefined },
    { data: [], count: -1 }, { data: [], count: "0" }, { data: null, count: 0 }]) {
    const m = mock(() => resposta);
    await assert.rejects(m.repo.listarPorEvento(13), { code });
  }
});

test("campos invalidos, outro evento, arrays esparsos e dinheiro nao textual sao rejeitados", async () => {
  const invalidos = [null, [], {}, { ...linha(), id: "1" }, { ...linha(), id: 0 },
    { ...linha(), evento_id: 14 }, { ...linha(), evento_id: "13" },
    { ...linha(), categoria: null }, { ...linha(), descricao: 1 },
    ...[undefined, null, 0.1, NaN, Infinity, "", "1.0", "1.001", "10000000000.00", "+0.10", "0.10\n", "0.10\r\n"]
      .map(valor => ({ ...linha(), valor_estimado: valor })),
    { id: 1, evento_id: 13, categoria: "Som", descricao: "PA" }];
  for (const row of invalidos) {
    const m = mock(() => ({ data: [row], count: 1 }));
    await assert.rejects(m.repo.listarPorEvento(13), { code });
  }
  const esparso = mock(() => ({ data: Array(1), count: 1 }));
  await assert.rejects(esparso.repo.listarPorEvento(13), { code });
});

test("qualquer segundo argumento e recusado antes de montar consulta", async () => {
  for (const conexao of [undefined, null, {}, { execute() { throw Error("Nao deve usar"); } }]) {
    const m = mock(() => { throw Error("Nao deve consultar"); });
    await assert.rejects(m.repo.listarPorEvento(13, conexao), { code: "SUPABASE_CUSTO_CONNECTION_UNSUPPORTED" });
    assert.deepEqual(m.chamadas, []);
  }
});

test("chamadas nao compartilham evento, cache ou verificacao de ordem", async () => {
  let evento = 13;
  const m = mock(() => ({ data: [{ ...linha(), evento_id: evento }], count: 1 }));
  assert.equal((await m.repo.listarPorEvento(13))[0].evento_id, 13);
  evento = 14;
  assert.equal((await m.repo.listarPorEvento(14))[0].evento_id, 14);
  assert.deepEqual(m.chamadas.filter(c => c[0] === "eq"), [["eq", "evento_id", 13], ["eq", "evento_id", 14]]);
});

test("importacao inerte e cliente/fabrica existentes; guard de conexao nao importa helper", async () => {
  const arquivo = path.join(__dirname, "../repositories/supabase/custos.cjs");
  const m = mock(() => ({ data: [], count: 0 }));
  const imports = [];
  let criacoes = 0;
  const contexto = { module: { exports: {} }, require(nome) {
    imports.push(nome);
    if (nome === "./suporte-leitura.cjs") return require("../repositories/supabase/suporte-leitura.cjs");
    assert.equal(nome, "../../db-supabase.cjs"); return { criarClienteSupabase() { criacoes++; return m.cliente; } };
  } };
  vm.runInNewContext(fs.readFileSync(arquivo, "utf8"), contexto);
  assert.deepEqual(imports, []);
  const criar = contexto.module.exports.criarRepositorioCustos;
  await assert.rejects(criar(m.cliente).listarPorEvento(13, undefined));
  assert.deepEqual(imports, []);
  await criar(m.cliente).listarPorEvento(13); assert.equal(criacoes, 0);
  await criar().listarPorEvento(13); assert.equal(criacoes, 1);
});

test("SDK real com fetch falso solicita numeric::text por GET e nao repete 503", async () => {
  const { createClient } = require("@supabase/supabase-js");
  for (const falhar of [false, true]) {
    let chamadas = 0;
    const cliente = createClient("https://exemplo.invalid", "sb_secret_exclusivamente_ficticio", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (url, opcoes) => {
        chamadas++;
        const destino = new URL(url);
        assert.equal(destino.origin + destino.pathname, "https://exemplo.invalid/rest/v1/custos_evento");
        assert.equal(opcoes.method, "GET");
        assert.equal(destino.searchParams.get("select"), "id,evento_id,categoria,descricao,valor_estimado::text");
        assert.equal(destino.searchParams.get("evento_id"), "eq.13");
        assert.equal(destino.searchParams.get("order"), "id.asc");
        assert.equal(destino.searchParams.get("offset"), "0");
        assert.equal(destino.searchParams.get("limit"), "1000");
        assert.equal(new Headers(opcoes.headers).get("prefer"), "count=exact");
        return new Response(JSON.stringify(falhar ? { code: "53300", message: "erro sintetico" } : [linha()]),
          { status: falhar ? 503 : 200, headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" } });
      } },
    });
    const promessa = criarRepositorioCustos(cliente).listarPorEvento(13);
    if (falhar) await assert.rejects(promessa, e => e.code === "53300");
    else assert.deepEqual(await promessa, [linha()]);
    assert.equal(chamadas, 1);
  }
});
