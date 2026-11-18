import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { montarRouter, apiSintetica } from './helpers/routerDom.js'

const ler = nome => postcss.parse(readFileSync(new URL(`../src/components/admin/${nome}.css`, import.meta.url), 'utf8'))
const css = ler('AdminVisual'), layout = ler('AdminLayout'), paginas = ler('AdminPaginas'), relatorios = ler('AdminRelatorios')
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
test('F14 isola paleta, preserva Coral ativo e mantém os tons semânticos', () => {
  const tokens = estilo(css, '.adminLayout', 1366)
  assert.equal(tokens['--admin-petroleo'], '#193B4D')
  assert.equal(tokens['--foco-cor'], 'var(--admin-petroleo)')
  for (const fundo of ['#FFFFFF', tokens['--admin-petroleo-suave']]) assert.ok((luminancia(fundo) + .05) / (luminancia(tokens['--admin-petroleo']) + .05) >= 4.5)
  css.walkRules(r => r.selectors.forEach(s => assert.ok(s.startsWith('.adminLayout'), s)))
  css.walkDecls(d => {
    assert.doesNotMatch(d.prop, /^--(?:marca-coral|acao-|estado-|desabilitado-)/)
    assert.ok(!(d.prop === 'overflow-x' && d.value === 'hidden'))
  })
  assert.equal(estilo(layout, ".adminLayout .adminMenu button[aria-current='page']", 1366).color, 'var(--marca-coral-escuro)')
  assert.equal(estilo(layout, '.adminLayout .adminMenu button:disabled', 1366).color, 'var(--desabilitado-texto)')
  assert.equal(estilo(css, '.adminLayout .peaMetricas article:not(.peaAlerta)', 1366).background, 'var(--admin-petroleo-suave)')
})
// Verificação de estrutura e refluxo CSS, sem afirmar geometria ou zoom reais.
for (const width of [320, 375, 390, 768, 1366]) {
  test(`Admin mantém menu, rolagem de tabelas e modais acessíveis em ${width}px`, () => {
    assert.equal(estilo(layout, '.adminLayout .adminConteudo', width)['min-width'], '0')
    assert.equal(estilo(layout, '.adminLayout .adminMenu button', width)['min-height'], '48px')
    assert.equal(estilo(paginas, '.admTabela', width).overflow, 'auto')
    assert.equal(estilo(css, '.adminLayout .admTabela', width)['max-width'], '100%')
    assert.equal(estilo(paginas, '.admModal>header', width).position, 'sticky')
    assert.equal(estilo(css, '.adminLayout .admModal .admDados dd', width)['overflow-wrap'], 'anywhere')
    if (width <= 1000) assert.equal(estilo(layout, ".adminLayout .adminNavegacao .painelNavegacao[data-aberto='false']", width).display, 'none')
    if (width <= 540) {
      assert.equal(estilo(css, '.adminLayout .admModal > header > button', width).width, '100%')
      assert.equal(estilo(relatorios, '.admRelatorios .admFiltros', width)['grid-template-columns'], 'minmax(0, 1fr)')
    }
  })
}
test('dashboard, detalhes e bloqueios administrativos persistem com navegação real', async () => {
  const api = apiSintetica('admin'), calls = []
  const a = await montarRouter({ url: '/#/admin?secao=inicio', dados: { token: 'sintetico', perfil: 'admin' }, fetch: async (url, options) => {
    const path = new URL(url).pathname
    calls.push([path, options])
    const dados = path === '/usuarios' ? [{ id: 8, nome: 'Usuário sintético com nome extenso', email: 'sintetico@example.invalid', perfil: 'organizador' }]
      : path === '/admin/eventos' ? [{ id: 7, nome: 'Evento sintético', status: 'Ativo' }]
        : path === '/solicitacoes-acesso' ? [{ id: 1, status: 'pendente', perfil_solicitado: 'fornecedor' }] : null
    return dados ? { ok: true, status: 200, json: async () => dados } : api(url, options)
  } })
  const button = text => [...a.document.querySelectorAll('button')].find(b => b.textContent.trim() === text)
  try {
    assert.deepEqual([...a.document.querySelectorAll('.admResumoValor')].map(n => n.textContent), ['1', '1', '1'])
    assert.equal(a.document.querySelector('.adminNovo').disabled, true)
    await a.clicar(button('Consultar usuarios'))
    assert.equal(a.window.location.hash, '#/admin?secao=usuarios')
    const visualizar = a.document.querySelector('button[aria-label="Visualizar usuário Usuário sintético com nome extenso, ID 8"]')
    // JSDOM não calcula geometria; habilita apenas o retorno de foco do modal.
    visualizar.getClientRects = () => [{ width: 100, height: 44 }]
    await a.clicar(visualizar)
    let modal = a.document.querySelector('[role="dialog"]')
    assert.match(modal.textContent, /sintetico@example.invalid/)
    await a.clicar(modal.querySelector('header button'))
    assert.equal(a.document.querySelector('[role="dialog"]'), null)
    assert.equal(a.document.activeElement === visualizar, true)
    await a.clicar(a.document.querySelector('button[aria-label="Gerenciar perfis de Usuário sintético com nome extenso, ID 8"]'))
    modal = a.document.querySelector('[role="dialog"]')
    assert.match(modal.textContent, /gerenciamento de perfis ainda não está disponível/)
    assert.equal(modal.querySelector('form'), null)
    await a.clicar(modal.querySelector('header button'))
    await a.back()
    assert.equal(a.window.location.hash, '#/admin?secao=inicio')
    assert.equal(a.document.querySelectorAll('h1').length, 1)
    assert.ok(calls.every(([, options]) => !options.method || options.method === 'GET'))
  } finally { await a.close() }
})
