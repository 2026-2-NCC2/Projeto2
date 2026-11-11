'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { instalarCriacaoAdmin } = require('../admin-eventos-http.cjs');
const { falha } = require('../services/suporte-transacoes.cjs');
const dados = () => ({ organizador_id: 7, nome: 'Evento sintético', data: '2099-01-01', horario: '10:00', local: 'Local', publico: 10 });
function ambiente({ ativo = true, dono = { id: 7, perfil: 'organizador' }, criar } = {}) {
  const rotas = {}, calls = [];
  instalarCriacaoAdmin({ get(p, ...h) { rotas['GET ' + p] = h; }, post(p, ...h) { rotas['POST ' + p] = h; } }, {
    ativo, autenticar(req, res, next) { return req.usuario ? next() : res.status(401).json({}); },
    permitirPerfis: p => (req, res, next) => req.usuario.perfil === p ? next() : res.status(403).json({}),
    repositorios: { usuarios: { async buscarParaAutenticacao() { return dono; } }, adminEventos: {
      async capacidades() { return { criar: true, controleCapacidade: true }; },
      async criar(...a) { calls.push(a); return criar ? criar(...a) : { id: 13, usuario_id: 7 }; },
    } },
  });
  async function request({ perfil = 'admin', body = dados(), chave = randomUUID(), metodo = 'POST' } = {}) {
    const req = { usuario: perfil ? { id: 10, perfil } : null, body, headers: { 'idempotency-key': chave } };
    const res = { statusCode: 200, setHeader() {}, status(n) { this.statusCode = n; return this; }, json(b) { this.body = b; return this; } };
    const handlers = rotas[metodo + ' /admin/eventos' + (metodo === 'GET' ? '/capacidades' : '')];
    let i = 0; await (async function next() { if (i < handlers.length) await handlers[i++](req, res, next); })();
    return res;
  }
  return { request, calls };
}
test('endpoint administrativo exige autenticação e perfil admin, inclusive quando desativado', async () => {
  const a = ambiente();
  for (const [perfil, status] of [[null, 401], ['participante', 403], ['fornecedor', 403], ['organizador', 403]]) {
    assert.equal((await a.request({ perfil })).statusCode, status);
    assert.equal((await a.request({ perfil, metodo: 'GET' })).statusCode, status);
  }
  assert.equal(a.calls.length, 0);
  const bloqueado = ambiente({ ativo: false });
  assert.equal((await bloqueado.request()).statusCode, 503);
  assert.equal((await bloqueado.request({ metodo: 'GET' })).body.criar, false);
  assert.equal(bloqueado.calls.length, 0);
});
test('ator vem da sessão, dono do cadastro validado; autor/status/proprietário adulterados são recusados', async () => {
  const a = ambiente(), chave = randomUUID(), r = await a.request({ chave });
  assert.equal(r.statusCode, 201); assert.deepEqual(r.body.evento, { id: 13, usuario_id: 7 });
  assert.equal(a.calls[0][0], 10); assert.equal(a.calls[0][1], 7); assert.equal(a.calls[0][3], chave);
  for (const campo of ['usuario_id', 'admin_id', 'status', 'perfil']) {
    assert.equal((await a.request({ body: { ...dados(), [campo]: 'adulterado' } })).statusCode, 400);
  }
  assert.equal(a.calls.length, 1);
});
test('organizador ausente, inválido e campos inválidos não chegam à escrita', async () => {
  for (const dono of [null, { id: 7, perfil: 'participante' }, { id: 7, perfil: 'admin' }]) {
    const a = ambiente({ dono }); assert.equal((await a.request()).statusCode, 400); assert.equal(a.calls.length, 0);
  }
  const a = ambiente();
  for (const changes of [{ organizador_id: '7' }, { data: '2099-02-30' }, { horario: '24:00' }, { publico: 0 }, { nome: '' }]) {
    assert.equal((await a.request({ body: { ...dados(), ...changes } })).statusCode, 400);
  }
  assert.equal((await a.request({ chave: 'expirada-invalida' })).statusCode, 400);
  assert.equal(a.calls.length, 0);
});
test('mudança concorrente de perfil e resultado incerto propagam recusa sem retry automático', async () => {
  const a = ambiente({ criar: () => { throw falha(403, 'Organizador indisponível.'); } });
  const negado = await a.request();
  assert.equal(negado.statusCode, 403); assert.equal(negado.body.resultado_incerto, true); assert.equal(a.calls.length, 1);
  const b = ambiente({ criar: () => { throw new Error('SEGREDO'); } });
  const r = await b.request(); assert.equal(r.statusCode, 503); assert.equal(r.body.resultado_incerto, true);
  assert.doesNotMatch(JSON.stringify(r.body), /SEGREDO/); assert.equal(b.calls.length, 1);
});
test('adaptador usa RPC separada, sem retry, com autoria e dono verificáveis', async () => {
  const calls = [];
  let resposta = { data: { id: 3, usuario_id: 7, admin_criador_id: 10 } };
  const c = { schema() { return this; }, rpc(n, a) { calls.push([n, a]); return this; }, retry(v) { assert.equal(v, false); return this; }, abortSignal: async () => resposta };
  const r = require('../repositories/supabase/admin-eventos.cjs').criarRepositorioAdminEventos(c), chave = randomUUID();
  assert.deepEqual(await r.criar(10, 7, dados(), chave), { id: 3, usuario_id: 7 });
  assert.equal(calls[0][0], 'criar_evento_admin_v1'); assert.equal(calls[0][1].p_admin, 10);
  resposta = { data: { id: 3, usuario_id: 99, admin_criador_id: 10 } };
  await assert.rejects(r.criar(10, 7, dados(), chave), e => e.resultadoIncerto === true);
  resposta = { error: { code: 'EV409' } };
  await assert.rejects(r.criar(10, 7, dados(), chave), e => e.respostaStatus === 409);
  resposta = { error: { code: 'PGRST202' } };
  await assert.rejects(r.capacidades(), e => e.respostaStatus === 503);
});
test('servidor real mantém POST do Organizador exclusivo e endpoint novo bloqueado por padrão', async t => {
  const a = await require('./helpers/http-autenticacao.cjs').iniciar(t, 'supabase');
  assert.equal((await a.request('POST', '/admin/eventos', dados())).status, 401);
  for (const id of [7, 8, 9]) assert.equal((await a.request('POST', '/admin/eventos', dados(), a.token(id))).status, 403);
  assert.equal((await a.request('POST', '/admin/eventos', dados(), a.token(10))).status, 503);
  assert.equal((await a.request('POST', '/eventos', dados(), a.token(10))).status, 403);
});
