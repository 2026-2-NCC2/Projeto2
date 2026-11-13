import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement, Fragment, useId, useMemo, useState, useRef, useEffect } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import { carregarAdmin, hooksAdmin, nodes, text } from './helpers/adminRuntime.js'
import { primitivasFixture, jsxPrimitivas } from './helpers/primitivasFixture.js'

const env = { jsx: createElement, Fragment, useId, useMemo, useState, useRef, useEffect }
const ui = carregarAdmin('components/ui/Primitivas.jsx', ['Skeleton', 'Botao', 'Campo', 'Badge', 'Alerta', 'EstadoVazio'], env)
const { Marca } = carregarAdmin('components/ui/Marca.jsx', ['Marca'], env)
const { Icone } = carregarAdmin('components/ui/Icone.jsx', ['Icone'], env)
const { NavegacaoRecolhivel } = carregarAdmin('components/layout/NavegacaoRecolhivel.jsx', ['NavegacaoRecolhivel'], { ...env, Icone })
const { PortalFornecedor } = carregarAdmin('pages/fornecedor/PortalFornecedor.jsx', ['PortalFornecedor'], {
  ...env, ...ui, Marca, Icone, NavegacaoRecolhivel, IdentidadeConta: () => createElement('span', { className: 'identidadeConta' }, 'Identidade da sessão sintética'),
  PortfolioFornecedor: () => null, CapaEvento: () => null, MidiaEvento: () => null,
})
const render = pagina => renderToStaticMarkup(createElement(PortalFornecedor, { pagina, setPagina() {}, aoSair() {}, PerfilFornecedor: () => createElement('div', null, 'Perfil preservado') }))

test('fornecedor tem sidebar branca, marca única, cabeçalho, conta e conteúdo próprios sem importar organizador', () => {
  const html = render('fornecedor-mural')
  assert.match(html, /class="portalFornecedor fornecedorPagina fornEstrutura"/)
  assert.match(html, /<aside class="fornSidebar"/)
  assert.equal((html.match(/aria-label="TrocaTicket"/g) || []).length, 1)
  assert.match(html, /<header class="fornTopo"/)
  assert.match(html, /Identidade da sessão sintética/)
  assert.match(html, /<main class="fornConteudo"[^>]*id="fornecedor-conteudo"[^>]*tabindex="-1"[^>]*aria-labelledby="fornecedor-titulo-secao"/)
  assert.match(html, /aria-label="Seções do fornecedor"/)
  assert.match(html, /aria-label="Menu do fornecedor"/)
  assert.match(html, /href="#fornecedor-conteudo"/)
  assert.doesNotMatch(html, /Novo evento|Gestão Corporativa|EvenTum|Receita|Payouts/)
})

for (const [secao, titulo, ativo] of [
  ['mural', 'Mural de oportunidades', 'Mural de oportunidades'],
  ['enviadas', 'Propostas enviadas', 'Propostas enviadas'],
  ['cotacoes', 'Propostas enviadas', 'Propostas enviadas'],
  ['catalogo', 'Portfólio profissional', 'Portfólio profissional'],
  ['desempenho', 'Desempenho', 'Desempenho'],
  ['perfil', 'Meu perfil', 'Meu perfil'],
  ['contratos', 'Contratos ativos', 'Contratos ativos'],
  ['proposta', 'Elaborar proposta comercial', null],
]) test('cabeçalho e seção ativa preservam destino existente: ' + secao, () => {
  const html = render('fornecedor-' + secao)
  assert.ok(html.includes('id="fornecedor-titulo-secao">' + titulo + '</p>'))
  assert.equal((html.match(/aria-current="page"/g) || []).length, ativo ? 1 : 0)
  if (ativo) assert.match(html, new RegExp(`aria-current="page"[^]*?</svg>\\s*${ativo}`))
  assert.match(html, /<button(?=[^>]*disabled="")(?=[^>]*title="Funcionalidade indisponível")[^>]*>/)
})

function portal() {
  const chamadas = [], consultas = []
  const h = hooksAdmin({ ...primitivasFixture, jsx: jsxPrimitivas, Icone: 'svg', IdentidadeConta: 'identidade', NavegacaoRecolhivel: 'recolhivel',
    AbortController, sessionStorage: { getItem: () => 'token-sintético' }, apiUrl: p => p,
    fetch: url => { consultas.push(url); return new Promise(() => {}) },
  })
  const { PortalFornecedor: Portal } = carregarAdmin('pages/fornecedor/PortalFornecedor.jsx', ['PortalFornecedor'], h.env)
  const props = { pagina: 'fornecedor-mural', setPagina: p => { chamadas.push(p); return false }, aoSair: () => chamadas.push('sair') }
  return { render: () => h.render(Portal, props), chamadas, consultas, close: h.close }
}

test('atalho foca o conteúdo sem sobrescrever hash restaurável; layout não adiciona consultas', () => {
  const p = portal(), v = p.render()
  let foco = 0, impedido = 0
  nodes(v).find(n => n.type === 'main').props.ref.current = { focus: () => foco++ }
  nodes(v).find(n => n.type === 'a' && n.props.className === 'fornPular').props.onClick({ preventDefault: () => impedido++ })
  assert.equal(foco, 1); assert.equal(impedido, 1)
  assert.deepEqual(p.consultas, ['/fornecedor/cotacoes', '/fornecedor/propostas'])
  assert.deepEqual(p.chamadas, [])
  p.close()
})

