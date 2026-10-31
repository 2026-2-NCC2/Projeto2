"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { criarRepositorioUsuarios } = require("../repositories/supabase/usuarios.cjs");
const { criarRepositorioUsuarios: criarMySQL } = require("../repositories/mysql/usuarios.cjs");

const usuario = { id: 7, nome: " Pessoa Á ", email: "PESSOA@example.invalid" };

// Sem driver, SDK, .env ou conexoes. Nenhum metodo de escrita/auth esta disponivel.
function simular(resposta = { data: { ...usuario }, error: null }, falha) {
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
  return { cliente, chamadas, repo: criarRepositorioUsuarios(cliente) };
}

test("perfil: consulta schema/tabela, projecao e ID exatos", async () => {
  const { repo, chamadas } = simular();
  assert.deepEqual(await repo.buscarPerfil(7), usuario);
  assert.deepEqual(chamadas, [["schema", "public"], ["from", "usuarios"],
    ["select", "id, nome, email"], ["eq", "id", 7], ["maybeSingle"]]);
});

test("perfil: preserva campos, tipos, textos e JSON do repositorio MySQL", async () => {
  const mysql = criarMySQL({ async execute(sql, parametros) {
    assert.equal(sql, "SELECT id, nome, email FROM usuarios WHERE id = ?");
    assert.deepEqual(parametros, [7]);
    return [[usuario]];
  } });
  const esperado = await mysql.buscarPerfil(7);
  const recebido = await simular().repo.buscarPerfil(7);
  assert.deepEqual(recebido, esperado);
  assert.equal(JSON.stringify(recebido), JSON.stringify(esperado));
  assert.deepEqual(Object.keys(recebido), ["id", "nome", "email"]);
});

test("perfil: ausencia retorna undefined como no MySQL, sem confundir com erro", async () => {
  const mysql = criarMySQL({ async execute() { return [[]]; } });
  assert.equal(await simular({ data: null, error: null }).repo.buscarPerfil(7),
    await mysql.buscarPerfil(7));
});

test("perfil: falhas PostgREST sao propagadas sem retry ou fallback", async () => {
  for (const code of ["42501", "PGRST116", "PGRST205", "57014"]) {
    const erro = { code, message: "falha simulada" };
    const { repo, chamadas } = simular({ data: null, error: erro });
    await assert.rejects(repo.buscarPerfil(7), recebido => recebido === erro);
    assert.equal(chamadas.filter(c => c[0] === "maybeSingle").length, 1);
  }
});

test("perfil: falha de transporte e propagada uma unica vez", async () => {
  const erro = new Error("rede simulada indisponivel");
  const { repo, chamadas } = simular(undefined, erro);
  await assert.rejects(repo.buscarPerfil(7), recebido => recebido === erro);
  assert.equal(chamadas.length, 5);
});

test("perfil: erro tem prioridade sobre dados parciais", async () => {
  const erro = { code: "42501" };
  await assert.rejects(simular({ data: usuario, error: erro }).repo.buscarPerfil(7),
    recebido => recebido === erro);
});

test("perfil: resposta invalida ou de outro ID nao e retornada como usuario valido", async () => {
  const semEmail = { id: 7, nome: usuario.nome };
  for (const data of [undefined, [], "texto", {}, semEmail,
    { ...usuario, id: 8 }, { ...usuario, id: "7" }]) {
    await assert.rejects(simular({ data, error: null }).repo.buscarPerfil(7),
      { code: "SUPABASE_USUARIO_RESPONSE" });
  }
});

test("perfil: nao retorna senha, perfil ou outros campos extras; nao modifica resposta", async () => {
  const data = Object.freeze({ ...usuario, senha: "hash-ficticio", perfil: "admin", extra: 42 });
  const resultado = await simular({ data, error: null }).repo.buscarPerfil(7);
  assert.deepEqual(resultado, usuario);
  assert.equal(data.senha, "hash-ficticio");
  assert.equal(data.perfil, "admin");
});

test("perfil: cada consulta usa ID atual, sem cache nem compartilhamento entre clientes", async () => {
  const a = simular();
  const b = simular({ data: null, error: null });
  await a.repo.buscarPerfil(7);
  assert.equal(await b.repo.buscarPerfil(99), undefined);
  await a.repo.buscarPerfil(7);
  assert.equal(a.chamadas.filter(c => c[0] === "maybeSingle").length, 2);
  assert.equal(b.chamadas.filter(c => c[0] === "maybeSingle").length, 1);
  assert.ok(b.chamadas.some(c => c[0] === "eq" && c[1] === "id" && c[2] === 99));
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
    "../repositories/supabase/usuarios.cjs"), "utf8"), contexto);
  return { criar: contexto.module.exports.criarRepositorioUsuarios,
    imports, criacoes: () => criacoes };
}

