import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { montarRouter, apiSintetica } from './helpers/routerDom.js'

const css = postcss.parse(readFileSync(new URL('../src/pages/participante/ParticipanteVisual.css', import.meta.url), 'utf8'))
const base = postcss.parse(readFileSync(new URL('../src/pages/participante/Participante.css', import.meta.url), 'utf8'))
function estilo(tree, selector, width) {
  const out = {}
  tree.walkRules(r => {
    for (let p = r.parent; p; p = p.parent) {
      const max = p.type === 'atrule' && p.params?.match(/max-width:\s*(\d+)px/)
      if (max && width > Number(max[1])) return
    }
    if (r.selectors.includes(selector)) r.walkDecls(d => { out[d.prop] = d.value })
  })
  return out
}
function luminancia(hex) {
  const c = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722
}
test('F13 isola a paleta, mantém Coral ativo e não sobrescreve cores de avisos', () => {
  const tokens = estilo(css, '.participantePagina', 1366)
  assert.equal(tokens['--pp-petroleo'], '#193B4D')
  assert.equal(tokens['--foco-cor'], 'var(--pp-petroleo)')
  for (const fundo of ['#FFFFFF', tokens['--pp-petroleo-suave']]) assert.ok((luminancia(fundo) + .05) / (luminancia(tokens['--pp-petroleo']) + .05) >= 4.5)
  css.walkRules(r => r.selectors.forEach(s => assert.ok(s.startsWith('.participantePagina'), s)))
  css.walkDecls(d => {
    assert.doesNotMatch(d.prop, /^--(?:marca-coral|acao-|estado-|desabilitado-)/)
    assert.ok(!(d.prop === 'overflow-x' && d.value === 'hidden'))
  })
  assert.equal(estilo(base, '.participantePagina .ppSecoes .ttBotao.ativo:enabled', 1366).background, 'var(--marca-coral-suave)')
  assert.equal(estilo(base, '.participantePagina .ppPerfil .privacidadeContaAcesso', 1366)['border-top'], '4px solid var(--marca-coral)')
})
// Verificação estrutural: não calcula a geometria nem simula zoom visual.
for (const width of [320, 375, 390, 768, 1366]) {
  test(`Participante preserva navegação, cards e toque em ${width}px`, () => {
    assert.equal(estilo(base, '.participantePagina .ppConteudo', width)['min-width'], '0')
    assert.equal(estilo(base, '.participantePagina .ppMenu .ttBotao', width)['min-height'], '44px')
    assert.equal(estilo(base, '.participantePagina .ppGradeEventos', width)['grid-template-columns'], width <= 700 ? 'minmax(0, 1fr)' : width <= 1100 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))')
    assert.equal(estilo(base, '.participantePagina .ppEsqueletos', width)['grid-template-columns'], estilo(base, '.participantePagina .ppGradeEventos', width)['grid-template-columns'])
    assert.equal(estilo(base, '.participantePagina .ppEventoCapa > .eventoCapaLista', width)['object-fit'], 'cover')
    assert.equal(estilo(base, '.participantePagina .ppEventoAcoes > .ttBotao', width)['min-height'], '44px')
    if (width <= 900) assert.equal(estilo(base, ".participantePagina .ppNavegacao .painelNavegacao[data-aberto='false']", width).display, 'none')
    if (width <= 700) {
      assert.equal(estilo(css, '.participantePagina .ppEventoAcoes > .ttBotao', width)['flex-basis'], '100%')
      assert.equal(estilo(css, '.participantePagina .ppIngressoDados', width)['grid-template-columns'], 'minmax(0, 1fr)')
    }
  })
}
test('explorar, detalhes e ingressos preservam informações, bloqueio de inscrição e histórico', async () => {
  const api = apiSintetica('participante'), calls = []
  const evento = { id: 7, nome: 'Evento sintético com nome extenso', categoria: 'Workshop', data: '2030-12-10', horario: '10:00:00', local: 'Local sintético', status: 'Ativo', descricao: 'Descrição sintética', inscritos_confirmados: 1, capacidade_maxima: 20, vagas_restantes: 19, lotado: false }
  const a = await montarRouter({ url: '/#/participante?secao=eventos', dados: { token: 'sintetico', perfil: 'participante' }, fetch: async (url, options) => {
    const path = new URL(url).pathname
    calls.push([path, options])
    if (path === '/participante/eventos') return { ok: true, status: 200, json: async () => [evento] }
    if (path === '/participante/inscricoes') return { ok: true, status: 200, json: async () => [{ id: 9, evento_id: 7, evento_nome: evento.nome, evento_data: evento.data, evento_horario: evento.horario, evento_local: evento.local, evento_status: 'Ativo', status: 'Confirmada' }] }
    return api(url, options)
  } })
  const button = text => [...a.document.querySelectorAll('button')].find(b => b.textContent.trim() === text)
  try {
    const card = a.document.querySelector('.ppEventoCartao')
    assert.equal(a.document.getElementById(card.getAttribute('aria-labelledby')).textContent, evento.nome)
    assert.match(card.textContent, /10\/12\/2030/)
    assert.match(card.textContent, /10:00:00/)
    assert.match(card.querySelector('.ppEventoDisponibilidade').textContent, /19 vagas disponíveis/)
    assert.equal(button('Já inscrito').disabled, true)
    await a.clicar(button('Ver detalhes'))
    assert.equal(a.window.location.hash, '#/participante?secao=detalhes&evento=7')
    assert.match(a.document.querySelector('.ppDetalhesInscricao').textContent, /Já inscrito/)
    assert.match(a.document.querySelector('.ppDetalhesDados').textContent, /Local sintético/)
    assert.equal(a.document.activeElement.id, 'participante-titulo')
    await a.clicar(button('Meus ingressos'))
    const ingresso = a.document.querySelector('.ppIngresso')
    assert.match(ingresso.textContent, /Evento sintético com nome extenso/)
    assert.match(ingresso.querySelector('.ppIngressoDados').textContent, /10\/12\/2030/)
    assert.match(ingresso.querySelector('.ppIngressoEstados').textContent, /Confirmada/)
    assert.equal(a.document.querySelectorAll('h1').length, 1)
    await a.back()
    assert.ok(a.document.querySelector('.ppDetalhes'))
    assert.ok(calls.every(([, options]) => !options.method || options.method === 'GET'))
  } finally { await a.close() }
})
