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
function load(file, name, env) {
  const source = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/gm, '').replaceAll('export function ', 'function ')
    .replaceAll('export async function ', 'async function ').replaceAll('export const ', 'const ')
    .replace(/^export default .*$/gm, '')
  const result = transformSync(file, source, { jsx: { runtime: 'classic', pragma: 'jsx', pragmaFrag: 'Fragment' } })
  assert.equal(result.errors.length, 0)
  return vm.runInNewContext(result.code + '\n' + name, { jsx, Fragment: 'fragment', Icone: 'svg', ...env })
}
function runtime(dados = {}, fetch = async () => { throw Error('Rede inesperada') }) {
  const storage = new Map(Object.entries(dados)), cells = [], effects = []
  let cursor = 0
  const env = {
    sessionStorage: {
      getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k),
    }, fetch, apiUrl: p => p, AbortController,
    useState(initial) {
      const i = cursor++
      if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial
      return [cells[i], value => { cells[i] = typeof value === 'function' ? value(cells[i]) : value }]
    },
    useRef(initial) { const i = cursor++; return cells[i] ?? (cells[i] = { current: initial }) },
    useEffect(fn, deps) {
      const i = cursor++
      if (!cells[i] || deps.some((d, j) => d !== cells[i].deps[j])) effects.push(() => {
        cells[i]?.cleanup?.(); cells[i] = { deps, cleanup: fn() }
      })
    },
  }
  const service = load('services/autenticacao.js', '({ validarSessao, paginaAutorizada, paginasPorPerfil })', env)
  Object.assign(env, service)
  return { env, storage, service,
    render(fn, props) { cursor = 0; const result = fn(props); effects.splice(0).forEach(fn => fn()); return result },
  }
}
const rotas = { participante: '/participante/inscricoes', organizador: '/cotacoes', fornecedor: '/fornecedor/propostas', admin: '/admin/eventos' }
const response = (status, data) => ({ ok: status === 200, status, json: async () => data })
const api = (perfil, calls = []) => async (url, options) => {
  calls.push([url, options])
  return url === '/perfil' ? response(200, { id: 7, nome: 'Conta', email: 'conta@example.invalid' })
    : response(url === rotas[perfil] ? 200 : 403, [])
}

test('sem sessão: nenhum painel ou destino desconhecido é autorizado, sem consultar API', async () => {
  const r = runtime({ perfil: 'admin', paginaAtual: 'admin' })
  const hook = load('hooks/useAutenticacao.js', 'useAutenticacao', r.env)
  r.render(hook, 'admin'); await tick()
  assert.equal(r.render(hook, 'admin').sessao, null)
  for (const pagina of [...Object.values(r.service.paginasPorPerfil).flat(), 'desconhecida']) {
    assert.equal(r.service.paginaAutorizada(pagina), 'login')
  }
})

for (const status of [401, 500]) test(`recarregamento com sessão rejeitada (${status}) fecha acesso e limpa storage`, async () => {
  const r = runtime({ token: 'invalido', perfil: 'admin', paginaAtual: 'admin' }, async () => response(status))
  const hook = load('hooks/useAutenticacao.js', 'useAutenticacao', r.env)
  assert.equal(r.render(hook, 'admin').sessao, null); await tick()
  const result = r.render(hook, 'admin')
  assert.equal(result.sessao, null); assert.equal(result.verificando, false); assert.ok(result.erro)
  assert.equal(r.storage.size, 0)
})

for (const perfil of Object.keys(rotas)) test(`perfil ${perfil}: servidor prevalece sobre perfil adulterado e restaura somente destinos permitidos`, async () => {
  const calls = [], r = runtime({ token: 'valido', perfil: 'admin' }, api(perfil, calls))
  const hook = load('hooks/useAutenticacao.js', 'useAutenticacao', r.env)
  assert.equal(r.render(hook, 'admin').sessao, null); await tick()
  const result = r.render(hook, 'admin')
  assert.equal(result.sessao.perfil, perfil)
  for (const [dono, paginas] of Object.entries(r.service.paginasPorPerfil)) {
    for (const pagina of paginas) assert.equal(r.service.paginaAutorizada(pagina, perfil), dono === perfil ? pagina : r.service.paginasPorPerfil[perfil][0])
  }
  calls.forEach(([, opts]) => assert.equal(opts.headers.Authorization, 'Bearer valido'))
})

test('navegação revalida sem desmontar o portal; token substituído oculta a sessão anterior', async () => {
  const r = runtime({ token: 'valido', perfil: 'fornecedor' }, api('fornecedor'))
  const hook = load('hooks/useAutenticacao.js', 'useAutenticacao', r.env)
  r.render(hook, 'fornecedor-mural'); await tick()
  assert.ok(r.render(hook, 'fornecedor-mural').sessao)
  assert.ok(r.render(hook, 'fornecedor-enviadas').sessao)
  await tick(); assert.ok(r.render(hook, 'fornecedor-enviadas').sessao)
  r.storage.set('token', 'substituido')
  assert.equal(r.render(hook, 'fornecedor-enviadas').sessao, null)
})

