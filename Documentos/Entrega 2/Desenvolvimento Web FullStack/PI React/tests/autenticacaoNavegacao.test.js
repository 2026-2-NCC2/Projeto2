import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { setImmediate } from 'node:timers'
import { transformSync } from 'rolldown/utils'
import { primitivasFixture } from './helpers/primitivasFixture.js'
import { historicoFixture } from './helpers/historicoFixture.js'

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
  return vm.runInNewContext(result.code + '\n' + name, { jsx, Fragment: 'fragment', Marca: 'marca', Icone: 'svg', ...env })
}
function runtime(dados = {}, fetch = async () => { throw Error('Rede inesperada') }) {
  const storage = new Map(Object.entries(dados)), cells = [], effects = []
  let cursor = 0
  const env = {
    sessionStorage: {
      getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k),
    }, fetch, apiUrl: p => p, AbortController,
    Campo: 'Campo', Botao: 'Botao', Alerta: 'Alerta', lerAvisoCadastro: () => '', limparAvisoCadastro() {},
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
    close() { cells.forEach(c => c?.cleanup?.()) },
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

function appRuntime(dados, fetch, { logoutReal = false, pendencias = false, confirmar = true, browser, formularioPendente = false } = {}) {
  const r = runtime(dados, fetch)
  if (browser) r.env.window = { ...browser.window, confirm: () => confirmar }
  r.env.lerDestinoNavegacao = load('hooks/useNavegacao.js', 'lerDestinoNavegacao', r.env)
  r.env.consultarEvento = load('services/eventos.js', 'consultarEvento', r.env)
  r.env.rascunhoCustosTemAlteracoes = load('utils/rascunhosCustos.js', 'rascunhoCustosTemAlteracoes', r.env)
  Object.assign(r.env, {
    useAutenticacao: load('hooks/useAutenticacao.js', 'useAutenticacao', r.env),
    useHistoricoNavegacao: load('hooks/useNavegacao.js', 'useHistoricoNavegacao', r.env),
    useNavegacao() {}, useSessao: () => ({ aoSair() {} }),
    useRascunhosCustos: () => ({ rascunhos: {}, formularioCustosPendenteRef: { current: formularioPendente }, formularioCustosPendente: formularioPendente,
      setRascunhos() {}, setFormularioCustosPendente() {}, setContextoFormularioCustos() {}, garantirRascunho() {}, removerRascunho() {}, temRascunhos: pendencias }),
    useCustosPersistidos: () => ({}), usePublicacaoCotacao: () => ({}),
    Layout: 'Layout', Custos: 'Custos', Cotacao: 'Cotacao', Ticket: 'Ticket', CriarEvento: 'CriarEvento', PerfilOrganizador: 'PerfilOrganizador', ProvedorImagensEvento: 'provedor', capacidadesEventos:async()=>response(200,{criar:true,editar:true,inscrever:true}), AdminPortal: 'AdminPortal', PortalFornecedor: 'PortalFornecedor',
    PortalParticipante: 'PortalParticipante', SolicitarAcesso: 'SolicitarAcesso', Login: 'Login', EntradaPublica: 'EntradaPublica', Cadastro: 'Cadastro', Eventos: 'Eventos', Skeleton: primitivasFixture.Skeleton,
  })
  if (logoutReal) {
    r.env.useCallback = fn => fn
    r.env.window = { ...r.env.window, confirm: () => confirmar }
    r.env.useSessao = load('hooks/useSessao.js', 'useSessao', r.env)
  }
  const app = load('App.jsx', 'App', r.env)
  return { ...r, renderApp: () => {
    const view = r.render(app)
    if (view.type === primitivasFixture.Skeleton) return primitivasFixture.Skeleton(view.props)
    return view.type === 'provedor' ? view.children[0] : view
  } }
}

test('App com painel salvo e sem token apresenta entrada pública sem autorizar o painel', async () => {
  const r = appRuntime({ paginaAtual: 'admin', perfil: 'admin' })
  assert.equal(r.renderApp().props.role, 'status'); await tick()
  const entrada = r.renderApp()
  assert.equal(entrada.type, 'EntradaPublica')
  assert.equal(entrada.props.iniciarNoLogin, false)
  assert.equal(entrada.children[0].type, 'Login')
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
  const entrada = r.renderApp()
  assert.equal(entrada.type, 'EntradaPublica')
  assert.equal(entrada.props.iniciarNoLogin, true)
  assert.equal(entrada.children[0].type, 'Login')
  assert.match(entrada.children[0].props.erroSessao, /validar sua sessão/)
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

for (const [perfil, painel] of Object.entries({ participante: 'PortalParticipante', organizador: 'Layout', fornecedor: 'PortalFornecedor', admin: 'AdminPortal' })) {
  for (const paginaAtual of [undefined, 'login', 'cadastro']) test(`sessão válida ${perfil}, página ${paginaAtual || 'ausente'}: portal confirmado em vez de landing/login`, async () => {
    const dados = { token: 'valido', perfil }
    if (paginaAtual) dados.paginaAtual = paginaAtual
    const r = appRuntime(dados, api(perfil))
    assert.equal(r.renderApp().props.role, 'status')
    await tick()
    assert.equal(r.renderApp().type, painel)
    assert.equal(nodes(r.renderApp()).some(n => n.type === 'EntradaPublica' || n.type === 'Login'), false)
  })
}

test('restauração pendente não monta landing, login nem portal e não limpa a sessão', async () => {
  let concluir
  const dados = { token: 'pendente', perfil: 'participante', paginaAtual: 'participante' }
  const permitir = api('participante')
  const r = appRuntime(dados, (url, options) => url === '/perfil'
    ? new Promise(resolve => { concluir = () => resolve(response(200, { id: 7 })) }) : permitir(url, options))
  for (let i = 0; i < 3; i++) {
    const v = r.renderApp()
    assert.equal(v.props.role, 'status')
    assert.equal(v.props['aria-busy'], 'true')
    assert.match(v.props.className, /sessaoSkeleton/)
    const status = nodes(v).find(n => n.props.className === 'ttSrOnly')
    assert.equal(text(status), 'Validando sessão...')
    assert.equal(nodes(v).some(n => ['input', 'button', 'a', 'Login', 'EntradaPublica', 'PortalParticipante'].includes(n.type)), false)
  }
  assert.equal(r.storage.get('token'), 'pendente')
  concluir(); await tick()
  assert.equal(r.renderApp().type, 'PortalParticipante')
})

for (const [perfil, painel] of Object.entries({ participante: 'PortalParticipante', organizador: 'Layout', fornecedor: 'PortalFornecedor', admin: 'AdminPortal' })) {
  test(`login recebido pela entrada pública mantém validação e encaminha ${perfil}`, async () => {
    const calls = [], r = appRuntime({}, api(perfil, calls))
    r.renderApp(); await tick()
    const login = r.renderApp().children[0]
    assert.equal(login.type, 'Login')
    assert.equal(r.storage.has('token'), false)
    await login.props.aoAutenticarSessao('valido', perfil)
    assert.equal(r.storage.get('token'), 'valido')
    assert.equal(r.storage.get('perfil'), perfil)
    assert.equal(r.renderApp().type, painel)
    assert.equal(calls[0][0], '/perfil')
    assert.ok(calls.every(([, options]) => !options.method || options.method === 'GET'))
  })
}

test('logout real confirmado limpa sessão e volta à apresentação sem consultas extras', async () => {
  const calls = [], r = appRuntime({ token: 'valido', perfil: 'participante', paginaAtual: 'participante' }, api('participante', calls), { logoutReal: true })
  r.renderApp(); await tick()
  const total = calls.length
  r.renderApp().props.aoSair()
  for (const chave of ['token', 'perfil', 'paginaAtual']) assert.equal(r.storage.has(chave), false)
  const entrada = r.renderApp()
  assert.equal(entrada.type, 'EntradaPublica')
  assert.equal(entrada.props.iniciarNoLogin, false)
  await tick(); assert.equal(calls.length, total)
})

test('cancelar logout real preserva sessão e portal mesmo com a entrada pública integrada', async () => {
  const r = appRuntime({ token: 'valido', perfil: 'participante', paginaAtual: 'participante' }, api('participante'), { logoutReal: true, pendencias: true, confirmar: false })
  r.renderApp(); await tick()
  r.renderApp().props.aoSair()
  assert.equal(r.storage.get('token'), 'valido')
  assert.equal(r.storage.get('perfil'), 'participante')
  assert.equal(r.storage.get('paginaAtual'), 'participante')
  assert.equal(r.renderApp().type, 'PortalParticipante')
})

test('histórico real do App retorna Landing/Login e preserva o destino interno antes de um site externo', async () => {
  const browser = historicoFixture(), r = appRuntime({}, undefined, { browser })
  r.renderApp(); await tick()
  r.renderApp().props.navegacao.mudar({ login: true }); r.renderApp()
  browser.back(); assert.equal(r.renderApp().props.navegacao.estado.login, false)
  browser.forward(); assert.equal(r.renderApp().props.navegacao.estado.login, true)
  browser.back(); r.renderApp(); browser.back(); assert.equal(browser.saiu(), true)
  assert.equal(r.storage.size, 0)
})

test('Back entre Solicitar acesso e participante restaura a seção sem perder perfil ou sessão', async () => {
  const browser = historicoFixture(), r = appRuntime({ token: 'valido', perfil: 'participante', paginaAtual: 'participante' }, api('participante'), { browser })
  r.renderApp(); await tick()
  r.renderApp().props.navegacao.mudar({ aba: 'perfil', eventoId: null }); r.renderApp()
  r.renderApp().props.setPagina('solicitar-acesso'); r.renderApp(); await tick()
  assert.equal(r.renderApp().type, 'SolicitarAcesso')
  browser.back()
  const v = r.renderApp()
  assert.equal(v.type, 'PortalParticipante'); assert.equal(v.props.navegacao.estado.aba, 'perfil')
  assert.equal(r.storage.get('token'), 'valido'); assert.equal(r.storage.get('perfil'), 'participante')
})

test('Back pode retornar à apresentação sem logout; após logout, Avançar não restaura acesso protegido', async () => {
  const browser = historicoFixture(), r = appRuntime({}, api('participante'), { browser, logoutReal: true })
  r.renderApp(); await tick()
  r.renderApp().props.navegacao.mudar({ login: true }); r.renderApp()
  await r.renderApp().children[0].props.aoAutenticarSessao('valido', 'participante')
  r.renderApp().props.navegacao.mudar({ aba: 'perfil', eventoId: null }); r.renderApp()
  browser.back(); r.renderApp(); browser.back(); r.renderApp()
  assert.equal(r.renderApp().type, 'EntradaPublica')
  assert.equal(r.storage.get('token'), 'valido')
  browser.forward(); r.renderApp()
  r.renderApp().props.aoSair(); r.renderApp()
  browser.forward(); r.renderApp()
  assert.equal(r.renderApp().type, 'EntradaPublica')
  assert.equal(r.storage.has('token'), false)
})

test('Back no App respeita o cancelamento de descarte dos campos de custos e mantém sessão', async () => {
  const browser = historicoFixture(), r = appRuntime({ token: 'valido', perfil: 'organizador', paginaAtual: 'eventos' }, api('organizador'), { browser, formularioPendente: true, confirmar: false })
  r.renderApp(); await tick()
  r.renderApp().props.setPagina('custos'); r.renderApp(); await tick()
  assert.equal(r.renderApp().props.pagina, 'custos')
  browser.back(); assert.equal(r.renderApp().props.pagina, 'custos')
  assert.equal(r.storage.get('token'), 'valido')
})

async function estabilizarApp(r) {
  let v
  for (let i = 0; i < 4; i++) { v = r.renderApp(); await tick() }
  return v
}

for (const [perfil, url, componente, dados] of [
  ['participante', '#/participante?secao=perfil', 'PortalParticipante', { aba: 'perfil', eventoId: null }],
  ['participante', '#/participante?secao=detalhes&evento=4', 'PortalParticipante', { aba: 'detalhes', eventoId: 4 }],
  ['admin', '#/admin?secao=propostas', 'AdminPortal', { secao: 'propostas', eventoId: null, cotacaoId: null }],
  ['admin', '#/admin?secao=painel&evento=5', 'AdminPortal', { secao: 'painel', eventoId: 5, cotacaoId: null }],
  ['fornecedor', '#/fornecedor-proposta?cotacao=8', 'PortalFornecedor', { cotacaoId: 8 }],
]) test('F5/acesso direto restaura somente após validar a sessão: ' + url, async () => {
  const browser = historicoFixture({ hash: url })
  const sessao = { token: 'valido', perfil, paginaAtual: 'admin' }
  const r = appRuntime(sessao, api(perfil), { browser })
  assert.equal(r.renderApp().props.role, 'status')
  const v = await estabilizarApp(r)
  assert.equal(v.type, componente)
  assert.deepEqual(JSON.parse(JSON.stringify(v.props.navegacao.estado)), dados)
  const n = browser.entradas.length
  assert.equal(n, 2); assert.equal(browser.window.location.hash, url)
  r.close()
  const recarregado = appRuntime(Object.fromEntries(r.storage), api(perfil), { browser })
  assert.equal(recarregado.renderApp().props.role, 'status')
  const novo = await estabilizarApp(recarregado)
  assert.equal(novo.type, componente)
  assert.deepEqual(JSON.parse(JSON.stringify(novo.props.navegacao.estado)), dados)
  assert.equal(browser.entradas.length, n)
})

test('F5 do Login e da Landing preserva apresentação sem inferir permissão do storage', async () => {
  for (const [hash, login] of [['#/entrar', true], ['#/inicio', false]]) {
    const browser = historicoFixture({ hash }), r = appRuntime({ paginaAtual: 'admin', perfil: 'admin' }, undefined, { browser })
    const v = await estabilizarApp(r)
    assert.equal(v.type, 'EntradaPublica'); assert.equal(v.props.navegacao.estado.login, login)
    assert.equal(browser.entradas.length, 2)
  }
})

test('URL de outro perfil e sessão rejeitada não montam portais não autorizados', async () => {
  for (const perfil of [null, 'participante', 'fornecedor']) {
    const browser = historicoFixture({ hash: '#/admin?secao=usuarios' })
    const r = appRuntime(perfil ? { token: 'valido', perfil } : { token: 'invalido', perfil: 'admin' }, perfil ? api(perfil) : async () => response(401), { browser })
    assert.equal(r.renderApp().props.role, 'status')
    const v = await estabilizarApp(r)
    assert.notEqual(v.type, 'AdminPortal')
    assert.equal(v.type, perfil === 'participante' ? 'PortalParticipante' : perfil === 'fornecedor' ? 'PortalFornecedor' : 'EntradaPublica')
    if (!perfil) assert.equal(r.storage.has('token'), false)
  }
})

test('F5 em custos reconstrói evento por GET autorizado antes de mostrar o formulário', async () => {
  const browser = historicoFixture({ hash: '#/custos?evento=7' }), calls = []
  let concluirEvento
  const permitir = api('organizador', calls)
  const r = appRuntime({ token: 'valido', perfil: 'organizador' }, (url, options) => {
    if (url === '/eventos/7') {
      calls.push([url, options])
      return new Promise(resolve => { concluirEvento = () => resolve(response(200, { id: 7, nome: 'Evento sintético', data: '2030-01-01', horario: '10:00', versao: 1 })) })
    }
    return permitir(url, options)
  }, { browser })
  r.renderApp(); await tick(); r.renderApp(); await tick()
  assert.equal(r.renderApp().props.role, 'status')
  concluirEvento(); await tick()
  const v = await estabilizarApp(r)
  assert.equal(v.type, 'Layout'); assert.equal(v.props.pagina, 'custos')
  const custos = nodes(v).find(n => n.type === 'Custos')
  assert.equal(custos.props.evento.id, 7)
  assert.equal(browser.window.location.hash, '#/custos?evento=7')
  assert.ok(calls.every(([, opts]) => !opts.method || opts.method === 'GET'))
})

test('evento sem acesso na URL não preenche formulário e retorna à listagem autorizada', async () => {
  const browser = historicoFixture({ hash: '#/custos?evento=999' }), permitir = api('organizador')
  const r = appRuntime({ token: 'valido', perfil: 'organizador' }, (url, options) => url === '/eventos/999' ? response(403) : permitir(url, options), { browser })
  const v = await estabilizarApp(r)
  assert.equal(v.props.pagina, 'eventos')
  assert.equal(nodes(v).some(n => n.type === 'Custos'), false)
  assert.equal(browser.window.location.hash, '#/eventos')
})

test('navegar durante GET de restauração impede aplicação tardia do evento e preserva sessão', async () => {
  const browser = historicoFixture({ hash: '#/custos?evento=7' }), permitir = api('organizador')
  let concluir
  const r = appRuntime({ token: 'valido', perfil: 'organizador' }, (url, options) => url === '/eventos/7'
    ? new Promise(resolve => { concluir = () => resolve(response(200, { id: 7, nome: 'Evento sintético' })) })
    : permitir(url, options), { browser })
  r.renderApp(); await tick(); r.renderApp(); await tick()
  assert.equal(r.renderApp().props.role, 'status')
  browser.emitir(null, '#/inicio'); await estabilizarApp(r)
  concluir(); await tick()
  assert.equal(r.renderApp().type, 'EntradaPublica')
  assert.equal(r.storage.get('token'), 'valido')
  assert.equal(browser.window.location.hash, '#/inicio')
})

test('troca de sessão durante restauração de evento não aplica dados da conta anterior', async () => {
  let concluir
  const browser = historicoFixture({ hash: '#/custos?evento=7' })
  const r = appRuntime({ token: 'valido', perfil: 'organizador' }, (url, opts) => {
    if (url === '/eventos/7') return new Promise(resolve => { concluir = () => resolve(response(200, { id: 7, nome: 'CONTEUDO_ANTERIOR_PROIBIDO' })) })
    return api(opts.headers.Authorization === 'Bearer outra-sessao' ? 'fornecedor' : 'organizador')(url, opts)
  }, { browser })
  r.renderApp(); await tick(); r.renderApp(); await tick()
  assert.equal(r.renderApp().props.role, 'status')
  r.storage.set('token', 'outra-sessao'); r.storage.set('perfil', 'fornecedor')
  assert.equal(r.renderApp().props.role, 'status')
  await estabilizarApp(r); concluir(); await tick()
  const v = r.renderApp()
  assert.equal(v.type, 'PortalFornecedor')
  assert.doesNotMatch(text(v), /CONTEUDO_ANTERIOR_PROIBIDO/)
  assert.equal(r.storage.get('token'), 'outra-sessao')
  r.close()
})

test('URL pública explícita pode ser restaurada com sessão válida sem logout forçado', async () => {
  const browser = historicoFixture({ hash: '#/entrar' }), r = appRuntime({ token: 'valido', perfil: 'participante' }, api('participante'), { browser })
  const v = await estabilizarApp(r)
  assert.equal(v.type, 'EntradaPublica')
  assert.equal(v.props.navegacao.estado.login, true)
  assert.equal(r.storage.get('token'), 'valido')
  assert.equal(browser.window.location.hash, '#/entrar')
  r.close()
})
