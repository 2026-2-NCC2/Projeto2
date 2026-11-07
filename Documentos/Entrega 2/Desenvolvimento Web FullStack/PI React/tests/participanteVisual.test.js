import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { carregarAdmin, hooksAdmin, nodes, text } from './helpers/adminRuntime.js'
import { primitivasFixture, jsxPrimitivas } from './helpers/primitivasFixture.js'

const ok = dados => ({ ok: true, json: async () => dados })
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const evento = { id: 4, nome: 'Evento sintético', categoria: 'Workshop', local: 'Local sintético', status: 'Ativo', lotado: false }
function participante({ eventos = [evento], ingressos = [], fetch, capacidades = { inscrever: true }, confirmar = true } = {}) {
  const chamadas = [], confirmacoes = [], avisos = [], destinos = []
  let saidas = 0
  const h = hooksAdmin({ ...primitivasFixture, jsx: jsxPrimitivas, Icone: 'svg', PerfilPessoal: 'perfil',
    MidiaEvento: 'midia', CapaEvento: 'capa', VagasEvento: 'vagas', apiUrl: p => p,
    sessionStorage: { getItem: () => 'token-sintetico' }, console: { error() {} }, alert: m => avisos.push(m),
    window: { confirm: m => { confirmacoes.push(m); return confirmar } },
    capacidadesEventos: async () => ok(capacidades),
    fetch: async (url, opcoes) => { chamadas.push([url, opcoes]); return fetch ? fetch(url, opcoes) : ok(url.endsWith('/eventos') ? eventos : ingressos) },
  })
  const fn = carregarAdmin('pages/participante/PortalParticipante.jsx', ['PortalParticipante'], h.env).PortalParticipante
  const render = () => h.render(fn, { setPagina: p => destinos.push(p), aoSair: () => saidas++ })
  const navegar = label => { botao(render(), label).props.onClick(); return render() }
  return { render, navegar, chamadas, confirmacoes, avisos, destinos, saidas: () => saidas }
}
function botao(v, nome) { return nodes(v).find(n => n.type === 'button' && text(n).trim() === nome) }

test('participante anuncia skeletons sem apresentar ausencias durante consultas pendentes', () => {
  const p = participante({ fetch: () => new Promise(() => {}) })
  assert.match(text(p.render()), /Consultando quantidade de eventos/)
  const eventos = p.navegar('Explorar eventos')
  assert.match(text(eventos), /Carregando eventos/); assert.match(text(eventos), /Consultando suas inscrições/)
  assert.doesNotMatch(text(eventos), /Nenhum evento disponível|Nenhum resultado/)
  const ingressos = p.navegar('Meus ingressos')
  assert.match(text(ingressos), /Consultando suas inscrições/)
  assert.doesNotMatch(text(ingressos), /Você ainda não possui inscrições/)
})

test('nenhum evento disponivel e nenhum resultado dos filtros sao estados distintos', async () => {
  const vazio = participante({ eventos: [] }); vazio.render(); await tick()
  assert.match(text(vazio.navegar('Explorar eventos')), /Nenhum evento disponível/)
  const p = participante(); p.render(); await tick()
  const view = p.navegar('Explorar eventos')
  const campo = nodes(view).find(n => n.type === 'input' && n.props.id === 'participante-busca')
  assert.ok(nodes(view).some(n => n.type === 'label' && n.props.htmlFor === campo.props.id))
  campo.props.onChange({ target: { value: 'inexistente' } })
  assert.match(text(p.render()), /Nenhum resultado encontrado pelos filtros/)
  assert.doesNotMatch(text(p.render()), /Nenhum evento disponível/)
})

test('filtro continua pesquisando nome, categoria e local sem requisicoes adicionais', async () => {
  const p = participante(); p.render(); await tick(); p.navegar('Explorar eventos')
  const total = p.chamadas.length
  for (const busca of ['EVENTO SINTÉTICO', 'workshop', 'local sintético']) {
    nodes(p.render()).find(n => n.props.id === 'participante-busca').props.onChange({ target: { value: busca } })
    assert.match(text(p.render()), /Evento sintético/)
  }
  assert.equal(p.chamadas.length, total)
})