test("perfil: importacao inerte e reutilizacao tardia da fabrica existente", async () => {
  const a = carregarFabrica();
  assert.deepEqual(a.imports, []);
  assert.equal(a.criacoes(), 0);
  const repo = a.criar();
  assert.equal(a.criacoes(), 1);
  assert.deepEqual(a.imports, ["../../db-supabase.cjs"]);
  assert.deepEqual(JSON.parse(JSON.stringify(await repo.buscarPerfil(7))), usuario);
  assert.deepEqual(Object.keys(repo), ["criar", "buscarParaLogin", "buscarIdPorEmail", "buscarParaAutenticacao", "buscarPerfil", "listar"]);
});

test("perfil: cliente injetado nao le configuracao nem inicializa SDK", async () => {
  const a = carregarFabrica(new Error("fabrica nao deve ser chamada"));
  const { cliente } = simular({ data: null, error: null });
  assert.equal(await a.criar(cliente).buscarPerfil(7), undefined);
  assert.deepEqual(a.imports, []);
  assert.equal(a.criacoes(), 0);
});

test("perfil: configuracao/isolamento recusados pela fabrica nao geram fallback", () => {
  for (const code of ["SUPABASE_CONFIG", "SUPABASE_PROVIDER", "DB_PROVIDER_ISOLATED"]) {
    const erro = Object.assign(new Error("configuracao simulada recusada"), { code });
    const a = carregarFabrica(erro);
    assert.throws(() => a.criar(), recebido => recebido === erro);
    assert.equal(a.criacoes(), 1);
    assert.deepEqual(a.imports, ["../../db-supabase.cjs"]);
  }
});

test("email: preserva filtro de igualdade e projecao exclusiva do ID", async () => {
  for (const email of ["PESSOA@example.invalid", " pessoa@example.invalid ",
    "a%_+teste@example.invalid", "x' OR 1=1 --@example.invalid"]) {
    const { repo, chamadas } = simular({ data: { id: 7 }, error: null });
    assert.deepEqual(await repo.buscarIdPorEmail(email), { id: 7 });
    assert.deepEqual(chamadas, [["schema", "public"], ["from", "usuarios"],
      ["select", "id"], ["eq", "email", email], ["maybeSingle"]]);
  }
});

test("email: preserva retorno, tipos e JSON do MySQL", async () => {
  const email = "pessoa@example.invalid";
  const mysql = criarMySQL({ async execute(sql, parametros) {
    assert.equal(sql, "SELECT id FROM usuarios WHERE email = ?");
    assert.deepEqual(parametros, [email]);
    return [[{ id: 7 }]];
  } });
  const esperado = await mysql.buscarIdPorEmail(email);
  const recebido = await simular({ data: { id: 7 }, error: null }).repo.buscarIdPorEmail(email);
  assert.deepEqual(recebido, esperado);
  assert.equal(JSON.stringify(recebido), JSON.stringify(esperado));
});

test("email: ausencia retorna undefined como no MySQL", async () => {
  const mysql = criarMySQL({ async execute() { return [[]]; } });
  const { repo } = simular({ data: null, error: null });
  assert.equal(await repo.buscarIdPorEmail("ausente@example.invalid"),
    await mysql.buscarIdPorEmail("ausente@example.invalid"));
});

test("email: falhas PostgREST, inclusive multiplicidade, nao viram ausencia", async () => {
  for (const code of ["42501", "PGRST116", "PGRST205", "57014"]) {
    const erro = { code, message: "falha simulada" };
    const { repo, chamadas } = simular({ data: null, error: erro });
    await assert.rejects(repo.buscarIdPorEmail(usuario.email), recebido => recebido === erro);
    assert.equal(chamadas.filter(c => c[0] === "maybeSingle").length, 1);
  }
});

test("email: falha de transporte e propagada sem retry ou fallback", async () => {
  const erro = new Error("rede simulada indisponivel");
  const { repo, chamadas } = simular(undefined, erro);
  await assert.rejects(repo.buscarIdPorEmail(usuario.email), recebido => recebido === erro);
  assert.equal(chamadas.length, 5);
});

test("email: erro tem prioridade sobre dados parciais", async () => {
  const erro = { code: "42501" };
  await assert.rejects(simular({ data: { id: 7 }, error: erro }).repo.buscarIdPorEmail(usuario.email),
    recebido => recebido === erro);
});

test("email: respostas invalidas nao geram falso resultado de duplicidade", async () => {
  for (const data of [undefined, [], "texto", {}, { id: "7" }, { id: null },
    { id: 0 }, { id: -1 }, { id: 1.5 }, { id: NaN }, { id: Infinity },
    { id: Number.MAX_SAFE_INTEGER + 1 }]) {
    await assert.rejects(simular({ data, error: null }).repo.buscarIdPorEmail(usuario.email),
      { code: "SUPABASE_USUARIO_RESPONSE" });
  }
});

