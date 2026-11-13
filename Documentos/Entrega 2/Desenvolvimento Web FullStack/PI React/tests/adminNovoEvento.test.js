import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { carregarAdmin, hooksAdmin, nodes, text } from './helpers/adminRuntime.js'
import { primitivasFixture } from './helpers/primitivasFixture.js'
import { lerDestinoNavegacao, urlDestinoNavegacao } from '../src/hooks/useNavegacao.js'
import { agendaBrasilia, validarFormularioEvento } from '../src/utils/validarEvento.js'
const tick = () => new Promise(r => setImmediate(r))
const storage = () => {
  const valores = new Map([['token', 'token-sintetico']])
  return { getItem: k => valores.get(k) || null, setItem: (k, v) => valores.set(k, v), removeItem: k => valores.delete(k) }
}
const api = carregarAdmin('services/adminEventos.js', ['criarEnvioAdmin', 'capacidadesAdminEventos'], { apiUrl: p => p })
const dados = { organizador_id: 7, nome: 'Sintético', data: '2099-01-01', horario: '10:00', local: 'Local', publico: 20 }

test('resultado incerto conserva chave/payload, bloqueia alterações e confirma replay sem duplicação', async () => {
  const s = storage(), calls = []
  let falhar = true
  const enviar = api.criarEnvioAdmin({ storage: s, uuid: () => 'uuid-sintetico', enviar: async (url, op) => {
    calls.push([url, op]); if (falhar) throw Error('Falha simulada')
    return { ok: true, json: async () => ({ evento: { id: 13, usuario_id: 7 } }) }
  } })
  await assert.rejects(enviar(dados), e => e.resultadoIncerto === true)
  assert.equal(s.getItem('adminEventoPendente'), '1')
  await assert.rejects(enviar({ ...dados, nome: 'Alterado' }), /não confirmada/)
  falhar = false; assert.equal((await enviar(dados)).id, 13)
  assert.equal(calls.length, 2)
  assert.equal(calls[0][1].headers['Idempotency-Key'], calls[1][1].headers['Idempotency-Key'])
  assert.equal(calls[0][1].body, calls[1][1].body)
  assert.equal(calls[0][1].method, 'POST'); assert.equal(calls[0][0], '/admin/eventos')
  assert.equal(s.getItem('adminEventoPendente'), null)
})
test('trava concorrente e resposta adulterada/incompleta não confirmam criação', async () => {
  const s = storage(); let finalizar, calls = 0
  const enviar = api.criarEnvioAdmin({ storage: s, uuid: () => 'chave', enviar: () => { calls++; return new Promise(r => { finalizar = r }) } })
  const p = enviar(dados)
  await assert.rejects(enviar(dados), /andamento/)
  finalizar({ ok: true, json: async () => ({ evento: { id: 13, usuario_id: 99 } }) })
  await assert.rejects(p, e => e.resultadoIncerto === true)
  assert.equal(calls, 1)
})
test('400 definitivo permite corrigir com nova chave; F5 com pendência e sessão ausente bloqueiam envio', async () => {
  const s = storage(); let n = 0, invalido = true
  const enviar = api.criarEnvioAdmin({ storage: s, uuid: () => String(++n), enviar: async () => invalido ?
    { ok: false, status: 400, json: async () => ({ erro: 'Dados inválidos', resultado_incerto: false }) } :
    { ok: true, json: async () => ({ evento: { id: 3, usuario_id: 7 } }) } })
  await assert.rejects(enviar(dados), e => e.resultadoIncerto === false)
  invalido = false; await enviar({ ...dados, nome: 'Corrigido' }); assert.equal(n, 2)
  s.setItem('adminEventoPendente', '1')
  await assert.rejects(api.criarEnvioAdmin({ storage: s, enviar: () => { throw Error('Envio não permitido') } })(dados), /anterior/)
  s.removeItem('token'); await assert.rejects(enviar(dados), /Sessão expirada/)
})

async function formulario({ capacidade = true, anterior = false, envio = async () => ({ id: 13, usuario_id: 7 }), consultarCapacidades = async () => ({ criar: capacidade, controleCapacidade: true }) } = {}) {
  const s = storage(); if (anterior) s.setItem('adminEventoPendente', '1')
  const destinos = [], calls = []
  const consulta = { dados: [{ id: 7, nome: 'Organizador sintético', perfil: 'organizador' }, { id: 10, nome: 'Admin sintético', perfil: 'admin' }], recarregar() {} }
  const h = hooksAdmin({ AbortController, sessionStorage: s, useConsultaAdmin: () => consulta, capacidadesAdminEventos: consultarCapacidades,
    criarEnvioAdmin: () => async d => { calls.push(d); return envio(d) }, CriarEvento: 'formulario', SkeletonAdmin: 'skeleton', ErroAdmin: 'erro' })
  const { AdminNovoEvento } = carregarAdmin('components/admin/AdminNovoEvento.jsx', ['AdminNovoEvento'], h.env)
  const render = () => h.render(AdminNovoEvento, { aoCancelar: () => destinos.push('eventos'), aoCriar: id => destinos.push(id) })
  assert.equal(render().type, 'skeleton'); await tick()
  return { render, consulta, calls, destinos, close: h.close }
}

