import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// Executa o handler real, sem montar telas ou acessar servidores.
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const inicio = app.indexOf('const aoExcluirEvento = async (evento) => {')
const fim = app.indexOf('  const aoFinalizarESalvar', inicio)
assert.ok(inicio >= 0 && fim > inicio)

async function executar(resposta) {
  const alerts = [], removidos = [], atualizacoes = []
  let eventos = [{ id: 1, nome: 'Descartável' }, { id: 2, nome: 'Outro' }]
  const handler = vm.runInNewContext(app.slice(inicio, fim) + '\naoExcluirEvento', {
    rascunhosCustos: {}, rascunhoCustosTemAlteracoes: () => false,
    window: { confirm: () => true }, sessionStorage: { getItem: () => 'token-ficticio' },
    alert: mensagem => alerts.push(mensagem), console: { error() {} }, setPagina() {},
    excluirEvento: async (id, token) => {
      assert.equal(id, 1)
      assert.equal(token, 'token-ficticio')
      if (resposta instanceof Error) throw resposta
      return resposta
    },
    setEventos: atualizar => { eventos = atualizar(eventos) },
    removerRascunho: chave => removidos.push(chave),
    selecaoEventoRef: { current: { chave: 'evento:1' } },
    contadorNovoEventoRef: { current: 0 }, dadosNovoEvento: () => ({}),
    atualizarSelecao: (...args) => atualizacoes.push(args),
  })
  await handler(eventos[0])
  return { alerts, removidos, atualizacoes, ids: Array.from(eventos, e => e.id) }
}

test('409 informa vínculos uma vez e preserva lista e rascunhos', async () => {
  const r = await executar({ status: 409, ok: false, json: async () => { throw Error('Não deve ler JSON') } })
  assert.deepEqual(r.alerts, ['Este evento possui inscrições ou propostas vinculadas e não pode ser excluído.'])
  assert.deepEqual(r.ids, [1, 2])
  assert.deepEqual(r.removidos, [])
  assert.equal(r.atualizacoes.length, 0)
})

test('200 remove somente o evento excluído e informa sucesso uma vez', async () => {
  const r = await executar({ status: 200, ok: true })
  assert.deepEqual(r.ids, [2])
  assert.deepEqual(r.removidos, ['evento:1'])
  assert.equal(r.atualizacoes.length, 1)
  assert.deepEqual(r.alerts, ['Evento excluído com sucesso!'])
})

for (const status of [404, 500]) test(`${status} preserva mensagem recebida e lista`, async () => {
  const mensagem = status === 404 ? 'Evento não encontrado.' : 'Erro interno ao excluir evento.'
  const r = await executar({ status, ok: false, json: async () => ({ erro: mensagem }) })
  assert.deepEqual(r.alerts, [mensagem])
  assert.deepEqual(r.ids, [1, 2])
  assert.deepEqual(r.removidos, [])
})

test('erro sem mensagem mantém tratamento genérico existente', async () => {
  const r = await executar({ status: 500, ok: false, json: async () => ({}) })
  assert.deepEqual(r.alerts, ['Erro ao excluir evento.'])
})

test('falha de conexão mantém aviso único existente', async () => {
  const r = await executar(new Error('Rede indisponível'))
  assert.deepEqual(r.alerts, ['Não foi possível conectar ao servidor.'])
  assert.deepEqual(r.ids, [1, 2])
})
