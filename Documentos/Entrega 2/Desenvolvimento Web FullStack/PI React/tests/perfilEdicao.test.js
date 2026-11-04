import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { setImmediate } from 'node:timers'
import { transformSync } from 'rolldown/utils'

const tick = () => new Promise(resolve => setImmediate(resolve))
const jsx = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) })
const nodes = v => v && typeof v === 'object' ? [v, ...(v.children || []).flatMap(nodes)] : []
const text = v => v && typeof v === 'object' ? (v.children || []).map(text).join(' ') : String(v ?? '')
const findButton = (v, label) => nodes(v).find(n => n.type === 'button' && text(n).includes(label))
const identity = { id: 7, nome: 'Pessoa', email: 'pessoa@example.invalid', telefone: null, biografia: null, edicao_disponivel: true }
function load(file, name, env) {
  const source = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/gm, '').replaceAll('export function ', 'function ').replaceAll('export async function ', 'async function ')
  const result = transformSync(file, source, { jsx: { runtime: 'classic', pragma: 'jsx', pragmaFrag: 'Fragment' } })
  assert.equal(result.errors.length, 0)
  return vm.runInNewContext(result.code + '\n' + name, { jsx, Fragment: 'fragment', Icone: 'svg', PerfilProfissional: 'section', ...env })
}
function runtime(file, name, env = {}) {
  const cells = [], pending = []
  let cursor = 0
  const hooks = {
    useState(initial) {
      const i = cursor++
      if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial
      return [cells[i], value => { cells[i] = typeof value === 'function' ? value(cells[i]) : value }]
    },
    useRef(value) { const i = cursor++; return cells[i] ?? (cells[i] = { current: value }) },
    useEffect(fn, deps) {
      const i = cursor++
      if (!cells[i] || deps.some((v, j) => v !== cells[i].deps[j])) pending.push(() => {
        cells[i]?.cleanup?.(); cells[i] = { deps, cleanup: fn() }
      })
    },
  }
  const fn = load(file, name, { ...hooks, AbortController, sessionStorage: { getItem: () => 'token-a' }, ...env })
  return { render(props) { cursor = 0; const v = fn(props); pending.splice(0).forEach(f => f()); return v },
    unmount() { cells.forEach(c => c?.cleanup?.()) } }
}

test('formulário bloqueia edição antes da migração e mantém email somente leitura', () => {
  const r = runtime('components/perfil/PerfilPessoal.jsx', 'FormularioPerfil')
  const view = r.render({ perfil: { ...identity, edicao_disponivel: false }, token: 'token-a' })
  assert.equal(findButton(view, 'Editar'), undefined)
  const inputs = nodes(view).filter(n => ['input', 'textarea'].includes(n.type))
  assert.equal(inputs.find(n => n.props.type === 'email').props.readOnly, true)
  assert.ok(inputs.filter(n => n.props.type !== 'email').every(n => n.props.disabled))
  assert.match(text(view), /ainda não está disponível/)
})

test('salvamento aguarda servidor, bloqueia envio duplo e mostra resposta persistida', async () => {
  let resolve, calls = 0
  const props = { perfil: identity, token: 'token-a' }
  const r = runtime('components/perfil/PerfilPessoal.jsx', 'FormularioPerfil', {
    salvarPerfil(token, dados) {
      calls++; assert.equal(token, 'token-a'); assert.equal(dados.nome, 'Nome novo')
      return new Promise(res => { resolve = () => { props.perfil = { ...identity, nome: 'Nome novo' }; res(props.perfil) } })
    },
  })
  findButton(r.render(props), 'Editar dados').props.onClick()
  nodes(r.render(props)).find(n => n.type === 'input').props.onChange({ target: { value: 'Nome novo' } })
  const pending = r.render(props).props.onSubmit({ preventDefault() {} })
  await r.render(props).props.onSubmit({ preventDefault() {} })
  assert.equal(calls, 1)
  assert.ok(findButton(r.render(props), 'Salvando').props.disabled)
  assert.ok(findButton(r.render(props), 'Cancelar').props.disabled)
  assert.doesNotMatch(text(r.render(props)), /Perfil atualizado/)
  resolve(); await pending
  assert.match(text(r.render(props)), /Perfil atualizado/)
  assert.equal(nodes(r.render(props)).find(n => n.type === 'input').props.value, 'Nome novo')
})

test('falha mantém rascunho para correção e cancelar restaura dados persistidos', async () => {
  const props = { perfil: identity, token: 'token-a' }
  const r = runtime('components/perfil/PerfilPessoal.jsx', 'FormularioPerfil', { salvarPerfil: async () => { throw new Error('Telefone inválido') } })
  findButton(r.render(props), 'Editar dados').props.onClick()
  nodes(r.render(props)).find(n => n.type === 'input').props.onChange({ target: { value: 'Rascunho' } })
  await r.render(props).props.onSubmit({ preventDefault() {} })
  assert.ok(nodes(r.render(props)).some(n => n.props.role === 'alert' && text(n).includes('Telefone inválido')))
  assert.doesNotMatch(text(r.render(props)), /Perfil atualizado/)
  assert.equal(nodes(r.render(props)).find(n => n.type === 'input').props.value, 'Rascunho')
  findButton(r.render(props), 'Cancelar').props.onClick()
  assert.equal(nodes(r.render(props)).find(n => n.type === 'input').props.value, identity.nome)
})

