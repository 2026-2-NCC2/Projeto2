import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { createElement } from 'react'
import { montarRouter } from './helpers/routerDom.js'

const css = postcss.parse(readFileSync(new URL('../src/components/layout/OrganizadorVisual.css', import.meta.url), 'utf8'))
const layout = postcss.parse(readFileSync(new URL('../src/components/layout/OrganizadorLayout.css', import.meta.url), 'utf8'))
const dashboard = postcss.parse(readFileSync(new URL('../src/pages/organizador/OrganizadorDashboard.css', import.meta.url), 'utf8'))
const acabamento = postcss.parse(readFileSync(new URL('../src/pages/organizador/OrganizadorAcabamento.css', import.meta.url), 'utf8'))

function estilo(tree, selector, width) {
  const out = {}
  tree.walkRules(rule => {
    for (let p = rule.parent; p; p = p.parent) {
      const max = p.type === 'atrule' && p.params?.match(/max-width:\s*(\d+)px/)
      if (max && width > Number(max[1])) return
    }
    if (rule.selectors.includes(selector)) rule.walkDecls(d => { out[d.prop] = d.value })
  })
  return out
}
function luminancia(hex) {
  const c = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722
}
test('paleta do Organizador fica isolada e oferece contraste de texto e foco', () => {
  const tokens = estilo(css, '.orgLayout', 1366)
  assert.equal(tokens['--org-petroleo'], '#193B4D')
  for (const fundo of ['#FFFFFF', tokens['--org-petroleo-suave']]) {
    assert.ok((luminancia(fundo) + .05) / (luminancia(tokens['--org-petroleo']) + .05) >= 4.5)
  }
  css.walkRules(r => r.selectors.forEach(s => assert.ok(s.startsWith('.orgLayout'), s)))
  css.walkDecls(d => {
    assert.doesNotMatch(d.prop, /^--(?:marca-coral|acao-|desabilitado-)/)
    assert.ok(!(d.prop === 'overflow-x' && d.value === 'hidden'))
  })
  assert.equal(tokens['--foco-cor'], 'var(--org-petroleo)')
  assert.equal(estilo(layout, ".orgLayout .orgSidebar .menu button[aria-current='page']", 1366).color, 'var(--marca-coral-escuro)')
})

// Verificação estrutural de CSS; não mede geometria, zoom real ou screenshots.
for (const width of [320, 375, 390, 768, 1366]) {
  test(`Organizador conserva menu, cards e ações adaptáveis em ${width}px`, () => {
    assert.equal(estilo(layout, '.orgLayout .orgSidebar .menu button', width)['min-height'], '48px')
    assert.equal(estilo(layout, '.orgLayout .orgConteudo', width)['min-width'], '0')
    assert.equal(estilo(dashboard, '.orgDashboard .orgIndicadores', width)['grid-template-columns'], width <= 380 ? 'minmax(0, 1fr)' : width <= 1200 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))')
    assert.equal(estilo(css, '.orgLayout .orgPropostaCabecalho', width)['flex-wrap'], 'wrap')
    assert.equal(estilo(acabamento, '.orgPaginaSecundaria .ttBotao', width)['min-height'], '44px')
    if (width <= 600) {
      assert.equal(estilo(css, '.orgLayout .orgProposta .acoesProposta .ttBotao', width).flex, '1 1 100%')
      assert.equal(estilo(css, '.orgLayout .orgDashboard .orgGerenciamento .filtros input', width)['flex-basis'], '100%')
    }
    if (width <= 1000) assert.equal(estilo(layout, ".orgLayout .orgNavegacao .painelNavegacao[data-aberto='false']", width).display, 'none')
  })
}

test('propostas associam fornecedor, situação, valor e ações sem duplicar estado', async () => {
  const { Cotacao } = await import('../src/pages/organizador/Cotacao.jsx')
  const proposta = { id: 9, evento_id: 7, fornecedor_nome: 'Fornecedor sintético com nome extenso', evento_nome: 'Evento sintético', status: 'Em avaliação', valor: '1234.56', condicoes_pagamento: 'Condições sintéticas', detalhes_tecnicos: 'Serviço sintético' }
  const calls = []
  const a = await montarRouter({ dados: { token: 'sintetico' }, routes: [{ path: '*', element: createElement(Cotacao, { evento: { id: 7 }, custos: [], publicacao: {} }) }], fetch: async (url, options) => {
    calls.push([new URL(url).pathname, options])
    return { ok: true, status: 200, json: async () => new URL(url).pathname === '/contratacoes/capacidades' ? { disponivel: false } : [proposta] }
  } })
  try {
    const card = a.document.querySelector('.orgProposta')
    assert.equal(card.getAttribute('role'), 'group')
    assert.equal(a.document.getElementById(card.getAttribute('aria-labelledby')).textContent, proposta.fornecedor_nome)
    assert.equal(card.querySelectorAll('.ttBadge').length, 1)
    assert.equal(card.querySelector('.ttBadge').textContent, proposta.status)
    assert.match(card.querySelector('.orgPropostaValor').textContent, /Valor proposto:.*1\.234,56/)
    assert.match(card.textContent, /Condições sintéticas/)
    assert.match(card.textContent, /Serviço sintético/)
    const buttons = [...card.querySelectorAll('button')]
    assert.ok(buttons.some(b => b.textContent.includes('Aprovar proposta') && !b.disabled))
    assert.ok(buttons.some(b => b.textContent.includes('Recusar proposta') && !b.disabled))
    assert.equal(a.document.querySelectorAll('h1').length, 1)
    assert.equal(calls.filter(([p]) => p === '/organizador/propostas').length, 1)
    assert.ok(calls.every(([,op]) => !op.method))
  } finally { await a.close() }
})
