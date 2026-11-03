"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { criarControle, criarTransporte, confirmarEntrada, iniciar } = require("../homologacao-escrita.cjs");
const { tokensCorpo } = require("../scripts/catalogo-homologacao-escrita.cjs");
const config = { projectRef: "gnwybroqfvwosiqzsfla", SUPABASE_URL: "https://gnwybroqfvwosiqzsfla.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_ficticia" };
const headers = { apikey: config.SUPABASE_SECRET_KEY, authorization: "Bearer " + config.SUPABASE_SECRET_KEY };
test("escrita: flag sem contexto e execucao fora da entrada nao liberam startup", async () => {
  assert.throws(confirmarEntrada, { code: "HW_ENTRY" });
  await assert.rejects(iniciar(criarControle(), () => {}), { code: "HW_ENTRY" });
});
test("HTTP: permissao pontual exige rota, metodo e token; nao pode ser reutilizada", () => {
  const c = criarControle(); let passou = 0;
  const res = { status(n) { assert.equal(n, 405); return this; }, json() {} };
  c.armarHttp("POST", "/eventos", "Bearer ficticio");
  c.filtro({ method: "POST", path: "/eventos", headers: { authorization: "Bearer outro" } }, res, () => passou++);
  c.filtro({ method: "POST", path: "/eventos", headers: { authorization: "Bearer ficticio" } }, res, () => passou++);
  c.filtro({ method: "POST", path: "/eventos", headers: { authorization: "Bearer ficticio" } }, res, () => passou++);
  assert.equal(passou, 1);
  assert.throws(() => c.armarHttp("POST", "/login/"), { code: "HW_HTTP_ARM" });
});
test("transporte: destino, chave e schema incorretos nao chegam ao fetch", async () => {
  const c = criarControle(); let calls = 0;
  const t = criarTransporte(config, c, async () => { calls++; }, () => {});
  for (const [url, h] of [["https://outro.invalid/rest/v1/eventos", headers], [config.SUPABASE_URL + "/rest/v1/eventos", { ...headers, authorization: "Bearer usuario" }], [config.SUPABASE_URL + "/rest/v1/eventos", { ...headers, "accept-profile": "auth" }]]) {
    await assert.rejects(t.fetch(url, { headers: h }), { code: "HW_TRANSPORT" });
  }
  assert.equal(calls, 0);
});
test("escrita: sem permissao, ID alheio ou payload diferente jamais chegam a rede", async () => {
  const c = criarControle(); let calls = 0;
  const t = criarTransporte(config, c, async () => { calls++; }, () => {});
  const url = config.SUPABASE_URL + "/rest/v1/eventos?id=eq.10";
  await assert.rejects(t.fetch(url, { method: "DELETE", headers }), { code: "HW_MUTATION_DENIED" });
  c.armarEscrita("DELETE", "/rest/v1/eventos?id=eq.11");
  await assert.rejects(t.fetch(url, { method: "DELETE", headers }), { code: "HW_MUTATION_DENIED" });
  c.armarEscrita("PATCH", "/rest/v1/eventos?id=eq.10", { nome: "fixture" });
  await assert.rejects(t.fetch(url, { method: "PATCH", headers, body: '{"nome":"outro"}' }), { code: "HW_MUTATION_DENIED" });
  assert.equal(calls, 0);
});
test("timeout: uma tentativa incerta e registrada; retry nao recebe nova permissao", async () => {
  const c = criarControle(), log = []; let calls = 0;
  const t = criarTransporte(config, c, async () => { calls++; throw Error("timeout sintetico"); }, e => log.push(e.phase));
  c.armarEscrita("POST", "/rest/v1/rpc/avaliar_proposta", { p_proposta_id: "10" });
  const request = () => t.fetch(config.SUPABASE_URL + "/rest/v1/rpc/avaliar_proposta", { method: "POST", headers, body: '{"p_proposta_id":"10"}' });
  await assert.rejects(request()); await assert.rejects(request(), { code: "HW_MUTATION_DENIED" });
  assert.deepEqual(log, ["antes"]); assert.equal(calls, 1);
});
test("IDs sao registrados antes de devolver resposta e shutdown cancela corpo apos headers", async () => {
  const c = criarControle(), log = []; let signal;
  const t = criarTransporte(config, c, async (u, op) => { signal = op.signal; return new Response('{"id":77}', { headers: { "sb-project-ref": config.projectRef } }); }, e => log.push(e.phase));
  c.armarEscrita("POST", "/rest/v1/eventos?select=id", { nome: "fixture" });
  const r = await t.fetch(config.SUPABASE_URL + "/rest/v1/eventos?select=id", { method: "POST", headers, body: '{"nome":"fixture"}' });
  assert.deepEqual(log, ["antes", "confirmada"]); assert.deepEqual(await r.json(), { id: 77 });
  t.abortar(); assert.equal(signal.aborted, true);
});
test("corpos SQL: normaliza comentarios/formatacao sem apagar literais", () => {
  assert.deepEqual(tokensCorpo("AS $a$ BEGIN -- comentario\n RETURN '--'; END; $a$"), tokensCorpo("AS $b$ begin RETURN '--'; end; $b$"));
  assert.notDeepEqual(tokensCorpo("AS $$ RETURN 'A'; $$"), tokensCorpo("AS $$ RETURN 'a'; $$"));
});

