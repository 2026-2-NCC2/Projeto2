import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import config from '../vite.imagens-homolog.config.js'

test('Vite isolado fixa loopback/portas, não carrega .env e não usa 3001', () => {
  assert.throws(() => config({ mode: 'development' }), /isolado/)
  const c = config({ mode: 'isolado' })
  assert.equal(c.server.host, '127.0.0.1'); assert.equal(c.server.port, 5273); assert.equal(c.server.strictPort, true)
  assert.deepEqual(c.envPrefix, []); assert.ok(c.envDir.endsWith('.sem-env-homologacao'))
  for (const opcoes of [c.server, c.preview]) {
    assert.equal(opcoes.proxy['/api'].target, 'http://127.0.0.1:3131')
    assert.equal(opcoes.proxy['/api'].rewrite('/api/login'), '/login')
  }
  assert.equal(c.define['import.meta.env.TROCATICKET_API_MODO'], '"isolado"')
})
test('entrada isolada não modifica HTML principal e mantém uploads bloqueados', () => {
  const c = config({ mode: 'isolado' }), html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const transformado = c.plugins[1].transformIndexHtml.handler(html)
  assert.ok(transformado.includes('/src/homologacao/main.jsx')); assert.ok(html.includes('/src/main.jsx'))
  const entrada = readFileSync(new URL('../src/homologacao/AppImagensHomologacao.jsx', import.meta.url), 'utf8')
  assert.ok(!entrada.includes('3001')); assert.ok(!entrada.includes('habilitado={true}'))
  assert.ok(entrada.includes('/__homologacao')); assert.ok(entrada.includes('ocupado || !destino'))
  assert.ok(entrada.includes("dados.projectRef === 'gnwybroqfvwosiqzsfla'"))
})
