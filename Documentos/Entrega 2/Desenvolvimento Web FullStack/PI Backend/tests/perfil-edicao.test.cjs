"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { iniciar } = require("./helpers/http-autenticacao.cjs");
const { validarAlteracoesPerfil } = require("../perfil.cjs");
const { criarRepositorioUsuarios } = require("../repositories/supabase/usuarios.cjs");

test('perfil anuncia imagens somente quando a integração está pronta, inclusive após editar',async t=>{
  const a=await iniciar(t,'supabase');
  assert.equal((await a.request('GET','/perfil',undefined,a.token())).body.imagens_disponiveis,undefined);
  a.app.locals.imagensDisponiveis=()=>true;
  for(const id of [7,8,9,10]){
    assert.equal((await a.request('GET','/perfil',undefined,a.token(id))).body.imagens_disponiveis,true);
    assert.equal((await a.request('PATCH','/perfil',{nome:'Nome sintético'},a.token(id))).body.imagens_disponiveis,true);
  }
});

for (const [id, tipo] of [[7, "organizador"], [8, "fornecedor"], [9, "participante"], [10, "administrador"]]) {
  test(`PATCH perfil ${tipo}: persiste somente o titular e GET reflete sem novo login`, async t => {
    const a = await iniciar(t, "supabase");
    const antes = structuredClone(a.state.usuarios);
    const token = a.token(id);
    const r = await a.request("PATCH", "/perfil?usuario_id=999", {
      nome: " Nome atualizado ", telefone: " +55 (11) 99999-8888 ", biografia: " Minha biografia\nSegunda linha ",
    }, token);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { id, nome: "Nome atualizado", email: `teste${id}@example.invalid`,
      telefone: "+55 (11) 99999-8888", biografia: "Minha biografia\nSegunda linha", edicao_disponivel: true });
    assert.deepEqual(await a.request("GET", "/perfil", undefined, token), r);
    for (const u of a.state.usuarios) {
      const original = antes.find(item => item.id === u.id);
      if (u.id !== id) assert.deepEqual(u, original);
      else for (const k of ["id", "senha", "perfil", "email"]) assert.equal(u[k], original[k]);
    }
    const escritas = a.calls.filter(c => c.method === "PATCH");
    assert.equal(escritas.length, 1);
    assert.ok(escritas[0].query.includes(`id=eq.${id}`));
    assert.ok(a.calls.every(c => c.headersChecked));
    assert.ok(!JSON.stringify(r).includes(a.hash));
  });
}

test("PATCH perfil exige autenticação antes de qualquer escrita", async t => {
  const a = await iniciar(t, "supabase");
  assert.equal((await a.request("PATCH", "/perfil", { nome: "Novo" })).status, 401);
  assert.equal((await a.request("PATCH", "/perfil", { nome: "Novo" }, "invalido")).status, 401);
  assert.ok(!a.calls.some(c => c.method === "PATCH"));
});

test("PATCH perfil rejeita qualquer campo fora da lista, inclusive junto com nome válido", async t => {
  const a = await iniciar(t, "supabase");
  for (const campo of ["email", "id", "usuario_id", "perfil", "senha", "senhaHash", "permissoes", "admin", "extra", "__proto__"]) {
    const body = JSON.parse(`{"nome":"Outro","${campo}":"proibido"}`);
    assert.equal((await a.request("PATCH", "/perfil", body, a.token())).status, 400, campo);
  }
  assert.equal(a.state.usuarios[0].nome, "Teste 7");
  assert.ok(!a.calls.some(c => c.method === "PATCH"));
});

test("PATCH perfil valida tipos, tamanho, controles, telefone e objeto vazio", async t => {
  const a = await iniciar(t, "supabase");
  for (const body of [{}, [], { nome: "  " }, { nome: null }, { nome: 7 }, { nome: "a".repeat(101) },
    { nome: "A\nB" }, { telefone: [] }, { telefone: null }, { telefone: "abc" }, { telefone: "+++" },
    { telefone: "1".repeat(31) }, { telefone: "11\n22" }, { biografia: {} },
    { biografia: "a".repeat(1001) }, { biografia: "a\u0000b" }]) {
    assert.equal((await a.request("PATCH", "/perfil", body, a.token())).status, 400, JSON.stringify(body));
  }
  assert.ok(!a.calls.some(c => c.method === "PATCH"));
});

