import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { carregarAdmin, hooksAdmin, nodes, text } from './helpers/adminRuntime.js'

function notificacoes() {
  const h = hooksAdmin({ useId: () => 'notificacao' })
  const { useNotificacoes } = carregarAdmin('hooks/useNotificacoes.js', ['useNotificacoes'], h.env)
  return () => h.render(useNotificacoes)
}

function dialogo(props = {}) {
  const listeners = new Set(), document = { body: {}, activeElement: null,
    addEventListener(tipo, fn) { assert.equal(tipo, 'keydown'); listeners.add(fn) },
    removeEventListener(tipo, fn) { assert.equal(tipo, 'keydown'); listeners.delete(fn) } }
  function elemento() {
    return { disabled: false, tabIndex: 0, isConnected: true, focus() { document.activeElement = this },
      matches() { return this.disabled }, closest() { return null }, getClientRects: () => [1] }
  }
  const origem = elemento(), cancelar = elemento(), confirmar = elemento(), modal = elemento()
  modal.querySelector = () => cancelar
  modal.querySelectorAll = () => [cancelar, confirmar]
  document.activeElement = origem
  const h = hooksAdmin({ document, useId: () => 'confirmacao', createPortal: v => v, Alerta: 'alerta', Botao: 'botao' })
  const ref = h.env.useRef
  h.env.useRef = valor => ref(valor === null ? modal : valor)
  h.env.useCallback = fn => ref(fn).current
  h.env.useLayoutEffect = h.env.useEffect
  h.env.useFocoModal = carregarAdmin('hooks/useFocoModal.js', ['useFocoModal'], h.env).useFocoModal
  const api = carregarAdmin('components/ui/Feedbacks.jsx', ['DialogoConfirmacao'], h.env)
  let options = { aberto: true, titulo: 'Remover item?', descricao: 'Esta ação precisa de confirmação.', ...props }
  function render(novos = {}) {
    options = { ...options, ...novos }
    const view = h.render(() => {
      const v = api.DialogoConfirmacao(options)
      return v ? v.type(v.props) : null
    })
    const buttons = nodes(view).filter(n => n.type === 'botao')
    if (buttons.length) { cancelar.disabled = buttons[0].props.disabled; confirmar.disabled = buttons[1].props.disabled || buttons[1].props.ocupado }
    return view
  }
  function key(tecla, shift = false) {
    const e = { key: tecla, shiftKey: shift, preventDefault() { this.prevented = true }, stopPropagation() { this.stopped = true } }
    listeners.forEach(fn => fn(e)); return e
  }
  return { render, key, document, origem, cancelar, confirmar, modal, listeners, close: () => h.close() }
}
const botoes = view => nodes(view).filter(n => n.type === 'botao')

test('notificacoes distinguem quatro tipos com IDs unicos e ordem preservada', () => {
  const render = notificacoes()
  for (const tipo of ['sucesso', 'erro', 'aviso', 'informacao']) render().notificar({ tipo, mensagem: tipo })
  const itens = render().notificacoes
  assert.equal(itens.length, 4); assert.equal(new Set(itens.map(i => i.id)).size, 4)
  assert.deepEqual(Array.from(itens, i => i.tipo), ['sucesso', 'erro', 'aviso', 'informacao'])
})

test('mensagens importantes nao expiram nem sao removidas ao publicar outra mensagem', () => {
  const render = notificacoes(), id = render().notificar({ tipo: 'erro', mensagem: 'Resultado incerto: consulte antes de repetir' })
  for (let i = 0; i < 10; i++) render().notificar({ tipo: 'sucesso', mensagem: 'Outra operação' })
  assert.equal(render().notificacoes.length, 11)
  assert.match(render().notificacoes.find(i => i.id === id).mensagem, /Resultado incerto/)
  render().dispensar('inexistente'); assert.equal(render().notificacoes.length, 11)
  render().dispensar(id); assert.equal(render().notificacoes.length, 10)
})

test('central usa alertas existentes, rotulos textuais e nao move foco ao receber mensagens', () => {
  const h = hooksAdmin({ Alerta: 'alerta', Botao: 'botao' })
  const { CentralNotificacoes } = carregarAdmin('components/ui/Feedbacks.jsx', ['CentralNotificacoes'], h.env)
  const ids = [], props = { notificacoes: [{ id: 'a', tipo: 'erro', mensagem: 'Confira o resultado' }], aoDispensar: id => ids.push(id) }
  const v = h.render(CentralNotificacoes, props)
  let focos = 0
  v.props.ref.current = { focus() { focos++ } }
  assert.equal(focos, 0); assert.equal(nodes(v).find(n => n.type === 'alerta').props.titulo, 'Erro')
  const btn = botoes(v)[0]; assert.match(btn.props['aria-label'], /Dispensar.*Erro/)
  btn.props.onClick(); assert.deepEqual(ids, ['a']); assert.equal(focos, 1)
})

test('dialogo fechado nao monta interface nem instala ouvintes', () => {
  const f = dialogo({ aberto: false }); assert.equal(f.render(), null); assert.equal(f.listeners.size, 0)
})

test('dialogo tem nome e descricao associados e foco inicial conservador', () => {
  const f = dialogo(), v = f.render(), section = nodes(v).find(n => n.props.role === 'dialog')
  assert.equal(section.props['aria-modal'], 'true')
  assert.ok(nodes(v).some(n => n.props.id === section.props['aria-labelledby']))
  assert.ok(nodes(v).some(n => n.props.id === section.props['aria-describedby']))
  assert.equal(f.document.activeElement, f.cancelar); assert.equal(f.listeners.size, 1)
  f.close(); assert.equal(f.document.activeElement, f.origem); assert.equal(f.listeners.size, 0)
})