for (const status of [undefined, 401, 403, 503]) test('capacidade: falha ' + status + ' bloqueia criação e nova tentativa distingue desativação', async () => {
  let consultas = 0
  const signals = []
  const f = await formulario({ consultarCapacidades: async ({ signal }) => {
    signals.push(signal)
    if (++consultas === 1) throw Object.assign(Error('Falha de capacidade'), { status })
    return { criar: false, controleCapacidade: false }
  } })
  let v = f.render()
  assert.equal(v.type, 'erro'); assert.equal(v.props.erro.status, status)
  assert.equal(v.props.rotuloAtualizar, 'Tentar novamente')
  assert.equal(nodes(v).some(n => n.type === 'formulario'), false)
  v.props.aoAtualizar(); assert.equal(f.render().type, 'skeleton')
  await tick(); v = f.render()
  assert.match(text(v), /indisponível/); assert.equal(consultas, 2)
  assert.equal(signals[0].aborted, true); assert.equal(f.calls.length, 0)
  f.close()
})

test('capacidade pendente, resposta sem confirmação positiva e resposta após desmontagem não liberam formulário', async () => {
  let terminar, signal
  const f = await formulario({ consultarCapacidades: ({ signal: s }) => { signal = s; return new Promise(r => { terminar = r }) } })
  assert.equal(f.render().type, 'skeleton'); assert.equal(f.calls.length, 0)
  f.close(); assert.equal(signal.aborted, true)
  terminar({ criar: true, controleCapacidade: true }); await tick()
  assert.equal(f.render().type, 'skeleton')
  const invalido = await formulario({ consultarCapacidades: async () => ({ criar: 'true' }) })
  assert.match(text(invalido.render()), /indisponível/); assert.equal(invalido.calls.length, 0)
  invalido.close()
})