test('sair do formulário aborta requisição e não apresenta sucesso atrasado', async () => {
  let resolve, signal
  const props = { perfil: identity, token: 'token-a' }
  const r = runtime('components/perfil/PerfilPessoal.jsx', 'FormularioPerfil', { salvarPerfil: (_, __, s) => { signal = s; return new Promise(res => { resolve = res }) } })
  findButton(r.render(props), 'Editar dados').props.onClick()
  const pending = r.render(props).props.onSubmit({ preventDefault() {} })
  r.unmount(); assert.ok(signal.aborted)
  resolve(identity); await pending
  assert.doesNotMatch(text(r.render(props)), /Perfil atualizado/)
})

test('página diferencia carregamento/erro, permite repetir e mostra identidade real', () => {
  let estado = { perfil: null, erro: '' }, repeats = 0
  const r = runtime('components/perfil/PerfilPessoal.jsx', 'PerfilPessoal', { usePerfil: () => ({ ...estado, recarregar: () => repeats++ }) })
  assert.match(text(r.render({})), /Carregando perfil/)
  estado = { perfil: null, erro: 'Falha ao consultar' }
  assert.ok(nodes(r.render({})).some(n => n.props.role === 'alert'))
  findButton(r.render({}), 'Tentar novamente').props.onClick(); assert.equal(repeats, 1)
  estado = { perfil: identity, erro: '' }
  const view = r.render({ contexto: 'Participante' })
  assert.match(text(view), /Pessoa/); assert.match(text(view), /pessoa@example.invalid/)
})

function eventBus() {
  const listeners = new Set()
  return { addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn),
    dispatchEvent: e => listeners.forEach(fn => fn(e)), size: () => listeners.size }
}
test('identidades montadas sincronizam após salvar e ignoram GET antigo e outra sessão', async () => {
  const bus = eventBus(), pendentes = []
  const env = { window: bus, apiUrl: x => x, fetch: () => new Promise(res => pendentes.push(res)) }
  const a = runtime('hooks/usePerfil.js', 'usePerfil', env), b = runtime('hooks/usePerfil.js', 'usePerfil', env)
  a.render(); b.render()
  const novo = { ...identity, nome: 'Atualizado' }
  bus.dispatchEvent({ detail: { token: 'token-a', perfil: novo } })
  assert.equal(a.render().perfil.nome, 'Atualizado'); assert.equal(b.render().perfil.nome, 'Atualizado')
  pendentes.forEach(res => res({ ok: true, json: async () => identity })); await tick()
  assert.equal(a.render().perfil.nome, 'Atualizado')
  bus.dispatchEvent({ detail: { token: 'outra-sessao', perfil: identity } })
  assert.equal(a.render().perfil.nome, 'Atualizado')
  a.unmount(); b.unmount(); assert.equal(bus.size(), 0)
})

function service(fetch, token = () => 'token-a', bus = eventBus()) {
  return { salvar: load('services/perfil.js', 'salvarPerfil', { apiUrl: x => x, fetch, sessionStorage: { getItem: token }, window: bus,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail } } }), bus }
}
test('serviço PATCH autenticado envia só campos permitidos e publica perfil confirmado', async () => {
  const calls = [], events = []
  const s = service(async (...args) => { calls.push(args); return { ok: true, json: async () => identity } })
  s.bus.addEventListener('', e => events.push(e))
  await s.salvar('token-a', { nome: 'Pessoa', telefone: '', biografia: '', id: 9, email: 'outro', perfil: 'admin', senha: 'privada' })
  assert.equal(calls[0][0], '/perfil'); assert.equal(calls[0][1].method, 'PATCH')
  assert.equal(calls[0][1].headers.Authorization, 'Bearer token-a')
  assert.deepEqual(JSON.parse(calls[0][1].body), { nome: 'Pessoa', telefone: '', biografia: '' })
  assert.equal(events.length, 1); assert.equal(events[0].detail.perfil.nome, 'Pessoa')
})
test('serviço não publica sucesso em erro HTTP, resposta inválida ou sessão substituída', async () => {
  for (const response of [{ ok: false, json: async () => ({ erro: 'Migração pendente' }) }, { ok: true, json: async () => ({}) }]) {
    const s = service(async () => response); let events = 0
    s.bus.addEventListener('', () => events++)
    await assert.rejects(s.salvar('token-a', identity)); assert.equal(events, 0)
  }
  const s = service(async () => ({ ok: true, json: async () => identity }), () => 'outra')
  await assert.rejects(s.salvar('token-a', identity), /sessão foi alterada/)
})

test('menu administrativo abre somente o próprio perfil', () => {
  let secao
  const r = runtime('components/admin/AdminPortal.jsx', 'AdminMenu')
  const view = r.render({ secao: 'contas', setSecao: value => { secao = value } })
  findButton(view, 'Meu perfil').props.onClick(); assert.equal(secao, 'perfil')
})
