'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { criarEncerramentoGracioso } = require('../config/encerramento-gracioso.cjs');
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

test('fecha admissão, aguarda HTTP, limpeza e persistência antes de fechar o pool', async () => {
  const http = deferred(), limpeza = deferred();
  let pendentes = 1, fechou = 0, pausou = 0, fecharHttp = 0;
  const runtime = { pararLimpeza() { pausou++; return limpeza.promise; }, async fechar() { fechou++; } };
  const s = criarEncerramentoGracioso({ obterRuntime: () => runtime, supervisor: {
    status: () => ({ resultadosIncertos: 0, requisicoesPendentes: 0, operacoesPersistenciaPendentes: pendentes, escritasPendentes: 0 }),
  } });
  let admitiu = false;
  s.middleware({}, {}, () => { admitiu = true; }); assert.equal(admitiu, true);
  const server = { close(cb) { fecharHttp++; http.promise.then(() => cb()); } };
  const encerramento = s.encerrar(server);
  assert.equal(s.encerrar(server), encerramento);
  const headers = {}, res = { setHeader(k, v) { headers[k] = v; }, status(n) { assert.equal(n, 503); return this; }, json() {} };
  s.middleware({}, res, () => assert.fail('admissão durante encerramento'));
  assert.equal(headers.Connection, 'close'); assert.equal(pausou, 1); assert.equal(fecharHttp, 1);
  http.resolve(); await new Promise(r => setImmediate(r)); assert.equal(fechou, 0);
  limpeza.resolve(); await new Promise(r => setImmediate(r)); assert.equal(fechou, 0);
  pendentes = 0; await encerramento; assert.equal(fechou, 1);
});

test('incerteza preserva o pool e recusa conclusão segura', async () => {
  let fechou = false;
  const s = criarEncerramentoGracioso({ obterRuntime: () => ({ async pararLimpeza() {}, async fechar() { fechou = true; } }),
    supervisor: { status: () => ({ resultadosIncertos: 1 }) } });
  await assert.rejects(s.encerrar({ close(cb) { cb(); } }), /RESULTADO_INCERTO/);
  assert.equal(fechou, false);
});

test('prazo vencido não destrói conexões nem fecha pool com requisição pendente', async () => {
  let fechou = false;
  const s = criarEncerramentoGracioso({ prazoMs: 20, obterRuntime: () => ({ async pararLimpeza() {}, async fechar() { fechou = true; } }) });
  await assert.rejects(s.encerrar({ close() {} }), /DRENAGEM_PENDENTE/);
  assert.equal(fechou, false);
});
