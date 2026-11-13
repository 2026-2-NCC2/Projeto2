import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement, Fragment, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import { carregarAdmin, hooksAdmin, nodes, text } from './helpers/adminRuntime.js'

const env = { jsx: createElement, Fragment, useRef, useState }
const { Marca } = carregarAdmin('components/ui/Marca.jsx', ['Marca'], env)
const { Icone } = carregarAdmin('components/ui/Icone.jsx', ['Icone'], env)
const { Menu } = carregarAdmin('components/layout/Menu.jsx', ['Menu'], { ...env, Marca, Icone })
const { NavegacaoRecolhivel } = carregarAdmin('components/layout/NavegacaoRecolhivel.jsx', ['NavegacaoRecolhivel'], { ...env, Icone })
const IdentidadeConta = () => createElement('span', { className: 'identidadeConta' }, 'Identidade sintética')
const { Layout } = carregarAdmin('components/layout/Layout.jsx', ['Layout'], { ...env, Marca, Menu, NavegacaoRecolhivel, IdentidadeConta })
const render = pagina => renderToStaticMarkup(createElement(Layout, { pagina, setPagina() {}, aoCriarNovoEvento() {}, aoSair() {} },
  createElement('section', null, createElement('h1', null, 'Conteúdo preservado'))))

test('organizador tem sidebar, marca, cabeçalho, identidade e um único conteúdo sem inventar funções', () => {
  const html = render('eventos')
  assert.match(html, /class="orgLayout"/)
  assert.match(html, /class="orgSidebar"/)
  assert.match(html, /class="orgMarca"/)
  assert.match(html, /aria-label="TrocaTicket"/)
  assert.match(html, /<header class="orgCabecalho"/)
  assert.match(html, /Identidade sintética/)
  assert.match(html, /<main class="orgConteudo"[^>]*id="org-conteudo"[^>]*tabindex="-1"[^>]*aria-labelledby="org-titulo-secao"/)
  assert.equal((html.match(/<h1\b/g) || []).length, 1)
  assert.match(html, /<h1>Conteúdo preservado<\/h1>/)
  assert.doesNotMatch(html, /EvenTum|Financeiro|Pagamentos|Assinaturas|Notificações|Configurações|Vendas/)
  assert.match(html, /href="#org-conteudo"/)
})

for (const [pagina, titulo] of Object.entries({ eventos: 'Meus eventos', criar: 'Criar evento', custos: 'Custos',
  cotacao: 'Cotações e concorrência', ticket: 'Propostas e ticket', perfil: 'Meu perfil' })) {
  test('cabeçalho e menu mantêm contexto e item ativo: ' + pagina, () => {
    const html = render(pagina)
    assert.ok(html.includes('id="org-titulo-secao">' + titulo + '</p>'))
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1)
    assert.match(html, /aria-label="Seções do organizador"/)
    assert.match(html, /aria-label="Menu do organizador"/)
  })
}

test('layout repassa filhos e callbacks exatos ao menu, sem redirecionar ou alterar contratos', () => {
  const { Layout: Estrutura } = carregarAdmin('components/layout/Layout.jsx', ['Layout'], {
    Marca: 'marca', Menu: 'menu-original', NavegacaoRecolhivel: 'recolhivel', IdentidadeConta: 'identidade', useRef: () => ({ current: null }),
  })
  const filho = { type: 'formulario-existente', props: { chave: 'intacta' }, children: [] }
  const props = { pagina: 'custos', setPagina() {}, aoCriarNovoEvento() {}, aoSair() {}, children: filho }
  const view = Estrutura(props), menu = nodes(view).find(n => n.type === 'menu-original')
  for (const nome of ['pagina', 'setPagina', 'aoCriarNovoEvento', 'aoSair']) assert.equal(menu.props[nome], props[nome])
  assert.equal(nodes(view).find(n => n.type === 'main').children[0], filho)
  assert.equal(nodes(view).filter(n => n.type === 'identidade').length, 1)
})

test('atalho de conteúdo move foco sem substituir o fragmento da URL restaurável', () => {
  let focado = 0, impedido = 0
  const { Layout: Estrutura } = carregarAdmin('components/layout/Layout.jsx', ['Layout'], {
    Marca: 'marca', Menu: 'menu', NavegacaoRecolhivel: 'recolhivel', IdentidadeConta: 'identidade',
    useRef: () => ({ current: { focus: () => focado++ } }),
  })
  const v = Estrutura({ pagina: 'custos' })
  const atalho = nodes(v).find(n => n.type === 'a')
  atalho.props.onClick({ preventDefault: () => impedido++ })
  assert.equal(impedido, 1); assert.equal(focado, 1)
  assert.equal(nodes(v).find(n => n.type === 'main').props.tabIndex, -1)
})

function menuInterativo() {
  const acoes = [], h = hooksAdmin({ Icone: 'svg' })
  const { Menu: MenuReal } = carregarAdmin('components/layout/Menu.jsx', ['Menu'], h.env)
  const { NavegacaoRecolhivel: Recolhivel } = carregarAdmin('components/layout/NavegacaoRecolhivel.jsx', ['NavegacaoRecolhivel'], h.env)
  const conteudo = MenuReal({ pagina: 'eventos', setPagina: p => { acoes.push(p); return false }, aoCriarNovoEvento: () => acoes.push('novo'), aoSair: () => acoes.push('sair') })
  let foco = 0
  const render = () => {
    const v = h.render(Recolhivel, { id: 'menu-organizador', rotulo: 'Menu do organizador', className: 'orgNavegacao', children: conteudo })
    nodes(v).find(n => n.props['aria-controls']).props.ref.current = { getClientRects: () => [1], focus: () => foco++ }
    return v
  }
  return { render, acoes, foco: () => foco, close: h.close }
}

