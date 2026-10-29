import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'

const dataUrl = fonte => `data:text/javascript;base64,${Buffer.from(fonte).toString('base64')}`
async function carregar(ambiente) {
  const api = readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8')
    .replace('import.meta.env', JSON.stringify(ambiente))
  const fonte = readFileSync(new URL('../src/services/eventos.js', import.meta.url), 'utf8')
    .replace("'./api.js'", JSON.stringify(dataUrl(api)))
  return import(dataUrl(fonte))
}

for (const [modo, env, base] of [
  ['principal', { MODE: 'development' }, 'http://localhost:3001'],
  ['isolado', { MODE: 'isolado', TROCATICKET_API_MODO: 'isolado' }, '/api'],
]) {
  test(`${modo}: preserva URLs, metodos, JWT, payloads e Response sem ler JSON`, async () => {
    const service = await carregar(env)
    const original = globalThis.fetch
    const chamadas = []
    const response = { ok: false, status: 400, json() { throw Error('JSON pertence ao App') } }
    globalThis.fetch = async (...args) => { chamadas.push(args); return response }
    try {
      const completo = { id: 42, nome: 'Evento', publico: 500, descricao: '', categoria: 'Corporativo' }
      const financeiro = { nome: 'Evento', publico: 500, descricao: '' }
      const copia = structuredClone(completo)
      assert.equal(await service.listarEventos('simulado'), response)
      assert.equal(await service.publicarEvento(42, 'simulado'), response)
      assert.equal(await service.excluirEvento(42, 'simulado'), response)
      assert.equal(await service.salvarEvento(undefined, completo, 'simulado'), response)
      assert.equal(await service.salvarEvento(42, financeiro, 'simulado'), response)
      assert.deepEqual(completo, copia)
      assert.deepEqual(chamadas, [
        [`${base}/eventos`, { headers: { Authorization: 'Bearer simulado' } }],
        [`${base}/eventos/42/publicar`, { method: 'PATCH', headers: { Authorization: 'Bearer simulado' } }],
        [`${base}/eventos/42`, { method: 'DELETE', headers: { Authorization: 'Bearer simulado' } }],
        [`${base}/eventos`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer simulado' }, body: JSON.stringify(completo) }],
        [`${base}/eventos/42`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer simulado' }, body: JSON.stringify(financeiro) }],
      ])
    } finally { globalThis.fetch = original }
  })

  test(`${modo}: falhas de rede propagam intactas, sem repeticao ou fallback`, async () => {
    const service = await carregar(env)
    const original = globalThis.fetch
    const erro = new Error('falha simulada')
    let chamadas = 0
    globalThis.fetch = async () => { chamadas++; throw erro }
    try {
      for (const operacao of [() => service.listarEventos('x'), () => service.publicarEvento(42, 'x'),
        () => service.excluirEvento(42, 'x'), () => service.salvarEvento(null, {}, 'x')]) {
        await assert.rejects(operacao, e => e === erro)
      }
      assert.equal(chamadas, 4)
    } finally { globalThis.fetch = original }
  })
}
