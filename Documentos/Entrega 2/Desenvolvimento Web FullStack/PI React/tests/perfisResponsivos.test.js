import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { parse } from '@babel/parser'

const css = postcss.parse(readFileSync(new URL('../src/App.css', import.meta.url), 'utf8'))
// Regressao das regras por largura; nao equivale a screenshots ou geometria DOM.
function estilo(selector, width) {
  const out = {}
  css.walkRules(rule => {
    if (!rule.selector.split(',').map(x => x.trim()).includes(selector)) return
    for (let p = rule.parent; p; p = p.parent) {
      if (p.type === 'atrule' && p.name === 'media') {
        const limit = p.params.match(/max-width:\s*(\d+)px/)
        if (limit && width > Number(limit[1])) return
      }
    }
    rule.walkDecls(d => { out[d.prop] = d.value })
  })
  return out
}
for (const width of [1920, 1366, 768, 390, 360]) test(`perfis e textos longos: ${width}px`, () => {
  assert.equal(estilo('.fornTopo', width).height, 'auto')
  assert.equal(estilo('.fornTopo', width)['min-height'], '66px')
  assert.equal(estilo('.fornEmpresa', width)['overflow-wrap'], 'anywhere')
  assert.equal(estilo('.fornHero', width)['overflow-wrap'], 'anywhere')
  assert.equal(estilo('.fornHero', width)['flex-wrap'], 'wrap')
  assert.equal(estilo('.perfilEmpresaDados>div', width)['min-width'], '0')
  assert.equal(estilo('.perfilEmpresaDados>div', width)['overflow-wrap'], 'anywhere')
  assert.equal(estilo('.perfilSegurancaItem>div', width)['min-width'], '0')
  assert.equal(estilo('.perfilPreferencia>span', width)['min-width'], '0')
  assert.equal(estilo('.perfilPreferencia input', width).flex, '0 0 36px')
  if (width <= 600) {
    assert.equal(estilo('.fornTopo .logo small', width)['flex-basis'], '100%')
    assert.equal(estilo('.fornMenu nav', width)['grid-template-columns'], 'repeat(2, minmax(0, 1fr))')
    assert.match(estilo('.caixaLogin', width).width, /calc\(100% - 36px\)/)
  } else assert.equal(estilo('.caixaLogin', width).width, '410px')
  if (width <= 850) assert.equal(estilo('.fornMenu button', width)['min-height'], '44px')
  for (const region of ['.adminTabelaEventos', '.adminTabelaWrap', '.fornTabela']) assert.equal(estilo(region, width)['overflow-x'], 'auto')
  for (const root of ['html', 'body', '#root']) assert.equal(estilo(root, width)['overflow-x'], undefined)
})
function regions(file) {
  const ast = parse(readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'), { sourceType: 'module', plugins: ['jsx'] }), found = []
  function visit(n) {
    if (!n || typeof n !== 'object') return
    if (n.type === 'JSXOpeningElement') {
      const attrs = Object.fromEntries(n.attributes.filter(a => a.type === 'JSXAttribute').map(a => [a.name.name, a.value?.type === 'JSXExpressionContainer' ? a.value.expression.value : a.value?.value]))
      if (['adminTabelaEventos', 'adminTabelaWrap', 'fornTabela'].includes(attrs.className)) found.push(attrs)
    }
    for (const value of Object.values(n)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value)
  }
  visit(ast)
  return found
}
test('tabelas dos fornecedores e das cinco listagens administrativas possuem acesso por teclado', () => {
  const admin = regions('components/admin/AdminPortal.jsx'), supplier = regions('pages/fornecedor/PortalFornecedor.jsx')
  assert.equal(admin.length, 5)
  assert.equal(supplier.length, 1)
  for (const r of [...admin, ...supplier]) {
    assert.equal(r.tabIndex, 0)
    assert.equal(r.role, 'region')
    assert.ok(r['aria-label'].length > 5)
  }
  assert.equal(new Set(admin.map(r => r['aria-label'])).size, 5)
})
