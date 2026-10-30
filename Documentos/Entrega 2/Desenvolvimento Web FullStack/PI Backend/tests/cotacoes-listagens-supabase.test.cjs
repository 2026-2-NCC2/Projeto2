"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const { criarRepositorioCotacoes } = require("../repositories/supabase/cotacoes.cjs");
const { criarRepositorioCotacoes: criarMySQL } = require("../repositories/mysql/cotacoes.cjs");

const campos = "id, evento_id, prazo, modalidade, observacoes, status, criada_em";
const casos = [
  { metodo: "listarPorOrganizador", args: [7], organizador: true },
  { metodo: "listarAdministrativo", args: [], organizador: false },
];

function linha(id = 2) {
  return { id, evento_id: 9, prazo: "2030-03-01", modalidade: " Fechada ", observacoes: null,
    status: "Aberta", criada_em: "2030-02-01T10:00:00-03:00",
    evento: { nome: " Evento Á ", data: "2030-03-02", local: " Local ", usuario_id: 7 } };
}

function esperado(caso, id = 2) {
  return { id, evento_id: 9, evento_nome: " Evento Á ",
    ...(caso.organizador ? { evento_data: new Date(2030, 2, 2), evento_local: " Local " } : {}),
    prazo: new Date(2030, 2, 1), modalidade: " Fechada ", observacoes: null,
    status: "Aberta", criada_em: new Date("2030-02-01T13:00:00Z") };
}

// Nenhum driver/SDK ou acesso a rede. Consultas terminam em promises simuladas.
function simular(paginas) {
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
  return { cliente, chamadas, repo: criarRepositorioCotacoes(cliente) };
}

for (const caso of casos) {
  test(`${caso.metodo}: INNER JOIN, filtros, projecao, ordem, tipos e JSON do MySQL`, async () => {
    const mysql = criarMySQL({ async execute(sql, parametros) {
      assert.match(sql, /INNER JOIN eventos e ON e.id = c.evento_id/);
      assert.match(sql, /ORDER BY c.id DESC/);
      assert.deepEqual(parametros, caso.organizador ? [7] : undefined);
      return [[esperado(caso)]];
    } });
    const { repo, chamadas } = simular([{ data: [linha()], count: 1, error: null }]);
    const recebido = await repo[caso.metodo](...caso.args);
    const contrato = await mysql[caso.metodo](...caso.args);
    assert.deepEqual(recebido, contrato);
    assert.equal(JSON.stringify(recebido), JSON.stringify(contrato));
    const eventoCampos = caso.organizador ? "nome, data, local, usuario_id" : "nome";
    assert.deepEqual(chamadas, [[["schema", "public"], ["from", "cotacoes"],
      ["select", `${campos}, evento:eventos!inner(${eventoCampos})`, { count: "exact" }],
      ...(caso.organizador ? [["eq", "evento.usuario_id", 7]] : []),
      ["order", "id", { ascending: false }], ["range", 0, 999]]]);
  });

  test(`${caso.metodo}: ausencia retorna array vazio`, async () => {
    const { repo, chamadas } = simular([{ data: [], count: 0, error: null }]);
    assert.deepEqual(await repo[caso.metodo](...caso.args), []);
    assert.equal(chamadas.length, 1);
  });

  test(`${caso.metodo}: mantem ordem e filtros em paginas menores que o limite`, async () => {
    const { repo, chamadas } = simular([2, 1].map(id => ({ data: [linha(id)], count: 2, error: null })));
    assert.deepEqual(await repo[caso.metodo](...caso.args), [esperado(caso, 2), esperado(caso, 1)]);
    assert.deepEqual(chamadas.map(p => p.at(-1)), [["range", 0, 999], ["range", 1, 1000]]);
    assert.deepEqual(chamadas[0].slice(0, -1), chamadas[1].slice(0, -1));
  });

  test(`${caso.metodo}: retorna mais de mil linhas sem truncamento`, async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => 1001 - i);
    const { repo } = simular([
      { data: ids.slice(0, 1000).map(linha), count: 1001, error: null },
      { data: ids.slice(1000).map(linha), count: 1001, error: null },
    ]);
    assert.deepEqual(await repo[caso.metodo](...caso.args), ids.map(id => esperado(caso, id)));
  });

  test(`${caso.metodo}: propaga erros de API sem retry ou lista parcial`, async () => {
    for (const code of ["42501", "PGRST200", "57014"]) {
      const erro = { code, message: "falha simulada" };
      const { repo, chamadas } = simular([
        { data: [linha(2)], count: 2, error: null }, { data: [linha(1)], count: 2, error: erro },
      ]);
      await assert.rejects(repo[caso.metodo](...caso.args), e => e === erro);
      assert.equal(chamadas.length, 2);
    }
  });

  test(`${caso.metodo}: transporte falha sem retry/fallback`, async () => {
    const erro = new Error("rede simulada indisponivel");
    const { repo, chamadas } = simular([erro]);
    await assert.rejects(repo[caso.metodo](...caso.args), e => e === erro);
    assert.equal(chamadas.length, 1);
  });

  test(`${caso.metodo}: rejeita dados, contagens e joins invalidos`, async () => {
    for (const pagina of [{ data: [], count: null }, { data: [], count: 1 },
      { data: null, count: 0 }, { data: [null], count: 1 }, { data: [{}], count: 1 },
      { data: [{ ...linha(), evento: null }], count: 1 },
      { data: [{ ...linha(), evento: [] }], count: 1 }]) {
      await assert.rejects(simular([{ ...pagina, error: null }]).repo[caso.metodo](...caso.args),
        { code: "SUPABASE_COTACAO_RESPONSE" });
    }
  });

  test(`${caso.metodo}: rejeita datas invalidas, timestamps sem offset e overflow`, async () => {
    const invalidas = [
      { ...linha(), prazo: "2030-02-30" }, { ...linha(), prazo: "infinity" },
      { ...linha(), criada_em: "2030-02-01T10:00:00" },
      { ...linha(), criada_em: "2030-02-30T10:00:00Z" },
      { ...linha(), criada_em: "2030-02-01T24:00:00Z" },
    ];
    for (const data of invalidas) {
      await assert.rejects(simular([{ data: [data], count: 1, error: null }])
        .repo[caso.metodo](...caso.args), { code: "SUPABASE_COTACAO_RESPONSE" });
    }
  });

  test(`${caso.metodo}: detecta contagem concorrente divergente e IDs repetidos`, async () => {
    for (const segunda of [{ data: [linha(1)], count: 3, error: null },
      { data: [linha(2)], count: 2, error: null }]) {
      const { repo } = simular([{ data: [linha(2)], count: 2, error: null }, segunda]);
      await assert.rejects(repo[caso.metodo](...caso.args), { code: "SUPABASE_COTACAO_RESPONSE" });
    }
  });

  test(`${caso.metodo}: preserva nulos/textos, sem extras ou mutacao da resposta`, async () => {
    const row = Object.freeze({ ...linha(), extra: "nao retornar", evento: Object.freeze(linha().evento) });
    const { repo } = simular([{ data: Object.freeze([row]), count: 1, error: null }]);
    assert.deepEqual(await repo[caso.metodo](...caso.args), [esperado(caso)]);
    assert.equal(row.criada_em, "2030-02-01T10:00:00-03:00");
  });
}

