import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement, Fragment, useEffect, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import { carregarAdmin, hooksAdmin, nodes, text } from './helpers/adminRuntime.js'

const env = { jsx: createElement, Fragment, useEffect, useRef, useState }
const { Marca } = carregarAdmin('components/ui/Marca.jsx', ['Marca'], env)
const { Icone } = carregarAdmin('components/ui/Icone.jsx', ['Icone'], env)
const { NavegacaoRecolhivel } = carregarAdmin('components/layout/NavegacaoRecolhivel.jsx', ['NavegacaoRecolhivel'], { ...env, Icone })
const { AdminPortal } = carregarAdmin('components/admin/AdminPortal.jsx', ['AdminPortal'], {
  ...env, Marca, Icone, NavegacaoRecolhivel,
  IdentidadeConta: () => createElement('span', { className: 'identidadeConta' }, 'Identidade sintética'),
  AdminCatalogo: () => createElement('h1', null, 'Consulta existente'),
  AdminSolicitacoes: () => createElement('h1', null, 'Solicitações existentes'),
  AdminVisaoGeral: () => createElement('h1', null, 'Visão geral'),
  AdminRelatorios: () => createElement('h1', null, 'Relatórios'),
  PerfilPessoal: () => createElement('h1', null, 'Perfil existente'),
  useConsultaAdmin: () => ({ dados: [] }),
  PainelEventoAdmin: () => createElement('h1', null, 'Painel existente'),
})
const titulos = { relatorios: 'Relatórios', inicio: 'Visão geral', contas: 'Solicitações de acesso', eventos: 'Eventos', usuarios: 'Usuários', cotacoes: 'Cotações', propostas: 'Propostas', painel: 'Painel de evento', perfil: 'Meu perfil' }

for (const [secao, titulo] of Object.entries(titulos)) test('estrutura e contexto administrativo: ' + secao, () => {
  const html = renderToStaticMarkup(createElement(AdminPortal, {
    aoSair() {}, navegacao: { estado: { secao, eventoId: null, cotacaoId: null }, mudar() {} },
  }))
  assert.match(html, /class="adminApp adminLayout(?: adminLayout--inicio)?"/)
  assert.match(html, /class="adminSidebar"/)
  assert.match(html, /aria-label="TrocaTicket"/)
  assert.ok(html.includes('id="admin-titulo-secao">' + titulo + '</p>'))
  assert.match(html, /Identidade sintética/)
  assert.match(html, /<main[^>]*id="admin-conteudo"[^>]*tabindex="-1"[^>]*aria-labelledby="admin-titulo-secao"/)
  assert.match(html, /href="#admin-conteudo"/)
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1)
  assert.equal((html.match(/<h1\b/g) || []).length, 1)
  assert.doesNotMatch(html, /Busca geral|Notificações|adminBusca|adminIcone/)
  assert.match(html, /Relatórios/)
  assert.match(html, /Novo evento \(indisponível\)/)
})

test('identidade abre perfil via navegação existente; Sair é uma ação independente', () => {
  let saidas = 0
  const nav = { estado: { secao: 'eventos' }, mudar(d) { this.estado = d } }
  const h = hooksAdmin({ Marca: 'marca', Icone: 'icone', IdentidadeConta: 'identidade', NavegacaoRecolhivel: 'menu', AdminCatalogo: 'catalogo', PerfilPessoal: 'perfil' })
  const api = carregarAdmin('components/admin/AdminPortal.jsx', ['AdminPortal', 'AdminTopo', 'AdminMenu'], h.env)
  const render = () => h.render(api.AdminPortal, { navegacao: nav, aoSair: () => saidas++ })
  const topoProps = nodes(render()).find(n => n.type === api.AdminTopo).props
  nodes(api.AdminTopo(topoProps)).find(n => n.type === 'button').props.onClick()
  assert.equal(nav.estado.secao, 'perfil')
  assert.equal(nav.estado.eventoId, null)
  assert.equal(nav.estado.cotacaoId, null)
  assert.equal(saidas, 0)
  assert.ok(nodes(render()).some(n => n.type === 'perfil'))
  const menuProps = nodes(render()).find(n => n.type === api.AdminMenu).props
  nodes(api.AdminMenu(menuProps)).find(n => n.type === 'button' && text(n).trim() === 'Sair').props.onClick()
  assert.equal(saidas, 1)
  h.close()
})