test("email: nao retorna campos extras nem modifica a resposta", async () => {
  const data = Object.freeze({ ...usuario, senha: "hash-ficticio", perfil: "admin" });
  const { repo } = simular({ data, error: null });
  assert.deepEqual(await repo.buscarIdPorEmail(usuario.email), { id: 7 });
  assert.equal(data.email, usuario.email);
  assert.equal(data.senha, "hash-ficticio");
});

test("usuario atual: preserva schema, filtro por ID e campos sem senha", async () => {
  const data = { ...usuario, perfil: "participante" };
  const { repo, chamadas } = simular({ data, error: null });
  assert.deepEqual(await repo.buscarParaAutenticacao(7), data);
  assert.deepEqual(chamadas, [["schema", "public"], ["from", "usuarios"],
    ["select", "id, nome, email, perfil"], ["eq", "id", 7], ["maybeSingle"]]);
});

test("usuario atual: campos, tipos, perfis e JSON correspondem ao MySQL", async () => {
  for (const perfil of ["participante", "organizador", "fornecedor", "admin"]) {
    const data = { ...usuario, perfil };
    const mysql = criarMySQL({ async execute(sql, parametros) {
      assert.equal(sql, "SELECT id, nome, email, perfil FROM usuarios WHERE id = ?");
      assert.deepEqual(parametros, [7]);
      return [[data]];
    } });
    const esperado = await mysql.buscarParaAutenticacao(7);
    const recebido = await simular({ data, error: null }).repo.buscarParaAutenticacao(7);
    assert.deepEqual(recebido, esperado);
    assert.equal(JSON.stringify(recebido), JSON.stringify(esperado));
  }
});

test("usuario atual: ausencia retorna undefined como no MySQL", async () => {
  const mysql = criarMySQL({ async execute() { return [[]]; } });
  assert.equal(await simular({ data: null, error: null }).repo.buscarParaAutenticacao(7),
    await mysql.buscarParaAutenticacao(7));
});

test("usuario atual: erros PostgREST nao viram ausencia nem dados parciais", async () => {
  for (const code of ["42501", "PGRST116", "PGRST205", "57014"]) {
    const erro = { code, message: "falha simulada" };
    for (const data of [null, { ...usuario, perfil: "admin" }]) {
      const { repo, chamadas } = simular({ data, error: erro });
      await assert.rejects(repo.buscarParaAutenticacao(7), recebido => recebido === erro);
      assert.equal(chamadas.filter(c => c[0] === "maybeSingle").length, 1);
    }
  }
});

test("usuario atual: falha de transporte e propagada sem retry/fallback", async () => {
  const erro = new Error("rede simulada indisponivel");
  const { repo, chamadas } = simular(undefined, erro);
  await assert.rejects(repo.buscarParaAutenticacao(7), recebido => recebido === erro);
  assert.equal(chamadas.length, 5);
});

test("usuario atual: resposta malformada ou de outra identidade e recusada", async () => {
  for (const data of [undefined, [], "texto", {}, usuario,
    { ...usuario, perfil: "admin", id: 8 }, { ...usuario, perfil: "admin", id: "7" }]) {
    await assert.rejects(simular({ data, error: null }).repo.buscarParaAutenticacao(7),
      { code: "SUPABASE_USUARIO_RESPONSE" });
  }
});

test("usuario atual: projecao impede retorno de senha, JWT e campos extras", async () => {
  const data = Object.freeze({ ...usuario, perfil: "participante",
    senha: "hash-ficticio", token: "token-ficticio", extra: 42 });
  const recebido = await simular({ data, error: null }).repo.buscarParaAutenticacao(7);
  assert.deepEqual(recebido, { ...usuario, perfil: "participante" });
  assert.equal(data.senha, "hash-ficticio");
});

test("usuario atual: cada leitura recupera perfil atual e detecta desaparecimento", async () => {
  const resposta = { data: { ...usuario, perfil: "participante" }, error: null };
  const { repo, chamadas } = simular(resposta);
  assert.equal((await repo.buscarParaAutenticacao(7)).perfil, "participante");
  resposta.data = { ...usuario, perfil: "fornecedor" };
  assert.equal((await repo.buscarParaAutenticacao(7)).perfil, "fornecedor");
  resposta.data = null;
  assert.equal(await repo.buscarParaAutenticacao(7), undefined);
  assert.equal(chamadas.filter(c => c[0] === "maybeSingle").length, 3);
});

test("usuario atual: cliente injetado nao inicializa fabrica ou autenticacao SDK", async () => {
  const a = carregarFabrica(new Error("fabrica nao deve ser chamada"));
  const { cliente } = simular({ data: null, error: null });
  assert.equal(await a.criar(cliente).buscarParaAutenticacao(7), undefined);
  assert.deepEqual(a.imports, []);
  assert.equal(a.criacoes(), 0);
});
