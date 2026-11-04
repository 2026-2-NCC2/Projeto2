import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { setImmediate } from 'node:timers'
import { transformSync } from 'rolldown/utils'

const jsx = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) })
const nodes = v => v && typeof v === 'object' ? [v, ...(v.children || []).flatMap(nodes)] : []
const text = v => v && typeof v === 'object' ? (v.children || []).map(text).join(' ') : String(v ?? '')
function load(file, name, env) {
  const source = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replaceAll('export function ', 'function ')
  const result = transformSync(file, source, { jsx: { runtime: 'classic', pragma: 'jsx', pragmaFrag: 'Fragment' } })
  assert.equal(result.errors.length, 0)
  return vm.runInNewContext(result.code + '\n' + name, { jsx, MidiaEvento: 'section', Fragment: 'fragment', Icone: 'svg', ...env })
}
function runtime(file, name, fetch) {
  const states = [], effects = [], cleanups = []
  let cursor = 0, effectCursor = 0, token = 'token-a'
  const env = {
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }] },
    useEffect(effect, deps) { const i = effectCursor++; if (!effects[i] || deps.some((v, j) => v !== effects[i][j])) { cleanups[i]?.(); effects[i] = deps; cleanups[i] = effect() } },
    apiUrl: x => 'http://localhost:3001' + x, sessionStorage: { getItem: () => token }, fetch, AbortController,
    console: { error() {} }, IdentidadeConta: () => null, PortfolioFornecedor: () => null, formatarMoeda: x => String(x), alert() {},
  }
  const fn = load(file, name, env)
  return {
    render(props) { cursor = 0; effectCursor = 0; return fn(props) },
    token(value) { token = value }, unmount() { cleanups.forEach(c => c?.()) },
  }
}
const tick = () => new Promise(resolve => setImmediate(resolve))
const ok = data => ({ ok: true, json: async () => data })

test('perfil usa GET autenticado e somente nome/email reais', async () => {
  const calls = [], r = runtime('hooks/usePerfil.js', 'usePerfil', async (...args) => { calls.push(args); return ok({ id: 7, nome: 'Conta de teste', email: 'teste@example.invalid' }) })
  assert.equal(r.render().perfil, null); await tick()
  assert.equal(r.render().perfil.nome, 'Conta de teste')
  assert.equal(calls[0][0], 'http://localhost:3001/perfil')
  assert.equal(calls[0][1].headers.Authorization, 'Bearer token-a')
  assert.equal(calls[0][1].method, undefined)
})
test('troca de token oculta identidade antiga e ignora resposta atrasada', async () => {
  const pending = [], r = runtime('hooks/usePerfil.js', 'usePerfil', () => new Promise(resolve => pending.push(resolve)))
  r.render(); r.token('token-b'); assert.equal(r.render().perfil, null)
  pending[1](ok({ nome: 'Nova', email: 'nova@example.invalid' })); await tick()
  pending[0](ok({ nome: 'Antiga', email: 'antiga@example.invalid' })); await tick()
  assert.equal(r.render().perfil.nome, 'Nova')
})
for (const response of [{ ok: false }, ok(null), ok({ nome: 'Sem email' })]) test('falha de perfil nao inventa identidade', async () => {
  const r = runtime('hooks/usePerfil.js', 'usePerfil', async () => response)
  r.render(); await tick(); assert.equal(r.render().perfil, null); assert.ok(r.render().erro)
})
test('sem token nao consulta perfil; unmount cancela consulta', async () => {
  let signal, count = 0
  const r = runtime('hooks/usePerfil.js', 'usePerfil', async (_, opts) => { count++; signal = opts.signal; return ok({ nome: 'Teste', email: 'a@b.invalid' }) })
  r.token(null); r.render(); await tick(); assert.equal(count, 0)
  r.token('nova'); r.render(); r.unmount(); assert.equal(signal.aborted, true)
})
function fornecedor(fetch) {
  const r = runtime('pages/fornecedor/PortalFornecedor.jsx', 'PortalFornecedor', fetch)
  let page = 'fornecedor-enviadas'
  const props = () => ({ pagina: page, setPagina: value => { page = value }, aoSair() {}, PerfilFornecedor: () => null })
  return { ...r, render: () => r.render(props()), page: value => { page = value } }
}

