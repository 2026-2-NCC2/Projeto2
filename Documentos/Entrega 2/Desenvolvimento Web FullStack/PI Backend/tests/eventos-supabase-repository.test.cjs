"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const { criarRepositorioEventos } = require("../repositories/supabase/eventos.cjs");
const { criarRepositorioEventos: criarMySQL } = require("../repositories/mysql/eventos.cjs");

const evento = { id: 13, nome: " Evento ", data: "2030-01-01", horario: "10:00:00",
  local: " Local ", categoria: null, publico: 10, descricao: "", status: "Ativo", usuario_id: 7 };
const campos = "id, nome, data, horario, local, categoria, publico, descricao, status, usuario_id";

// A superficie do mock nao oferece escrita, auth, RPC ou fallback.
function simular(resposta = { data: { ...evento }, error: null }, falha) {
  const chamadas = [];
  const cliente = {};
  for (const metodo of ["schema", "from", "select", "eq"]) {
    cliente[metodo] = (...args) => { chamadas.push([metodo, ...args]); return cliente; };
  }
  cliente.maybeSingle = async () => {
    chamadas.push(["maybeSingle"]);
    if (falha) throw falha;
    return resposta;
  };
  return { repo: criarRepositorioEventos(cliente), chamadas };
}

test("detalhe seleciona public, campos exatos e ambos os filtros", async () => {
  const { repo, chamadas } = simular();
  const resultado = await repo.buscarPorIdDoUsuario(13, 7);
  assert.deepEqual(chamadas, [["schema", "public"], ["from", "eventos"],
    ["select", campos], ["eq", "id", 13], ["eq", "usuario_id", 7], ["maybeSingle"]]);
  assert.deepEqual(Object.keys(resultado), campos.split(", "));
  assert.deepEqual(resultado, { ...evento, data: new Date(2030, 0, 1) });
});

test("retorno e JSON correspondem ao repositorio MySQL com o driver atual", async () => {
  const mysqlEvento = { ...evento, data: new Date(2030, 0, 1) };
  const mysql = criarMySQL({ async execute() { return [[mysqlEvento]]; } });
  const a = await mysql.buscarPorIdDoUsuario(13, 7);
  const b = await simular().repo.buscarPorIdDoUsuario(13, 7);
  assert.deepEqual(b, a);
  assert.equal(JSON.stringify(b), JSON.stringify(a));
});

test("ausente ou alheio retorna undefined para o mesmo 404 do handler", async () => {
  for (const usuario of [7, 99]) {
    const { repo, chamadas } = simular({ data: null, error: null });
    assert.equal(await repo.buscarPorIdDoUsuario(13, usuario), undefined);
    assert.ok(chamadas.some(c => c[0] === "eq" && c[1] === "usuario_id" && c[2] === usuario));
  }
});

test("erro PostgREST nao vira ausencia, mesmo com data null ou dados parciais", async () => {
  for (const code of ["42501", "PGRST116", "PGRST205", "57014"]) {
    const erro = { code, message: "falha simulada" };
    const { repo, chamadas } = simular({ data: null, error: erro });
    await assert.rejects(repo.buscarPorIdDoUsuario(13, 7), e => e === erro);
    assert.equal(chamadas.filter(c => c[0] === "maybeSingle").length, 1);
  }
});

test("rejeicao de transporte e propagada sem retry ou fallback", async () => {
  const erro = new Error("falha de rede simulada");
  const { repo, chamadas } = simular(undefined, erro);
  await assert.rejects(repo.buscarPorIdDoUsuario(13, 7), e => e === erro);
  assert.equal(chamadas.length, 6);
});

test("erro tem prioridade sobre dados parciais", async () => {
  const erro = { code: "42501" };
  const { repo } = simular({ data: evento, error: erro });
  await assert.rejects(repo.buscarPorIdDoUsuario(13, 7), e => e === erro);
});

