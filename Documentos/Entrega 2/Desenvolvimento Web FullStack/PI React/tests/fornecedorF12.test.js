import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { montarRouter, apiSintetica } from './helpers/routerDom.js'

const css = postcss.parse(readFileSync(new URL('../src/pages/fornecedor/FornecedorVisual.css', import.meta.url), 'utf8'))
const layout = postcss.parse(readFileSync(new URL('../src/pages/fornecedor/FornecedorLayout.css', import.meta.url), 'utf8'))
const base = postcss.parse(readFileSync(new URL('../src/pages/fornecedor/Fornecedor.css', import.meta.url), 'utf8'))
function estilo(tree, selector, width) {
  const out = {}
  tree.walkRules(r => {
    for (let p = r.parent; p; p = p.parent) {
      const max = p.type === 'atrule' && p.params?.match(/max-width:\s*(\d+)px/)
      if (max && width > Number(max[1])) return
    }
    if (r.selectors.includes(selector)) r.walkDecls(d => { out[d.prop] = d.value })
  })
  return out
}
function luminancia(hex) {
  const c = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722
}
test('F12 isola a paleta e preserva Coral ativo, foco e controles desabilitados', () => {
  const tokens = estilo(css, '.fornEstrutura', 1366)
  assert.equal(tokens['--forn-petroleo'], '#193B4D')
  assert.equal(tokens['--foco-cor'], 'var(--forn-petroleo)')
  for (const fundo of ['#FFFFFF', tokens['--forn-petroleo-suave']]) assert.ok((luminancia(fundo) + .05) / (luminancia(tokens['--forn-petroleo']) + .05) >= 4.5)
  css.walkRules(r => r.selectors.forEach(s => assert.ok(s.startsWith('.fornEstrutura'), s)))
  css.walkDecls(d => {
    assert.doesNotMatch(d.prop, /^--(?:marca-coral|acao-)/)
    assert.ok(!(d.prop === 'overflow-x' && d.value === 'hidden'))
  })
  assert.equal(estilo(layout, ".fornEstrutura .fornSidebar .fornMenu nav button[aria-current='page']:enabled", 1366).color, 'var(--marca-coral-escuro)')
  assert.equal(estilo(css, '.fornEstrutura .fornSidebar .fornMenu button:disabled', 1366).color, 'var(--desabilitado-texto)')
})
// Estrutura de CSS; não substitui uma inspeção de geometria ou zoom em navegador.
for (const width of [320, 375, 390, 768, 1366]) {
  test(`Fornecedor mantém menu, cards, tabelas e botões adaptáveis em ${width}px`, () => {
    assert.equal(estilo(layout, '.fornEstrutura .fornConteudo', width)['min-width'], '0')
    assert.equal(estilo(layout, '.fornEstrutura .fornSidebar .fornMenu button', width)['min-height'], '48px')
    assert.equal(estilo(css, '.fornEstrutura .fornSelo', width)['white-space'], 'normal')
    assert.equal(estilo(base, '.fornecedorPagina .fornTabela', width)['overflow-x'], 'auto')
    assert.equal(estilo(css, '.fornEstrutura .fornTabelaLinha > *', width)['overflow-wrap'], 'anywhere')
    if (width <= 1200) assert.equal(estilo(css, '.fornEstrutura .fornLista', width)['grid-template-columns'], 'minmax(0, 1fr)')
    if (width <= 1000) assert.equal(estilo(layout, ".fornEstrutura .fornNavegacao .painelNavegacao[data-aberto='false']", width).display, 'none')
    if (width <= 600) assert.equal(estilo(css, '.fornEstrutura .fornForm .acoes .ttBotao', width).flex, '1 1 100%')
  })
}
test('cotações e propostas conservam dados, URL, histórico e contratos bloqueados', async () => {
  const api = apiSintetica('fornecedor'), calls = []
  const a = await montarRouter({ url: '/#/fornecedor-mural', dados: { token: 'sintetico', perfil: 'fornecedor' }, fetch: async (url, options) => {
    const path = new URL(url).pathname
    calls.push([path, options])
    if (path === '/fornecedor/cotacoes') return { ok: true, status: 200, json: async () => [{ id: 8, evento_id: 7, evento_nome: 'Evento sintético com nome extenso', evento_local: 'Local sintético', prazo: '2030-12-10', status: 'Aberta', itens: [{ categoria: 'Áudio' }] }] }
    if (path === '/fornecedor/propostas') return { ok: true, status: 200, json: async () => [{ id: 9, evento_nome: 'Evento sintético com nome extenso', categoria: 'Áudio', valor: '1234.56', status: 'Em avaliação' }] }
    return api(url, options)
  } })
  const button = text => [...a.document.querySelectorAll('button')].find(b => b.textContent.trim() === text)
  try {
    const card = a.document.querySelector('.fornLista article')
    assert.equal(a.document.getElementById(card.getAttribute('aria-labelledby')).textContent.trim(), 'Evento sintético com nome extenso')
    assert.equal(card.querySelector('time').dateTime, '2030-12-10')
    assert.equal(card.querySelector('time').textContent, '10/12/2030')
    assert.ok(card.querySelector('button').getAttribute('aria-label').includes('cotação #8'))
    assert.equal(button('Contratos ativos (indisponível)').disabled, true)
    await a.clicar(button('Propostas enviadas'))
    assert.equal(a.window.location.hash, '#/fornecedor-enviadas')
    const filtros = a.document.querySelector('.fornFiltros')
    assert.equal(filtros.getAttribute('role'), 'group')
    assert.equal(filtros.getAttribute('aria-label'), 'Filtrar propostas por situação')
    assert.match(a.document.querySelector('.fornValorProposto').textContent, /1\.234,56/)
    assert.equal(a.document.querySelectorAll('h1').length, 1)
    await a.back()
    assert.equal(a.window.location.hash, '#/fornecedor-mural')
    assert.ok(a.document.querySelector('.fornLista article'))
    assert.ok(button('Meu perfil'))
    assert.ok(calls.every(([, options]) => !options.method || options.method === 'GET'))
  } finally { await a.close() }
})