test('recarregar elaboração sem cotação não renderiza formulário e retorna ao mural', async () => {
  const r = fornecedor(async () => ok([]))
  r.page('fornecedor-proposta')
  const inicial = r.render()
  assert.equal(nodes(inicial).filter(n => n.type === 'form').length, 0)
  await tick()
  const view = r.render()
  assert.ok(nodes(view).some(n => n.type === 'input' && n.props['aria-label'] === 'Buscar oportunidades'))
  assert.equal(nodes(view).filter(n => n.type === 'form').length, 0)
})
test('menu unifica propostas e bloqueia contratos; portfolio preserva URL antiga', async () => {
  const r = fornecedor(async () => ok([])); r.page('fornecedor-cotacoes'); r.render(); await tick()
  const view = r.render(), buttons = nodes(view).filter(n => n.type === 'button')
  assert.equal(buttons.filter(n => text(n).includes('Propostas enviadas')).length, 1)
  assert.equal(buttons.filter(n => text(n).includes('Minhas cota')).length, 0)
  const disabled = buttons.filter(n => n.props.disabled)
  assert.equal(disabled.length, 1); disabled.forEach(n => assert.equal(n.props.onClick, undefined))
  assert.ok(nodes(view).some(n => n.type === 'h2' && text(n) === 'Hist\u00f3rico de propostas'))
})
test('erro de propostas aparece, tentativa manual reconsulta e filtro Aprovada funciona', async () => {
  let attempts = 0
  const r = fornecedor(async url => {
    if (url.endsWith('/cotacoes')) return ok([])
    attempts++
    return attempts === 1 ? { ok: false, json: async () => ({ erro: 'Falha controlada' }) } : ok([
      { id: 1, evento_nome: 'Evento aprovado', valor: 10, status: 'Aprovada' },
      { id: 2, evento_nome: 'Evento recusado', valor: 20, status: 'Recusada' },
    ])
  })
  r.render(); await tick()
  assert.ok(nodes(r.render()).some(n => n.props.role === 'alert' && text(n).includes('Falha controlada')))
  nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Tentar novamente').props.onClick()
  r.render(); await tick()
  assert.equal(attempts, 2); assert.ok(!nodes(r.render()).some(n => n.props.role === 'alert'))
  nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Aprovada').props.onClick()
  const rows = nodes(r.render()).filter(n => n.props.className === 'fornTabelaLinha')
  assert.equal(rows.length, 1); assert.ok(text(rows[0]).includes('Evento aprovado'))
})
test('envio real preserva endpoint, payload e navegacao, sem escrita real', async () => {
  const calls = [], r = fornecedor(async (url, opts) => {
    calls.push([url, opts])
    if (opts?.method === 'POST') return ok({ proposta_id: 9 })
    if (url.endsWith('/cotacoes')) return ok([{ id: 3, evento_nome: 'Evento teste', evento_local: 'Local', prazo: '2027-01-01', itens: [{ categoria: 'Som' }] }])
    return ok([])
  })
  r.page('fornecedor-mural'); r.render(); await tick()
  nodes(r.render()).find(n => n.type === 'button' && text(n).startsWith('Elaborar proposta')).props.onClick()
  let form = nodes(r.render()).find(n => n.type === 'form')
  const fields = nodes(form).filter(n => n.type === 'input' || n.type === 'textarea')
  fields[0].props.onChange({ target: { value: '150' } })
  form = nodes(r.render()).find(n => n.type === 'form')
  await form.props.onSubmit({ preventDefault() {} })
  const post = calls.find(([, opts]) => opts?.method === 'POST')
  assert.equal(post[0], 'http://localhost:3001/fornecedor/propostas')
  assert.equal(JSON.parse(post[1].body).cotacao_id, 3); assert.equal(JSON.parse(post[1].body).valor, 150)
  assert.ok(nodes(r.render()).some(n => n.props.className === 'fornTabelaLinha' && text(n).includes('Evento teste')))
})
test('cabecalhos compartilham identidade real e perfis consultam /perfil', () => {
  for (const file of ['components/layout/Cabecalho.jsx', 'components/admin/AdminPortal.jsx', 'pages/fornecedor/PortalFornecedor.jsx']) {
    const source = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')
    assert.ok(source.includes('<IdentidadeConta />')); assert.doesNotMatch(source, /Roberto Albuquerque|Sonora Stage/)
  }
  for (const file of ['App.jsx', 'pages/organizador/Perfil.jsx', 'components/admin/AdminPortal.jsx', 'pages/participante/PortalParticipante.jsx']) {
    const source = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')
    assert.ok(source.includes('<PerfilPessoal'))
    assert.doesNotMatch(source, /Roberto Albuquerque|Sonora Stage/)
  }
  const source = readFileSync(new URL('../src/components/perfil/PerfilPessoal.jsx', import.meta.url), 'utf8')
  assert.ok(source.includes('usePerfil()')); assert.ok(source.includes('value={perfil.email} readOnly'))
})

test('identidade compartilhada apresenta nome e email ou erro, sem fallback ficticio', () => {
  const render = perfil => load('components/layout/IdentidadeConta.jsx', 'IdentidadeConta', { usePerfil: () => perfil })()
  assert.ok(text(render({ perfil: { nome: 'Pessoa real', email: 'real@example.invalid' }, erro: '' })).includes('real@example.invalid'))
  assert.ok(text(render({ perfil: { nome: 'Pessoa real', email: 'real@example.invalid' }, erro: '' })).includes('Pessoa real'))
  assert.ok(nodes(render({ perfil: null, erro: 'Falha de identidade' })).some(n => n.props.role === 'alert'))
})
