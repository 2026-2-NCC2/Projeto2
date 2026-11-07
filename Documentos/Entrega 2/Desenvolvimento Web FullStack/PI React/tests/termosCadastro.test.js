import test from 'node:test'
import assert from 'node:assert/strict'
import { carregarAdmin } from './helpers/adminRuntime.js'
import { createHash, webcrypto } from 'node:crypto'
import original from '../src/pages/publicas/termosUso.json' with { type: 'json' }

function servico(termosUso, dados, ok = true) {
  const chamadas = []
  const { consultarTermosCadastro } = carregarAdmin('services/termosCadastro.js', ['consultarTermosCadastro'], {
    termosUso, crypto: webcrypto, TextEncoder, apiUrl: x => x, fetch: async (...args) => { chamadas.push(args); return { ok, json: async () => dados } },
  })
  return { consultarTermosCadastro, chamadas }
}
const aprovado = { ...original, estado: 'aprovado', aprovacao: 'referencia-sintetica' }
const hash = t => createHash('sha256').update(JSON.stringify(t)).digest('hex')
const documento = t => ({ id: t.id, versao: t.versao, hash: hash(t), conteudo: t })

test('frontend recusa minuta mesmo diante de uma resposta que a apresente como disponível', async () => {
  const s = servico(original, { disponivel: true, documento: documento(original) })
  await assert.rejects(s.consultarTermosCadastro())
})
test('frontend exige documento publicado idêntico ao exibido e não repete consulta automaticamente', async () => {
  for (const d of [{ ...documento(aprovado), versao: 'outra' }, { ...documento(aprovado), hash: 'inválido' }, { ...documento(aprovado), conteudo: { ...aprovado, secoes: [] } }]) {
    const s = servico(aprovado, { disponivel: true, documento: d })
    await assert.rejects(s.consultarTermosCadastro()); assert.equal(s.chamadas.length, 1)
  }
})
test('metadados de aceite vêm do backend, com consulta sem cache e sinal de cancelamento', async () => {
  const s = servico(aprovado, { disponivel: true, documento: documento(aprovado) }), c = new AbortController()
  const r = await s.consultarTermosCadastro(c.signal)
  assert.deepEqual(JSON.parse(JSON.stringify(r)), { documento: aprovado.id, versao: aprovado.versao, hash: hash(aprovado) })
  assert.equal(s.chamadas[0][0], '/termos/vigente'); assert.equal(s.chamadas[0][1].cache, 'no-store')
  assert.equal(s.chamadas[0][1].signal, c.signal)
})

test('hash sintaticamente válido mas diferente dos bytes apresentados mantém cadastro bloqueado', async () => {
  const s = servico(aprovado, { disponivel: true, documento: { ...documento(aprovado), hash: 'b'.repeat(64) } })
  await assert.rejects(s.consultarTermosCadastro(), /integridade/)
  assert.equal(s.chamadas.length, 1)
})
