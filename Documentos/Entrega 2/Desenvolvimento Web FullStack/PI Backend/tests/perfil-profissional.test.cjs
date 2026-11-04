"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { iniciar } = require("./helpers/http-autenticacao.cjs");
const { validarProfissional, validarUrl } = require("../perfil-profissional.cjs");
const { criarRepositorioProfissional } = require("../repositories/supabase/perfil-profissional.cjs");
const rota = "/perfil/profissional";

test("ativação fica bloqueada por padrão e não interfere no perfil pessoal", async t => {
  const a = await iniciar(t, "supabase");
  for (const method of ["GET", "PATCH"]) assert.equal((await a.request(method, rota, method === "PATCH" ? { redes_sociais: {} } : undefined, a.token())).status, 503);
  assert.ok(!a.calls.some(c => c.method === "PATCH"));
  assert.equal((await a.request("GET", "/perfil", undefined, a.token())).status, 200);
  assert.equal((await a.request("PATCH", "/perfil", { nome: "Nome atualizado" }, a.token())).status, 200);
});

for (const id of [7, 8, 9, 10]) test(`redes sociais na conta ${id}: isolamento, persistência, remoção e compatibilidade pessoal`, async t => {
  const a = await iniciar(t, "supabase", { profissionalAtivo: true });
  const antes = structuredClone(a.state.usuarios);
  const redes_sociais = Object.fromEntries(["instagram", "linkedin", "facebook", "tiktok", "site_pessoal"].map(k => [k, `https://example.invalid/${k}`]));
  const salvo = await a.request("PATCH", rota + "?usuario_id=999", { redes_sociais }, a.token(id));
  assert.equal(salvo.status, 200); assert.equal(salvo.body.id, id);
  assert.deepEqual(salvo.body.redes_sociais, redes_sociais);
  assert.deepEqual(await a.request("GET", rota, undefined, a.token(id)), salvo);
  for (const u of a.state.usuarios) {
    if (u.id !== id) assert.deepEqual(u, antes.find(v => v.id === u.id));
    else { const original = antes.find(v => v.id === id); for (const k of Object.keys(original).filter(k => k !== "redes_sociais")) assert.deepEqual(u[k], original[k]); }
  }
  assert.equal((await a.request("PATCH", "/perfil", { biografia: "Biografia" }, a.token(id))).status, 200);
  assert.deepEqual((await a.request("GET", rota, undefined, a.token(id))).body.redes_sociais, redes_sociais);
  const apagado = await a.request("PATCH", rota, { redes_sociais: {} }, a.token(id));
  assert.equal(apagado.body.redes_sociais, null);
  assert.equal((await a.request("GET", rota, undefined, a.token(id))).body.redes_sociais, null);
  assert.ok(!JSON.stringify(salvo).includes(a.hash));
});

test("fornecedor e organizador persistem dados profissionais; PATCH preserva seção omitida", async t => {
  const a = await iniciar(t, "supabase", { profissionalAtivo: true });
  for (const id of [7, 8]) {
    const dados_comerciais = { nome_comercial: "Organização", descricao: "Descrição\nSegunda linha", telefone_comercial: "+55 (11) 1234-5678", email_comercial: "contato@example.invalid", cidade: "São Paulo", site_oficial: "https://example.invalid", ...(id === 8 ? { categorias_servicos: ["Som", "Iluminação"] } : {}) };
    const r = await a.request("PATCH", rota, { dados_comerciais }, a.token(id));
    assert.equal(r.status, 200); assert.deepEqual(r.body.dados_comerciais, dados_comerciais);
    assert.equal((await a.request("PATCH", rota, { redes_sociais: { instagram: "https://example.invalid/perfil" } }, a.token(id))).status, 200);
    assert.deepEqual((await a.request("GET", rota, undefined, a.token(id))).body.dados_comerciais, dados_comerciais);
    assert.equal((await a.request("PATCH", rota, { dados_comerciais: null }, a.token(id))).body.dados_comerciais, null);
  }
});

test("autenticação, autorização e campos proibidos impedem qualquer escrita", async t => {
  const a = await iniciar(t, "supabase", { profissionalAtivo: true });
  for (const method of ["GET", "PATCH"]) for (const token of [undefined, "invalido"]) assert.equal((await a.request(method, rota, undefined, token)).status, 401);
  for (const id of [9, 10]) assert.equal((await a.request("PATCH", rota, { dados_comerciais: {} }, a.token(id))).status, 403);
  assert.equal((await a.request("PATCH", rota, { dados_comerciais: { categorias_servicos: ["Som"] } }, a.token(7))).status, 400);
  for (const body of [{}, [], { id: 8 }, { usuario_id: 8, redes_sociais: {} }, { redes_sociais: { extra: "https://example.invalid" } }, { dados_comerciais: { perfil: "admin" } }, { redes_sociais: { instagram: 7 } }, { dados_comerciais: { nome_comercial: null } }]) assert.equal((await a.request("PATCH", rota, body, a.token())).status, 400);
  assert.ok(!a.calls.some(c => c.method === "PATCH"));
});