test('menu real alterna por botão nativo, comunica estado, fecha com Escape e retorna foco', () => {
  const m = menuInterativo()
  const controle = v => nodes(v).find(n => n.props['aria-controls'])
  assert.equal(controle(m.render()).props.type, 'button')
  assert.equal(controle(m.render()).props['aria-expanded'], false)
  controle(m.render()).props.onClick()
  let v = m.render()
  assert.equal(controle(v).props['aria-expanded'], true)
  assert.equal(nodes(v).find(n => n.props.id === controle(v).props['aria-controls']).props['data-aberto'], true)
  let impedidos = 0
  for (const key of ['Tab', 'Enter', ' ']) v.props.onKeyDown({ key, preventDefault() { impedidos++ }, stopPropagation() {} })
  assert.equal(impedidos, 0)
  v.props.onKeyDown({ key: 'Escape', preventDefault() { impedidos++ }, stopPropagation() {} })
  v = m.render()
  assert.equal(controle(v).props['aria-expanded'], false); assert.equal(m.foco(), 1)
  assert.equal(impedidos, 1); m.close()
})

test('seleção chama o guard original uma vez; cancelar não troca item ativo ou força navegação', () => {
  const m = menuInterativo()
  nodes(m.render()).find(n => n.props['aria-controls']).props.onClick()
  const v = m.render(), botao = nodes(v).find(n => n.type === 'button' && text(n).trim() === 'Custos')
  botao.props.onClick()
  nodes(v).find(n => n.props.id === 'menu-organizador').props.onClick({ target: { closest: () => true } })
  const novo = m.render()
  assert.deepEqual(m.acoes, ['custos'])
  assert.equal(text(nodes(novo).find(n => n.props['aria-current'] === 'page')).trim(), 'Meus eventos')
  assert.equal(nodes(novo).find(n => n.props['aria-controls']).props['aria-expanded'], false)
  assert.equal(m.foco(), 1); m.close()
})

const css = postcss.parse(readFileSync(new URL('../src/components/layout/OrganizadorLayout.css', import.meta.url), 'utf8'))
function estilo(seletor, largura) {
  const valor = {}
  css.walkRules(r => {
    if (!r.selectors.includes(seletor)) return
    let p = r.parent
    while (p) {
      if (p.type === 'atrule' && p.name === 'media') {
        const max = p.params.match(/max-width:\s*(\d+)px/)
        if (!max || largura > Number(max[1])) return
      }
      p = p.parent
    }
    r.walkDecls(d => { valor[d.prop] = d.value })
  })
  return valor
}

for (const largura of [360, 390, 768, 1024, 1440, 720, 320, 375]) test('estrutura do organizador: regras responsivas em ' + largura + 'px', () => {
  const recolhido = largura <= 1000
  assert.equal(estilo('.orgLayout', largura)['grid-template-columns'], recolhido ? 'minmax(0, 1fr)' : '264px minmax(0, 1fr)')
  assert.equal(estilo('.orgLayout .orgNavegacao .alternarNavegacao', largura).display, recolhido ? 'flex' : 'none')
  assert.equal(estilo(".orgLayout .orgNavegacao .painelNavegacao[data-aberto='false']", largura).display, recolhido ? 'none' : 'flex')
  assert.equal(estilo('.orgLayout .orgSidebar', largura).position, recolhido ? 'static' : 'sticky')
  assert.equal(estilo('.orgLayout .orgConteudo', largura)['grid-row'], recolhido ? '3' : '2')
  assert.equal(estilo('.orgLayout .orgConteudo', largura)['min-width'], '0')
  assert.equal(estilo('.orgLayout .orgSidebar .menu button', largura)['min-height'], '48px')
  assert.equal(estilo('.orgLayout .orgCabecalho', largura)['grid-template-columns'], largura <= 540 ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 260px)')
})

test('CSS é exclusivo, usa tokens e não redesenha cards, tabelas, formulários ou outros portais', () => {
  css.walkRules(r => r.selectors.forEach(s => assert.ok(s.startsWith('.orgLayout'), s)))
  assert.doesNotMatch(css.toString(), /#[\da-f]{3,8}\b|url\(|animation:|transition:|overflow(?:-x)?:\s*hidden/)
  css.walkRules(r => assert.doesNotMatch(r.selector, /\.pp|\.admin|\.forn|input|textarea|select|\.cartao|\.tabela/))
  assert.equal(estilo('.orgLayout .orgSidebar .menu button[aria-current=\'page\']', 1440).color, 'var(--marca-coral-escuro)')
  assert.equal(estilo('.orgLayout .orgNavegacao button:focus-visible', 360).outline, '3px solid var(--foco-cor)')
  assert.equal(estilo('.orgLayout .orgSidebar', 320)['grid-template-columns'], 'minmax(0, 1fr)')
  assert.equal(estilo('.orgLayout .orgNavegacao .alternarNavegacao', 320)['grid-row'], '2')
})
