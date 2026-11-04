"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const express = require('express'), jwt = require('jsonwebtoken');
const { criarRouterImagens } = require('../imagens/http.cjs');
const segredo = 'segredo-sintetico-http-imagens-exclusivo-dos-testes';
async function fixture(t, servico, agora, montagem = false) {
  const app = express();
  const autenticar = (req, res, next) => {
    try {
      const p = jwt.verify((req.headers.authorization || '').replace(/^Bearer /, ''), segredo, { algorithms: ['HS256'] });
      req.usuario = { id: p.id, perfil: ['participante','organizador','fornecedor','admin'][p.id-7] }; next();
    } catch { res.status(401).json({ erro: 'Sessão inválida.' }); }
  };
  if (montagem) require('../imagens/rotas.cjs').instalarRotasImagens(app,autenticar,{servico});
  else app.use('/perfil/imagens', criarRouterImagens({ autenticar, servico, agora }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}/perfil/imagens/`;
  return (id, tipo = 'foto', method = 'GET', body, headers = {}) => fetch(base+tipo, { method, body,
    headers: { ...(id ? { Authorization: 'Bearer '+jwt.sign({ id }, segredo, { expiresIn: '1h' }) } : {}), ...headers } });
}
test('router preparado: JWT e propriedade nos quatro perfis; query de outro dono recusada', async t => {
  const chamadas = [];
  let tempo = 0;
  const r = await fixture(t, {
    consultar: async (u, tipo) => { chamadas.push([u.id,tipo]); return null; },
    substituir: async (u, tipo, corpo) => { chamadas.push([u.id,tipo,corpo.length]); return { operacao: 'sintetica' }; },
    remover: async (u,tipo) => { chamadas.push([u.id,tipo]); },
  }, () => tempo);
  assert.equal((await r(null, 'foto', 'PUT', 'nao parsear', { 'Content-Type':'application/json' })).status, 401);
  for (const id of [7,8,9,10]) {
    tempo += 60001;
    assert.equal((await r(id)).status, 200);
    assert.equal((await r(id,'capa','PUT',Buffer.from('bytes'),{'Content-Type':'image/png'})).status,200);
    assert.equal((await r(id,'foto','DELETE')).status,200);
    for (const method of ['GET','PUT','DELETE']) assert.equal((await r(id,'foto?usuario_id=999',method)).status,400);
  }
  assert.equal(chamadas.length,12); assert.ok(chamadas.every(([id])=>[7,8,9,10].includes(id)));
  assert.equal((await r(7,'__proto__')).status,400);
});

test('montagem explícita conecta serviço existente; dependência inválida nunca libera rotas',async t=>{
  const {instalarRotasImagens}=require('../imagens/rotas.cjs');
  let montagens=0;assert.throws(()=>instalarRotasImagens({use(){montagens++}},()=>{},{servico:{}}),/inválida/);assert.equal(montagens,0);
  const calls=[],r=await fixture(t,{consultar:async u=>{calls.push(u.id);return null},substituir:async()=>({}),remover:async()=>{}},undefined,true);
  assert.equal((await r(null)).status,401);assert.equal((await r(7)).status,200);assert.deepEqual(calls,[7]);
});
test('limites HTTP: MIME, compressão, bytes, frequência e resposta sem cache', async t => {
  let chamadas = 0, tempo = 0;
  const r = await fixture(t, { substituir: async () => { chamadas++; return {}; }, consultar: async()=>null }, () => tempo);
  assert.equal((await r(7,'foto','PUT','{}',{'Content-Type':'application/json'})).status,415);
  assert.equal((await r(7,'foto','PUT','x',{'Content-Type':'image/png','Content-Encoding':'gzip'})).status,415);
  assert.equal((await r(7,'foto','PUT',Buffer.alloc(5242881),{'Content-Type':'image/png'})).status,413);
  assert.equal(chamadas,0);
  tempo += 60001;
  for(let i=0;i<6;i++) assert.equal((await r(7,'foto','PUT','x',{'Content-Type':'image/png'})).status,200);
  const bloqueada=await r(7,'foto','PUT','x',{'Content-Type':'image/png'});
  assert.equal(bloqueada.status,429); assert.ok(bloqueada.headers.get('retry-after'));
  assert.equal(chamadas,6); assert.equal((await r(7)).headers.get('cache-control'),'no-store');
});
test('falha de upload não repete escrita nem expõe erro bruto', async t => {
  let chamadas=0;
  const r=await fixture(t,{substituir:async()=>{chamadas++;throw Error('CREDENCIAL_FICTICIA_INTERNA');}});
  const resposta=await r(7,'foto','PUT','x',{'Content-Type':'image/png'});
  assert.equal(resposta.status,503); assert.equal(chamadas,1);
  assert.ok(!(await resposta.text()).includes('CREDENCIAL'));
});
test('capacidade global limita recepção/processamento sem cancelar operações iniciadas', async t => {
  const liberar=[];
  const r=await fixture(t,{substituir:()=>new Promise(resolve=>liberar.push(resolve))});
  const a=r(7,'foto','PUT','x',{'Content-Type':'image/png'});
  const b=r(8,'foto','PUT','x',{'Content-Type':'image/png'});
  for(let i=0;liberar.length<2 && i<50;i++) await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(liberar.length,2);
  assert.equal((await r(9,'foto','PUT','x',{'Content-Type':'image/png'})).status,429);
  liberar.forEach(fn=>fn({})); assert.equal((await a).status,200); assert.equal((await b).status,200);
});
