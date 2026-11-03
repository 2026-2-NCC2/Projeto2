import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { transformSync } from 'rolldown/utils'
import postcss from 'postcss'

function fixture() {
  const listeners = new Set(), closed = [], document = { activeElement: null,
    addEventListener(type, listener, capture) { assert.equal(type, 'keydown'); assert.equal(capture, true); listeners.add(listener) },
    removeEventListener(type, listener, capture) { assert.equal(type, 'keydown'); assert.equal(capture, true); listeners.delete(listener) },
  }
  function element(options = {}) {
    return { tabIndex: 0, isConnected: true, disabled: false, visible: true, inert: false, ...options,
      focus() { document.activeElement = this }, matches() { return this.disabled },
      closest() { return this.inert ? {} : null }, getClientRects() { return this.visible ? [1] : [] },
    }
  }
  const opener = element(), first = element(), last = element(), modal = element({ tabIndex: -1 })
  let items = [first, last]
  modal.querySelectorAll = () => items
  const ref = { current: modal }; document.activeElement = opener
  let cleanup, deps
  const source = readFileSync(new URL('../src/hooks/useFocoModal.js', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replace('export function', 'function')
  const hook = vm.runInNewContext(source + '\nuseFocoModal', { document, useRef: () => ref,
    useEffect(effect, nextDeps) { if (!deps || nextDeps.some((x, i) => x !== deps[i])) { cleanup?.(); cleanup = effect(); deps = nextDeps } },
  })
  const close = value => closed.push(value)
  function render(selected = {}) { return hook(selected, close) }
  function key(key, shiftKey = false) {
    const event = { key, shiftKey, prevented: false, stopped: false, preventDefault() { this.prevented = true }, stopPropagation() { this.stopped = true } }
    for (const listener of listeners) listener(event)
    return event
  }
  return { document, opener, modal, first, last, element, render, key, closed, listeners, setItems: next => { items = next }, unmount: () => cleanup?.() }
}

test('abertura foca o dialogo; fechamento e desmontagem restauram o acionador', () => {
  const f = fixture(); assert.equal(f.render().current, f.modal); assert.equal(f.document.activeElement, f.modal)
  f.render(null); assert.equal(f.document.activeElement, f.opener); assert.equal(f.listeners.size, 0)
  f.render({}); f.unmount(); assert.equal(f.document.activeElement, f.opener)
})
test('Tab e Shift+Tab permanecem no modal, inclusive partindo do container', () => {
  const f = fixture(); f.render()
  assert.equal(f.key('Tab').prevented, true); assert.equal(f.document.activeElement, f.first)
  f.key('Tab', true); assert.equal(f.document.activeElement, f.last)
  f.key('Tab'); assert.equal(f.document.activeElement, f.first)
  f.modal.focus(); f.key('Tab', true); assert.equal(f.document.activeElement, f.last)
  f.unmount()
})
test('foco fora e controles dinamicamente desabilitados nao escapam da contencao', () => {
  const f = fixture(); const hidden = f.element({ visible: false }), disabled = f.element({ disabled: true }), inert = f.element({ inert: true }), negative = f.element({ tabIndex: -1 })
  f.setItems([hidden, disabled, inert, negative, f.first, f.last]); f.render(); f.opener.focus(); f.key('Tab')
  assert.equal(f.document.activeElement, f.first)
  f.last.disabled = true; f.key('Tab'); assert.equal(f.document.activeElement, f.first)
  f.unmount()
})
test('sem controles disponiveis o Tab conserva foco no proprio dialogo', () => {
  const f = fixture(); f.setItems([]); f.render(); f.key('Tab'); assert.equal(f.document.activeElement, f.modal)
  f.key('Tab', true); assert.equal(f.document.activeElement, f.modal); f.unmount()
})
test('Escape fecha uma vez e restaura foco no ciclo seguinte', () => {
  const f = fixture(); f.render(); const event = f.key('Escape'); assert.deepEqual(f.closed, [null]); assert.ok(event.prevented && event.stopped)
  f.render(null); assert.equal(f.document.activeElement, f.opener); f.key('Escape'); assert.equal(f.closed.length, 1)
})
test('Tab intermediario e demais teclas conservam comportamento nativo', () => {
  const f = fixture(), middle = f.element(); f.setItems([f.first, middle, f.last]); f.render(); middle.focus()
  assert.equal(f.key('Tab').prevented, false); assert.equal(f.key('Enter').prevented, false); assert.equal(f.closed.length, 0); f.unmount()
})
test('rerender nao reinicia foco e um acionador removido nao e refocado', () => {
  const f = fixture(); f.render(); f.first.focus(); f.render({ id: 2 }); assert.equal(f.document.activeElement, f.first)
  assert.equal(f.listeners.size, 1); f.opener.isConnected = false; f.render(null); assert.equal(f.document.activeElement, f.first)
})

const source = readFileSync(new URL('../src/components/admin/AdminPortal.jsx', import.meta.url), 'utf8')
function admin(section) {
  const js = transformSync('AdminPortal.jsx', source.replace(/^import .*\r?\n/gm, '').replaceAll('export function ', 'function '), { jsx: { runtime: 'classic', pragma: 'jsx', pragmaFrag: 'Fragment' } })
  assert.equal(js.errors.length, 0)
  const component = vm.runInNewContext(js.code + '\nAdminPortal', { jsx: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }), Fragment: 'fragment', useState: value => [value === 'contas' ? section : value, () => {}], useEffect() {}, useFocoModal: () => ({ current: null }), NavegacaoRecolhivel: 'nav' })
  return component({ aoSair() {} })
}
function nodes(view) { return [view, ...view.children.filter(x => x && typeof x === 'object').flatMap(nodes)] }
test('Aprovar em lote e nativamente desabilitado e possui titulo explicativo', () => {
  const button = nodes(admin('contas')).find(n => n.props.className === 'aprovarLote')
  assert.equal(button.props.disabled, true); assert.equal(button.props.title, 'Funcionalidade em desenvolvimento'); assert.equal(button.props.disabledtitle, undefined)
})
test('Painel e Relatorios nao mostram indevidamente o conteudo de Contas', () => {
  for (const section of ['painel', 'relatorios']) {
    const view = nodes(admin(section)), status = view.find(n => n.props.role === 'status')
    assert.ok(status.children.includes('Funcionalidade em desenvolvimento.'))
    assert.equal(view.some(n => n.props.className === 'adminFila'), false)
  }
})
test('espaco inferior e removido somente quando o rodape fica no fluxo', () => {
  const css = postcss.parse(readFileSync(new URL('../src/App.css', import.meta.url), 'utf8'))
  function styles(selector, width) {
    const out = {}
    css.walkRules(rule => {
      if (rule.selector !== selector) return
      if (rule.parent.type === 'atrule' && width > Number(rule.parent.params.match(/max-width:\s*(\d+)/)?.[1] ?? Infinity)) return
      rule.walkDecls(d => { out[d.prop] = d.value })
    })
    return out
  }
  for (const width of [1920, 1366, 768, 390, 360]) {
    const mobile = width <= 720
    assert.equal(styles('.adminBarraLote', width).position, mobile ? 'static' : 'fixed')
    assert.equal(styles('.adminApp', width)['padding-bottom'], mobile ? '0' : '76px')
    assert.ok(styles('.adminConteudo', width).padding.endsWith(mobile ? '24px' : '100px'))
  }
})
