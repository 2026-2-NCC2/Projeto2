import { primitivasFixture, jsxPrimitivas } from './helpers/primitivasFixture.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { setImmediate } from 'node:timers'
import { transformSync } from 'rolldown/utils'

const tick = () => new Promise(resolve => setImmediate(resolve))
const jsx = jsxPrimitivas
const nodes = v => v && typeof v === 'object' ? [v, ...(v.children || []).flatMap(nodes)] : []
const text = v => v && typeof v === 'object' ? (v.children || []).map(text).join(' ') : String(v ?? '')
const ok = data => ({ ok: true, json: async () => data })
function runtime(file, name, extra = {}) {
  const cells = [], pending = []
  let cursor = 0
  const env = {
    ...primitivasFixture, jsx, VagasEvento: 'vagas', MidiaEvento: 'section', CapaEvento: 'capa', ProvedorImagensEvento: 'provedor', Fragment: 'fragment', Icone: 'svg', console: { error() {} }, useMemo: fn => fn(),
    sessionStorage: { getItem: () => 'token' }, apiUrl: p => p, capacidadesEventos:async()=>ok({criar:true,editar:true,publicar:true,inscrever:true}),
    useState(initial) {
      const i = cursor++
      if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial
      return [cells[i], value => { cells[i] = typeof value === 'function' ? value(cells[i]) : value }]
    },
    useRef(initial) { const i = cursor++; return cells[i] ?? (cells[i] = { current: initial }) },
    useEffect(fn, deps) {
      const i = cursor++
      if (!cells[i] || deps.some((d, j) => d !== cells[i].deps[j])) pending.push(() => {
        cells[i]?.cleanup?.(); cells[i] = { deps, cleanup: fn() }
      })
    }, ...extra,
  }
  const source = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/gm, '').replaceAll('export function ', 'function ')
    .replace(/^export default .*$/gm, '')
  const result = transformSync(file, source, { jsx: { runtime: 'classic', pragma: 'jsx', pragmaFrag: 'Fragment' } })
  assert.equal(result.errors.length, 0)
  const fn = vm.runInNewContext(result.code + '\n' + name, env)
  return {
    render(props) { cursor = 0; const view = fn(props); pending.splice(0).forEach(fn => fn()); return view },
    unmount() { cells.forEach(c => c?.cleanup?.()) },
  }
}
const button = (view, label) => nodes(view).find(n => n.type === 'button' && text(n).includes(label))

test('perfil fornecedor usa o formulário compartilhado sem afirmar segurança ou homologação', () => {
  const r = runtime('App.jsx', 'PerfilFornecedor', { PerfilPessoal: 'perfil-pessoal', formatarMoeda: String })
  const view = r.render({ propostas: [{ valor: 10, status: 'Aprovada' }] })
  assert.equal(view.type, 'perfil-pessoal')
  assert.equal(view.props.contexto, 'Fornecedor')
  assert.match(text(view.props.indicadores), /Propostas enviadas/)
  assert.doesNotMatch(text(view.props.indicadores), /Documentação válida|Empresa homologada|Fornecedor homologado/)
})

test('eventos distingue carregamento, erro, ausência e filtro; oculta dados antigos', () => {
  const r = runtime('pages/organizador/Eventos.jsx', 'Eventos')
  const props = { eventos: [{ id: 1, nome: 'Evento antigo' }] }
  for (const state of [{ carregando: true }, { erro: 'Falha de consulta' }]) {
    const view = r.render({ ...props, ...state })
    assert.doesNotMatch(text(view), /Evento antigo|eventos cadastrados|Nenhum evento|possui eventos/)
    assert.ok(nodes(view).some(n => n.props.role === (state.erro ? 'alert' : 'status')))
  }
  assert.match(text(r.render({ eventos: [] })), /ainda não possui eventos cadastrados/)
  let view = r.render(props)
  nodes(view).find(n => n.type === 'input').props.onChange({ target: { value: 'inexistente' } })
  view = r.render(props)
  assert.match(text(view), /Nenhum evento encontrado para o filtro/)
})

function app(listarEventos) {
  return runtime('App.jsx', 'App', {
    useAutenticacao: () => ({ sessao: { perfil: 'organizador' } }), paginaAutorizada: p => p,
    useNavegacao() {}, useSessao: () => ({ aoSair() {} }),
    useRascunhosCustos: () => ({ rascunhos: {}, formularioCustosPendenteRef: { current: false } }),
    useCustosPersistidos: () => ({}), usePublicacaoCotacao: () => ({}),
    Layout: 'Layout', Eventos: 'Eventos', listarEventos,
    sessionStorage: { getItem: k => k === 'paginaAtual' ? 'eventos' : 'token' },
  })
}
const lista = view => nodes(view).find(n => n.type === 'Eventos')
test('App limpa dados após falha e permite repetir consulta com lista vazia confirmada', async () => {
  const resolvers = [], r = app(() => new Promise(resolve => resolvers.push(resolve)))
  assert.ok(lista(r.render()).props.carregando)
  resolvers.shift()(ok([{ id: 1, nome: 'Confirmado' }]))
  await tick()
  let view = lista(r.render())
  assert.equal(view.props.eventos.length, 1)
  view.props.aoTentarNovamente(); r.render()
  assert.equal(lista(r.render()).props.eventos.length, 0)
  resolvers.shift()({ ok: false }); await tick()
  view = lista(r.render())
  assert.ok(view.props.erro); assert.equal(view.props.carregando, false)
  assert.equal(view.props.eventos.length, 0)
  view.props.aoTentarNovamente(); r.render()
  resolvers.shift()(ok([])); await tick()
  view = lista(r.render())
  assert.equal(view.props.erro, ''); assert.equal(view.props.carregando, false)
  assert.equal(view.props.eventos.length, 0)
})

