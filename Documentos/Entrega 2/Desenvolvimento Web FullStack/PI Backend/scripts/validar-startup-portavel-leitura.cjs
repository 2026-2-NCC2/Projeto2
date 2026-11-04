"use strict";
// Verificacao manual: backend ja iniciado, uma chamada HTTP e um SELECT REST.
// Nao executa RPC, migracao, recuperacao, rollback ou escrita de registros.
const assert = require('node:assert/strict');
require('dotenv').config({ quiet: true });
let etapa = 'guard';
async function main() {
  const c = require('../config/startup-controlado.cjs').validarEntrada(process.env);
  etapa = 'health';
  const health = await fetch(`http://127.0.0.1:${process.env.PORT || 3001}/`, { signal: AbortSignal.timeout(10000) });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).mensagem, 'Backend do TrocaTicket funcionando!');
  etapa = 'supabase';
  const res = await fetch(c.url + '/rest/v1/eventos?select=id&limit=1', {
    method: 'GET', headers: { apikey: c.secretKey, Authorization: 'Bearer ' + c.secretKey },
    signal: AbortSignal.timeout(10000),
  });
  etapa = 'supabase-status-' + res.status;
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('sb-project-ref'), 'gnwybroqfvwosiqzsfla');
  assert.ok(Array.isArray(await res.json()));
  console.log(JSON.stringify({ healthStatus: health.status, supabaseStatus: res.status,
    project: res.headers.get('sb-project-ref'), method: 'GET', recordsModified: false }));
}
main().catch(erro => {
  const code = erro.cause?.code;
  const rede = typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,60}$/.test(code) ? code : 'omitido';
  console.error(`Validacao de startup/leitura falhou na etapa ${etapa}; codigo de rede: ${rede}.`);
  process.exitCode = 1;
});