test('nenhuma inscricao so aparece apos consulta bem sucedida', async () => {
  const p = participante(); p.render(); await tick()
  const v = p.navegar('Meus ingressos')
  assert.match(text(v), /Você ainda não possui inscrições em eventos/)
  assert.doesNotMatch(text(v), /Não foi possível consultar/)
})

test('erros de consulta persistem sem se converter em listas vazias', async () => {
  const p = participante({ fetch: async () => ({ ok: false }) }); p.render(); await tick()
  const e = p.navegar('Explorar eventos')
  assert.match(text(e), /Erro de consulta de eventos/); assert.ok(nodes(e).some(n => n.props.role === 'alert'))
  assert.doesNotMatch(text(e), /Nenhum evento disponível|Nenhum resultado encontrado/)
  for (let i = 0; i < 3; i++) assert.match(text(p.navegar('Meus ingressos')), /Novas inscrições estão bloqueadas/)
  assert.doesNotMatch(text(p.render()), /Você ainda não possui inscrições/)
})

test('indisponibilidade de inscricoes preserva consulta de eventos e ingressos existentes', async () => {
  const p = participante({ capacidades: { inscrever: false }, ingressos: [{ id: 10, evento_id: 9, evento_nome: 'Histórico', status: 'Confirmada' }] })
  p.render(); await tick()
  const v = p.navegar('Explorar eventos')
  assert.match(text(v), /Inscrições indisponíveis/); assert.match(text(v), /Evento sintético/)
  assert.equal(botao(v, 'Inscrever-se').props.disabled, true)
  assert.match(text(p.navegar('Meus ingressos')), /Histórico/)
})

test('detalhes conservam midia, vagas, fallbacks e navegacao', async () => {
  const p = participante({ eventos: [{ ...evento, data: null, horario: '', local: '', descricao: '' }] })
  p.render(); await tick(); p.navegar('Explorar eventos')
  assert.equal(nodes(p.render()).find(n => n.type === 'capa').props.eventoId, evento.id)
  botao(p.render(), 'Ver detalhes').props.onClick()
  const v = p.render()
  assert.equal(nodes(v).find(n => n.type === 'midia').props.eventoId, evento.id)
  assert.equal(nodes(v).find(n => n.type === 'vagas').props.evento.id, evento.id)
  assert.match(text(v), /Descrição não informada/); assert.match(text(v), /Não informado/)
  botao(v, '← Voltar aos eventos').props.onClick(); assert.ok(botao(p.render(), 'Ver detalhes'))
})

test('confirmacao cancelada nunca envia POST nem altera os destinos', async () => {
  const p = participante({ confirmar: false }); p.render(); await tick(); p.navegar('Explorar eventos')
  await botao(p.render(), 'Inscrever-se').props.onClick()
  assert.equal(p.confirmacoes.length, 1)
  assert.equal(p.chamadas.some(([, opts]) => opts.method === 'POST'), false)
  assert.deepEqual(p.destinos, []); assert.equal(p.avisos.length, 0)
})

test('lotacao e inscricao existente continuam bloqueando acao na lista e nos detalhes', async () => {
  for (const inscrito of [false, true]) {
    const p = participante({ eventos: [{ ...evento, lotado: !inscrito }], ingressos: inscrito ? [{ id: 10, evento_id: evento.id }] : [] })
    p.render(); await tick(); p.navegar('Explorar eventos')
    const nome = inscrito ? 'Já inscrito' : 'Lotado'
    assert.equal(botao(p.render(), nome).props.disabled, true)
    await botao(p.render(), nome).props.onClick()
    botao(p.render(), 'Ver detalhes').props.onClick()
    assert.equal(botao(p.render(), nome).props.disabled, true)
    assert.equal(p.chamadas.some(([, opts]) => opts.method === 'POST'), false)
  }
})

