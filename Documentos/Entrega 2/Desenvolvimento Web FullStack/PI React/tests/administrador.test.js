import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { setImmediate } from 'node:timers'
import { transformSync } from 'rolldown/utils'

const source = readFileSync(new URL('../src/components/admin/AdminPortal.jsx', import.meta.url), 'utf8')
const compiled = transformSync('AdminPortal.jsx', source.replace(/^import .*\r?\n/gm, '').replaceAll('export function ', 'function '), { jsx: { runtime: 'classic', pragma: 'jsx', pragmaFrag: 'Fragment' } })
assert.equal(compiled.errors.length, 0)
const jsx = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) })
const nodes = v => v && typeof v === 'object' ? [v, ...(v.children || []).flatMap(nodes)] : []
const text = v => v && typeof v === 'object' ? (v.children || []).map(text).join(' ') : String(v ?? '')
const tick = () => new Promise(resolve => setImmediate(resolve))
const ok = data => ({ ok: true, json: async () => data })
function runtime(fetch, confirmed = true) {
  const states = [], effects = []
  let cursor = 0, effectCursor = 0
  const env = {
    jsx, Fragment: 'fragment', Icone: 'svg', fetch, apiUrl: x => x,
    sessionStorage: { getItem: () => 'token-teste' },
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }] },
    useEffect(fn, deps) { const i = effectCursor++; if (!effects[i] || deps.some((d, j) => d !== effects[i][j])) { effects[i] = deps; fn() } },
    useFocoModal: () => null, IdentidadeConta: () => null, NavegacaoRecolhivel: () => null,
    window: { confirm: () => confirmed }, alert() {}, console: { error() {} },
  }
  const api = vm.runInNewContext(compiled.code + '; ({ AdminPortal, AdminMenu, AdminTopo })', env)
  const render = () => { cursor = 0; effectCursor = 0; return api.AdminPortal({ aoSair() {} }) }
  return { ...api, render, navigate(section) { nodes(render()).find(n => n.type === api.AdminMenu).props.setSecao(section); return render() } }
}
const requests = [
  { id: 30, nome: 'Zélia', email: 'z@example.invalid', perfil_solicitado: 'organizador', criada_em: '2026-01-01T12:00:00Z', status: 'pendente', justificativa: 'Pedido Z' },
  { id: 2, nome: 'Ana', email: 'a@example.invalid', perfil_solicitado: 'fornecedor', criada_em: '2026-10-01T12:00:00Z', status: 'pendente' },
  { id: 4, nome: 'Bia', perfil_solicitado: 'fornecedor', criada_em: null, status: 'pendente' },
  { id: 5, nome: 'Aprovada', status: 'aprovado' },
]
const rows = view => nodes(view).filter(n => n.type === 'tr' && n.props.key !== undefined)
const ids = view => rows(view).map(n => n.props.key)
function selectOrder(r, value) { nodes(r.render()).find(n => n.props.id === 'ordemSolicitacoes').props.onChange({ target: { value } }); return r.render() }

test('seletor ordena datas originais e nomes; filtro mantém ordem e métricas reais', async () => {
  const r = runtime(async () => ok(requests)); r.render(); await tick()
  assert.deepEqual(ids(r.render()), [2, 30, 4])
  assert.deepEqual(ids(selectOrder(r, 'antigas')), [30, 2, 4])
  assert.deepEqual(ids(selectOrder(r, 'nome')), [2, 4, 30])
  assert.deepEqual(ids(selectOrder(r, 'recentes')), [2, 30, 4])
  nodes(r.render()).find(n => n.type === 'button' && text(n).includes('Fornecedores (')).props.onClick()
  assert.deepEqual(ids(r.render()), [2, 4])
  const metrics = nodes(r.render()).filter(n => typeof n.type === 'function' && n.type.name === 'CartaoMetrica')
  assert.deepEqual(metrics.map(n => n.props.valor), [1, 2, 3])
  assert.match(text(r.render()), /Data não informada/)
})

test('datas empatadas têm desempate consistente por ID', async () => {
  const r = runtime(async () => ok([requests[1], { ...requests[1], id: 1 }]))
  r.render(); await tick(); assert.deepEqual(ids(r.render()), [1, 2])
})

