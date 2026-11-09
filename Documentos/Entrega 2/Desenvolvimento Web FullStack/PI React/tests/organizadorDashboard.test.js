import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement, Fragment, useId, useMemo, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import { carregarAdmin, hooksAdmin, nodes, text } from './helpers/adminRuntime.js'
import { primitivasFixture, jsxPrimitivas } from './helpers/primitivasFixture.js'

const evento = (id, status, extra = {}) => ({ id, status, nome: `Evento ${id}`, data: '2026-11-18', horario: '10:30:00', local: 'Local sintético', ...extra })
const dados = [evento(1, 'Ativo'), evento(2, 'Em planejamento'), evento(3, 'Cancelado'), evento(4, 'Encerrado'), evento(5, 'Ativo')]
function pagina(props = {}) {
  const chamadas = []
  const h = hooksAdmin({ ...primitivasFixture, jsx: jsxPrimitivas, Icone: 'svg', CapaEvento: 'capa', MidiaEvento: 'midia', VagasEvento: 'vagas', useMemo: fn => fn(),
    fetch() { throw Error('Dashboard não pode realizar consultas') } })
  const { Eventos } = carregarAdmin('pages/organizador/Eventos.jsx', ['Eventos'], h.env)
  const p = { eventos: dados, capacidades: { criar: true, cancelar: true, publicar: true, encerrar: true },
    setPagina: v => chamadas.push(['pagina', v]), aoSelecionarEvento: v => chamadas.push(['selecionar', v]),
    aoCriarNovoEvento: () => chamadas.push(['novo']), aoPublicarEvento: v => chamadas.push(['publicar', v]),
    aoMudarEstado: (...v) => chamadas.push(v), aoTentarNovamente: () => chamadas.push(['repetir']), ...props }
  return { props: p, chamadas, render: () => h.render(Eventos, p), close: h.close }
}
const classe = (v, nome) => nodes(v).filter(n => n.props.className?.split(' ').includes(nome))
const indicador = (v, titulo) => classe(v, 'orgIndicador').find(n => text(n).includes(titulo))
const valor = n => text(nodes(n).find(n => n.type === 'strong')).trim()
const botao = (v, titulo) => nodes(v).find(n => n.type === 'button' && text(n).trim().replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')') === titulo)

test('dashboard calcula indicadores apenas da lista recebida, sem métricas financeiras ou chamadas adicionais', () => {
  const p = pagina(), v = p.render()
  assert.deepEqual(classe(v, 'orgIndicador').map(n => valor(n)), ['5', '2', '1', '1'])
  assert.equal(classe(v, 'orgIndicadorDestaque').length, 1)
  assert.equal(valor(indicador(v, 'Total de eventos')), '5')
  assert.match(text(v), /antes dos filtros abaixo/)
  const resumo = text(classe(v, 'orgDashboardResumo')[0])
  assert.doesNotMatch(resumo, /R\$|receita|faturamento|pagamentos|vendas|conversões|crescimento|inscritos|vagas/i)
  assert.deepEqual(p.chamadas, [])
  p.props.eventos = [evento(9, 'Encerrado', { usuario_id: 12 })]
  const outraConta = p.render()
  assert.deepEqual(classe(outraConta, 'orgIndicador').map(n => valor(n)), ['1', '0', '0', '1'])
  assert.doesNotMatch(text(outraConta), /Evento 1\b|Evento 5\b/)
  p.close()
})

test('indicadores e painéis não mudam com filtros; a listagem mantém os quatro estados', () => {
  const p = pagina()
  for (const [filtro, estado] of [['Ativos (2)', 'Ativo'], ['Em planejamento (1)', 'Em planejamento'], ['Cancelado (1)', 'Cancelado'], ['Encerrado (1)', 'Encerrado']]) {
    const controle = botao(p.render(), filtro)
    assert.ok(controle, filtro)
    controle.props.onClick()
    const v = p.render()
    assert.deepEqual(classe(v, 'orgIndicador').map(n => valor(n)), ['5', '2', '1', '1'])
    assert.equal(classe(v, 'evento').length, dados.filter(e => e.status === estado).length)
    assert.equal(nodes(classe(v, 'orgDistribuicao')[0]).filter(n => n.type === 'dt').length, 4)
  }
  p.close()
})

test('busca sem resultados não confunde o resumo da conta com o resultado filtrado', () => {
  const p = pagina()
  nodes(p.render()).find(n => n.type === 'input').props.onChange({ target: { value: 'inexistente' } })
  const v = p.render()
  assert.match(text(v), /Nenhum evento encontrado para o filtro aplicado/)
  assert.equal(classe(v, 'evento').length, 0)
  assert.equal(valor(indicador(v, 'Total de eventos')), '5')
  p.close()
})

