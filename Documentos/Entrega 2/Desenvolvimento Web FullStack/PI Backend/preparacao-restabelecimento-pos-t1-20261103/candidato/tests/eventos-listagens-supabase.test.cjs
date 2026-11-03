"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { criarRepositorioEventos } = require("../repositories/supabase/eventos.cjs");
const { criarRepositorioEventos: criarMySQL } = require("../repositories/mysql/eventos.cjs");

const campos = "id, nome, data, horario, local, categoria, publico, descricao, status, usuario_id";
const evento = { id: 13, nome: " Evento Á ", data: "2030-01-01", horario: "10:00:00",
  local: " Local ", categoria: null, publico: 10, descricao: null, status: "Ativo", usuario_id: 7 };
const casos = [
  { metodo: "listarPorUsuario", args: [7], selecao: campos,
    filtros: [["usuario_id", 7]], ordens: [["id", { ascending: false }]] },
  { metodo: "listarAdministrativo", args: [],
    selecao: `${campos}, organizador:usuarios!inner(nome)`,
    filtros: [], ordens: [["id", { ascending: false }]], admin: true },
  { metodo: "listarAtivosParaParticipante", args: [],
    selecao: campos.replace(", usuario_id", ""), filtros: [["status", "Ativo"]],
    ordens: [["data", { ascending: true }], ["id", { ascending: true }]], participante: true },
];

function linha(caso, id = 13) {
  return { ...evento, id, ...(caso.admin ? { organizador: { nome: " Pessoa " } } : {}) };
}

function esperado(caso, id = 13) {
  const r = { ...evento, id, data: new Date(2030, 0, 1) };
  if (caso.participante) delete r.usuario_id;
  if (caso.admin) r.organizador_nome = " Pessoa ";
  return r;
}

// Uma consulta nova por pagina. Nao existe fetch, SDK, driver ou escrita.
function simular(paginas) {
  const chamadas = [];
  let indice = 0;
  const cliente = { schema(...args) {
    const chamadasPagina = [["schema", ...args]];
    chamadas.push(chamadasPagina);
    const consulta = {};
    for (const metodo of ["from", "select", "eq", "order", "range"]) {
      consulta[metodo] = (...valores) => { chamadasPagina.push([metodo, ...valores]); return consulta; };
    }
    consulta.then = (resolve, reject) => {
      const pagina = paginas[indice++];
      if (pagina === undefined) return Promise.reject(Error("Consulta adicional inesperada")).then(resolve, reject);
      return (pagina instanceof Error ? Promise.reject(pagina) : Promise.resolve(pagina)).then(resolve, reject);
    };
    return consulta;
  } };
  return { repo: criarRepositorioEventos(cliente), chamadas };
}

