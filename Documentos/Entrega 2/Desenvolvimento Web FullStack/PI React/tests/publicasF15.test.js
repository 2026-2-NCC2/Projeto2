import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { act } from 'react'
import { montarRouter } from './helpers/routerDom.js'

const ler = path => postcss.parse(readFileSync(new URL(`../src/${path}.css`, import.meta.url), 'utf8'))
const identidade = ler('pages/publicas/IdentidadePublica'), landing = ler('pages/publicas/LandingPage')
const login = ler('pages/auth/Autenticacao'), status = ler('pages/publicas/PaginaNaoEncontrada')
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
test('tokens públicos são restritos e o texto nos painéis petróleo tem contraste AA', () => {
  const roots = ['.lpPagina', '.loginPagina', '.ttPaginaStatus', '.transparenciaPagina', '.entradaPublica']
  identidade.walkRules(r => r.selectors.forEach(s => assert.ok(roots.includes(s))))
  const tokens = estilo(identidade, '.loginPagina', 1366)
  assert.equal(tokens['--publico-petroleo'], '#193B4D')
  for (const claro of ['#FFFFFF', tokens['--publico-petroleo-suave']]) assert.ok((luminancia(claro) + .05) / (luminancia(tokens['--publico-petroleo']) + .05) >= 4.5)
  identidade.walkDecls(d => assert.doesNotMatch(d.prop, /^--(?:marca-coral|acao-|estado-|desabilitado-)/))
  assert.equal(estilo(login, '.loginPagina .loginApresentacao h2', 1366).color, 'var(--superficie-cartao)')
  assert.equal(estilo(login, '.loginPagina .loginApresentacao > p', 1366).color, 'var(--superficie-cartao)')
  assert.equal(estilo(landing, '.lpPagina .lpLinkDestaque', 1366).background, 'var(--acao-primaria-fundo)')
})
// Estrutura de refluxo CSS; não equivale a inspecionar zoom ou geometria reais.
for (const width of [320, 375, 768, 900, 1366]) {
  test(`entrada pública mantém grade, campos e ações adaptáveis em ${width}px`, () => {
    assert.equal(estilo(landing, '.lpPagina .lpPerfis', width)['grid-template-columns'], width <= 800 ? 'minmax(0, 1fr)' : width <= 1000 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))')
    assert.equal(estilo(login, '.loginPagina .loginEstrutura', width)['grid-template-columns'], width <= 900 ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 500px)')
    assert.equal(estilo(login, '.loginPagina .loginPerfis button', width)['min-height'], '44px')
    assert.equal(estilo(status, '.ttPaginaStatus nav', width)['flex-wrap'], 'wrap')
    assert.equal(estilo(status, '.ttPaginaStatus a', width)['min-height'], '44px')
    if (width <= 540) assert.equal(estilo(status, '.ttPaginaStatus nav a', width).width, '100%')
  })
}
test('entrada apresenta quatro perfis, mantém Login, erro focado, senha e 404 real', async () => {
  const calls = []
  const a = await montarRouter({ fetch: async (url, options) => {
    calls.push([new URL(url).pathname, options])
    assert.equal(new URL(url).pathname, '/login')
    return { ok: false, status: 401, json: async () => ({ erro: 'Dados de acesso sintéticos inválidos.' }) }
  } })
  const button = text => [...a.document.querySelectorAll('button')].find(b => b.textContent.trim() === text)
  try {
    assert.deepEqual([...a.document.querySelectorAll('.lpCard h3')].map(n => n.textContent), ['Participante', 'Organizador', 'Fornecedor', 'Administrador'])
    assert.match(a.document.body.textContent, /Acesso restrito às contas autorizadas/)
    assert.equal(calls.length, 0)
    await a.clicar(button('Entrar no TrocaTicket'))
    assert.equal(a.window.location.hash, '#/entrar')
    assert.equal(a.document.activeElement.id, 'login-email')
    await act(async () => {
      for (const [id, value] of [['login-email', 'pessoa@example.invalid'], ['login-senha', 'senha-sintetica']]) {
        const input = a.document.getElementById(id)
        Object.getOwnPropertyDescriptor(a.window.HTMLInputElement.prototype, 'value').set.call(input, value)
        input.dispatchEvent(new a.window.Event('input', { bubbles: true }))
      }
    })
    await a.clicar(button('Mostrar senha'))
    assert.equal(a.document.getElementById('login-senha').type, 'text')
    await a.clicar(button('Ocultar senha'))
    assert.equal(a.document.getElementById('login-senha').type, 'password')
    await act(async () => { a.document.querySelector('.caixaLogin form').dispatchEvent(new a.window.Event('submit', { bubbles: true, cancelable: true })) })
    await a.settle()
    assert.equal(a.document.activeElement.id, 'login-feedback')
    assert.match(a.document.getElementById('login-feedback').textContent, /Dados de acesso sintéticos inválidos/)
    assert.equal(a.document.getElementById('login-email').value, 'pessoa@example.invalid')
    assert.equal(calls.length, 1)
    assert.equal(calls[0][1].method, 'POST')
    await a.navegar('/endereco-inexistente-f15')
    assert.match(a.document.querySelector('h1').textContent, /Página não encontrada/)
    assert.equal(a.document.activeElement.id, 'pagina-status-titulo')
    assert.equal(a.document.querySelectorAll('h1').length, 1)
    assert.doesNotMatch(a.document.body.textContent, /pessoa@example.invalid/)
  } finally { await a.close() }
})
