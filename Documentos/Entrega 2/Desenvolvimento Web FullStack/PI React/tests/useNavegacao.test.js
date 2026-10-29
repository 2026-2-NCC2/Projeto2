import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Executa o hook real com useEffect simulado; sem navegador, rede ou storage real.
function montar() {
  const fonte = readFileSync(new URL('../src/hooks/useNavegacao.js', import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/u, '').replace('export function', 'function')
  const escritas = []
  let dependencias
  let efeito
  const useEffect = (executar, deps) => {
    if (!dependencias || !Object.is(dependencias[0], deps[0])) efeito = executar
    dependencias = deps
  }
  const storage = { setItem: (...args) => escritas.push(args) }
  const hook = new Function('useEffect', 'sessionStorage', `${fonte}\nreturn useNavegacao;`)(useEffect, storage)
  return { hook, escritas, executarEfeitos() { const executar = efeito; efeito = undefined; executar?.() } }
}

test('persiste pagina somente depois do efeito, sem alterar token ou perfil', () => {
  const a = montar()
  assert.equal(a.hook('eventos'), undefined)
  assert.deepEqual(a.escritas, [])
  a.executarEfeitos()
  assert.deepEqual(a.escritas, [['paginaAtual', 'eventos']])
})

test('pagina login nao grava nem remove dados da sessao', () => {
  const a = montar()
  a.hook('login'); a.executarEfeitos()
  assert.deepEqual(a.escritas, [])
  a.hook('custos'); a.executarEfeitos()
  a.hook('login'); a.executarEfeitos()
  assert.deepEqual(a.escritas, [['paginaAtual', 'custos']])
})

test('repetir render da mesma pagina nao repete persistencia; transicoes preservam destinos', () => {
  const a = montar()
  for (const pagina of ['eventos', 'eventos', 'criar', 'custos', 'cotacao', 'ticket', 'fornecedor-mural', 'participante']) {
    a.hook(pagina); a.executarEfeitos()
  }
  assert.deepEqual(a.escritas.map(([, pagina]) => pagina),
    ['eventos', 'criar', 'custos', 'cotacao', 'ticket', 'fornecedor-mural', 'participante'])
})