test("URLs e limites rejeitam protocolos inseguros, credenciais, controles e categorias inválidas", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,x", "http://example.invalid", "ftp://example.invalid", "//example.invalid", "https://user:pass@example.invalid", "https://example.invalid/a\nb", "https://example.invalid\\x", "https:", "https://exa mple.invalid", "https://" + "a".repeat(2048)]) assert.throws(() => validarUrl(url), url);
  assert.equal(validarUrl(" https://example.invalid/a?q=á#b "), "https://example.invalid/a?q=á#b");
  for (const dados_comerciais of [{ nome_comercial: "a".repeat(151) }, { descricao: "a".repeat(2001) }, { cidade: "a".repeat(121) }, { telefone_comercial: "abc" }, { email_comercial: "sem-email" }, { categorias_servicos: ["Som", " som "] }, { categorias_servicos: [""] }, { categorias_servicos: Array(21).fill("Som") }, { categorias_servicos: ["a".repeat(81)] }]) assert.throws(() => validarProfissional({ dados_comerciais }, "fornecedor"));
  assert.deepEqual(validarProfissional({ redes_sociais: { instagram: " " }, dados_comerciais: { cidade: " ", categorias_servicos: [] } }, "fornecedor"), { redes_sociais: null, dados_comerciais: null });
});

test("schema antigo, permissão e transporte não geram falso sucesso ou escrita", async t => {
  const a = await iniciar(t, "supabase", { profissionalAtivo: true });
  const antes = structuredClone(a.state.usuarios);
  a.state.schemaProfissionalAntigo = true;
  for (const method of ["GET", "PATCH"]) assert.equal((await a.request(method, rota, method === "PATCH" ? { redes_sociais: {} } : undefined, a.token())).status, 503);
  a.state.schemaProfissionalAntigo = false; a.state.erroProfissional = "42501";
  assert.equal((await a.request("PATCH", rota, { redes_sociais: {} }, a.token())).status, 500);
  a.state.erroProfissional = null; a.state.falha = "transporte";
  assert.equal((await a.request("PATCH", rota, { redes_sociais: {} }, a.token())).status, 500);
  assert.deepEqual(a.state.usuarios, antes);
  assert.ok(!a.calls.some(c => c.method === "PATCH"));
  assert.ok(!JSON.stringify(a.logs).includes(a.privado));
});

test("MySQL permanece bloqueado mesmo com flag ativa", async t => {
  const a = await iniciar(t, "mysql", { profissionalAtivo: true });
  assert.equal((await a.request("GET", rota, undefined, a.token())).status, 503);
});

test("repositório filtra ID e papel, desativa retry e rejeita confirmação inconsistente", async () => {
  const calls = [];
  let data = { id: 7, perfil: "organizador", redes_sociais: { instagram: "https://example.invalid" }, dados_comerciais: null };
  const q = {};
  for (const nome of ["schema", "from", "update", "eq", "select", "maybeSingle"]) q[nome] = (...args) => { calls.push([nome, ...args]); return q; };
  q.retry = async v => { calls.push(["retry", v]); return { data, error: null }; };
  const repo = criarRepositorioProfissional(q);
  await repo.atualizarProfissional(7, "organizador", { redes_sociais: data.redes_sociais });
  assert.ok(calls.some(c => c[0] === "eq" && c[1] === "id" && c[2] === 7));
  assert.ok(calls.some(c => c[0] === "eq" && c[1] === "perfil" && c[2] === "organizador"));
  assert.deepEqual(calls.at(-1), ["retry", false]);
  data = { ...data, redes_sociais: null };
  await assert.rejects(repo.atualizarProfissional(7, "organizador", { redes_sociais: { instagram: "https://example.invalid" } }), /não confirmada/);
});

test("SQL é incremental e não altera registros ou permissões", () => {
  const sql = require("node:fs").readFileSync(require("node:path").join(__dirname, "../../Banco de dados/perfil_profissional.incremental.sql"), "utf8").replace(/--[^\n]*/g, "");
  assert.match(sql, /BEGIN;/); assert.match(sql, /COMMIT;/);
  for (const c of ["redes_sociais", "dados_comerciais"]) assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${c} jsonb`));
  assert.match(sql, /column_default IS NULL/); assert.match(sql, /is_nullable = 'YES'/); assert.match(sql, /RAISE EXCEPTION/);
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
});