test('atalho preserva URL; foco muda somente ao trocar seção, inclusive por histórico', () => {
  let focos = 0, prevenidos = 0
  const nav = { estado: { secao: 'eventos' }, mudar(d) { this.estado = d } }
  const h = hooksAdmin({ NavegacaoRecolhivel: 'menu', AdminCatalogo: 'catalogo', PerfilPessoal: 'perfil' })
  const { AdminPortal } = carregarAdmin('components/admin/AdminPortal.jsx', ['AdminPortal'], h.env)
  const render = () => h.render(AdminPortal, { navegacao: nav })
  const v = render()
  nodes(v).find(n => n.type === 'main').props.ref.current = { focus() { focos++ } }
  render(); assert.equal(focos, 0)
  nodes(v).find(n => n.type === 'a').props.onClick({ preventDefault() { prevenidos++ } })
  assert.equal(prevenidos, 1); assert.equal(focos, 1)
  nav.estado = { secao: 'perfil' }; render(); assert.equal(focos, 2)
  render(); assert.equal(focos, 2)
  nav.estado = { secao: 'eventos' }; render(); assert.equal(focos, 3)
  // Trocar apenas o registro consultado não desloca foco de seletores/modais.
  nav.estado = { secao: 'eventos', eventoId: 23 }; render(); assert.equal(focos, 3)
  h.close()
})