test('carregamento, falha e lista vazia não apresentam indicadores simulados', async () => {
  let resolve
  const r = runtime(() => new Promise(done => { resolve = done }))
  assert.match(text(r.render()), /Carregando solicitações/)
  assert.ok(nodes(r.render()).filter(n => n.type.name === 'CartaoMetrica').every(n => n.props.valor === '—'))
  resolve({ ok: false, json: async () => ({ erro: 'Falha de consulta' }) }); await tick()
  assert.ok(nodes(r.render()).some(n => n.props.role === 'alert' && text(n).includes('Falha de consulta')))
  assert.ok(nodes(r.render()).filter(n => n.type.name === 'CartaoMetrica').every(n => n.props.valor === '—'))
  const empty = runtime(async () => ok([])); empty.render(); await tick()
  assert.match(text(empty.render()), /Nenhuma solicitação pendente/)
  assert.ok(nodes(empty.render()).filter(n => n.type.name === 'CartaoMetrica').every(n => n.props.valor === 0))
})

test('recursos indisponíveis desabilitados, navegação real e saída preservadas', () => {
  const r = runtime(async () => ok([])), menu = r.AdminMenu({ secao: 'contas', setSecao() {}, aoSair() {} })
  for (const label of ['Painel de evento', 'Relatórios', 'Novo evento']) {
    const button = nodes(menu).find(n => n.type === 'button' && text(n).includes(label))
    assert.ok(button.props.disabled); assert.equal(button.props.onClick, undefined)
  }
  for (const label of ['Eventos', 'Usuários', 'Cotações', 'Propostas', 'Solicitações de acesso', 'Meu perfil', 'Sair']) {
    const button = nodes(menu).find(n => n.type === 'button' && text(n).includes(label))
    assert.ok(!button.props.disabled); assert.equal(typeof button.props.onClick, 'function')
  }
  const top = r.AdminTopo({ aoSair() {} })
  assert.ok(nodes(top).find(n => n.type === 'input').props.disabled)
  assert.ok(nodes(top).find(n => n.props.className === 'adminIcone').props.disabled)
  assert.ok(nodes(r.render()).filter(n => n.type === 'input' && n.props.type === 'checkbox').every(n => n.props.disabled))
  assert.doesNotMatch(source, /SHA-256|SSL 256|AUDITORIA ATIVA|cargo:|score:|risco:|docs:|Fornecedores & Contas/)
})

for (const [label, status] of [['Aprovar', 'aprovado'], ['Recusar', 'rejeitado']]) test('decisão individual ' + label + ' mantém PATCH autenticado e só remove após sucesso', async () => {
  const calls = []
  let success = false
  const r = runtime(async (url, opts) => {
    calls.push([url, opts]); return opts?.method === 'PATCH' ? { ok: success, json: async () => ({}) } : ok(requests)
  })
  r.render(); await tick()
  const decide = () => nodes(rows(r.render())[0]).find(n => n.type === 'button' && text(n) === label).props.onClick()
  await decide(); assert.deepEqual(ids(r.render()), [2, 30, 4])
  success = true; await decide(); assert.deepEqual(ids(r.render()), [30, 4])
  const [url, opts] = calls.at(-1)
  assert.equal(url, '/solicitacoes-acesso/2'); assert.equal(opts.headers.Authorization, 'Bearer token-teste')
  assert.deepEqual(JSON.parse(opts.body), { status })
})

test('cancelar decisão não envia PATCH', async () => {
  const calls = [], r = runtime(async (url, opts) => { calls.push([url, opts]); return ok(requests) }, false)
  r.render(); await tick()
  await nodes(rows(r.render())[0]).find(n => n.type === 'button').props.onClick()
  assert.equal(calls.length, 1)
})

for (const [section, endpoint, record] of [
  ['eventos', '/admin/eventos', { id: 1, nome: 'Evento real', status: 'Ativo' }],
  ['usuarios', '/usuarios', { id: 2, nome: 'Pessoa real', email: 'real@example.invalid', perfil: 'admin' }],
  ['cotacoes', '/admin/cotacoes', { id: 3, evento_nome: 'Cotação real' }],
  ['propostas', '/admin/propostas', { id: 4, evento_nome: 'Proposta real', fornecedor_nome: 'Fornecedor real', valor: 120 }],
]) test('consulta autenticada e modal preservados: ' + section, async () => {
  const calls = [], r = runtime(async (url, opts) => { calls.push([url, opts]); return ok(url === endpoint ? [record] : []) })
  r.navigate(section); await tick()
  assert.ok(calls.some(([url, opts]) => url === endpoint && opts.headers.Authorization === 'Bearer token-teste'))
  assert.equal(nodes(r.render()).filter(n => n.props.className === 'adminBarraLote').length, 0)
  const button = nodes(r.render()).find(n => n.type === 'button' && text(n).trim() === 'Visualizar')
  assert.ok(button); button.props.onClick({ currentTarget: { focus() {} } })
  assert.ok(nodes(r.render()).some(n => n.props.role === 'dialog'))
})