test('painel de ativos limita o resumo a três registros e explicita seu escopo, sem duplicar controles', () => {
  const ativos = Array.from({ length: 5 }, (_, i) => evento(i + 1, 'Ativo'))
  const p = pagina({ eventos: [...ativos, evento(6, 'Cancelado')] }), v = p.render()
  const painel = classe(v, 'orgPainel')[1]
  assert.match(text(painel), /Até 3 eventos ativos, na mesma ordem da listagem/)
  assert.deepEqual(nodes(painel).filter(n => n.type === 'h3').map(n => text(n).trim()), ['Evento 1', 'Evento 2', 'Evento 3'])
  assert.equal(nodes(painel).filter(n => n.type === 'button' || n.type === 'a' || n.type === 'capa' || n.type === 'midia').length, 0)
  assert.equal(classe(v, 'listaEventos').length, 1)
  assert.equal(classe(v, 'evento').length, 6)
  p.close()
})

test('resumo preserva datas civis, horários e informa campos ausentes sem inventar agenda futura', () => {
  const p = pagina({ eventos: [evento(1, 'Ativo'), evento(2, 'Ativo', { data: '2026-11-18T03:00:00.000Z' }), evento(3, 'Ativo', { data: 'invalida', horario: null, local: ' ' })] })
  const resumo = text(classe(p.render(), 'orgAtivosResumo')[0])
  assert.equal((resumo.match(/18\/11\/2026/g) || []).length, 2)
  assert.match(resumo, /10:30/)
  assert.match(resumo, /Data não informada/)
  assert.match(resumo, /Local não cadastrado/)
  assert.doesNotMatch(resumo, /Invalid Date|NaN|próximos/i)
  p.close()
})

test('carregamento oculta valores e nomes anteriores e usa skeletons para indicadores e painéis', () => {
  const p = pagina({ carregando: true }), v = p.render()
  assert.equal(classe(v, 'orgIndicador').length, 0)
  assert.equal(classe(v, 'orgIndicadorSkeleton').length, 4)
  assert.equal(classe(v, 'orgPainelSkeleton').length, 2)
  assert.equal(classe(v, 'evento').length, 0)
  assert.match(text(v), /Carregando eventos/)
  assert.doesNotMatch(text(v), /Evento 1|Evento 5/)
  assert.ok(classe(v, 'ttSkeleton').every(n => String(n.props['aria-busy']) === 'true' && n.props.role === 'status'))
  p.close()
})

test('falha mantém mensagem persistente e nova tentativa; não apresenta erro como zero ou snapshot completo', () => {
  const p = pagina({ erro: 'Não foi possível carregar os eventos. Tente novamente.' })
  for (let i = 0; i < 3; i++) {
    const v = p.render()
    assert.equal(classe(v, 'orgIndicador').length, 0)
    assert.equal(classe(v, 'orgPainel').length, 0)
    assert.equal(classe(v, 'evento').length, 0)
    assert.match(text(nodes(v).find(n => n.props.role === 'alert')), /Não foi possível carregar os eventos/)
  }
  botao(p.render(), 'Tentar novamente').props.onClick()
  assert.deepEqual(p.chamadas, [['repetir']])
  p.close()
})

test('consulta vazia confirma zero eventos sem produzir erro e preserva criação conforme capacidade', () => {
  const p = pagina({ eventos: [] }), v = p.render()
  assert.deepEqual(classe(v, 'orgIndicador').map(n => valor(n)), ['0', '0', '0', '0'])
  assert.match(text(v), /Você ainda não possui eventos cadastrados/)
  assert.match(text(v), /Nenhum evento ativo nesta consulta/)
  assert.equal(nodes(v).filter(n => n.props.role === 'alert').length, 0)
  assert.equal(botao(v, 'Novo evento').props.disabled, false)
  p.props.capacidades = {}
  assert.equal(botao(p.render(), 'Novo evento').props.disabled, true)
  assert.match(text(p.render()), /temporariamente indisponíveis/)
  p.close()
})

test('ações originais mantêm referências, parâmetros, ordem e bloqueios sem atalhos novos', () => {
  const p = pagina({ eventos: [evento(1, 'Em planejamento'), evento(2, 'Ativo')] })
  botao(p.render(), 'Novo evento').props.onClick()
  botao(p.render(), 'Publicar').props.onClick()
  botao(p.render(), 'Cancelar evento').props.onClick()
  botao(p.render(), 'Encerrar evento').props.onClick()
  const acesso = nodes(p.render()).find(n => n.type === 'button' && n.props.title === 'Acessar cotações e custos deste evento')
  acesso.props.onClick()
  assert.deepEqual(p.chamadas, [['novo'], ['pagina', 'criar'], ['publicar', p.props.eventos[0]], [p.props.eventos[0], 'cancelar'], [p.props.eventos[1], 'encerrar'], ['selecionar', p.props.eventos[0]], ['pagina', 'custos']])
  p.props.capacidades = {}
  assert.ok(nodes(p.render()).filter(n => n.type === 'button' && /Novo evento|Publicar|Cancelar evento|Encerrar evento/.test(text(n))).every(n => n.props.disabled))
  assert.equal(classe(p.render(), 'evento').length, 2)
  p.close()
})