test('envio de inscricao preserva endpoint, payload, ocupacao e atualizacoes posteriores', async () => {
  let concluir, registrado = false
  const p = participante({ fetch: async (url, opts) => {
    if (opts.method === 'POST') return new Promise(resolve => { concluir = resolve })
    return ok(url.endsWith('/eventos') ? [evento] : registrado ? [{ id: 11, evento_id: evento.id, evento_nome: evento.nome, status: 'Confirmada' }] : [])
  } })
  p.render(); await tick(); p.navegar('Explorar eventos')
  const pendente = botao(p.render(), 'Inscrever-se').props.onClick()
  const busy = nodes(p.render()).find(n => n.type === 'button' && text(n).trim().startsWith('Realizando inscrição...'))
  assert.equal(busy.props.disabled, true); assert.equal(busy.props['aria-busy'], true)
  await busy.props.onClick()
  const posts = p.chamadas.filter(([, opts]) => opts.method === 'POST')
  assert.equal(posts.length, 1); assert.equal(posts[0][0], '/participante/inscricoes')
  assert.deepEqual(JSON.parse(posts[0][1].body), { evento_id: evento.id })
  assert.equal(posts[0][1].headers.Authorization, 'Bearer token-sintetico')
  registrado = true; concluir(ok({ id: 11 })); await pendente
  p.render(); await tick()
  assert.match(text(p.render()), /Meus ingressos/); assert.match(text(p.render()), /Inscrição nº\s+11/)
  assert.deepEqual(p.avisos, ['Inscrição realizada com sucesso!'])
  p.navegar('Explorar eventos'); assert.equal(botao(p.render(), 'Já inscrito').props.disabled, true)
})

test('falha de inscricao preserva tratamento existente sem reenviar automaticamente', async () => {
  const p = participante({ fetch: async (url, opts) => opts.method === 'POST' ? { ok: false, json: async () => ({ erro: 'Inscrição recusada' }) } : ok(url.endsWith('/eventos') ? [evento] : []) })
  p.render(); await tick(); p.navegar('Explorar eventos')
  await botao(p.render(), 'Inscrever-se').props.onClick(); p.render(); await tick()
  assert.deepEqual(p.avisos, ['Inscrição recusada'])
  assert.equal(p.chamadas.filter(([, opts]) => opts.method === 'POST').length, 1)
  assert.equal(botao(p.render(), 'Inscrever-se').props.disabled, false)
})

test('menu usa botoes nativos com estado atual e preserva saida e solicitacao de acesso', () => {
  const p = participante({ fetch: () => new Promise(() => {}) })
  const v = p.render(), atual = nodes(v).find(n => n.type === 'button' && n.props['aria-current'] === 'page')
  assert.equal(text(atual).trim(), 'Início'); assert.equal(atual.props.type, 'button')
  botao(v, 'Solicitar acesso').props.onClick(); assert.deepEqual(p.destinos, ['solicitar-acesso'])
  botao(v, 'Sair').props.onClick(); assert.equal(p.saidas(), 1)
})