test('navegação mantém callbacks exatos, destinos legados e bloqueio de contratos sem forçar guard', () => {
  const p = portal(), v = p.render()
  const menu = nodes(v).find(n => n.props.className === 'fornMenu')
  const b = label => nodes(menu).find(n => n.type === 'button' && text(n).trim() === label)
  b('Propostas enviadas').props.onClick()
  b('Portfólio profissional').props.onClick()
  b('Meu perfil').props.onClick()
  b('Sair').props.onClick()
  assert.deepEqual(p.chamadas, ['fornecedor-enviadas', 'fornecedor-catalogo', 'fornecedor-perfil', 'sair'])
  const contratos = nodes(menu).find(n => n.props.title === 'Funcionalidade indisponível')
  assert.equal(contratos.props.disabled, true); assert.equal(contratos.props.onClick, undefined)
  assert.equal(text(nodes(p.render()).find(n => n.props['aria-current'] === 'page')).trim(), 'Mural de oportunidades')
  p.close()
})

test('menu compartilhado comunica expansão, preserva Tab, fecha com Escape e devolve foco', () => {
  const p = portal(), menu = nodes(p.render()).find(n => n.props.className === 'fornMenu')
  const h = hooksAdmin({ Icone: 'svg' })
  const { NavegacaoRecolhivel: Menu } = carregarAdmin('components/layout/NavegacaoRecolhivel.jsx', ['NavegacaoRecolhivel'], h.env)
  const view = () => h.render(Menu, { id: 'menu-fornecedor', rotulo: 'Menu do fornecedor', className: 'fornNavegacao', children: menu })
  const controle = v => nodes(v).find(n => n.props['aria-controls'])
  assert.equal(controle(view()).props['aria-expanded'], false)
  controle(view()).props.onClick()
  let v = view(), foco = 0, impedido = 0
  controle(v).props.ref.current = { focus: () => foco++, getClientRects: () => [1] }
  assert.equal(controle(v).props['aria-expanded'], true)
  v.props.onKeyDown({ key: 'Tab', preventDefault: () => impedido++ })
  assert.equal(impedido, 0)
  v.props.onKeyDown({ key: 'Escape', preventDefault: () => impedido++, stopPropagation() {} })
  assert.equal(controle(view()).props['aria-expanded'], false)
  assert.equal(foco, 1); assert.equal(impedido, 1)
  controle(view()).props.onClick(); v = view()
  nodes(v).find(n => n.props.id === 'menu-fornecedor').props.onClick({ target: { closest: () => true } })
  assert.equal(controle(view()).props['aria-expanded'], false)
  p.close(); h.close()
})

const css = postcss.parse(readFileSync(new URL('../src/pages/fornecedor/FornecedorLayout.css', import.meta.url), 'utf8'))
function estilo(seletor, largura) {
  const resultado = {}
  css.walkRules(r => {
    if (!r.selectors.includes(seletor)) return
    let pai = r.parent
    while (pai) {
      if (pai.type === 'atrule' && pai.name === 'media' && largura > Number(pai.params.match(/max-width:\s*(\d+)px/)[1])) return
      pai = pai.parent
    }
    r.walkDecls(d => { resultado[d.prop] = d.value })
  })
  return resultado
}
for (const largura of [360, 390, 768, 1024, 1440, 320, 375]) test(`estrutura fornecedor: reflow em ${largura}px`, () => {
  assert.equal(estilo('.fornEstrutura', largura)['grid-template-columns'], largura <= 1000 ? 'minmax(0, 1fr)' : '264px minmax(0, 1fr)')
  assert.equal(estilo('.fornEstrutura .fornNavegacao .alternarNavegacao', largura).display, largura <= 1000 ? 'flex' : 'none')
  assert.equal(estilo(".fornEstrutura .fornNavegacao .painelNavegacao[data-aberto='false']", largura).display, largura <= 1000 ? 'none' : 'flex')
  assert.equal(estilo('.fornEstrutura .fornSidebar', largura).position, largura <= 1000 ? 'static' : 'sticky')
  assert.equal(estilo('.fornEstrutura .fornEmpresa', largura).display, 'block')
  assert.equal(estilo('.fornEstrutura .fornConteudo', largura)['min-width'], '0')
  assert.equal(estilo('.fornEstrutura .fornSidebar .fornMenu button', largura)['min-height'], '48px')
})

test('CSS restringe mudanças à estrutura, usa tokens e mantém foco e conteúdos internos', () => {
  css.walkRules(r => r.selectors.forEach(s => assert.ok(s.startsWith('.fornEstrutura'), s)))
  assert.doesNotMatch(css.toString(), /#[\da-f]{3,8}\b|url\(|animation:|transition:|overflow(?:-x)?:\s*hidden|\.org|\.pp|\.admin|\.fornCartao|\.fornTabela|\.fornForm|\.fornIndicadores/)
  assert.equal(estilo('.fornEstrutura .fornConteudo:focus', 360).outline, '3px solid var(--foco-cor)')
  const source = readFileSync(new URL('../src/pages/fornecedor/PortalFornecedor.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /OrganizadorLayout|components\/layout\/Layout|history\.|pushState|replaceState/)
})