for (const perfil of Object.keys(rotas)) test(`login válido ${perfil}: POST real do componente e validação antes de persistir sessão`, async () => {
  const r = runtime({}, api(perfil)), alerts = []
  const hook = load('hooks/useAutenticacao.js', 'useAutenticacao', r.env)
  r.render(hook, 'login'); await tick()
  const autenticar = r.render(hook, 'login').iniciarSessao
  let destino, post
  const login = load('pages/auth/Login.jsx', 'Login', {
    ...r.env, alert: m => alerts.push(m), console,
    fetch: async (url, options) => { post = [url, options]; return response(200, { token: 'login-valido', usuario: { perfil } }) },
  })
  const props = { setPagina() {}, aoAutenticarSessao: async (token, dica) => {
    assert.equal(r.storage.has('token'), false)
    const validado = await autenticar(token, dica)
    destino = r.service.paginasPorPerfil[validado][0]
  } }
  await nodes(r.render(login, props)).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.equal(post[0], '/login'); assert.equal(post[1].method, 'POST')
  assert.equal(r.storage.get('token'), 'login-valido'); assert.equal(r.storage.get('perfil'), perfil)
  assert.equal(destino, r.service.paginasPorPerfil[perfil][0]); assert.equal(alerts.length, 0)
})

test('SSO, recuperação e lembrar dispositivo permanecem desabilitados e sem navegação', () => {
  const r = runtime(), login = load('pages/auth/Login.jsx', 'Login', r.env)
  const view = r.render(login, { setPagina() {} })
  for (const label of ['Google Workspace / SSO', 'Esqueci minha senha']) {
    const button = nodes(view).find(n => n.type === 'button' && text(n).includes(label))
    assert.ok(button.props.disabled); assert.equal(button.props.onClick, undefined)
  }
  const checkbox = nodes(view).find(n => n.type === 'input' && n.props.type === 'checkbox')
  assert.ok(checkbox.props.disabled); assert.equal(checkbox.props.defaultChecked, undefined)
})

function appRuntime(dados, fetch) {
  const r = runtime(dados, fetch)
  Object.assign(r.env, {
    useAutenticacao: load('hooks/useAutenticacao.js', 'useAutenticacao', r.env),
    useNavegacao() {}, useSessao: () => ({ aoSair() {} }),
    useRascunhosCustos: () => ({ rascunhos: {}, formularioCustosPendenteRef: { current: false } }),
    useCustosPersistidos: () => ({}), usePublicacaoCotacao: () => ({}),
    Layout: 'Layout', ProvedorImagensEvento: 'provedor', capacidadesEventos:async()=>response(200,{criar:true,editar:true,inscrever:true}), AdminPortal: 'AdminPortal', PortalFornecedor: 'PortalFornecedor',
    PortalParticipante: 'PortalParticipante', Login: 'Login', Cadastro: 'Cadastro', Eventos: 'Eventos',
  })
  const app = load('App.jsx', 'App', r.env)
  return { ...r, renderApp: () => {const view=r.render(app);return view.type==='provedor'?view.children[0]:view} }
}

test('App com painel salvo e sem token exibe somente login após carregar', async () => {
  const r = appRuntime({ paginaAtual: 'admin', perfil: 'admin' })
  assert.equal(r.renderApp().props.role, 'status'); await tick()
  assert.equal(r.renderApp().type, 'Login')
})

test('App preserva PortalFornecedor ao abrir elaboração e revalidar a sessão', async () => {
  const calls = []
  const r = appRuntime({ token: 'valido', perfil: 'fornecedor', paginaAtual: 'fornecedor-mural' }, api('fornecedor', calls))
  r.renderApp(); await tick()
  const mural = r.renderApp()
  assert.equal(mural.type, 'PortalFornecedor')
  mural.props.setPagina('fornecedor-proposta')
  const proposta = r.renderApp()
  assert.equal(proposta.type, mural.type)
  assert.equal(proposta.props.pagina, 'fornecedor-proposta')
  await tick()
  assert.equal(r.renderApp().props.pagina, 'fornecedor-proposta')
  assert.equal(calls.filter(([url]) => url === '/perfil').length, 2)
})

test('sessão revogada durante navegação volta ao login e limpa token', async () => {
  let revogada = false
  const permitir = api('fornecedor')
  const r = appRuntime({ token: 'valido', perfil: 'fornecedor', paginaAtual: 'fornecedor-mural' }, (...args) => revogada ? response(401) : permitir(...args))
  r.renderApp(); await tick()
  revogada = true
  r.renderApp().props.setPagina('fornecedor-enviadas')
  r.renderApp(); await tick()
  assert.equal(r.renderApp().type, 'Login')
  assert.equal(r.storage.has('token'), false)
})

for (const [perfil, painel] of Object.entries({ participante: 'PortalParticipante', organizador: 'Layout', fornecedor: 'PortalFornecedor', admin: 'AdminPortal' })) {
  test(`App restaura ${perfil} somente após validação e impede acesso a painel de outro perfil`, async () => {
    const r = appRuntime({ token: 'valido', perfil: 'admin', paginaAtual: perfil === 'admin' ? 'fornecedor-mural' : 'admin' }, api(perfil))
    assert.equal(r.renderApp().props.role, 'status')
    await tick()
    assert.equal(r.renderApp().type, painel)
  })
}
