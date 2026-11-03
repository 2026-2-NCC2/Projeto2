import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { parse } from '@babel/parser'

const css = postcss.parse(readFileSync(new URL('../src/App.css', import.meta.url), 'utf8'))
// Verifica a cascata relevante. Nao calcula geometria ou screenshots.
function estilo(selectors, width) {
  const values = {}, priorities = {}
  css.walkRules(rule => {
    for (let p = rule.parent; p; p = p.parent) if (p.type === 'atrule' && p.name === 'media') {
      const m = p.params.match(/max-width:\s*(\d+)px/); if (m && width > Number(m[1])) return
    }
    const matches = rule.selector.split(',').map(s => s.trim()).filter(s => selectors.includes(s))
    if (!matches.length) return
    const priority = Math.max(...matches.map(s => (s.match(/[.[]/g) || []).length))
    rule.walkDecls(d => { if (priority >= (priorities[d.prop] ?? -1)) { values[d.prop] = d.value; priorities[d.prop] = priority } })
  })
  return values
}

for (const width of [1920, 1366, 768, 390, 360]) {
  test(`cards, formularios e acoes em ${width}px`, () => {
    assert.equal(estilo(['.evento'], width)['flex-wrap'], 'wrap')
    assert.equal(estilo(['.eventoInfo'], width)['min-width'], '0')
    assert.equal(estilo(['.acoes'], width)['flex-wrap'], 'wrap')
    assert.equal(estilo(['.categorias'], width)['flex-wrap'], 'wrap')
    assert.equal(estilo(['.etapas'], width)['flex-wrap'], 'wrap')
    assert.equal(estilo(['.fornFiltros'], width)['flex-wrap'], 'wrap')
    assert.equal(estilo(['.adminAbas'], width)['flex-wrap'], 'wrap')
    assert.equal(estilo(['.numero'], width).display, 'flex')
    assert.equal(estilo(['input', 'textarea'], width)['max-width'], '100%')
    assert.equal(estilo(['select'], width)['max-width'], '100%')
    assert.equal(estilo(['.adminMetrica'], width)['min-width'], '0')
    if (width <= 600) {
      assert.equal(estilo(['.acoes > button'], width).flex, '1 1 100%')
      assert.equal(estilo(['.etapas > *'], width)['flex-basis'], '100%')
    }
    assert.equal(estilo(['.resumoCategorias'], width)['grid-template-columns'], width <= 480 ? 'minmax(0, 1fr)' : width <= 850 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(5, minmax(0, 1fr))')
    if (width <= 850) assert.equal(estilo(['.acoes button'], width)['min-height'], '44px')
  })
  test(`tabelas locais e modais em ${width}px`, () => {
    assert.equal(estilo(['.tabela'], width)['overflow-x'], 'auto')
    assert.equal(estilo(['.tabela'], width)['max-width'], '100%')
    for (const s of ['.tabelaCabecalho', '.tabelaLinha']) assert.equal(estilo([s], width)['min-width'], '600px')
    for (const s of ['.adminTabelaEventos', '.fornTabela', '.adminTabelaWrap']) assert.equal(estilo([s], width)['overflow-x'], 'auto')
    for (const s of ['.adminModal', '.adminDetalhesEvento']) {
      assert.equal(estilo([s], width)['overflow-y'], 'auto')
      assert.match(estilo([s], width)['max-height'], /100dvh/)
      assert.equal(estilo([s + ' button'], width)['min-height'], '44px')
    }
    assert.equal(estilo(['.adminBarraLote'], width).position, width <= 720 ? 'static' : 'fixed')
    for (const s of ['html', 'body', '#root']) assert.equal(estilo([s], width)['overflow-x'], undefined)
  })
}
test('overlay duplicado consolidado preserva a cor que ja prevalecia', () => {
  let count = 0
  css.walkRules(r => { if (r.selector === '.adminModalOverlay' && r.parent.type === 'root') count++ })
  assert.equal(count, 1)
  assert.equal(estilo(['.adminModalOverlay'], 1366).background, 'rgba(15, 23, 42, 0.65)')
  assert.equal(estilo([':root'], 1366)['--cor-primaria'], '#3427b8')
})
test('regiao de custos possui foco de teclado e nome acessivel', () => {
  const ast = parse(readFileSync(new URL('../src/pages/organizador/Custos.jsx', import.meta.url), 'utf8'), { sourceType: 'module', plugins: ['jsx'] })
  let table
  function visit(n) {
    if (!n || typeof n !== 'object') return
    if (n.type === 'JSXOpeningElement' && n.attributes.some(a => a.name?.name === 'className' && a.value?.value === 'tabela')) table = n
    for (const v of Object.values(n)) if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v === 'object') visit(v)
  }
  visit(ast)
  assert.ok(table)
  const attr = name => table.attributes.find(a => a.name?.name === name)?.value
  assert.equal(attr('role').value, 'region')
  assert.equal(attr('aria-label').value, 'Itens de custo do evento')
  assert.equal(attr('tabIndex').expression.value, 0)
})