test('serviço de capacidades propaga cancelamento e recusa respostas inválidas; erro 401 oferece login', async () => {
  const signal = new AbortController().signal, calls = []
  let resposta = { criar: false, controleCapacidade: false }
  const { capacidadesAdminEventos } = carregarAdmin('services/adminEventos.js', ['capacidadesAdminEventos'], { requisicaoAdmin: async (...args) => { calls.push(args); return resposta } })
  assert.equal((await capacidadesAdminEventos({ signal })).criar, false)
  assert.equal(calls[0][0], '/admin/eventos/capacidades'); assert.equal(calls[0][1].signal, signal)
  resposta = { criar: 'true' }; await assert.rejects(capacidadesAdminEventos(), /não confirmada/)
  const { ErroAdmin } = carregarAdmin('components/admin/AdminUI.jsx', ['ErroAdmin'])
  let saiu = 0, repetiu = 0
  for (const status of [401, 403]) {
    const v = ErroAdmin({ erro: Object.assign(Error('Falha'), { status }), rotuloAtualizar: 'Tentar novamente', aoSair() { saiu++ }, aoAtualizar() { repetiu++ } })
    const botao = nodes(v).find(n => n.type === 'button')
    assert.equal(text(botao), status === 401 ? 'Entrar novamente' : 'Tentar novamente'); botao.props.onClick()
  }
  assert.equal(saiu, 1); assert.equal(repetiu, 1)
})
test('formulário filtra organizadores, cancela sem escrever e abre painel apenas após confirmação', async () => {
  const f = await formulario()
  const select = nodes(f.render()).find(n => n.type === 'select')
  assert.equal(nodes(select).filter(n => n.type === 'option').length, 2)
  select.props.onChange({ target: { value: '7' } })
  let form = nodes(f.render()).find(n => n.type === 'formulario')
  form.props.setEvento(dados)
  form = nodes(f.render()).find(n => n.type === 'formulario')
  assert.equal(form.props.administrativo, true); assert.equal(form.props.podeSalvar, true)
  await form.props.aoAvancarParaCustos()
  assert.deepEqual(f.destinos, [13]); assert.equal(f.calls[0].organizador_id, 7)
  form.props.setPagina('eventos'); assert.deepEqual(f.destinos, [13, 'eventos']); f.close()
})
test('indisponível, organizadores ausentes, falha e reload pendente não permitem escrita nova', async () => {
  const bloqueado = await formulario({ capacidade: false }); assert.match(text(bloqueado.render()), /indisponível/); bloqueado.close()
  const reload = await formulario({ anterior: true }); assert.match(text(reload.render()), /tentativa anterior/)
  assert.equal(nodes(reload.render()).find(n => n.type === 'formulario').props.podeSalvar, false); reload.close()
  const f = await formulario({ envio: async () => { throw Object.assign(Error('Resultado incerto'), { resultadoIncerto: true }) } })
  f.consulta.dados = []; assert.match(text(f.render()), /Nenhum organizador/)
  assert.equal(nodes(f.render()).find(n => n.type === 'formulario').props.podeSalvar, false)
  f.consulta.dados = [{ id: 7, nome: 'Organizador', perfil: 'organizador' }]
  nodes(f.render()).find(n => n.type === 'select').props.onChange({ target: { value: '7' } })
  await nodes(f.render()).find(n => n.type === 'formulario').props.aoAvancarParaCustos()
  assert.equal(nodes(f.render()).find(n => n.type === 'formulario').props.podeSalvar, false)
  assert.ok(nodes(f.render()).some(n => n.type === 'button' && text(n) === 'Confirmar tentativa anterior'))
  assert.deepEqual(f.destinos, []); f.close()
})
test('formulário reutilizado em contexto admin não oferece custos, publicação ou imagens', () => {
  const h = hooksAdmin({ ...primitivasFixture, agendaBrasilia, validarFormularioEvento, VagasEvento: 'vagas', MidiaEvento: 'midia' })
  const { CriarEvento } = carregarAdmin('pages/organizador/CriarEvento.jsx', ['CriarEvento'], h.env)
  const v = h.render(CriarEvento, { administrativo: true, evento: dados, podeSalvar: true, setPagina() {}, setEvento() {} })
  assert.equal(nodes(v).some(n => n.type === 'midia'), false)
  assert.doesNotMatch(text(v), /Custos & Cotações|Ticket e Viabilidade|Imagens do evento/)
  assert.match(text(v), /Criar evento em planejamento/)
  assert.equal(nodes(v).filter(n => n.type === 'h1').length, 1)
})
test('URL administrativa restaura seção vazia sem conceder acesso ao fluxo do Organizador', () => {
  const u = '#/admin?secao=novo-evento'
  assert.equal(urlDestinoNavegacao(lerDestinoNavegacao(u)), u)
  assert.equal(lerDestinoNavegacao(u + '&evento=7'), null)
  const { AdminMenu } = carregarAdmin('components/admin/AdminPortal.jsx', ['AdminMenu'], { Icone: 'icone' })
  const destinos = []
  let v = AdminMenu({ secao: 'novo-evento', criacaoDisponivel: false, setSecao: s => destinos.push(s) })
  assert.equal(nodes(v).find(n => n.props.className === 'adminNovo').props.disabled, true)
  v = AdminMenu({ secao: 'novo-evento', criacaoDisponivel: true, setSecao: s => destinos.push(s) })
  const b = nodes(v).find(n => n.props.className === 'adminNovo'); b.props.onClick()
  assert.equal(b.props['aria-current'], 'page'); assert.deepEqual(destinos, ['novo-evento'])
})
test('estilos exclusivos mantêm campos de largura flexível, toque e foco', () => {
  const css = postcss.parse(readFileSync(new URL('../src/components/admin/AdminNovoEvento.css', import.meta.url), 'utf8'))
  css.walkRules(r => r.selectors.forEach(s => assert.ok(s.startsWith('.admNovoEvento'))))
  assert.match(css.toString(), /min-height: 44px/); assert.match(css.toString(), /:focus-visible/)
  assert.doesNotMatch(css.toString(), /overflow-x:\s*hidden/)
})

test('seção nova usa foco contextual existente e navega ao painel só com confirmação', () => {
  const nav = { estado: { secao: 'novo-evento', eventoId: null, cotacaoId: null }, mudar(d) { this.estado = d } }
  const h = hooksAdmin({ AdminNovoEvento: 'novo', NavegacaoRecolhivel: 'menu', Marca: 'marca' })
  const { AdminPortal } = carregarAdmin('components/admin/AdminPortal.jsx', ['AdminPortal'], h.env)
  const render = () => h.render(AdminPortal, { navegacao: nav })
  let focos = 0
  nodes(render()).find(n => n.type === 'main').props.ref.current = { focus() { focos++ } }
  nodes(render()).find(n => n.type === 'novo').props.aoCriar(13)
  const v = render()
  assert.equal(nav.estado.secao, 'painel'); assert.equal(nav.estado.eventoId, 13)
  assert.equal(focos, 1)
  assert.match(text(v), /criado para o organizador/)
  h.close()
})