const css = postcss.parse(readFileSync(new URL('../src/components/admin/AdminLayout.css', import.meta.url), 'utf8'))
function estilo(seletor, largura) {
  const valores = {}
  css.walkRules(r => {
    if (!r.selectors.includes(seletor)) return
    for (let p = r.parent; p; p = p.parent) {
      if (p.type === 'atrule' && p.name === 'media' && largura > Number(p.params.match(/max-width:\s*(\d+)px/)?.[1] ?? Infinity)) return
    }
    r.walkDecls(d => { valores[d.prop] = d.value })
  })
  return valores
}
for (const largura of [1920, 1366, 1000, 768, 390, 360]) test('regras estruturais administrativas: ' + largura + 'px', () => {
  const compacto = largura <= 1000
  assert.equal(estilo('.adminApp.adminLayout', largura)['grid-template-columns'], compacto ? 'minmax(0, 1fr)' : '264px minmax(0, 1fr)')
  assert.equal(estilo('.adminLayout .adminSidebar', largura).position, compacto ? 'static' : 'sticky')
  assert.equal(estilo('.adminLayout .adminNavegacao .alternarNavegacao', largura).display, compacto ? 'flex' : 'none')
  assert.equal(estilo(".adminLayout .adminNavegacao .painelNavegacao[data-aberto='false']", largura).display, compacto ? 'none' : 'flex')
  assert.equal(estilo('.adminLayout .adminConteudo', largura)['grid-row'], compacto ? '3' : '2')
  assert.equal(estilo('.adminLayout .adminConteudo', largura)['min-width'], '0')
  assert.equal(estilo('.adminApp.adminLayout', largura)['padding-bottom'], '0')
  assert.equal(estilo('.adminLayout .adminTopo', largura)['grid-template-columns'], largura <= 540 ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 280px)')
  assert.equal(estilo('.adminLayout .adminMenu button', largura)['min-height'], '48px')
  assert.equal(estilo('.adminLayout .adminTopo .adminUsuario', largura)['max-width'], '100%')
  assert.equal(estilo('.adminLayout .adminUsuario .identidadeConta strong', largura).display, 'block')
})
test('CSS administrativo é isolado e preserva tokens e componentes internos', () => {
  css.walkRules(r => r.selectors.forEach(s => assert.ok(s.startsWith('.adminLayout ') || s.startsWith('.adminLayout--inicio ') || s.startsWith('.adminApp.adminLayout'), s)))
  assert.doesNotMatch(css.toString(), /#[\da-f]{3,8}\b|!important/)
  css.walkDecls(/^overflow/, d => {
    if (d.value === 'hidden') assert.deepEqual(d.parent.selectors, ['.adminLayout .peaCabecalho h1', '.adminLayout .perfilCabecalho h1'])
  })
  css.walkRules(r => assert.doesNotMatch(r.selector, /\.org|\.pp|\.forn|\.admTabela|\.admModal|input|textarea/))
  assert.equal(estilo(".adminLayout .adminMenu button[aria-current='page']", 1366).color, 'var(--marca-coral-escuro)')
  assert.equal(estilo('.adminLayout .adminNavegacao button:focus-visible', 360).outline, '3px solid var(--foco-cor)')
})

test('sidebar tem o mesmo acabamento em todas as seções, conservando rolagem e alvos acessíveis', () => {
  assert.equal(estilo('.adminLayout .adminAuditoria', 1366).display, 'none')
  assert.equal(estilo('.adminLayout .adminMenu nav', 1366).gap, '4px')
  assert.equal(estilo('.adminLayout .adminMenu nav', 1366)['margin-top'], '16px')
  assert.equal(estilo('.adminLayout .adminMarcaLateral', 1366).padding, '20px 24px')
  assert.equal(estilo('.adminLayout .adminMenuRodape', 1366)['padding-top'], '16px')
  assert.doesNotMatch(css.toString(), /\.adminLayout--inicio/)
  assert.equal(estilo('.adminLayout .adminSidebar', 1366)['overflow-y'], 'auto')
  assert.equal(estilo('.adminLayout .adminSidebar', 390)['overflow-y'], 'visible')
  assert.equal(estilo('.adminLayout .adminMenu button', 1366)['min-height'], '48px')
})

for (const largura of [1920, 1366, 768, 390, 360]) test('títulos administrativos não duplicam visualmente e continuam acessíveis em ' + largura + 'px', () => {
  for (const seletor of ['.adminLayout .peaCabecalho h1', '.adminLayout .perfilCabecalho h1']) {
    const estiloTitulo = estilo(seletor, largura)
    assert.equal(estiloTitulo.position, 'absolute')
    assert.equal(estiloTitulo['clip-path'], 'inset(50%)')
    assert.equal(estiloTitulo.width, '1px')
    assert.equal(estiloTitulo.height, '1px')
    assert.notEqual(estiloTitulo.display, 'none')
    assert.notEqual(estiloTitulo.visibility, 'hidden')
  }
  assert.equal(estilo('.adminLayout .perfilCabecalho', largura)['margin-bottom'], '24px')
})

test('Painel e Perfil reais mantêm um h1, descrições e breadcrumb sem ocultar controles', () => {
  const { PainelEventoAdmin } = carregarAdmin('components/admin/PainelEventoAdmin.jsx', ['PainelEventoAdmin'], env)
  const { PerfilPessoal } = carregarAdmin('components/perfil/PerfilPessoal.jsx', ['PerfilPessoal'], {
    ...env, usePerfil: () => ({ perfil: null, erro: '' }), sessionStorage: { getItem: () => null },
    Skeleton: () => createElement('div', { role: 'status' }, 'Carregando perfil'),
  })
  const painel = renderToStaticMarkup(createElement(PainelEventoAdmin, { eventos: [], carregando: false, eventoId: null }))
  const perfil = renderToStaticMarkup(createElement(PerfilPessoal, { contexto: 'Administração' }))
  assert.equal((painel.match(/<h1\b/g) || []).length, 1)
  assert.equal((perfil.match(/<h1\b/g) || []).length, 1)
  assert.match(painel, /<h1>Painel de evento<\/h1>/)
  assert.match(perfil, /<h1>Meu perfil<\/h1>/)
  assert.match(perfil, /TrocaTicket › Administração › Meu perfil/)
  assert.match(perfil, /Consulte e atualize suas informações pessoais/)
  assert.match(painel, /Selecionar evento<select/)
  assert.doesNotMatch(painel + perfil, /aria-hidden="true"/)
})
