import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { createElement, Fragment, useEffect, useId, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { carregarAdmin, hooksAdmin, nodes, text } from './helpers/adminRuntime.js'
import { primitivasFixture, jsxPrimitivas } from './helpers/primitivasFixture.js'

const ok = dados => ({ ok: true, json: async () => dados })
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const evento = { id: 4, nome: 'Evento sintético', categoria: 'Workshop', local: 'Local sintético', status: 'Ativo', lotado: false }
function participante({ eventos = [evento], ingressos = [], fetch, capacidades = { inscrever: true }, confirmar = true, documento, navegacao } = {}) {
  const chamadas = [], confirmacoes = [], avisos = [], destinos = [], focos = []
  let saidas = 0
  const h = hooksAdmin({ ...primitivasFixture, jsx: jsxPrimitivas, Icone: 'svg', PerfilPessoal: 'perfil', NavegacaoRecolhivel: 'recolhivel',
    MidiaEvento: 'midia', CapaEvento: 'capa', VagasEvento: 'vagas', apiUrl: p => p,
    sessionStorage: { getItem: () => 'token-sintetico' }, console: { error() {} }, alert: m => avisos.push(m),
    document: documento,
    window: { confirm: m => { confirmacoes.push(m); return confirmar } },
    capacidadesEventos: async () => ok(capacidades),
    fetch: async (url, opcoes) => { chamadas.push([url, opcoes]); return fetch ? fetch(url, opcoes) : ok(url.endsWith('/eventos') ? eventos : ingressos) },
  })
  // Simula o commit: refs recebem o titulo renderizado antes dos efeitos,
  // como no React. Nao equivale a inspecao de teclado em navegador real.
  const efeitos = [], registrarEfeito = h.env.useEffect
  h.env.useEffect = (fn, deps) => registrarEfeito(() => {
    let limpar
    efeitos.push(() => { limpar = fn() })
    return () => limpar?.()
  }, deps)
  const fn = carregarAdmin('pages/participante/PortalParticipante.jsx', ['PortalParticipante'], h.env).PortalParticipante
  const render = () => {
    const v = h.render(fn, { setPagina: p => destinos.push(p), aoSair: () => saidas++, navegacao })
    for (const n of nodes(v)) if (n.props.ref && n.props.id === 'participante-titulo') {
      n.props.ref.current = { focus: () => focos.push({ id: n.props.id, titulo: text(n).trim() }) }
    }
    efeitos.splice(0).forEach(efeito => efeito())
    return v
  }
  const navegar = label => { botao(render(), label).props.onClick(); return render() }
  return { render, navegar, chamadas, confirmacoes, avisos, destinos, focos, close: h.close, saidas: () => saidas }
}
function botao(v, nome) { return nodes(v).find(n => n.type === 'button' && text(n).trim() === nome) }

function navegacaoControlada(inicial = { aba: 'inicio', eventoId: null }) {
  let estado = inicial
  const substituicoes = []
  return { get estado() { return estado }, substituicoes, mudar(valor, substituir = false) {
    estado = typeof valor === 'function' ? valor(estado) : valor
    substituicoes.push(substituir)
  } }
}

test('participante controlado restaura seção e detalhes por ID da consulta atual sem novas requisições', async () => {
  const nav = navegacaoControlada(), p = participante({ navegacao: nav })
  p.render(); await tick(); p.navegar('Explorar eventos')
  const total = p.chamadas.length
  botao(p.render(), 'Ver detalhes').props.onClick()
  assert.equal(nav.estado.aba, 'detalhes'); assert.equal(nav.estado.eventoId, evento.id)
  assert.equal(nodes(p.render()).find(n => n.type === 'midia').props.eventoId, evento.id)
  p.navegar('Meu perfil')
  nav.mudar({ aba: 'detalhes', eventoId: evento.id })
  assert.match(text(p.render()), /Evento sintético/)
  assert.equal(p.focos.at(-1).titulo, 'Detalhes do evento')
  botao(p.render(), '← Voltar aos eventos').props.onClick()
  assert.equal(nav.estado.aba, 'eventos'); assert.equal(p.chamadas.length, total)
  p.close()
})

test('detalhes históricos sem evento disponível retornam à consulta por substituição, sem inventar dados', async () => {
  const nav = navegacaoControlada({ aba: 'detalhes', eventoId: 999 }), p = participante({ navegacao: nav })
  p.render(); await tick(); p.render()
  assert.equal(nav.estado.aba, 'eventos')
  assert.equal(nav.substituicoes.at(-1), true)
  assert.ok(botao(p.render(), 'Ver detalhes'))
  assert.equal(p.chamadas.some(([, opts]) => opts.method === 'POST'), false); p.close()
})

test('navegação controlada preserva inscrição confirmada e updater final sem voltar indevidamente aos eventos', async () => {
  const nav = navegacaoControlada(), p = participante({ navegacao: nav })
  p.render(); await tick(); p.navegar('Explorar eventos')
  botao(p.render(), 'Ver detalhes').props.onClick()
  await botao(p.render(), 'Inscrever-se').props.onClick()
  assert.equal(nav.estado.aba, 'ingressos')
  const posts = p.chamadas.filter(([, options]) => options.method === 'POST')
  assert.equal(posts.length, 1)
  assert.equal(posts[0][0], '/participante/inscricoes')
  assert.deepEqual(JSON.parse(posts[0][1].body), { evento_id: evento.id })
  p.close()
})

function renderizarComPerfilReal(view, estado) {
  const env = { jsx: createElement, Fragment, useEffect, useId, useRef, useState }
  const primitivas = carregarAdmin('components/ui/Primitivas.jsx', ['Skeleton', 'Botao', 'Campo', 'Alerta'], env)
  const { PerfilPessoal } = carregarAdmin('components/perfil/PerfilPessoal.jsx', ['PerfilPessoal'], {
    ...env, ...primitivas, usePerfil: () => ({ ...estado, recarregar() {} }),
    sessionStorage: { getItem: () => 'sessao-sintetica' },
    // Não é necessário consultar imagens ou redes sociais para renderizar a hierarquia do perfil.
    ImagensPerfil: () => null, PerfilProfissional: () => null, ConsultaPortfolios: () => null,
  })
  function compor(n) {
    if (!n || typeof n !== 'object') return n
    return createElement(n.type === 'perfil' ? PerfilPessoal : n.type, n.props, ...(n.children || []).map(compor))
  }
  return renderToStaticMarkup(compor(view))
}

for (const [estado, dados] of Object.entries({
  carregando: { perfil: null, erro: '' },
  erro: { perfil: null, erro: 'Consulta sintética indisponível' },
  carregado: { perfil: { id: 7, nome: 'Pessoa sintética', email: 'pessoa@example.invalid', edicao_disponivel: false }, erro: '' },
})) test(`Meu perfil composto com PerfilPessoal real tem um único h1: ${estado}`, () => {
  const p = participante({ fetch: () => new Promise(() => {}) })
  p.render()
  const html = renderizarComPerfilReal(p.navegar('Meu perfil'), dados)
  assert.equal((html.match(/<h1\b/g) || []).length, 1)
  assert.match(html, /<h1>Meu perfil<\/h1>/)
  assert.match(html, /<p[^>]*id="participante-titulo"[^>]*tabindex="-1"[^>]*>Meu perfil<\/p>/)
  assert.match(html, /<main[^>]*aria-labelledby="participante-titulo"/)
  if (estado === 'carregado') assert.match(html, /<h2>Informações pessoais<\/h2>/)
  assert.equal(p.focos.at(-1).titulo, 'Meu perfil')
  p.close()
})

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

test('seções e detalhes preservam título, localização e nome acessível; perfil delega h1 ao componente real', async () => {
  const p = participante(); p.render(); await tick()
  function conferir(v, titulo) {
    const tituloContexto = nodes(v).find(n => n.props.id === 'participante-titulo'), main = nodes(v).find(n => n.type === 'main')
    const trilha = nodes(v).find(n => n.type === 'nav' && n.props['aria-label'] === 'Localização no portal')
    assert.equal(text(tituloContexto).trim(), titulo)
    assert.equal(tituloContexto.type, titulo === 'Meu perfil' ? 'p' : 'h1')
    assert.equal(main.props['aria-labelledby'], tituloContexto.props.id)
    assert.equal(tituloContexto.props.tabIndex, -1)
    assert.equal(text(nodes(trilha).find(n => n.props['aria-current'] === 'page')).trim(), titulo)
    assert.ok(nodes(trilha).some(n => n.props['aria-hidden'] === 'true'))
    assert.doesNotMatch(text(trilha), /undefined/)
  }
  for (const [aba, titulo] of [['Início', 'Painel do Participante'], ['Explorar eventos', 'Explorar eventos'], ['Meus ingressos', 'Meus ingressos'], ['Meu perfil', 'Meu perfil']]) conferir(p.navegar(aba), titulo)
  p.navegar('Explorar eventos'); botao(p.render(), 'Ver detalhes').props.onClick()
  let v = p.render(); conferir(v, 'Detalhes do evento')
  assert.equal(text(nodes(v).find(n => n.type === 'h2')).trim(), evento.nome)
  assert.equal(text(nodes(v).find(n => n.type === 'button' && n.props['aria-current'] === 'page')).trim(), 'Explorar eventos')
  botao(v, '← Voltar aos eventos').props.onClick(); v = p.render(); conferir(v, 'Explorar eventos')
  assert.ok(botao(v, 'Ver detalhes')); p.close()
})

test('perfil do dashboard informa o papel sem inventar estado de conta nem consultar APIs extras', async () => {
  const p = participante(); p.render(); await tick()
  const v = p.render(), painel = nodes(v).find(n => n.props.className === 'fornIndicadores')
  assert.match(text(painel), /SEU PERFIL\s+Participante\s+Perfil de acesso/)
  assert.doesNotMatch(text(painel), /Ativo|Conta ativa|Perfil ativo/)
  assert.deepEqual(p.chamadas.map(([url]) => url).sort(), ['/participante/eventos', '/participante/inscricoes'])
  p.close()
})

test('foco acompanha mudanças de seção e retorno dos detalhes, sem interferir em busca ou carregamento', async () => {
  const p = participante(); p.render(); assert.equal(p.focos.length, 0)
  await tick(); p.render(); assert.equal(p.focos.length, 0)
  p.navegar('Explorar eventos'); assert.equal(p.focos.at(-1).titulo, 'Explorar eventos')
  const total = p.focos.length
  nodes(p.render()).find(n => n.props.id === 'participante-busca').props.onChange({ target: { value: 'workshop' } })
  p.render(); assert.equal(p.focos.length, total)
  p.navegar('Explorar eventos'); assert.equal(p.focos.length, total)
  botao(p.render(), 'Ver detalhes').props.onClick(); p.render()
  assert.equal(p.focos.at(-1).titulo, 'Detalhes do evento')
  botao(p.render(), '← Voltar aos eventos').props.onClick(); p.render()
  assert.equal(p.focos.at(-1).titulo, 'Explorar eventos')
  for (const [aba, titulo] of [['Meus ingressos', 'Meus ingressos'], ['Meu perfil', 'Meu perfil'], ['Início', 'Painel do Participante']]) {
    p.navegar(aba); assert.deepEqual(p.focos.at(-1), { id: 'participante-titulo', titulo })
  }
  p.close()
})

test('navegação mantém botões nativos para teclado, região identificada e uma única seção selecionada', () => {
  const p = participante({ fetch: () => new Promise(() => {}) })
  for (const nome of ['Início', 'Explorar eventos', 'Meus ingressos', 'Meu perfil']) {
    const v = p.navegar(nome), nav = nodes(v).find(n => n.type === 'nav' && n.props['aria-label'] === 'Seções do participante')
    const botoes = nodes(nav).filter(n => n.type === 'button')
    assert.equal(botoes.length, 4)
    for (const b of botoes) {
      assert.equal(b.props.type, 'button'); assert.equal(b.props.disabled, false)
      assert.equal(b.props.role, undefined); assert.equal(b.props.tabIndex, undefined)
      assert.equal(b.props.onKeyDown, undefined); assert.ok(text(b).trim())
    }
    const selecionados = botoes.filter(b => b.props['aria-current'] === 'page')
    assert.equal(selecionados.length, 1); assert.equal(text(selecionados[0]).trim(), nome)
    assert.match(selecionados[0].props.className, /ativo/)
    assert.equal(nodes(v).some(n => n.props.role === 'tab' || n.props.role === 'tablist'), false)
  }
  p.close()
})

test('título da aba acompanha a seção e é restaurado ao sair do portal', async () => {
  const documento = { title: 'TrocaTicket | Plataforma de Eventos' }, p = participante({ documento })
  p.render(); assert.equal(documento.title, 'Painel do Participante | TrocaTicket')
  await tick(); p.navegar('Explorar eventos'); assert.equal(documento.title, 'Explorar eventos | TrocaTicket')
  botao(p.render(), 'Ver detalhes').props.onClick(); p.render(); assert.equal(documento.title, 'Detalhes do evento | TrocaTicket')
  p.navegar('Meus ingressos'); assert.equal(documento.title, 'Meus ingressos | TrocaTicket')
  p.close(); assert.equal(documento.title, 'TrocaTicket | Plataforma de Eventos')
})

test('redesenho mantém CSS local e controles focaveis sem esconder transbordamentos da página', () => {
  const css = postcss.parse(readFileSync(new URL('../src/pages/participante/Participante.css', import.meta.url), 'utf8'))
  css.walkRules(r => assert.ok(r.selector.split(',').every(s => s.trim().startsWith('.participantePagina'))))
  css.walkDecls(d => assert.doesNotMatch(d.value, /#[\da-f]{3,8}\b|\brgba?\(/i))
  assert.doesNotMatch(css.toString(), /position:\s*fixed|overflow(?:-x)?:\s*hidden/)
  assert.match(css.toString(), /:focus-visible/)
  assert.match(css.toString(), /\.participantePagina \.ppTitulo:focus\s*\{[^}]*outline:/)
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
for (const largura of [360, 390, 768, 1024, 1440, 320, 375]) test(`grade de descoberta e inscrições adapta regras em ${largura}px`, () => {
  const esperado = largura <= 700 ? 'minmax(0, 1fr)' : largura <= 1100 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))'
  for (const grade of ['.ppGradeEventos', '.ppGradeInscricoes']) {
    assert.equal(estiloParticipante(`.participantePagina ${grade}`, largura)['grid-template-columns'], esperado)
  }
  assert.equal(estiloParticipante('.participantePagina .ppSecoes', largura)['flex-wrap'], 'wrap')
  assert.equal(estiloParticipante('.participantePagina .ppEventoConteudo', largura)['min-width'], '0')
  assert.equal(estiloParticipante('.participantePagina .ppEventoCapa', largura)['aspect-ratio'], '16 / 10')
  if (largura <= 700) assert.equal(estiloParticipante('.participantePagina .ppBuscaBarra', largura)['flex-wrap'], 'wrap')
})

test('card resume informações, destaca detalhes e preserva dados completos e inscrição direta', async () => {
  const p = participante({ eventos: [{ ...evento, data: '2030-12-31T00:00:00Z', horario: '19:00', publico: 200, descricao: 'Descrição sintética' }] })
  p.render(); await tick(); p.navegar('Explorar eventos')
  const v = p.render(), card = nodes(v).find(n => n.type === 'article' && n.props.className.includes('eventoCartao'))
  const capa = nodes(card).find(n => n.props.className === 'ppEventoCapa')
  assert.equal(nodes(capa).find(n => n.type === 'capa').props.eventoId, evento.id)
  for (const campo of ['Data:', '31/12/2030', 'Horário:', 'Local:', 'Workshop', 'Ativo', '19:00', 'Local sintético']) assert.ok(text(card).includes(campo), campo)
  assert.doesNotMatch(text(card), /Público estimado|Descrição sintética/)
  const titulo = nodes(card).find(n => n.type === 'h3')
  assert.equal(card.props['aria-labelledby'], titulo.props.id)
  assert.equal(nodes(card).find(n => n.type === 'vagas').props.evento.id, evento.id)
  assert.ok(botao(card, 'Ver detalhes')); assert.ok(botao(card, 'Inscrever-se'))
  assert.match(botao(card, 'Ver detalhes').props.className, /ttBotao--primario/)
  assert.match(botao(card, 'Inscrever-se').props.className, /ttBotao--secundario/)
  assert.equal(botao(card, 'Ver detalhes').props['aria-label'], `Ver detalhes de ${evento.nome}`)
  const acoes = nodes(card).find(n => n.props.className === 'ppEventoAcoes')
  assert.equal(nodes(acoes).filter(n => n.type === 'button').length, 2)
  botao(card, 'Ver detalhes').props.onClick()
  const detalhes = nodes(p.render()).find(n => n.props.className?.includes('ppDetalhes'))
  assert.match(text(detalhes), /Público estimado:\s+200/)
  assert.match(text(detalhes), /Descrição sintética/)
  assert.equal(nodes(detalhes).find(n => n.type === 'vagas').props.evento.publico, 200)
})

test('barra de busca mantém label e consulta local, sem criar filtros ou chamadas extras', async () => {
  const p = participante(); p.render(); await tick(); p.navegar('Explorar eventos')
  const v = p.render(), barra = nodes(v).find(n => n.props.role === 'search')
  const inputs = nodes(barra).filter(n => n.type === 'input')
  assert.equal(inputs.length, 1)
  assert.ok(nodes(barra).some(n => n.type === 'label' && n.props.htmlFor === inputs[0].props.id))
  assert.equal(inputs[0].props['aria-describedby'], 'participante-busca-dica')
  assert.ok(nodes(barra).some(n => n.props.id === 'participante-busca-dica'))
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

test('card sem dados complementares mostra ausências sem inventar categoria, disponibilidade ou valores', async () => {
  const p = participante({ eventos: [{ id: 7, nome: '', data: null, horario: '', local: '', categoria: '', status: '' }] })
  p.render(); await tick(); const v = p.navegar('Explorar eventos')
  const card = nodes(v).find(n => n.type === 'article')
  assert.match(text(card), /Nome não informado/)
  assert.match(text(card), /Data:\s+Não informada/); assert.match(text(card), /Horário:\s+Não informado/)
  assert.match(text(card), /Local:\s+Não informado/); assert.match(text(card), /Estado não informado/)
  assert.match(text(card), /Disponibilidade não informada/)
  assert.equal(nodes(card).find(n => n.type === 'capa').props.eventoId, 7)
  assert.equal(nodes(card).some(n => n.props.className?.includes('ttBadge')), false)
  assert.doesNotMatch(text(card), /undefined|NaN|Invalid Date|R\$|Comprar|Gratuito/)
  p.close()
})

test('nomes e locais longos mantêm conteúdo acessível e navegação para os detalhes completos', async () => {
  const nome = 'Nome extenso '.repeat(40), local = 'Local detalhado '.repeat(60)
  const p = participante({ eventos: [{ ...evento, nome, local }] })
  p.render(); await tick(); const v = p.navegar('Explorar eventos'), card = nodes(v).find(n => n.type === 'article')
  assert.equal(text(nodes(card).find(n => n.type === 'h3')), nome)
  assert.ok(text(card).includes(local))
  assert.equal(botao(card, 'Ver detalhes').props['aria-label'], `Ver detalhes de ${nome}`)
  botao(card, 'Ver detalhes').props.onClick()
  assert.ok(text(p.render()).includes(local)); assert.ok(text(p.render()).includes(nome))
  p.close()
})

for (const status of ['Ativo', 'Cancelado', 'Encerrado', 'Em planejamento']) test(`card apresenta estado textual ${status} sem depender apenas de cor`, async () => {
  const p = participante({ eventos: [{ ...evento, status }] }); p.render(); await tick()
  const card = nodes(p.navegar('Explorar eventos')).find(n => n.type === 'article')
  assert.ok(nodes(card).some(n => n.props.className?.includes('ttBadge') && text(n) === status))
  assert.ok(botao(card, 'Ver detalhes')); p.close()
})

test('card reutiliza disponibilidade real: lotação, vagas, sem limite e inscrição existente permanecem distintos', async () => {
  const { VagasEvento } = carregarAdmin('components/eventos/VagasEvento.jsx', ['VagasEvento'], { jsx: jsxPrimitivas })
  for (const [dados, mensagem, rotulo, bloqueado, inscrito] of [
    [{ capacidade_maxima: 2, inscritos_confirmados: 2, vagas_restantes: 0, lotado: true }, /Lotado/, 'Lotado', true, false],
    [{ capacidade_maxima: 5, inscritos_confirmados: 2, vagas_restantes: 3, lotado: false }, /3 vagas disponíveis.*Capacidade:\s+5/, 'Inscrever-se', false, false],
    [{ capacidade_maxima: null, inscritos_confirmados: 7, vagas_restantes: null, lotado: false }, /Sem limite de vagas configurado/, 'Inscrever-se', false, false],
    [{ capacidade_maxima: 5, inscritos_confirmados: 2, vagas_restantes: 3, lotado: false }, /3 vagas disponíveis/, 'Já inscrito', true, true],
  ]) {
    const p = participante({ eventos: [{ ...evento, ...dados }], ingressos: inscrito ? [{ id: 8, evento_id: evento.id }] : [] })
    p.render(); await tick(); const card = nodes(p.navegar('Explorar eventos')).find(n => n.type === 'article')
    const vagas = nodes(card).find(n => n.type === 'vagas')
    assert.match(text(VagasEvento(vagas.props)).replace(/\s+/g, ' '), mensagem)
    assert.equal(botao(card, rotulo).props.disabled, bloqueado)
    assert.doesNotMatch(text(card), /Disponibilidade não informada/)
    p.close()
  }
})

test('loading reserva uma grade de capas e ações sem anúncios repetidos ou ausência presumida', () => {
  const p = participante({ fetch: () => new Promise(() => {}) }), v = p.navegar('Explorar eventos')
  const carregamento = nodes(v).find(n => n.props.className === 'ppCarregamentoEventos')
  assert.equal(carregamento.props.role, 'status'); assert.equal(carregamento.props['aria-busy'], 'true')
  const visuais = nodes(carregamento).find(n => n.props.className === 'ppEsqueletos')
  assert.equal(visuais.props['aria-hidden'], 'true')
  assert.equal(nodes(visuais).filter(n => n.props.className?.includes('ppSkeletonEvento')).length, 3)
  assert.doesNotMatch(text(v), /Nenhum evento disponível|Nenhum resultado encontrado/)
  p.close()
})

test('capas existentes preservam fallback, carregamento, erro, alt e falha de imagem sem consultas adicionais', () => {
  const estado = { imagens: [], carregando: false, erro: '' }
  const h = hooksAdmin({ Icone: 'svg', useImagensEvento: () => estado })
  const { Capa, ImagemEvento } = carregarAdmin('components/eventos/MidiaEvento.jsx', ['Capa', 'ImagemEvento'], h.env)
  assert.equal(Capa({ eventoId: 4 }).props['aria-label'], 'Evento sem capa')
  estado.carregando = true
  assert.equal(Capa({ eventoId: 4 }).props['aria-label'], 'Carregando capa do evento')
  estado.carregando = false; estado.erro = 'falha sintética'
  assert.equal(Capa({ eventoId: 4 }).props['aria-label'], 'Capa indisponível')
  estado.imagens = [{ posicao: 0, url: 'blob:capa-sintetica-somente-teste' }]
  const imagem = Capa({ eventoId: 4 }); assert.equal(imagem.props.alt, 'Capa do evento')
  assert.equal(imagem.props.loading, 'lazy')
  let v = h.render(ImagemEvento, imagem.props)
  assert.equal(v.type, 'img'); assert.equal(v.props.referrerPolicy, 'no-referrer')
  v.props.onError(); v = h.render(ImagemEvento, imagem.props)
  assert.equal(v.props.role, 'status'); assert.match(text(v), /Imagem indisponível/)
  h.close()
})

for (const largura of [360, 390, 768, 1024, 1440, 720, 320, 375]) test(`cards e skeletons compartilham proporções e refluxo em ${largura}px`, () => {
  const colunas = estiloParticipante('.participantePagina .ppGradeEventos', largura)['grid-template-columns']
  assert.equal(estiloParticipante('.participantePagina .ppEsqueletos', largura)['grid-template-columns'], colunas)
  assert.equal(estiloParticipante('.participantePagina .ppSkeletonEvento .ttSkeletonCapa', largura)['aspect-ratio'], '16 / 10')
  assert.equal(estiloParticipante('.participantePagina .ppEventoCapa', largura)['aspect-ratio'], '16 / 10')
  assert.equal(estiloParticipante('.participantePagina .ppEventoCapa > .eventoCapaLista', largura)['object-fit'], 'cover')
  assert.equal(estiloParticipante('.participantePagina .ppEventoCartao', largura)['overflow-wrap'], 'anywhere')
  assert.equal(estiloParticipante('.participantePagina .ppEventoAcoes > .ttBotao', largura)['min-height'], '44px')
  assert.equal(estiloParticipante('.participantePagina .ppSkeletonEvento:nth-child(3)', largura).display === 'none', largura <= 1100)
  assert.equal(estiloParticipante('.participantePagina .ppSkeletonEvento:nth-child(2)', largura).display === 'none', largura <= 700)
})

async function abrirDetalhes(opcoes = {}) {
  const p = participante(opcoes)
  p.render(); await tick(); p.navegar('Explorar eventos')
  botao(p.render(), 'Ver detalhes').props.onClick(); p.render()
  return p
}

test('detalhes organizam informações completas, mídia única e ação sem consultas adicionais', async () => {
  const dados = { ...evento, data: '2030-12-31T00:00:00Z', horario: '19:00', publico: 250,
    descricao: 'Descrição completa\nCom segunda linha preservada.', capacidade_maxima: 20, inscritos_confirmados: 3, vagas_restantes: 17 }
  const p = await abrirDetalhes({ eventos: [dados] }), v = p.render()
  const detalhe = nodes(v).find(n => n.props.className === 'ppDetalhes')
  const titulo = nodes(detalhe).find(n => n.type === 'h2')
  assert.equal(text(titulo), dados.nome); assert.equal(detalhe.props['aria-labelledby'], titulo.props.id)
  for (const s of ['Workshop', 'Ativo', 'Data:', '31/12/2030', 'Horário:', '19:00', 'Local:', dados.local, 'Público estimado:', '250', dados.descricao]) assert.ok(text(detalhe).includes(s), s)
  const dl = nodes(detalhe).find(n => n.type === 'dl')
  assert.equal(nodes(dl).filter(n => n.type === 'dt').length, 4)
  assert.equal(nodes(dl).filter(n => n.type === 'dd').length, 4)
  assert.equal(nodes(detalhe).filter(n => n.type === 'midia').length, 1)
  assert.equal(nodes(detalhe).find(n => n.type === 'midia').props.eventoId, dados.id)
  assert.equal(nodes(detalhe).filter(n => n.type === 'capa').length, 0)
  const bloco = nodes(detalhe).find(n => n.type === 'aside')
  assert.equal(bloco.props['aria-labelledby'], 'participante-disponibilidade')
  assert.equal(nodes(bloco).find(n => n.type === 'vagas').props.evento, dados)
  assert.match(botao(bloco, 'Inscrever-se').props.className, /ttBotao--primario/)
  assert.deepEqual(p.chamadas.map(([url]) => url).sort(), ['/participante/eventos', '/participante/inscricoes'])
  botao(v, '← Voltar aos eventos').props.onClick(); p.render()
  assert.equal(p.focos.at(-1).titulo, 'Explorar eventos')
  assert.ok(botao(p.render(), 'Ver detalhes')); p.close()
})

test('detalhes preservam fallbacks de campos ausentes e mostram textos longos integralmente', async () => {
  const p = await abrirDetalhes({ eventos: [{ ...evento, data: null, horario: '', local: '', publico: null, categoria: '', descricao: '' }] })
  const v = nodes(p.render()).find(n => n.props.className === 'ppDetalhes')
  assert.match(text(v), /Data:\s+Não informada/); assert.match(text(v), /Horário:\s+Não informado/)
  assert.match(text(v), /Local:\s+Não informado/); assert.match(text(v), /Público estimado:\s+Não informado/)
  assert.match(text(v), /Descrição não informada/); assert.doesNotMatch(text(v), /undefined|NaN|Invalid Date/)
  p.close()
  const nome = 'Nome muito longo '.repeat(40), local = 'Local muito longo '.repeat(60), descricao = 'Descrição extensa\n'.repeat(90)
  const q = await abrirDetalhes({ eventos: [{ ...evento, nome, local, descricao }] })
  const d = nodes(q.render()).find(n => n.props.className === 'ppDetalhes')
  assert.equal(text(nodes(d).find(n => n.type === 'h2')), nome)
  assert.ok(text(d).includes(local)); assert.ok(text(d).includes(descricao)); q.close()
})

test('detalhes preservam lotação, vagas, ausência de limite e inscrição existente junto da ação', async () => {
  const { VagasEvento } = carregarAdmin('components/eventos/VagasEvento.jsx', ['VagasEvento'], { jsx: jsxPrimitivas })
  for (const [dados, rotulo, mensagem, inscrito, bloqueado] of [
    [{ capacidade_maxima: 2, inscritos_confirmados: 2, vagas_restantes: 0, lotado: true }, 'Lotado', /Lotado/, false, true],
    [{ capacidade_maxima: 5, inscritos_confirmados: 2, vagas_restantes: 3 }, 'Inscrever-se', /3 vagas disponíveis/, false, false],
    [{ capacidade_maxima: null, inscritos_confirmados: 8, vagas_restantes: null }, 'Inscrever-se', /Sem limite de vagas configurado/, false, false],
    [{ capacidade_maxima: 5, inscritos_confirmados: 2, vagas_restantes: 3 }, 'Já inscrito', /3 vagas disponíveis/, true, true],
  ]) {
    const p = await abrirDetalhes({ eventos: [{ ...evento, ...dados }], ingressos: inscrito ? [{ id: 7, evento_id: evento.id }] : [] })
    const bloco = nodes(p.render()).find(n => n.props.className === 'ppDetalhesInscricao')
    const vagas = nodes(bloco).find(n => n.type === 'vagas')
    assert.match(text(VagasEvento(vagas.props)), mensagem)
    assert.equal(botao(bloco, rotulo).props.disabled, bloqueado); p.close()
  }
})

test('detalhes mantêm avisos próximos da ação e bloqueios por consulta pendente, erro e serviço indisponível', async () => {
  for (const opcoes of [
    { capacidades: { inscrever: false } },
    { fetch: url => url.endsWith('/inscricoes') ? new Promise(() => {}) : Promise.resolve(ok([evento])) },
    { fetch: async url => url.endsWith('/inscricoes') ? { ok: false } : ok([evento]) },
  ]) {
    const p = await abrirDetalhes(opcoes), bloco = nodes(p.render()).find(n => n.props.className === 'ppDetalhesInscricao')
    const acao = botao(bloco, 'Inscrever-se')
    assert.equal(acao.props.disabled, true)
    const ordem = nodes(bloco), aviso = ordem.find(n => n.props.role === 'alert' || n.props.role === 'status')
    assert.ok(aviso); assert.ok(ordem.indexOf(aviso) < ordem.indexOf(acao))
    await acao.props.onClick(); assert.equal(p.chamadas.some(([, op]) => op.method === 'POST'), false)
    p.close()
  }
})

test('detalhes preservam confirmação, payload, ação ocupada e bloqueio de envio duplicado', async () => {
  let terminar
  const p = await abrirDetalhes({ fetch: async (url, op) => op.method === 'POST' ? new Promise(r => { terminar = r }) : ok(url.endsWith('/eventos') ? [evento] : []) })
  const envio = botao(p.render(), 'Inscrever-se').props.onClick()
  const bloco = nodes(p.render()).find(n => n.props.className === 'ppDetalhesInscricao')
  const ocupada = nodes(bloco).find(n => n.type === 'button' && n.props['aria-busy'])
  assert.equal(ocupada.props.disabled, true); assert.match(text(ocupada), /Realizando inscrição/)
  await ocupada.props.onClick()
  const posts = p.chamadas.filter(([, op]) => op.method === 'POST')
  assert.equal(posts.length, 1); assert.equal(posts[0][0], '/participante/inscricoes')
  assert.deepEqual(JSON.parse(posts[0][1].body), { evento_id: evento.id })
  assert.equal(p.confirmacoes.length, 1)
  terminar(ok({ id: 10 })); await envio
  assert.deepEqual(p.avisos, ['Inscrição realizada com sucesso!']); assert.match(text(p.render()), /Meus ingressos/)
  p.close()
})

test('Meus ingressos preserva histórico, números, estados e datas sem oferecer emissão ou novas ações', async () => {
  const ingressos = [
    { id: 101, evento_id: 4, evento_nome: 'Evento anterior', evento_data: '2030-12-31T00:00:00Z', evento_horario: '18:00', evento_local: 'Local histórico', evento_status: 'Encerrado', status: 'Confirmada' },
    { id: 102, evento_id: 5, evento_nome: 'Outro evento', evento_data: null, evento_horario: '', evento_local: '', evento_status: 'Cancelado', status: 'Cancelada' },
    { id: 103, evento_id: 6 },
  ]
  const p = participante({ ingressos }); p.render(); await tick()
  const v = p.navegar('Meus ingressos'), regiao = nodes(v).find(n => n.props.className === 'ppInscricoes')
  assert.equal(regiao.props['aria-labelledby'], 'participante-ingressos-titulo')
  const cards = nodes(regiao).filter(n => n.type === 'article')
  assert.equal(cards.length, 3)
  for (const [i, card] of cards.entries()) {
    assert.match(text(card), new RegExp('Inscrição nº\\s+' + ingressos[i].id))
    const h3 = nodes(card).find(n => n.type === 'h3'); assert.equal(card.props['aria-labelledby'], h3.props.id)
    assert.equal(nodes(card).filter(n => n.type === 'button' || n.type === 'a' || n.type === 'img').length, 0)
  }
  for (const s of ['31/12/2030', '18:00', 'Local histórico', 'Estado do evento:', 'Encerrado', 'Status:', 'Confirmada']) assert.ok(text(cards[0]).includes(s), s)
  assert.match(text(cards[1]), /Cancelado/); assert.match(text(cards[1]), /Cancelada/)
  assert.match(text(cards[2]), /Nome não informado/); assert.match(text(cards[2]), /Não informada/); assert.match(text(cards[2]), /Não informado/)
  assert.doesNotMatch(text(regiao), /QR Code|Emitir|Comprar|Download|Ingresso digital/)
  p.close()
})

test('inscrições com nomes e locais extensos mantêm todas as informações', async () => {
  const nome = 'Nome extenso '.repeat(60), local = 'Local extenso '.repeat(80)
  const p = participante({ ingressos: [{ id: 7, evento_id: 4, evento_nome: nome, evento_local: local, status: 'Confirmada' }] })
  p.render(); await tick(); const card = nodes(p.navegar('Meus ingressos')).find(n => n.type === 'article')
  assert.equal(text(nodes(card).find(n => n.type === 'h3')), nome); assert.ok(text(card).includes(local)); p.close()
})

for (const largura of [360, 390, 768, 1024, 1440, 720, 320, 375]) test(`detalhes e ingressos refluem sem cortes nas regras de ${largura}px`, () => {
  assert.equal(estiloParticipante('.participantePagina .ppDetalhesGrade', largura)['grid-template-columns'], largura <= 900 ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(260px, .65fr)')
  assert.equal(estiloParticipante('.participantePagina .ppDetalhesDados', largura)['grid-template-columns'], largura <= 700 ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))')
  assert.equal(estiloParticipante('.participantePagina .ppDetalhes', largura)['min-width'], '0')
  assert.equal(estiloParticipante('.participantePagina .ppIngresso', largura)['overflow-wrap'], 'anywhere')
  assert.equal(estiloParticipante('.participantePagina .ppDetalhesDescricao p', largura)['white-space'], 'pre-wrap')
  assert.equal(estiloParticipante('.participantePagina .ppDetalhesInscricao > .ttBotao', largura)['min-height'], '44px')
  assert.equal(estiloParticipante('.participantePagina .ppDetalhesMidia summary', largura)['min-height'], '44px')
  assert.equal(estiloParticipante('.participantePagina .ppDetalhesMidia .eventoCapa', largura)['object-fit'], 'cover')
  assert.equal(estiloParticipante('.participantePagina .ppDetalhesMidia .eventoCapa', largura)['aspect-ratio'], '16 / 9')
})

function menuParticipante(p, visivel = true) {
  let focado = 0
  const h = hooksAdmin({ Icone: 'svg' })
  const { NavegacaoRecolhivel } = carregarAdmin('components/layout/NavegacaoRecolhivel.jsx', ['NavegacaoRecolhivel'], h.env)
  const render = () => {
    const pai = p.render(), wrapper = nodes(pai).find(n => n.type === 'recolhivel')
    const v = h.render(NavegacaoRecolhivel, { ...wrapper.props, children: wrapper.children })
    const b = nodes(v).find(n => n.props['aria-controls'])
    b.props.ref.current = { getClientRects: () => visivel ? [1] : [], focus: () => focado++ }
    return v
  }
  return { render, focado: () => focado, close: h.close }
}

test('estrutura superior tem marca, identificação, navegação única e ações sem classes de layout do fornecedor', () => {
  const p = participante({ fetch: () => new Promise(() => {}) }), v = p.render()
  const cabecalho = nodes(v).find(n => n.type === 'header')
  assert.equal(cabecalho.props.className, 'ppCabecalho')
  assert.match(text(cabecalho), /PORTAL PARTICIPANTE/)
  assert.equal(nodes(v).filter(n => n.type === 'recolhivel').length, 1)
  for (const nome of ['Início', 'Explorar eventos', 'Meus ingressos', 'Meu perfil', 'Solicitar acesso', 'Sair']) assert.ok(botao(cabecalho, nome), nome)
  for (const classe of ['portalFornecedor', 'fornMenu', 'fornTopo', 'fornCorpo', 'fornConteudo']) assert.ok(!nodes(v).some(n => (n.props.className || '').split(' ').includes(classe)), classe)
  // A estrutura muda; o conteudo dos cards continua no contrato anterior.
  assert.ok(nodes(v).some(n => n.props.className === 'fornCartao'))
  p.close()
})

test('menu participante associa controle e painel; alterna abertura sem duplicar seções', () => {
  const p = participante({ fetch: () => new Promise(() => {}) }), m = menuParticipante(p)
  let v = m.render(), b = nodes(v).find(n => n.props['aria-controls'])
  assert.equal(b.type, 'button'); assert.equal(b.props.type, 'button')
  assert.equal(b.props['aria-label'], 'Menu do participante'); assert.equal(b.props['aria-expanded'], false)
  assert.equal(b.props['aria-controls'], 'menu-participante')
  assert.equal(nodes(v).find(n => n.props.id === b.props['aria-controls']).props['data-aberto'], false)
  b.props.onClick(); v = m.render(); b = nodes(v).find(n => n.props['aria-controls'])
  assert.equal(b.props['aria-expanded'], true)
  assert.equal(nodes(v).filter(n => n.type === 'nav' && n.props['aria-label'] === 'Seções do participante').length, 1)
  b.props.onClick(); assert.equal(nodes(m.render()).find(n => n.props['aria-controls']).props['aria-expanded'], false)
  m.close(); p.close()
})

test('Escape fecha menu e devolve foco ao botão visível, sem interceptar Tab, Enter ou Space', () => {
  const p = participante({ fetch: () => new Promise(() => {}) }), m = menuParticipante(p)
  nodes(m.render()).find(n => n.props['aria-controls']).props.onClick()
  let impedido = 0
  for (const key of ['Tab', 'Enter', ' ']) m.render().props.onKeyDown({ key, preventDefault() { impedido++ }, stopPropagation() {} })
  assert.equal(impedido, 0)
  m.render().props.onKeyDown({ key: 'Escape', preventDefault() { impedido++ }, stopPropagation() {} })
  assert.equal(impedido, 1); assert.equal(m.focado(), 1)
  assert.equal(nodes(m.render()).find(n => n.props['aria-controls']).props['aria-expanded'], false)
  m.close(); p.close()
})

test('selecionar seção fecha menu; título recebe foco e estado selecionado do Lote 1 permanece', async () => {
  const p = participante(); p.render(); await tick(); const m = menuParticipante(p)
  nodes(m.render()).find(n => n.props['aria-controls']).props.onClick()
  let v = m.render()
  botao(v, 'Meus ingressos').props.onClick()
  nodes(v).find(n => n.props.id === 'menu-participante').props.onClick({ target: { closest: () => true } })
  v = m.render()
  assert.equal(nodes(v).find(n => n.props['aria-controls']).props['aria-expanded'], false)
  assert.equal(m.focado(), 1); assert.equal(p.focos.at(-1).titulo, 'Meus ingressos')
  assert.equal(text(nodes(v).find(n => n.type === 'button' && n.props['aria-current'] === 'page')).trim(), 'Meus ingressos')
  m.close(); p.close()
})

test('menu que deixa de ter acionador visível não rouba foco no desktop', () => {
  const p = participante({ fetch: () => new Promise(() => {}) }), m = menuParticipante(p, false)
  nodes(m.render()).find(n => n.props['aria-controls']).props.onClick()
  m.render().props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} })
  assert.equal(m.focado(), 0); m.close(); p.close()
})

for (const largura of [360, 390, 768, 1024, 1440, 720, 320, 375]) test(`estrutura/menu em ${largura}px${largura === 720 ? ' (refluxo equivalente a 1440px/200%)' : ''}`, () => {
  const mobile = largura <= 900
  assert.equal(estiloParticipante('.participantePagina .ppNavegacao .alternarNavegacao', largura).display, mobile ? 'flex' : 'none')
  // display:none retira todos os controles descendentes da ordem de Tab.
  assert.equal(estiloParticipante(".participantePagina .ppNavegacao .painelNavegacao[data-aberto='false']", largura).display, mobile ? 'none' : 'flex')
  assert.equal(estiloParticipante('.participantePagina .ppNavegacao .painelNavegacao', largura).display, 'flex')
  assert.equal(estiloParticipante('.participantePagina .ppCabecalhoInterno', largura)['grid-template-columns'], largura <= 340 ? 'minmax(0, 1fr)' : mobile ? 'minmax(0, 1fr) auto' : 'auto minmax(0, 1fr)')
  assert.equal(estiloParticipante('.participantePagina .ppMenu .ttBotao', largura)['min-height'], '44px')
  assert.equal(estiloParticipante('.participantePagina .ppConteudo', largura)['min-width'], '0')
  assert.equal(estiloParticipante('.participantePagina .ppCabecalhoInterno', largura)['max-width'], '1328px')
})

test('refluxo extremo mantém marca e botão em linhas próprias sem esconder overflow nem adicionar animações', () => {
  assert.equal(estiloParticipante('.participantePagina .ppCabecalhoInterno', 320)['grid-template-columns'], 'minmax(0, 1fr)')
  assert.equal(estiloParticipante('.participantePagina .ppNavegacao .alternarNavegacao', 320)['grid-column'], '1')
  const css = readFileSync(new URL('../src/pages/participante/Participante.css', import.meta.url), 'utf8')
  assert.doesNotMatch(css, /animation:|transition:|overflow(?:-x)?:\s*hidden/)
})

test('perfil usa wrapper próprio e componente compartilhado sem mudar ações, foco ou consultas', async () => {
  const p = participante(); p.render(); await tick()
  const consultas = p.chamadas.length
  const v = p.navegar('Meu perfil')
  const wrapper = nodes(v).find(n => n.props.className === 'ppPerfil')
  assert.ok(wrapper)
  const perfis = nodes(wrapper).filter(n => n.type === 'perfil')
  assert.equal(perfis.length, 1)
  assert.equal(perfis[0].props.contexto, 'Participante')
  assert.equal(nodes(wrapper).filter(n => ['form', 'input', 'textarea'].includes(n.type)).length, 0)
  botao(wrapper, 'Solicitar acesso como organizador ou fornecedor').props.onClick()
  assert.deepEqual(p.destinos, ['solicitar-acesso'])
  assert.equal(p.focos.at(-1).titulo, 'Meu perfil')
  assert.equal(p.chamadas.length, consultas)
  assert.equal(nodes(p.navegar('Explorar eventos')).some(n => n.props.className === 'ppPerfil'), false)
  p.close()
})

test('acabamento de perfil/privacidade é isolado, sem esconder conteúdo ou alterar feedbacks semânticos', () => {
  const css = readFileSync(new URL('../src/pages/participante/Participante.css', import.meta.url), 'utf8')
  const regras = []
  postcss.parse(css).walkRules(regra => {
    if (!regra.selector.includes('.ppPerfil')) return
    regras.push(regra)
    for (const seletor of regra.selectors) assert.ok(seletor.startsWith('.participantePagina .ppPerfil'), seletor)
    regra.walkDecls(d => {
      assert.doesNotMatch(d.value, /#[0-9a-f]{3,8}\b|!important/i)
      assert.ok(!['order', 'animation', 'transition'].includes(d.prop))
      assert.ok(!(d.prop === 'display' && d.value === 'none'))
      assert.ok(!d.prop.startsWith('overflow') || d.value !== 'hidden')
    })
  })
  assert.ok(regras.length > 20)
  assert.ok(regras.every(r => !/ttAlerta|:disabled|:enabled/.test(r.selector)))
  assert.equal(estiloParticipante('.participantePagina .ppPerfil .privacidadeConta a:focus-visible', 390).outline, '3px solid var(--foco-cor)')
  assert.equal(estiloParticipante('.participantePagina .ppPerfil .ttCampoControle:focus-visible', 390)['outline-offset'], '3px')
})

for (const largura of [360, 390, 768, 1024, 1440, 720, 320, 375]) test(`perfil/privacidade: regras de refluxo em ${largura}px${largura === 720 ? ' (1440px/200%)' : ''}`, () => {
  assert.equal(estiloParticipante('.participantePagina .ppPerfil', largura)['min-width'], '0')
  assert.equal(estiloParticipante('.participantePagina .ppPerfil', largura)['overflow-wrap'], 'anywhere')
  assert.equal(estiloParticipante('.participantePagina .ppPerfil .perfilCampos .ttCampo', largura).margin, '0')
  assert.equal(estiloParticipante('.participantePagina .ppPerfil .perfilCampos .ttCampoControle', largura)['font-size'], '1rem')
  assert.equal(estiloParticipante('.participantePagina .ppPerfil .ttBotao', largura)['min-height'], '44px')
  assert.equal(estiloParticipante('.participantePagina .ppPerfil .privacidadeContaDados dd', largura)['overflow-wrap'], 'anywhere')
  assert.equal(estiloParticipante('.participantePagina .ppPerfil .privacidadeContaCartao', largura).padding, largura <= 700 ? '20px' : '24px')
  if (largura <= 700) assert.equal(estiloParticipante('.participantePagina .ppPerfil .perfilCampos', largura)['grid-template-columns'], 'minmax(0, 1fr)')
})