test('redesenho mantém CSS local e controles focaveis sem esconder transbordamentos da página', () => {
  const css = postcss.parse(readFileSync(new URL('../src/pages/participante/Participante.css', import.meta.url), 'utf8'))
  css.walkRules(r => assert.ok(r.selector.split(',').every(s => s.trim().startsWith('.participantePagina'))))
  css.walkDecls(d => assert.doesNotMatch(d.value, /#[\da-f]{3,8}\b|\brgba?\(/i))
  assert.doesNotMatch(css.toString(), /position:\s*fixed|overflow(?:-x)?:\s*hidden/)
  assert.match(css.toString(), /:focus-visible/)
})

// Verifica regras CSS por largura; não substitui medição no navegador.
function estiloParticipante(seletor, largura) {
  const css = postcss.parse(readFileSync(new URL('../src/pages/participante/Participante.css', import.meta.url), 'utf8'))
  const out = {}
  css.walkRules(r => {
    if (!r.selector.split(',').some(s => s.trim() === seletor)) return
    for (let p = r.parent; p; p = p.parent) {
      if (p.type === 'atrule' && p.name === 'media') {
        const limite = p.params.match(/max-width:\s*(\d+)px/)
        if (limite && largura > Number(limite[1])) return
      }
    }
    r.walkDecls(d => { out[d.prop] = d.value })
  })
  return out
}
for (const largura of [360, 390, 768, 1024, 1440]) test(`grade de descoberta e inscrições adapta regras em ${largura}px`, () => {
  const esperado = largura <= 700 ? 'minmax(0, 1fr)' : largura <= 1100 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))'
  for (const grade of ['.ppGradeEventos', '.ppGradeInscricoes']) {
    assert.equal(estiloParticipante(`.participantePagina ${grade}`, largura)['grid-template-columns'], esperado)
  }
  assert.equal(estiloParticipante('.participantePagina .fornMenu nav', largura)['flex-wrap'], 'wrap')
  assert.equal(estiloParticipante('.participantePagina .ppEventoConteudo', largura)['min-width'], '0')
  assert.equal(estiloParticipante('.participantePagina .ppEventoCapa', largura)['aspect-ratio'], '16 / 10')
  if (largura <= 700) assert.equal(estiloParticipante('.participantePagina .ppBuscaBarra', largura)['flex-wrap'], 'wrap')
})

test('card de descoberta destaca capa real e mantém informações, vagas e duas ações', async () => {
  const p = participante({ eventos: [{ ...evento, horario: '19:00', publico: 200, descricao: 'Descrição sintética' }] })
  p.render(); await tick(); p.navegar('Explorar eventos')
  const v = p.render(), card = nodes(v).find(n => n.type === 'article' && n.props.className.includes('eventoCartao'))
  const capa = nodes(card).find(n => n.props.className === 'ppEventoCapa')
  assert.equal(nodes(capa).find(n => n.type === 'capa').props.eventoId, evento.id)
  for (const campo of ['Data:', 'Horário:', 'Local:', 'Público estimado:', 'Status:', '19:00', '200', 'Descrição sintética']) assert.ok(text(card).includes(campo), campo)
  assert.equal(nodes(card).find(n => n.type === 'vagas').props.evento.id, evento.id)
  assert.ok(botao(card, 'Ver detalhes')); assert.ok(botao(card, 'Inscrever-se'))
  const acoes = nodes(card).find(n => n.props.className === 'ppEventoAcoes')
  assert.equal(nodes(acoes).filter(n => n.type === 'button').length, 2)
})

test('barra de busca mantém label e consulta local, sem criar filtros ou chamadas extras', async () => {
  const p = participante(); p.render(); await tick(); p.navegar('Explorar eventos')
  const v = p.render(), barra = nodes(v).find(n => n.props.role === 'search')
  const inputs = nodes(barra).filter(n => n.type === 'input')
  assert.equal(inputs.length, 1)
  assert.ok(nodes(barra).some(n => n.type === 'label' && n.props.htmlFor === inputs[0].props.id))
  assert.equal(nodes(barra).filter(n => n.type === 'select').length, 0)
  const total = p.chamadas.length
  inputs[0].props.onChange({ target: { value: 'WORKSHOP' } })
  assert.match(text(p.render()), /Evento sintético/); assert.equal(p.chamadas.length, total)
})

test('cards de inscrições mantêm histórico, protocolo e estados sem oferecer novas operações', async () => {
  const p = participante({ ingressos: [{ id: 18, evento_id: 4, evento_nome: 'Histórico sintético', evento_horario: '18:00', evento_local: 'Local sintético', evento_status: 'Cancelado', status: 'Confirmada' }] })
  p.render(); await tick(); const v = p.navegar('Meus ingressos')
  const grade = nodes(v).find(n => n.props.className === 'ppGradeInscricoes')
  assert.ok(grade)
  for (const texto of ['Histórico sintético', '18:00', 'Local sintético', 'Inscrição nº 18', 'Cancelado', 'Confirmada']) assert.ok(text(grade).replace(/\s+/g, ' ').includes(texto), texto)
  assert.equal(nodes(grade).filter(n => n.type === 'button').length, 0)
})