test("respostas malformadas, campos ausentes e identidade divergente sao recusados", async () => {
  const semNome = { ...evento };
  delete semNome.nome;
  for (const data of [undefined, [], "texto", {}, semNome,
    { ...evento, id: 14 }, { ...evento, usuario_id: 8 }]) {
    await assert.rejects(simular({ data, error: null }).repo.buscarPorIdDoUsuario(13, 7),
      { code: "SUPABASE_EVENTO_RESPONSE" });
  }
});

test("campos extras nao vazam e resposta original nao e modificada", async () => {
  const data = Object.freeze({ ...evento, extra: "nao retornar" });
  const resultado = await simular({ data, error: null }).repo.buscarPorIdDoUsuario(13, 7);
  assert.ok(!Object.hasOwn(resultado, "extra"));
  assert.equal(data.data, "2030-01-01");
});

test("data invalida nao e normalizada silenciosamente", async () => {
  for (const data of [null, "", "2030-02-30", "2030-13-01", "2030-01-01T00:00:00Z", "infinity"]) {
    await assert.rejects(simular({ data: { ...evento, data }, error: null })
      .repo.buscarPorIdDoUsuario(13, 7), { code: "SUPABASE_EVENTO_RESPONSE" });
  }
});

test("data bissexta, campos nulos, textos e horarios sao preservados", async () => {
  const data = { ...evento, data: "2032-02-29", categoria: null, descricao: null, status: null };
  const resultado = await simular({ data, error: null }).repo.buscarPorIdDoUsuario(13, 7);
  assert.deepEqual(resultado, { ...data, data: new Date(2032, 1, 29) });
});

test("serializacao DATE acompanha o fuso local como no MySQL", () => {
  const arquivo = require.resolve("../repositories/supabase/eventos.cjs");
  for (const TZ of ["UTC", "America/Sao_Paulo"]) {
    const script = `const assert = require('node:assert/strict');
      const { criarRepositorioEventos } = require(${JSON.stringify(arquivo)});
      const row = ${JSON.stringify(evento)};
      const c = { schema(){return this}, from(){return this}, select(){return this},
        eq(){return this}, async maybeSingle(){return {data:row,error:null}} };
      criarRepositorioEventos(c).buscarPorIdDoUsuario(13,7).then(r => {
        assert.equal(r.data.getTime(), new Date(2030,0,1).getTime());
        assert.equal(JSON.stringify(r), JSON.stringify({...row,data:new Date(2030,0,1)}));
      }).catch(() => {process.exitCode=1});`;
    execFileSync(process.execPath, ["-e", script], { env: { ...process.env, TZ }, stdio: "pipe" });
  }
});

test("importacao inerte; fabrica reutiliza somente db-supabase existente", async () => {
  let criacoes = 0;
  const chamadas = [];
  const cliente = simular();
  const sdk = { schema() { return { from() { return { select() { return {
    eq() { return this; }, async maybeSingle() { return { data: null, error: null }; },
  }; } }; } }; } };
  const contexto = { module: { exports: {} }, require(nome) {
    chamadas.push(nome);
    assert.equal(nome, "../../db-supabase.cjs");
    return { criarClienteSupabase() { criacoes++; return sdk; } };
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../repositories/supabase/eventos.cjs"), "utf8"), contexto);
  assert.equal(criacoes, 0);
  assert.deepEqual(chamadas, []);
  const repo = contexto.module.exports.criarRepositorioEventos();
  assert.equal(criacoes, 1);
  assert.equal(await repo.buscarPorIdDoUsuario(13, 7), undefined);
  assert.deepEqual(chamadas, ["../../db-supabase.cjs"]);
  const metodos = ["publicar", "excluir", "criar", "atualizar", "listarPorUsuario", "listarAdministrativo", "listarAtivosParaParticipante", "buscarPorIdDoUsuario"];
  assert.deepEqual(Object.keys(cliente.repo), metodos);
  assert.deepEqual(Object.keys(repo), metodos);
});