test("organizador: recusa evento de outro usuario e preserva data bissexta", async () => {
  const outro = { ...linha(), evento: { ...linha().evento, usuario_id: 8 } };
  await assert.rejects(simular([{ data: [outro], count: 1, error: null }]).repo.listarPorOrganizador(7),
    { code: "SUPABASE_COTACAO_RESPONSE" });
  const bissexto = { ...linha(), prazo: "2032-02-29", evento: { ...linha().evento, data: "2032-02-29" } };
  const [r] = await simular([{ data: [bissexto], count: 1, error: null }]).repo.listarPorOrganizador(7);
  assert.equal(r.evento_data.getTime(), new Date(2032, 1, 29).getTime());
  assert.equal(r.prazo.getTime(), new Date(2032, 1, 29).getTime());
});

test("organizador sem ID nunca e convertido em listagem administrativa", async () => {
  const { repo, chamadas } = simular([]);
  await assert.rejects(repo.listarPorOrganizador(), { code: "SUPABASE_COTACAO_RESPONSE" });
  assert.deepEqual(chamadas, []);
});

test("importacao inerte, fabrica existente e somente as duas operacoes autorizadas", async () => {
  const { cliente } = simular([{ data: [], count: 0, error: null }]);
  const imports = [];
  let criacoes = 0;
  const contexto = { module: { exports: {} }, require(nome) {
    imports.push(nome);
    assert.equal(nome, "../../db-supabase.cjs");
    return { criarClienteSupabase() { criacoes++; return cliente; } };
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../repositories/supabase/cotacoes.cjs"), "utf8"), contexto);
  assert.deepEqual(imports, []);
  const repo = contexto.module.exports.criarRepositorioCotacoes();
  assert.deepEqual(JSON.parse(JSON.stringify(await repo.listarAdministrativo())), []);
  assert.equal(criacoes, 1);
  assert.deepEqual(imports, ["../../db-supabase.cjs"]);
  assert.deepEqual(Object.keys(repo), ["listarPorOrganizador", "listarAdministrativo", "listarDisponiveisParaFornecedor", "listarItens"]);
});

test("DATE local e TIMESTAMPTZ mantem JSON do contrato nos dois fusos", () => {
  const arquivo = require.resolve("../repositories/supabase/cotacoes.cjs");
  for (const TZ of ["UTC", "America/Sao_Paulo"]) {
    const script = `const assert=require('node:assert/strict');
      const {criarRepositorioCotacoes}=require(${JSON.stringify(arquivo)});
      const row=${JSON.stringify(linha())};
      const c={schema(){return this},from(){return this},select(){return this},eq(){return this},
        order(){return this},range(){return this},then(resolve,reject){
          return Promise.resolve({data:[row],count:1,error:null}).then(resolve,reject)}};
      const repo=criarRepositorioCotacoes(c);
      Promise.all([repo.listarPorOrganizador(7),repo.listarAdministrativo()]).then(listas=>{
        for(const [r] of listas){
          assert.equal(r.prazo.toJSON(),new Date(2030,2,1).toJSON());
          assert.equal(r.criada_em.toJSON(),'2030-02-01T13:00:00.000Z');
        }
        assert.equal(listas[0][0].evento_data.toJSON(),new Date(2030,2,2).toJSON());
      }).catch(()=>{process.exitCode=1});`;
    execFileSync(process.execPath, ["-e", script], { env: { ...process.env, TZ }, stdio: "pipe" });
  }
});