test("PATCH parcial preserva campos omitidos e permite apagar campos opcionais", async t => {
  const a = await iniciar(t, "supabase");
  a.state.usuarios[0].telefone = "123"; a.state.usuarios[0].biografia = "Bio";
  const r = await a.request("PATCH", "/perfil", { nome: "Novo" }, a.token());
  assert.equal(r.status, 200); assert.equal(r.body.telefone, "123"); assert.equal(r.body.biografia, "Bio");
  const vazio = await a.request("PATCH", "/perfil", { telefone: " ", biografia: "" }, a.token());
  assert.equal(vazio.status, 200); assert.equal(vazio.body.telefone, null); assert.equal(vazio.body.biografia, null);
  assert.equal(vazio.body.nome, "Novo");
  assert.deepEqual(validarAlteracoesPerfil({ nome: "a".repeat(100), telefone: "1".repeat(30), biografia: "a".repeat(1000) }),
    { nome: "a".repeat(100), telefone: "1".repeat(30), biografia: "a".repeat(1000) });
});

test("schema antigo mantém GET e sessão, bloqueia PATCH com 503 sem atualizar usuários", async t => {
  const a = await iniciar(t, "supabase"); a.state.schemaPerfilAntigo = true;
  const antes = structuredClone(a.state.usuarios);
  const r = await a.request("GET", "/perfil", undefined, a.token());
  assert.equal(r.status, 200); assert.equal(r.body.edicao_disponivel, false);
  assert.equal(r.body.telefone, null); assert.equal(r.body.biografia, null);
  assert.equal((await a.login()).status, 200);
  const patch = await a.request("PATCH", "/perfil", { nome: "Não salvar" }, a.token());
  assert.equal(patch.status, 503); assert.match(patch.body.erro, /aguarda atualização/);
  assert.deepEqual(a.state.usuarios, antes);
  assert.ok(!JSON.stringify([patch, a.logs]).includes(a.privado));
});

test("falhas de permissão ou transporte não viram sucesso nem ativam fallback do schema", async t => {
  const a = await iniciar(t, "supabase"); a.state.erroPerfil = "42501";
  const antes = structuredClone(a.state.usuarios);
  const r = await a.request("PATCH", "/perfil", { nome: "Não salvar" }, a.token());
  assert.equal(r.status, 500); assert.ok(!JSON.stringify(r).includes(a.privado));
  assert.deepEqual(a.state.usuarios, antes);
  const leitura = await a.request("GET", "/perfil", undefined, a.token());
  assert.equal(leitura.status, 500);
  assert.equal(a.calls.filter(c => c.method === "PATCH").length, 1);
});

test("MySQL continua consultável e não recebe escrita que dependa de colunas novas", async t => {
  const a = await iniciar(t, "mysql");
  assert.equal((await a.request("GET", "/perfil", undefined, a.token())).body.edicao_disponivel, false);
  assert.equal((await a.request("PATCH", "/perfil", { nome: "Novo" }, a.token())).status, 503);
  assert.ok(!a.calls.some(c => /^UPDATE/.test(c.sql)));
});

test("repositório restringe payload e identidade; escrita sem retry e sem segredos na projeção", async () => {
  const calls = [];
  let data = { id: 7, nome: "Novo", email: "a@b.invalid", telefone: null, biografia: null, senha: "privada", perfil: "admin" };
  const q = {};
  for (const nome of ["schema", "from", "update", "eq", "select", "maybeSingle"]) {
    q[nome] = (...args) => { calls.push([nome, ...args]); return q; };
  }
  q.retry = async valor => { calls.push(["retry", valor]); return { data, error: null }; };
  const repo = criarRepositorioUsuarios(q);
  for (const dados of [{ perfil: "admin" }, { nome: "Novo", id: 8 }, {}]) await assert.rejects(repo.atualizarPerfil(7, dados));
  assert.equal(calls.length, 0);
  const r = await repo.atualizarPerfil(7, { nome: "Novo" });
  assert.deepEqual(calls, [["schema", "public"], ["from", "usuarios"], ["update", { nome: "Novo" }],
    ["eq", "id", 7], ["select", "id, nome, email, telefone, biografia"], ["maybeSingle"], ["retry", false]]);
  assert.equal(r.senha, undefined); assert.equal(r.perfil, undefined);
  data = { ...data, id: 8 };
  await assert.rejects(repo.atualizarPerfil(7, { nome: "Novo" }), { code: "SUPABASE_USUARIO_RESPONSE" });
  data = null; assert.equal(await repo.atualizarPerfil(7, { nome: "Novo" }), undefined);
});

test("migração incremental é transacional, opcional, idempotente e sem DML/destruição", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../../Banco de dados/perfil_usuarios.incremental.sql"), "utf8")
    .replace(/--[^\n]*/g, "");
  assert.match(sql, /BEGIN;/); assert.match(sql, /COMMIT;/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS telefone varchar\(30\)/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS biografia varchar\(1000\)/);
  assert.match(sql, /column_default IS NULL/); assert.match(sql, /RAISE EXCEPTION/);
  assert.doesNotMatch(sql, /\b(UPDATE|INSERT|DELETE|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
  assert.match(sql, /lock_timeout = '5s'/);
});
