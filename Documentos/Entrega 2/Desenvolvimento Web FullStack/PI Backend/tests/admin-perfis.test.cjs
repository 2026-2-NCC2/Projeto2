'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { instalarGestaoPerfis } = require('../admin-perfis-http.cjs');
function ambiente({ ativo = true, alterar } = {}) {
  const routes = {}, calls = [];
  instalarGestaoPerfis({ get(p, ...h) { routes['GET ' + p] = h; }, patch(p, ...h) { routes['PATCH ' + p] = h; } }, {
    ativo, autenticar(q, s, next) { return q.usuario ? next() : s.status(401).json({}); },
    permitirPerfis: p => (q, s, next) => q.usuario.perfil === p ? next() : s.status(403).json({}),
    repositorios: { adminPerfis: { capacidades: async () => true, alterar: async (...args) => { calls.push(args); return alterar ? alterar(...args) : { id: 1, perfil: 'organizador' }; } } },
  });
  return { calls, async request({ perfil = 'admin', method = 'PATCH', body, chave = randomUUID() } = {}) {
    const q = { usuario: perfil ? { id: 10, perfil } : null, params: { id: '1' }, headers: { 'idempotency-key': chave },
      body: body ?? { perfil_anterior: 'participante', perfil_novo: 'organizador', motivo: 'Necessidade acadêmica', confirmado: true } };
    const s = { statusCode: 200, setHeader() {}, status(n) { this.statusCode = n; return this; }, json(x) { this.body = x; return this; } };
    const hs = routes[method + (method === 'GET' ? ' /admin/usuarios/perfis/capacidades' : ' /admin/usuarios/:id/perfil')];
    let i = 0; await (async function next() { if (i < hs.length) return hs[i++](q, s, next); })(); return s;
  } };
}
test('gestão de perfis exige admin; desativado não consulta banco nem altera perfil', async () => {
  const a = ambiente();
  for (const p of [null, 'participante', 'fornecedor', 'organizador']) for (const method of ['GET', 'PATCH'])
    assert.equal((await a.request({ perfil: p, method })).statusCode, p ? 403 : 401);
  assert.equal(a.calls.length, 0);
  const off = ambiente({ ativo: false }); assert.equal((await off.request()).statusCode, 503);
  assert.equal((await off.request({ method: 'GET' })).body.alterar, false); assert.equal(off.calls.length, 0);
});
test('autor vem da sessão; payload não concede autoridade; motivo e confirmação obrigatórios', async () => {
  const a = ambiente(), chave = randomUUID();
  assert.equal((await a.request({ chave })).statusCode, 200); assert.equal(a.calls[0][0], 10); assert.equal(a.calls[0][1], 1); assert.equal(a.calls[0][3], chave);
  const base = { perfil_anterior: 'participante', perfil_novo: 'admin', motivo: 'Motivo acadêmico legítimo', confirmado: true };
  for (const change of [{ admin_id: 99 }, { usuario_id: 99 }, { perfil_novo: 'root' }, { motivo: '' }, { motivo: 'x\n'.repeat(20) }, { confirmado: false }, { perfil_novo: 'participante' }])
    assert.equal((await a.request({ body: { ...base, ...change } })).statusCode, 400);
  assert.equal((await a.request({ chave: 'invalida' })).statusCode, 400); assert.equal(a.calls.length, 1);
});
test('falha técnica não simula sucesso nem expõe motivo/SQL; retorna resultado incerto', async () => {
  const a = ambiente({ alterar: () => { throw Error('SEGREDO_SINTETICO'); } });
  const r = await a.request(); assert.equal(r.statusCode, 503); assert.equal(r.body.resultado_incerto, true);
  assert.doesNotMatch(JSON.stringify(r.body), /SEGREDO/);
});
test('adaptador verifica autoria de payload e mapeia recusas sem retry', async () => {
  let response = { data: { id: 1, perfil: 'admin', confirmado: true } }; const calls = [];
  const cliente = { schema() { return this; }, rpc(n, a) { calls.push([n, a]); return this; }, retry(x) { assert.equal(x, false); return this; }, abortSignal: async () => response };
  const repo = require('../repositories/supabase/admin-perfis.cjs').criarRepositorioAdminPerfis(cliente);
  const d = { perfil_anterior: 'participante', perfil_novo: 'admin', motivo: 'Motivo válido sintético' };
  assert.deepEqual(await repo.alterar(10, 1, d, randomUUID()), { id: 1, perfil: 'admin' }); assert.equal(calls[0][1].p_admin, 10);
  for (const [code, status] of [['AP403', 403], ['AP412', 409], ['AP413', 409], ['55P03', 409], ['AP400', 400], ['AP409', 409]]) {
    response = { error: { code } }; await assert.rejects(repo.alterar(10, 1, d, randomUUID()), e => e.respostaStatus === status && e.resultadoIncerto === false);
  }
  response = { data: { id: 999, perfil: 'admin', confirmado: true } }; await assert.rejects(repo.alterar(10, 1, d, randomUUID()));
});
test('JWT já emitido usa perfil atual; revogação atinge a próxima requisição da sessão', async t => {
  const h = await require('./helpers/http-autenticacao.cjs').iniciar(t, 'supabase');
  const token = h.token(10);
  assert.equal((await h.request('GET', '/usuarios', undefined, token)).status, 200);
  h.state.usuarios.find(x => x.id === 10).perfil = 'participante';
  assert.equal((await h.request('GET', '/usuarios', undefined, token)).status, 403);
  assert.equal((await h.request('GET', '/admin/usuarios/perfis/capacidades', undefined, token)).status, 403);
  assert.equal((await h.request('GET', '/perfil', undefined, token)).status, 200);
});