test("catalogo: exportacao fornecida confere; corpo, EXECUTE ou FK divergente bloqueiam", () => {
  const catalogo = require("../fixtures/homologacao-escrita.catalogo-20261031.json")[0].preflight_homologacao_escrita;
  const { validarCatalogo } = require("../scripts/catalogo-homologacao-escrita.cjs");
  assert.equal(validarCatalogo(catalogo).length, 4);
  for (const alterar of [c => { c.functions[0].execute_by_role.anon = true; },
    c => { c.functions[0].definition = c.functions[0].definition.replace("RETURN 0", "RETURN 1"); },
    c => { c.foreign_keys[0].definition = c.foreign_keys[0].definition.replace("CASCADE", "RESTRICT"); },
    c => { c.functions[0].security_definer = undefined; }]) {
    const copia = structuredClone(catalogo); alterar(copia); assert.throws(() => validarCatalogo(copia));
  }
});

function memoriaLimpeza(estranho = false) {
  const { ORDEM } = require("../scripts/limpeza-homologacao-escrita.cjs");
  const ids = Object.fromEntries(ORDEM.map(t => [t, []])); ids.usuarios = [10]; ids.eventos = [20];
  const rows = { usuarios: [{ id: 10, run: true }, { id: 1, run: false }], eventos: [{ id: 20, usuario_id: 10, run: true }] };
  if (estranho) rows.eventos.push({ id: 21, usuario_id: 10, run: false });
  const deleted = [];
  return { ids, foreignKeys: [{ table: "eventos", references: "usuarios", definition: "FOREIGN KEY (usuario_id) REFERENCES usuarios(id)" }],
    pertence: (t, r) => r.run, rows, deleted,
    async ler(t, col, values) { return (rows[t] ?? []).filter(r => values.includes(r[col])); },
    async remover(t, id) { deleted.push([t, id]); rows[t] = rows[t].filter(r => r.id !== id); return [{ id }]; } };
}
test("limpeza: respeita dependencias e nunca remove usuario preexistente", async () => {
  const op = memoriaLimpeza();
  const result = await require("../scripts/limpeza-homologacao-escrita.cjs").limparDescartaveis(op);
  assert.deepEqual(op.deleted, [["eventos", 20], ["usuarios", 10]]);
  assert.deepEqual(op.rows.usuarios, [{ id: 1, run: false }]);
  assert.ok(Object.values(result).every(ids => !ids.length));
});
test("limpeza: referencia externa interrompe antes de qualquer exclusao", async () => {
  const op = memoriaLimpeza(true);
  await assert.rejects(require("../scripts/limpeza-homologacao-escrita.cjs").limparDescartaveis(op));
  assert.deepEqual(op.deleted, []);
});
test("limpeza: marcador alterado nao e aceito mesmo com ID no manifesto", async () => {
  const op = memoriaLimpeza(); op.rows.usuarios[0].run = false;
  await assert.rejects(require("../scripts/limpeza-homologacao-escrita.cjs").limparDescartaveis(op));
  assert.deepEqual(op.deleted, []);
});