for (const caso of casos) {
  test(`${caso.metodo}: filtros, ordenacoes, projecao e retorno correspondem ao MySQL`, async () => {
    const rows = [esperado(caso)];
    const mysql = criarMySQL({ async execute() { return [rows]; } });
    const { repo, chamadas } = simular([{ data: [linha(caso)], count: 1, error: null }]);
    const recebido = await repo[caso.metodo](...caso.args);
    assert.deepEqual(recebido, await mysql[caso.metodo](...caso.args));
    assert.equal(JSON.stringify(recebido), JSON.stringify(rows));
    assert.deepEqual(chamadas, [[["schema", "public"], ["from", "eventos"],
      ["select", caso.selecao, { count: "exact" }], ...caso.filtros.map(f => ["eq", ...f]),
      ...caso.ordens.map(o => ["order", ...o]), ["range", 0, 999]]]);
  });

  test(`${caso.metodo}: ausencia retorna lista vazia sem consultas extras`, async () => {
    const { repo, chamadas } = simular([{ data: [], count: 0, error: null }]);
    assert.deepEqual(await repo[caso.metodo](...caso.args), []);
    assert.equal(chamadas.length, 1);
  });

  test(`${caso.metodo}: preserva ordem e junta paginas mesmo com limite remoto menor`, async () => {
    const ids = caso.participante ? [1, 2, 3] : [3, 2, 1];
    const { repo, chamadas } = simular(ids.map(id => ({ data: [linha(caso, id)], count: 3, error: null })));
    assert.deepEqual(await repo[caso.metodo](...caso.args), ids.map(id => esperado(caso, id)));
    assert.deepEqual(chamadas.map(p => p.at(-1)), [["range", 0, 999], ["range", 1, 1000], ["range", 2, 1001]]);
    for (const p of chamadas) assert.deepEqual(p.slice(0, -1), chamadas[0].slice(0, -1));
  });

  test(`${caso.metodo}: retorna mais de mil eventos sem truncamento`, async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => caso.participante ? i + 1 : 1001 - i);
    const { repo, chamadas } = simular([
      { data: ids.slice(0, 1000).map(id => linha(caso, id)), count: 1001, error: null },
      { data: ids.slice(1000).map(id => linha(caso, id)), count: 1001, error: null },
    ]);
    const recebido = await repo[caso.metodo](...caso.args);
    assert.deepEqual(recebido, ids.map(id => esperado(caso, id)));
    assert.deepEqual(chamadas.map(p => p.at(-1)), [["range", 0, 999], ["range", 1000, 1999]]);
  });

  test(`${caso.metodo}: erros da API prevalecem sem retry nem retorno parcial`, async () => {
    for (const code of ["42501", "PGRST200", "57014"]) {
      const erro = { code, message: "falha simulada" };
      const { repo, chamadas } = simular([
        { data: [linha(caso, 1)], count: 2, error: null },
        { data: [linha(caso, 2)], count: 2, error: erro },
      ]);
      await assert.rejects(repo[caso.metodo](...caso.args), e => e === erro);
      assert.equal(chamadas.length, 2);
    }
  });

  test(`${caso.metodo}: falha de transporte nao gera retry/fallback`, async () => {
    const erro = new Error("rede simulada indisponivel");
    const { repo, chamadas } = simular([erro]);
    await assert.rejects(repo[caso.metodo](...caso.args), e => e === erro);
    assert.equal(chamadas.length, 1);
  });

  test(`${caso.metodo}: recusa contagem ausente, dados invalidos e pagina incompleta`, async () => {
    for (const pagina of [
      { data: [], count: null }, { data: [], count: -1 }, { data: null, count: 0 },
      { data: [], count: 1 }, { data: [linha(caso)], count: 0 },
      { data: [null], count: 1 }, { data: [{}], count: 1 },
      { data: [{ ...linha(caso), data: "2030-02-30" }], count: 1 },
    ]) {
      await assert.rejects(simular([{ ...pagina, error: null }]).repo[caso.metodo](...caso.args),
        { code: "SUPABASE_EVENTO_RESPONSE" });
    }
  });

  test(`${caso.metodo}: contagem concorrente divergente ou ID repetido nao produz lista valida`, async () => {
    for (const segunda of [
      { data: [linha(caso, 2)], count: 3, error: null },
      { data: [linha(caso, 1)], count: 2, error: null },
    ]) {
      const { repo, chamadas } = simular([{ data: [linha(caso, 1)], count: 2, error: null }, segunda]);
      await assert.rejects(repo[caso.metodo](...caso.args), { code: "SUPABASE_EVENTO_RESPONSE" });
      assert.equal(chamadas.length, 2);
    }
  });

  test(`${caso.metodo}: projecao preserva nulos/textos sem campos extras ou mutacao`, async () => {
    const row = Object.freeze({ ...linha(caso), extra: "nao retornar" });
    const { repo } = simular([{ data: Object.freeze([row]), count: 1, error: null }]);
    assert.deepEqual(await repo[caso.metodo](...caso.args), [esperado(caso)]);
    assert.equal(row.data, evento.data);
    assert.equal(row.extra, "nao retornar");
  });
}

test("lista propria recusa evento de outro usuario", async () => {
  const { repo } = simular([{ data: [{ ...evento, usuario_id: 8 }], count: 1, error: null }]);
  await assert.rejects(repo.listarPorUsuario(7), { code: "SUPABASE_EVENTO_RESPONSE" });
});

test("lista administrativa exige objeto do INNER JOIN e achata somente organizador_nome", async () => {
  for (const organizador of [null, [], {}, { nome: null }]) {
    const { repo } = simular([{ data: [{ ...evento, organizador }], count: 1, error: null }]);
    await assert.rejects(repo.listarAdministrativo(), { code: "SUPABASE_EVENTO_RESPONSE" });
  }
});

test("datas das tres listas mantem serializacao local nos dois fusos", () => {
  const arquivo = require.resolve("../repositories/supabase/eventos.cjs");
  for (const TZ of ["UTC", "America/Sao_Paulo"]) {
    const script = `const assert=require('node:assert/strict');
      const {criarRepositorioEventos}=require(${JSON.stringify(arquivo)});
      const row={...${JSON.stringify(evento)},organizador:{nome:'Pessoa'}};
      const c={schema(){return this},from(){return this},select(){return this},
        eq(){return this},order(){return this},range(){return this},
        then(resolve,reject){return Promise.resolve({data:[row],count:1,error:null}).then(resolve,reject)}};
      const repo=criarRepositorioEventos(c);
      Promise.all([repo.listarPorUsuario(7),repo.listarAdministrativo(),repo.listarAtivosParaParticipante()])
        .then(listas=>{for(const [r] of listas)assert.equal(r.data.toJSON(),new Date(2030,0,1).toJSON())})
        .catch(()=>{process.exitCode=1});`;
    execFileSync(process.execPath, ["-e", script], { env: { ...process.env, TZ }, stdio: "pipe" });
  }
});
