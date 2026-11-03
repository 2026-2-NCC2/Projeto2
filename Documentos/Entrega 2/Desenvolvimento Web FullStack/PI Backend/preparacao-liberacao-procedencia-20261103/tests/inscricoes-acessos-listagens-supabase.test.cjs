"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const casos = [
  { dominio: "inscricoes", fabrica: "criarRepositorioInscricoes", metodo: "listarPorUsuario", args: [7],
    tabela: "inscricoes", code: "SUPABASE_INSCRICAO_RESPONSE", dataCampo: "data_inscricao",
    selecao: "id, evento_id, status, data_inscricao, evento:eventos!inner(nome, data, horario, local, categoria)",
    filtros: [["usuario_id", 7]], ordens: [["data_inscricao", { ascending: false }]],
    linha: id => ({ id, evento_id: 9, status: "Cancelada", data_inscricao: "2030-01-01T10:00:00-03:00",
      evento: { nome: " Evento Á ", data: "2030-02-01", horario: "10:30:00", local: " Local ", categoria: null } }),
    esperado: id => ({ id, evento_id: 9, status: "Cancelada", data_inscricao: new Date("2030-01-01T13:00:00Z"),
      evento_nome: " Evento Á ", evento_data: new Date(2030, 1, 1), evento_horario: "10:30:00",
      evento_local: " Local ", evento_categoria: null }) },
  { dominio: "solicitacoes-acesso", fabrica: "criarRepositorioSolicitacoesAcesso", metodo: "listar", args: [],
    tabela: "solicitacoes_acesso", code: "SUPABASE_SOLICITACAO_RESPONSE", dataCampo: "criada_em",
    selecao: "id, usuario_id, perfil_solicitado, justificativa, status, criada_em, usuario:usuarios!inner(nome, email)",
    filtros: [], ordens: [["criada_em", { ascending: false }], ["id", { ascending: false }]],
    linha: id => ({ id, usuario_id: 7, perfil_solicitado: "fornecedor", justificativa: " sem trim ",
      status: "rejeitado", criada_em: "2030-01-01T10:00:00-03:00",
      usuario: { nome: " Pessoa Á ", email: "PESSOA@example.invalid" } }),
    esperado: id => ({ id, usuario_id: 7, nome: " Pessoa Á ", email: "PESSOA@example.invalid",
      perfil_solicitado: "fornecedor", justificativa: " sem trim ", status: "rejeitado",
      criada_em: new Date("2030-01-01T13:00:00Z") }) },
];

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
  test(`${caso.dominio}.${caso.metodo}: joins, campos, filtros, ordem e JSON do MySQL`, async () => {
    const criar = require(`../repositories/mysql/${caso.dominio}.cjs`)[caso.fabrica];
    const mysql = criar({ async execute(sql, parametros) {
      assert.match(sql, /INNER JOIN/);
      assert.match(sql, /ORDER BY/);
      assert.deepEqual(parametros, caso.args.length ? caso.args : undefined);
      return [[caso.esperado(2)]];
    } });
    const { repo, chamadas } = simular(caso, [{ data: [caso.linha(2)], count: 1, error: null }]);
    const recebido = await repo[caso.metodo](...caso.args);
    const esperado = await mysql[caso.metodo](...caso.args);
    assert.deepEqual(recebido, esperado);
    assert.equal(JSON.stringify(recebido), JSON.stringify(esperado));
    assert.deepEqual(chamadas, [[["schema", "public"], ["from", caso.tabela],
      ["select", caso.selecao, { count: "exact" }], ...caso.filtros.map(f => ["eq", ...f]),
      ...caso.ordens.map(o => ["order", ...o]), ["range", 0, 999]]]);
  });

  test(`${caso.metodo}: ausencia retorna array vazio sem novas consultas`, async () => {
    const { repo, chamadas } = simular(caso, [{ data: [], count: 0, error: null }]);
    assert.deepEqual(await repo[caso.metodo](...caso.args), []);
    assert.equal(chamadas.length, 1);
  });

  test(`${caso.metodo}: preserva ordem e filtros em paginas menores`, async () => {
    const { repo, chamadas } = simular(caso, [2, 1].map(id => ({ data: [caso.linha(id)], count: 2, error: null })));
    assert.deepEqual(await repo[caso.metodo](...caso.args), [caso.esperado(2), caso.esperado(1)]);
    assert.deepEqual(chamadas.map(p => p.at(-1)), [["range", 0, 999], ["range", 1, 1000]]);
    assert.deepEqual(chamadas[0].slice(0, -1), chamadas[1].slice(0, -1));
  });

  test(`${caso.metodo}: retorna mais de mil registros sem truncar`, async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => 1001 - i);
    const { repo } = simular(caso, [
      { data: ids.slice(0, 1000).map(caso.linha), count: 1001, error: null },
      { data: ids.slice(1000).map(caso.linha), count: 1001, error: null },
    ]);
    assert.deepEqual(await repo[caso.metodo](...caso.args), ids.map(caso.esperado));
  });

  test(`${caso.metodo}: propaga erros PostgREST sem retry ou lista parcial`, async () => {
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

  test(`${caso.metodo}: rejeita resposta incompleta, contagens e joins invalidos`, async () => {
    const relacao = caso.dominio === "inscricoes" ? "evento" : "usuario";
    for (const pagina of [{ data: [], count: null }, { data: null, count: 0 }, { data: [], count: 1 },
      { data: [null], count: 1 }, { data: [{}], count: 1 },
      { data: [{ ...caso.linha(1), [relacao]: null }], count: 1 },
      { data: [{ ...caso.linha(1), [relacao]: [] }], count: 1 }]) {
      await assert.rejects(simular(caso, [{ ...pagina, error: null }]).repo[caso.metodo](...caso.args),
        { code: caso.code });
    }
  });

  test(`${caso.metodo}: timestamps exigem offset e calendario valido`, async () => {
    for (const valor of [null, "infinity", "2030-02-30T10:00:00Z", "2030-01-01T10:00:00", "2030-01-01T24:00:00Z"]) {
      const row = { ...caso.linha(1), [caso.dataCampo]: valor };
      await assert.rejects(simular(caso, [{ data: [row], count: 1, error: null }]).repo[caso.metodo](...caso.args),
        { code: caso.code });
    }
  });

  test(`${caso.metodo}: detecta contagem concorrente divergente e IDs repetidos`, async () => {
    for (const segunda of [{ data: [caso.linha(1)], count: 3, error: null },
      { data: [caso.linha(2)], count: 2, error: null }]) {
      const { repo } = simular(caso, [{ data: [caso.linha(2)], count: 2, error: null }, segunda]);
      await assert.rejects(repo[caso.metodo](...caso.args), { code: caso.code });
    }
  });

  test(`${caso.metodo}: preserva textos/nulos sem mutacao ou campos extras`, async () => {
    const row = Object.freeze({ ...caso.linha(1), extra: "nao retornar" });
    const { repo } = simular(caso, [{ data: Object.freeze([row]), count: 1, error: null }]);
    assert.deepEqual(await repo[caso.metodo](...caso.args), [caso.esperado(1)]);
    assert.equal(row.extra, "nao retornar");
  });

  test(`${caso.metodo}: importacao inerte e fabrica existente sem clientes alternativos`, async () => {
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

test("inscricoes: DATE local valida calendario e preserva data bissexta", async () => {
  const caso = casos[0];
  for (const data of [null, "2030-02-30", "infinity"]) {
    const row = caso.linha(1);
    row.evento.data = data;
    await assert.rejects(simular(caso, [{ data: [row], count: 1, error: null }]).repo.listarPorUsuario(7),
      { code: caso.code });
  }
  const row = caso.linha(1);
  row.evento.data = "2032-02-29";
  const [r] = await simular(caso, [{ data: [row], count: 1, error: null }]).repo.listarPorUsuario(7);
  assert.equal(r.evento_data.getTime(), new Date(2032, 1, 29).getTime());
});

test("DATE local e instantes mantem serializacao nos dois fusos", () => {
  const arquivo = require.resolve("../repositories/supabase/suporte-leitura.cjs");
  for (const TZ of ["UTC", "America/Sao_Paulo"]) {
    const script = `const assert=require('node:assert/strict');
      const {dataLocal,instante}=require(${JSON.stringify(arquivo)});
      assert.equal(dataLocal('2030-02-01','TEST').toJSON(),new Date(2030,1,1).toJSON());
      assert.equal(instante('2030-01-01T10:00:00-03:00','TEST').toJSON(),'2030-01-01T13:00:00.000Z');`;
    execFileSync(process.execPath, ["-e", script], { env: { ...process.env, TZ }, stdio: "pipe" });
  }
});
