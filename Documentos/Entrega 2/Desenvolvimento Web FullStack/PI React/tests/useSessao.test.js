import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function montar(confirmar) {
  const fonte = readFileSync(new URL('../src/hooks/useSessao.js', import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/u, '').replace('export function', 'function')
  const dados = new Map([['token', 'simulado'], ['perfil', 'organizador'], ['paginaAtual', 'custos'], ['outro', 'preservado']])
  const chamadas = []
  const ref = { current: 'custos' }
  const custos = { geracao: 0, rascunhos: { 'evento:9': [] } }
  const hook = new Function('useCallback', 'sessionStorage', `${fonte}\nreturn useSessao;`)(
    callback => callback,
    { removeItem(chave) { chamadas.push(chave); dados.delete(chave) } },
  )
  const sessao = hook({
    confirmarDescarteDaSessao() { chamadas.push('confirmar'); return confirmar },
    limparRascunhosDaSessao() {
      chamadas.push('limpar'); custos.geracao++; custos.rascunhos = {}
      assert.equal(ref.current, 'custos')
    },
    paginaAtualRef: ref,
    definirPagina(pagina) { assert.equal(ref.current, 'login'); chamadas.push(pagina) },
  })
  return { sessao, dados, chamadas, ref, custos }
}

test('cancelar logout preserva storage, pagina, rascunhos e geracao', () => {
  const a = montar(false)
  assert.equal(a.sessao.aoSair(), undefined)
  assert.deepEqual(a.chamadas, ['confirmar'])
  assert.equal(a.dados.get('token'), 'simulado'); assert.equal(a.dados.get('perfil'), 'organizador')
  assert.equal(a.dados.get('paginaAtual'), 'custos'); assert.equal(a.ref.current, 'custos')
  assert.equal(a.custos.geracao, 0); assert.ok('evento:9' in a.custos.rascunhos)
})

test('logout confirmado conserva a ordem: remover sessao, invalidar respostas, navegar', () => {
  const a = montar(true)
  assert.deepEqual(a.chamadas, []) // Nenhuma limpeza durante a montagem do hook.
  assert.equal(a.sessao.aoSair(), undefined)
  assert.deepEqual(a.chamadas, ['confirmar', 'token', 'perfil', 'paginaAtual', 'limpar', 'login'])
  assert.deepEqual([...a.dados], [['outro', 'preservado']])
  assert.equal(a.custos.geracao, 1); assert.deepEqual(a.custos.rascunhos, {})
  assert.equal(a.ref.current, 'login')
})
