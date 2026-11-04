import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { transformSync } from 'rolldown/utils'
import postcss from 'postcss'

const jsx = (type, props, ...children) => ({ type, props: props || {}, children: children.flat() })
function carregar(file, nomes, hooks = {}) {
  const source = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/gm, '').replaceAll('export function ', 'function ')
  const result = transformSync(file, source, { jsx: { runtime: 'classic', pragma: 'jsx', pragmaFrag: 'Fragment' } })
  assert.equal(result.errors.length, 0)
  return vm.runInNewContext(result.code + '\n({' + nomes.join(',') + '})', { jsx, Fragment: 'fragment', Icone: 'svg', IdentidadeConta: () => null, ...hooks })
}
function disclosure() {
  let open = false, focused = 0
  const ref = { current: { getClientRects: () => [1], focus: () => focused++ } }
  const { NavegacaoRecolhivel } = carregar('components/layout/NavegacaoRecolhivel.jsx', ['NavegacaoRecolhivel'], {
    useState: () => [open, next => { open = typeof next === 'function' ? next(open) : next }], useRef: () => ref,
  })
  return { render: () => NavegacaoRecolhivel({ id: 'nav-teste', rotulo: 'Menu de teste', children: 'conteudo' }), focused: () => focused }
}
test('menu nativo associa controle e painel e alterna abertura sem duplicar conteudo', () => {
  const f = disclosure(), view = f.render(), [button, panel] = view.children
  assert.equal(button.type, 'button'); assert.equal(button.props.type, 'button')
  assert.equal(button.props['aria-controls'], panel.props.id)
  assert.equal(button.props['aria-expanded'], false)
  button.props.onClick(); assert.equal(f.render().children[0].props['aria-expanded'], true)
  f.render().children[0].props.onClick(); assert.equal(f.render().children[1].props['data-aberto'], false)
})
test('Escape fecha menu e retorna foco ao acionador visivel', () => {
  const f = disclosure(); f.render().children[0].props.onClick()
  let prevented = false
  f.render().props.onKeyDown({ key: 'Escape', preventDefault: () => { prevented = true }, stopPropagation() {} })
  assert.equal(f.render().children[0].props['aria-expanded'], false)
  assert.equal(f.focused(), 1); assert.equal(prevented, true)
})
test('selecao fecha menu; clique no fundo e outras teclas nao fecham', () => {
  const f = disclosure(); f.render().children[0].props.onClick()
  f.render().children[1].props.onClick({ target: { closest: () => null } })
  f.render().props.onKeyDown({ key: 'Tab' })
  assert.equal(f.render().children[0].props['aria-expanded'], true)
  f.render().children[1].props.onClick({ target: { closest: () => ({}) } })
  assert.equal(f.render().children[0].props['aria-expanded'], false)
})
function nodes(view) { return [view, ...view.children.filter(x => x && typeof x === 'object').flatMap(nodes)] }
test('menu organizador conserva destinos, novo evento e logout', () => {
  const actions = [], { Menu } = carregar('components/layout/Menu.jsx', ['Menu'])
  const view = Menu({ pagina: 'eventos', setPagina: x => actions.push(x), aoCriarNovoEvento: () => actions.push('novo'), aoSair: () => actions.push('sair') })
  const buttons = nodes(view).filter(x => x.type === 'button')
  for (const b of buttons) b.props.onClick()
  assert.deepEqual(actions, ['novo', 'criar', 'eventos', 'criar', 'custos', 'cotacao', 'ticket', 'perfil', 'sair'])
  assert.equal(buttons.filter(b => b.props['aria-current'] === 'page').length, 1)
})
test('menu e topo administrativos conservam destinos e saida', () => {
  const { AdminMenu, AdminTopo } = carregar('components/admin/AdminPortal.jsx', ['AdminMenu', 'AdminTopo'])
  const actions = [], view = AdminMenu({ secao: 'eventos', setSecao: x => actions.push(x), aoSair: () => actions.push('sair') })
  for (const b of nodes(view).filter(x => x.type === 'button' && x.props.onClick)) b.props.onClick()
  assert.deepEqual(actions, ['eventos', 'usuarios', 'cotacoes', 'propostas', 'contas', 'perfil', 'sair'])
  const unavailable = nodes(view).filter(x => x.type === 'button' && x.props.disabled)
  assert.equal(unavailable.length, 3)
  for (const button of unavailable) {
    assert.equal(button.props.onClick, undefined)
    assert.match(button.props.title, /Funcionalidade (em desenvolvimento|indisponível)/)
  }
  const logout = nodes(AdminTopo({ aoSair: () => actions.push('sair-topo') })).find(x => x.props['aria-label'] === 'Sair da conta de administrador')
  logout.props.onClick(); assert.equal(actions.at(-1), 'sair-topo')
})

const css = postcss.parse(readFileSync(new URL('../src/App.css', import.meta.url), 'utf8'))
// Avalia regras da estrutura; nao substitui medicao geometrica no navegador.
function estilo(selectors, width) {
  const values = {}, priorities = {}
  css.walkRules(rule => {
    for (let p = rule.parent; p; p = p.parent) if (p.type === 'atrule' && p.name === 'media') {
      const m = p.params.match(/max-width:\s*(\d+)px/); if (m && width > Number(m[1])) return
    }
    const matching = rule.selector.split(',').map(s => s.trim()).filter(s => selectors.includes(s))
    if (!matching.length) return
    const priority = Math.max(...matching.map(s => (s.match(/[.[]/g) || []).length))
    rule.walkDecls(d => { if (priority >= (priorities[d.prop] ?? -1)) { values[d.prop] = d.value; priorities[d.prop] = priority } })
  })
  return values
}
for (const width of [1920, 1366, 768, 390, 360]) test(`estrutura compartilhada em ${width}px`, () => {
  const mobile = width <= 850
  assert.equal(estilo(['.alternarNavegacao'], width).display, mobile ? 'flex' : 'none')
  assert.equal(estilo(['.painelNavegacao', ".painelNavegacao[data-aberto='false']"], width).display, mobile ? 'none' : 'flex')
  assert.equal(estilo(['.painelNavegacao'], width).display, 'flex')
  const wrapper = estilo(['.navegacaoRecolhivel', '.adminNavegacao'], width)
  if (mobile) {
    assert.equal(wrapper.flex, '0 0 auto')
    assert.equal(estilo(['.conteudo', '.adminConteudo'], width).width, '100%')
    assert.equal(estilo(['.menu nav', '.adminMenu nav'], width)['grid-template-columns'], width <= 480 ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))')
    assert.equal(estilo(['.menu button'], width)['min-height'], '44px')
    assert.equal(estilo(['.adminTopo'], width)['flex-wrap'], 'wrap')
    assert.equal(estilo(['.adminBusca', '.adminTopo .adminBusca'], width).display, 'flex')
  } else {
    assert.equal(wrapper['flex-basis'], '255px')
    assert.equal(estilo(['.menu'], width).width, '230px')
    assert.equal(estilo(['header'], width).height, '72px')
  }
  assert.equal(estilo(['.conteudo', '.adminConteudo'], width)['min-width'], '0')
})
test('sem mascaramento global de overflow ou alteracao de tokens visuais', () => {
  for (const s of ['body', '#root', 'html']) assert.equal(estilo([s], 360)['overflow-x'], undefined)
  assert.equal(estilo([':root'], 1920)['--cor-primaria'], '#3427b8')
})
