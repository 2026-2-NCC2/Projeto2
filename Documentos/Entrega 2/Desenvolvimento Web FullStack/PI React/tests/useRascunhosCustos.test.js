import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { criarRascunhoCustos, rascunhoCustosTemAlteracoes } from '../src/utils/rascunhosCustos.js'
import { custosSemanticamenteIguais } from '../src/utils/custos.js'

const item = (valor = 10, id = 'local') => ({ id, categoria: 'Som', descricao: 'Locação', valor })

// Executa o hook real com ciclo de hooks/efeitos simulado; sem rede ou storage.
function montar() {
  const fonte = readFileSync(new URL('../src/hooks/useRascunhosCustos.js', import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/gm, '').replace('export function', 'function')
  const celulas = []
  const efeitos = []
  const listeners = new Set()
  let cursor = 0
  const useState = inicial => {
    const n = cursor++
    if (!celulas[n]) {
      const c = { valor: typeof inicial === 'function' ? inicial() : inicial }
      c.set = proximo => { c.valor = typeof proximo === 'function' ? proximo(c.valor) : proximo }
      celulas[n] = c
    }
    return [celulas[n].valor, celulas[n].set]
  }
  const useRef = inicial => { const n = cursor++; return celulas[n] ?? (celulas[n] = { current: inicial }) }
  const mesmos = (a, b) => a && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const useCallback = (fn, deps) => {
    const n = cursor++
    if (!mesmos(celulas[n]?.deps, deps)) celulas[n] = { deps, fn }
    return celulas[n].fn
  }
  const useEffect = (fn, deps) => {
    const n = cursor++
    if (!mesmos(celulas[n]?.deps, deps)) efeitos.push(() => {
      celulas[n]?.limpar?.()
      celulas[n] = { deps, limpar: fn() }
    })
  }
  const janela = {
    addEventListener(tipo, fn) { assert.equal(tipo, 'beforeunload'); listeners.add(fn) },
    removeEventListener(tipo, fn) { assert.equal(tipo, 'beforeunload'); listeners.delete(fn) },
  }
  const hook = new Function('useState', 'useRef', 'useCallback', 'useEffect', 'window',
    'criarRascunhoCustos', 'rascunhoCustosTemAlteracoes', 'custosSemanticamenteIguais',
    `${fonte}\nreturn useRascunhosCustos;`)(useState, useRef, useCallback, useEffect, janela,
    criarRascunhoCustos, rascunhoCustosTemAlteracoes, custosSemanticamenteIguais)
  const geracao = { current: 0 }
  return { geracao, listeners,
    render() {
      cursor = 0
      const retorno = hook({ geracaoSessaoRef: geracao })
      efeitos.splice(0).forEach(executar => executar())
      return retorno
    },
    desmontar() { celulas.forEach(c => c.limpar?.()) },
    get estado() { return celulas[0].valor },
  }
}

test('inicializa novo sem ID com base desconhecida; setter permanece estavel', () => {
  const a = montar(); const primeiro = a.render()
  assert.deepEqual(a.estado['novo:0'], criarRascunhoCustos(0))
  assert.equal(a.render().setRascunhos, primeiro.setRascunhos)
  assert.equal(a.render().rascunhos, primeiro.rascunhos)
})

test('criacao e edicao separam eventos e preservam rascunho ao navegar', () => {
  const a = montar(); const h = a.render()
  h.atualizarCustos('novo:0', 0, [item()])
  h.garantirRascunho('evento:9'); h.garantirRascunho('evento:10')
  h.atualizarCustos('evento:9', 0, [item(20)])
  h.atualizarCustos('evento:10', 0, [item(30)])
  const antes = a.estado['evento:9']
  h.garantirRascunho('evento:10'); h.garantirRascunho('evento:9')
  assert.equal(a.estado['evento:9'], antes)
  assert.equal(a.estado['evento:9'].itens[0].valor, 20)
  assert.equal(a.estado['evento:10'].itens[0].valor, 30)
  assert.equal(a.estado['novo:0'].itens[0].valor, 10)
})

test('revisao muda somente com conteudo semantico, inclusive ao remover ultimo item', () => {
  const a = montar(); const h = a.render()
  h.garantirRascunho('evento:9')
  h.atualizarCustos('evento:9', 0, [item()])
  assert.equal(a.estado['evento:9'].revisaoLocal, 1)
  h.atualizarCustos('evento:9', 0, [item(10, 'outro-id')])
  assert.equal(a.estado['evento:9'].revisaoLocal, 1)
  h.setRascunhos(atuais => ({ ...atuais, 'evento:9': { ...atuais['evento:9'], basePersistida: [item()] } }))
  h.atualizarCustos('evento:9', 0, anteriores => anteriores.map(i => ({ ...i, valor: 20 })))
  h.atualizarCustos('evento:9', 0, [])
  assert.equal(a.estado['evento:9'].revisaoLocal, 3)
  assert.equal(rascunhoCustosTemAlteracoes(a.estado['evento:9']), true)
  assert.deepEqual(a.estado['evento:9'].basePersistida, [item()])
})

test('remover chave nao permite callback antigo recriar rascunho', () => {
  const a = montar(); const h = a.render()
  h.garantirRascunho('evento:9'); h.removerRascunho('evento:9')
  const antes = a.estado
  h.atualizarCustos('evento:9', 0, [item()])
  assert.equal(a.estado, antes)
  assert.equal(a.estado['evento:9'], undefined)
  assert.ok(a.estado['novo:0'])
})

test('logout invalida callbacks antigos e criacao usa geracao sincronizada pela ref', () => {
  const a = montar(); const antigo = a.render()
  antigo.garantirRascunho('evento:9')
  a.geracao.current++
  antigo.setRascunhos({})
  antigo.garantirRascunho('novo:1')
  antigo.garantirRascunho('evento:9')
  const antes = a.estado
  antigo.atualizarCustos('evento:9', 0, [item()])
  assert.equal(a.estado, antes)
  assert.equal(a.estado['novo:1'].geracaoSessao, 1)
  const atual = a.render()
  atual.atualizarCustos('evento:9', 1, [item(20)])
  assert.equal(a.estado['evento:9'].itens[0].valor, 20)
  // Tambem recusa um rascunho que pertenca a outra geracao.
  atual.setRascunhos({ 'evento:9': criarRascunhoCustos(0) })
  atual.atualizarCustos('evento:9', 1, [item()])
  assert.deepEqual(a.estado['evento:9'].itens, [])
})

test('edicao conserva metadados de GET/PUT e aviso de resultado incerto', () => {
  const a = montar(); const h = a.render()
  const r = criarRascunhoCustos(0)
  r.get = { ...r.get, estado: 'carregado', idRequisicao: 5 }
  r.put = { ...r.put, estado: 'resultadoIncerto', confirmarReenvio: true, mensagem: 'Revisar antes de reenviar' }
  h.setRascunhos({ 'evento:9': r })
  h.atualizarCustos('evento:9', 0, [item()])
  assert.equal(a.estado['evento:9'].get, r.get)
  assert.equal(a.estado['evento:9'].put.estado, 'resultadoIncerto')
  assert.equal(a.estado['evento:9'].put.mensagem, r.put.mensagem)
  assert.equal(a.estado['evento:9'].basePersistida, null)
})