test('App ignora resposta anterior quando uma nova consulta já terminou', async () => {
  const resolvers = [], r = app(() => new Promise(resolve => resolvers.push(resolve)))
  lista(r.render()).props.aoTentarNovamente(); r.render()
  resolvers[1](ok([{ id: 2, nome: 'Novo' }])); await tick()
  resolvers[0](ok([{ id: 1, nome: 'Antigo' }])); await tick()
  assert.equal(lista(r.render()).props.eventos[0].nome, 'Novo')
})

function participante(fetch) {
  return runtime('pages/participante/PortalParticipante.jsx', 'PortalParticipante', {
    fetch, window: { confirm: () => true }, alert() {},
  })
}
const propsParticipante = { setPagina() {}, aoSair() {} }
const evento = { id: 3, nome: 'Evento real' }
function explorar(r) {
  button(r.render(propsParticipante), 'Explorar eventos').props.onClick()
  return r.render(propsParticipante)
}
test('participante bloqueia inscrição no carregamento, erro e detalhes; retry libera após consulta real', async () => {
  const pending = [], calls = []
  const r = participante((url, opts) => {
    calls.push([url, opts])
    return url.endsWith('/eventos') ? Promise.resolve(ok([evento])) : new Promise(resolve => pending.push(resolve))
  })
  r.render(propsParticipante); await tick()
  let view = explorar(r)
  assert.match(text(view), /Consultando suas inscrições/)
  let inscrever = button(view, 'Inscrever-se')
  assert.ok(inscrever.props.disabled)
  await inscrever.props.onClick()
  assert.ok(!calls.some(([, opts]) => opts?.method === 'POST'))
  button(view, 'Ver detalhes').props.onClick()
  assert.ok(button(r.render(propsParticipante), 'Inscrever-se').props.disabled)
  pending.shift()({ ok: false }); await tick()
  view = r.render(propsParticipante)
  assert.match(text(view), /Novas inscrições estão bloqueadas/)
  assert.ok(button(view, 'Inscrever-se').props.disabled)
  await button(view, 'Inscrever-se').props.onClick()
  assert.ok(!calls.some(([, opts]) => opts?.method === 'POST'))
  button(view, 'Tentar novamente').props.onClick(); r.render(propsParticipante)
  pending.shift()(ok([])); await tick()
  view = r.render(propsParticipante)
  assert.ok(!button(view, 'Inscrever-se').props.disabled)
  const post = button(view, 'Inscrever-se').props.onClick()
  assert.equal(calls.at(-1)[1].method, 'POST')
  assert.equal(JSON.parse(calls.at(-1)[1].body).evento_id, 3)
  pending.shift()(ok({ id: 5 })); await post
  r.render(propsParticipante)
  pending.shift()(ok([{ id: 5, evento_id: 3 }])); await tick()
  view = explorar(r)
  assert.ok(button(view, 'Já inscrito').props.disabled)
})

for (const response of [{ ok: false }, ok({ invalido: true })]) test('falha de eventos não aparece como ausência no participante', async () => {
  const r = participante(async url => url.endsWith('/eventos') ? response : ok([]))
  r.render(propsParticipante); await tick()
  const view = explorar(r)
  assert.ok(nodes(view).some(n => n.props.role === 'alert'))
  assert.doesNotMatch(text(view), /Nenhum evento encontrado/)
})

test('fornecedor abre cada proposta com campos vazios e exemplos apenas nos placeholders', async () => {
  let pagina = 'fornecedor-mural'
  const r = runtime('pages/fornecedor/PortalFornecedor.jsx', 'PortalFornecedor', {
    AbortController, IdentidadeConta: 'IdentidadeConta', formatarMoeda: String,
    fetch: async url => ok(url.endsWith('/cotacoes') ? [{ id: 1, evento_nome: 'Cotação', prazo: '2027-01-01', itens: [] }] : []),
  })
  const props = () => ({ pagina, setPagina: p => { pagina = p }, PerfilFornecedor: 'PerfilFornecedor' })
  r.render(props()); await tick()
  button(r.render(props()), 'Elaborar proposta').props.onClick()
  const fields = () => nodes(r.render(props())).filter(n => n.type === 'textarea' || n.type === 'input' && n.props.value !== undefined)
  assert.equal(fields().length, 3)
  fields().forEach(n => assert.equal(n.props.value, ''))
  fields().slice(1).forEach(n => assert.match(n.props.placeholder, /^Ex\.:/))
  fields()[1].props.onChange({ target: { value: 'Condição digitada' } })
  button(r.render(props()), 'Voltar para oportunidades').props.onClick()
  button(r.render(props()), 'Elaborar proposta').props.onClick()
  fields().forEach(n => assert.equal(n.props.value, ''))
})