test('renderização real mantém semântica, título único e rótulos associados aos valores e painéis', () => {
  const env = { jsx: createElement, Fragment, useId, useMemo, useState }
  const ui = carregarAdmin('components/ui/Primitivas.jsx', ['Botao', 'Badge', 'Alerta', 'Skeleton', 'EstadoVazio'], env)
  const { Icone } = carregarAdmin('components/ui/Icone.jsx', ['Icone'], env)
  const { Eventos } = carregarAdmin('pages/organizador/Eventos.jsx', ['Eventos'], {
    ...env, ...ui, Icone, CapaEvento: () => null, MidiaEvento: () => null, VagasEvento: () => null,
  })
  const html = renderToStaticMarkup(createElement(Eventos, { eventos: dados, capacidades: { criar: true } }))
  assert.equal((html.match(/<h1\b/g) || []).length, 1)
  assert.match(html, /<h1>Visão geral dos seus eventos<\/h1>/)
  assert.match(html, /<section aria-label="Indicadores dos seus eventos"/)
  assert.match(html, /<dt><svg[^]*?<\/svg>Total de eventos<\/dt><dd><strong>5<\/strong>/)
  for (const id of ['org-distribuicao-titulo', 'org-ativos-titulo', 'org-gerenciamento-titulo']) {
    assert.match(html, new RegExp(`aria-labelledby="${id}"`))
    assert.match(html, new RegExp(`<h2 id="${id}"`))
  }
  assert.match(html, /<h3>Evento 1<\/h3>/)
  assert.doesNotMatch(html, /tabindex="[1-9]|<canvas|<iframe/)
})

const source = readFileSync(new URL('../src/pages/organizador/Eventos.jsx', import.meta.url), 'utf8')
const css = postcss.parse(readFileSync(new URL('../src/pages/organizador/OrganizadorDashboard.css', import.meta.url), 'utf8'))
function estilo(seletor, largura) {
  const valores = {}
  css.walkRules(r => {
    if (!r.selectors.includes(seletor)) return
    let pai = r.parent
    while (pai) {
      if (pai.type === 'atrule' && pai.name === 'media' && largura > Number(pai.params.match(/max-width:\s*(\d+)px/)[1])) return
      pai = pai.parent
    }
    r.walkDecls(d => { valores[d.prop] = d.value })
  })
  return valores
}
for (const largura of [360, 390, 768, 1024, 1440, 320, 720]) test(`dashboard: regras de reflow em ${largura}px`, () => {
  assert.equal(estilo('.orgDashboard .orgIndicadores', largura)['grid-template-columns'], largura <= 380 ? 'minmax(0, 1fr)' : largura <= 1200 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))')
  assert.equal(estilo('.orgDashboard .orgPaineis', largura)['grid-template-columns'], largura <= 1200 ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))')
  assert.equal(estilo('.orgDashboard .orgIndicador', largura)['min-width'], '0')
  assert.equal(estilo('.orgDashboard .orgPainel', largura)['min-width'], '0')
  assert.equal(estilo('.orgDashboard .orgGerenciamento .filtros input', largura)['min-height'], '44px')
})

test('estilos isolados preservam tokens, foco, movimento reduzido e não modificam sidebar ou outros portais', () => {
  css.walkRules(r => r.selectors.forEach(s => assert.ok(s.startsWith('.orgDashboard'), s)))
  assert.doesNotMatch(css.toString(), /#[\da-f]{3,8}\b|url\(|animation:|transition:|overflow(?:-x)?:\s*hidden|\.orgSidebar|\.orgNavegacao|\.pp|\.forn|\.admin/)
  assert.equal(estilo('.orgDashboard .orgIndicadorDestaque', 1440).background, 'var(--texto-principal)')
  assert.equal(estilo('.orgDashboard .orgIndicadorDestaque dd strong', 1440).color, 'var(--superficie-cartao)')
  assert.equal(estilo('.orgDashboard button:focus-visible', 360).outline, '3px solid var(--foco-cor)')
  const uiCss = readFileSync(new URL('../src/components/ui/Primitivas.css', import.meta.url), 'utf8')
  assert.match(uiCss, /prefers-reduced-motion:\s*reduce/)
})

test('dashboard não introduz armazenamento, consultas, histórico, identidade ou controles de autenticação', () => {
  assert.doesNotMatch(source, /\bfetch\b|useEffect|sessionStorage|localStorage|history\.|useNavegacao|services\/|usuario_id|token|eventos_vagas_v3/)
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(app, /const resposta = await listarEventos\(token\)/)
  assert.match(app, /if \(consultaAtiva\) setEventos\(dados\)/)
  assert.match(app, /<Eventos\s+eventos=\{eventos\}/)
  const backend = readFileSync(new URL('../../PI Backend/server.js', import.meta.url), 'utf8')
  assert.match(backend, /app\.get\("\/eventos", autenticar,[^]*?eventosRepository\.listarPorUsuario\(req\.usuario\.id\)/)
})