test('Tab e Shift Tab ficam contidos no dialogo com hook real de foco', () => {
  const f = dialogo({ aoConfirmar() {} }); f.render(); f.confirmar.focus()
  assert.equal(f.key('Tab').prevented, true); assert.equal(f.document.activeElement, f.cancelar)
  assert.equal(f.key('Tab', true).prevented, true); assert.equal(f.document.activeElement, f.confirmar)
  assert.equal(f.key('Enter').prevented, undefined)
  f.close()
})

test('Escape cancela sem confirmar e nao reinicia foco durante rerenders', () => {
  let cancelamentos = 0, confirmacoes = 0
  const f = dialogo({ aoCancelar: () => cancelamentos++, aoConfirmar: () => confirmacoes++ })
  f.render(); f.confirmar.focus(); f.render({ titulo: 'Título atualizado' })
  assert.equal(f.document.activeElement, f.confirmar)
  const e = f.key('Escape'); assert.equal(e.prevented, true); assert.equal(e.stopped, true)
  assert.equal(cancelamentos, 1); assert.equal(confirmacoes, 0); f.close()
})

test('trava sincrona impede dois cliques e callback antigo apos conclusao', async () => {
  let chamadas = 0, concluir
  const f = dialogo({ destrutivo: true, aoConfirmar: () => { chamadas++; return new Promise(resolve => { concluir = resolve }) } })
  const btn = botoes(f.render())[1]; assert.equal(btn.props.variante, 'destrutivo')
  const pendente = btn.props.onClick(); await btn.props.onClick(); assert.equal(chamadas, 1)
  const ocupado = f.render(); assert.equal(botoes(ocupado)[1].props.ocupado, true)
  concluir(); await pendente
  assert.match(text(f.render()), /Operação concluída/)
  await btn.props.onClick(); assert.equal(chamadas, 1); f.close()
})

test('ocupado bloqueia Escape e cancelamento, mantendo foco no dialogo', async () => {
  let cancelamentos = 0, concluir
  const f = dialogo({ aoCancelar: () => cancelamentos++, aoConfirmar: () => new Promise(resolve => { concluir = resolve }) })
  const inicial = botoes(f.render()), pendente = inicial[1].props.onClick()
  f.render(); f.key('Escape'); inicial[0].props.onClick(); assert.equal(cancelamentos, 0)
  assert.equal(f.key('Tab').prevented, true); assert.equal(f.document.activeElement, f.modal)
  concluir(); await pendente; f.close()
})

test('ocupacao externa bloqueia tambem callbacks antigos sem reenviar operacao', async () => {
  let chamadas = 0, cancelamentos = 0
  const f = dialogo({ aoConfirmar: () => chamadas++, aoCancelar: () => cancelamentos++ })
  const antigos = botoes(f.render()); f.render({ ocupado: true })
  await antigos[1].props.onClick(); antigos[0].props.onClick(); f.key('Escape')
  assert.equal(chamadas, 0); assert.equal(cancelamentos, 0)
  f.render({ ocupado: false }); await antigos[1].props.onClick(); assert.equal(chamadas, 1); f.close()
})

test('rejeicao preserva aviso de resultado incerto, nao vaza erro e nao libera repeticao', async () => {
  let chamadas = 0
  const f = dialogo({ aoConfirmar: async () => { chamadas++; throw Error('SEGREDO_INTERNO') } })
  const antigo = botoes(f.render())[1]; await antigo.props.onClick()
  const v = f.render(); assert.match(text(v), /Consulte o resultado/); assert.doesNotMatch(text(v), /SEGREDO_INTERNO|Operação concluída/)
  assert.equal(botoes(v)[1].props.disabled, true); await antigo.props.onClick(); assert.equal(chamadas, 1)
  assert.equal(text(botoes(v)[0]), 'Fechar'); f.close()
})

test('fechar interface durante operacao nao reenvia nem cancela a promessa em andamento', async () => {
  let chamadas = 0, concluir
  const f = dialogo({ aoConfirmar: () => { chamadas++; return new Promise(resolve => { concluir = resolve }) } })
  const btn = botoes(f.render())[1], pendente = btn.props.onClick(); f.close(); concluir(); await pendente
  await btn.props.onClick(); assert.equal(chamadas, 1)
})

test('interface nova pode confirmar novamente apos desmontagem por escolha do consumidor', async () => {
  let chamadas = 0
  const props = { aoConfirmar: () => chamadas++ }
  const a = dialogo(props); await botoes(a.render())[1].props.onClick(); a.close()
  const b = dialogo(props); await botoes(b.render())[1].props.onClick(); b.close()
  assert.equal(chamadas, 2)
})

test('CSS usa tokens e dialogo responsivo sem animacoes ou timers de descarte', () => {
  const css = postcss.parse(readFileSync(new URL('../src/components/ui/Feedbacks.css', import.meta.url), 'utf8'))
  css.walkDecls(d => assert.doesNotMatch(d.value, /#[\da-f]{3,8}\b|\brgba?\(/i))
  assert.match(css.toString(), /max-height: calc\(100dvh - 32px\)/)
  assert.match(css.toString(), /flex-wrap: wrap/); assert.match(css.toString(), /:focus-visible/)
  const source = readFileSync(new URL('../src/hooks/useNotificacoes.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /setTimeout|setInterval|localStorage|sessionStorage|fetch\(/)
})
