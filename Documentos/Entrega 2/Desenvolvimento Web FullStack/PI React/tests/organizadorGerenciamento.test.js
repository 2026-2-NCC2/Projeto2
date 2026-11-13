import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement, Fragment, useId, useMemo, useState, useRef, useEffect } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import { carregarAdmin, hooksAdmin, nodes, text } from './helpers/adminRuntime.js'
import { primitivasFixture, jsxPrimitivas } from './helpers/primitivasFixture.js'
import { agendaBrasilia, validarFormularioEvento } from '../src/utils/validarEvento.js'

const eventoBase = { id: 71, nome: 'Evento de teste', status: 'Em planejamento', data: '2026-12-10', horario: '10:30', local: 'Local sintético', publico: 100, categoria: 'Workshop', descricao: 'Descrição sintética', capacidade_maxima: null }
function pagina(nome, props = {}) {
  const chamadas = []
  const h = hooksAdmin({ ...primitivasFixture, agendaBrasilia, validarFormularioEvento, jsx: jsxPrimitivas, useMemo: f => f(), Icone: 'svg', CapaEvento: 'capa', MidiaEvento: 'midia', VagasEvento: 'vagas' })
  const view = carregarAdmin(`pages/organizador/${nome}.jsx`, [nome], h.env)[nome]
  const p = { evento: { ...eventoBase }, eventos: [{ ...eventoBase }], capacidades: { criar: true, publicar: true, cancelar: true, encerrar: true }, podeSalvar: true, controleCapacidade: true,
    setPagina: v => chamadas.push(['pagina', v]), aoSelecionarEvento: v => chamadas.push(['selecionar', v]),
    aoMudarEstado: (...v) => chamadas.push(v), aoPublicarEvento: v => chamadas.push(['publicar', v]),
    setEvento: f => { p.evento = f(p.evento) }, aoAvancarParaCustos: async () => chamadas.push(['salvar']), ...props }
  return { props: p, chamadas, render: () => h.render(view, p), close: h.close }
}
const classe = (v, c) => nodes(v).filter(n => n.props.className?.split(' ').includes(c))
const botao = (v, label) => nodes(v).find(n => n.type === 'button' && text(n).trim() === label)
const campo = (v, id) => nodes(v).find(n => n.props.id === id)

test('listagem mantém um card semântico por evento e métricas originais sem cálculos novos', () => {
  const nome = 'Evento '.repeat(100), local = 'Local'.repeat(100)
  const p = pagina('Eventos', { eventos: [{ ...eventoBase, nome, local, cotacao: 'Condição original', ticket: 'R$ 19,99' }] }), v = p.render()
  const card = classe(v, 'orgEvento')[0]
  assert.equal(card.type, 'article'); assert.equal(card.props['aria-label'], nome)
  assert.equal(classe(v, 'orgEvento').length, 1)
  const valores = classe(v, 'orgEventoNumeros')[0]
  assert.deepEqual(nodes(valores).filter(n => n.type === 'dt').map(n => text(n)), ['Público previsto', 'Cotação', 'Ticket sugerido'])
  assert.deepEqual(nodes(valores).filter(n => n.type === 'dd').map(n => text(n)), ['100', 'Condição original', 'R$ 19,99'])
  assert.ok(text(card).includes(local))
  assert.equal(nodes(card).filter(n => n.type === 'capa').length, 1)
  assert.equal(nodes(card).filter(n => n.type === 'midia').length, 1)
  assert.equal(nodes(card).filter(n => n.type === 'vagas').length, 1)
  assert.equal(nodes(card).find(n => n.type === 'midia').props.editar, true)
  p.close()
})

for (const status of ['Em planejamento', 'Ativo', 'Cancelado', 'Encerrado']) test('ações e estado preservados no card: ' + status, () => {
  const p = pagina('Eventos', { eventos: [{ ...eventoBase, status }] }), v = p.render()
  const card = classe(v, 'orgEvento')[0], acoes = classe(card, 'orgEventoAcoes')[0]
  assert.equal(acoes.props.role, 'group')
  assert.equal(acoes.props['aria-label'], 'Ações de Evento de teste')
  assert.equal(Boolean(botao(card, 'Publicar')), status === 'Em planejamento')
  assert.equal(Boolean(botao(card, 'Cancelar evento')), ['Em planejamento', 'Ativo'].includes(status))
  assert.equal(Boolean(botao(card, 'Encerrar evento')), status === 'Ativo')
  const acesso = botao(card, 'Custos e cotações')
  assert.equal(acesso.props.title, 'Acessar cotações e custos deste evento')
  assert.equal(acesso.props.type, 'button')
  acesso.props.onClick()
  assert.deepEqual(p.chamadas, [['selecionar', p.props.eventos[0]], ['pagina', 'custos']])
  assert.ok(text(classe(card, 'ttBadge')[0]).includes(status))
  p.close()
})

test('filtros comunicam seleção a tecnologias assistivas sem alterar os dados do dashboard', () => {
  const p = pagina('Eventos', { eventos: [eventoBase, { ...eventoBase, id: 72, status: 'Ativo' }] })
  const filtros = v => nodes(classe(v, 'filtros')[0]).filter(n => n.type === 'button')
  assert.deepEqual(filtros(p.render()).map(n => n.props['aria-pressed']), [true, false, false, false, false])
  filtros(p.render())[1].props.onClick()
  assert.deepEqual(filtros(p.render()).map(n => n.props['aria-pressed']), [false, true, false, false, false])
  assert.equal(classe(p.render(), 'orgEvento').length, 1)
  assert.equal(classe(p.render(), 'orgIndicador').length, 4)
  p.close()
})

test('grupos do formulário têm títulos, labels e dica de capacidade associados sem campos adicionais', () => {
  const p = pagina('CriarEvento'), v = p.render()
  assert.deepEqual(classe(v, 'orgFormularioGrupo').map(n => text(nodes(n).find(x => x.type === 'h2'))), ['Identificação', 'Data e local', 'Público e capacidade', 'Categoria e descrição'])
  for (const grupo of classe(v, 'orgFormularioGrupo')) assert.ok(nodes(grupo).some(n => n.props.id === grupo.props['aria-labelledby']))
  for (const label of nodes(v).filter(n => n.type === 'label')) assert.ok(campo(v, label.props.htmlFor))
  const cap = campo(v, 'capacidade-evento')
  assert.equal(cap.props['aria-describedby'], 'capacidade-evento-dica')
  assert.match(text(campo(v, 'capacidade-evento-dica')), /sem limite configurado.*estimativa independente.*inscritos confirmados/)
  assert.deepEqual(nodes(v).filter(n => n.type === 'input' || n.type === 'textarea').map(n => n.props.id), ['criarevento-campo-1', 'criarevento-campo-2', 'criarevento-campo-3', 'criarevento-campo-4', 'criarevento-campo-5', 'capacidade-evento', 'criarevento-campo-7'])
  p.close()
})

test('atributos e limites preservados; data auxilia escolha futura e validação é própria', () => {
  const p = pagina('CriarEvento'), v = p.render()
  const contratos = [
    ['criarevento-campo-1', undefined, undefined, undefined, 100, true],
    ['criarevento-campo-2', 'date', agendaBrasilia().data, '9999-12-31', undefined, true],
    ['criarevento-campo-3', 'time', undefined, undefined, undefined, true],
    ['criarevento-campo-4', undefined, undefined, undefined, 200, true],
    ['criarevento-campo-5', 'number', '1', '2147483647', undefined, true],
    ['capacidade-evento', 'number', '1', '2147483647', undefined, false],
  ]
  for (const [id, type, min, max, maxLength, required] of contratos) {
    const c = campo(v, id)
    assert.deepEqual([c.props.type, c.props.min, c.props.max, c.props.maxLength, c.props.required], [type, min, max, maxLength, required])
  }
  assert.equal(campo(v, 'criarevento-campo-7').props.maxLength, 10000)
  campo(v, 'criarevento-campo-5').props.onChange({ target: { value: '250' } })
  assert.equal(p.props.evento.publico, 250)
  campo(v, 'capacidade-evento').props.onChange({ target: { value: '300' } })
  assert.equal(p.props.evento.capacidade_maxima, 300)
  campo(v, 'capacidade-evento').props.onChange({ target: { value: '' } })
  assert.equal(p.props.evento.capacidade_maxima, null)
  campo(v, 'criarevento-campo-1').props.onChange({ target: { value: ' Nome sem transformação ' } })
  assert.equal(p.props.evento.nome, ' Nome sem transformação ')
  assert.equal(p.props.evento.publico, 250)
  p.close()
})

test('publicação, consulta indisponível e salvamento preservam bloqueios por campo e fieldset', async () => {
  const p = pagina('CriarEvento', { evento: { ...eventoBase, status: 'Ativo' } })
  let v = p.render()
  assert.ok(nodes(v).filter(n => n.type === 'input' && n.props.id !== 'capacidade-evento').every(n => n.props.disabled))
  assert.equal(campo(v, 'capacidade-evento').props.disabled, false)
  assert.equal(campo(v, 'criarevento-campo-7').props.disabled, false)
  p.props.salvando = true
  v = p.render()
  assert.equal(nodes(v).find(n => n.type === 'form').props['aria-busy'], true)
  assert.equal(nodes(v).find(n => n.type === 'fieldset').props.disabled, true)
  assert.equal(nodes(v).find(n => n.props.type === 'submit').props.disabled, true)
  await nodes(v).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.deepEqual(p.chamadas, [])
  p.props.salvando = false; p.props.podeSalvar = false
  await nodes(p.render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.match(text(p.render()), /salvamento está indisponível/)
  assert.deepEqual(p.chamadas, [])
  p.props.controleCapacidade = false
  assert.equal(campo(p.render(), 'capacidade-evento'), undefined)
  p.close()
})

test('envio continua aguardando callback original e retorna pelo guard existente, sem navegar por conta própria', async () => {
  let resolver, iniciadas = 0
  const p = pagina('CriarEvento', { aoAvancarParaCustos: () => { iniciadas++; return new Promise(r => { resolver = r }) } })
  const promessa = nodes(p.render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.equal(iniciadas, 1); assert.deepEqual(p.chamadas, [])
  resolver(); await promessa
  assert.deepEqual(p.chamadas, [])
  botao(p.render(), 'Voltar sem salvar').props.onClick()
  assert.deepEqual(p.chamadas, [['pagina', 'eventos']])
  assert.equal(nodes(p.render()).find(n => n.type === 'form').props.noValidate, true)
  p.close()
})

test('HTML real do formulário mantém um h1, campos nativos, botões com nomes e regiões de consulta', () => {
  const env = { jsx: createElement, Fragment, useId, useMemo, useState, useRef, useEffect, agendaBrasilia, validarFormularioEvento }
  const ui = carregarAdmin('components/ui/Primitivas.jsx', ['Botao', 'Campo', 'Alerta', 'Badge'], env)
  const { CriarEvento } = carregarAdmin('pages/organizador/CriarEvento.jsx', ['CriarEvento'], { ...env, ...ui, MidiaEvento: () => null, VagasEvento: () => null })
  const html = renderToStaticMarkup(createElement(CriarEvento, { evento: eventoBase, podeSalvar: true, controleCapacidade: true }))
  assert.equal((html.match(/<h1\b/g) || []).length, 1)
  assert.match(html, /<form[^>]*aria-label="Dados do evento"[^>]*aria-busy="false"/)
  assert.match(html, /<legend[^>]*>Dados básicos do evento<\/legend>/)
  assert.match(html, /for="capacidade-evento"/)
  assert.match(html, /aria-describedby="capacidade-evento-dica"/)
  assert.doesNotMatch(html, /tabindex="[1-9]|<input[^>]*type="file"|<iframe/)
})

const css = postcss.parse(readFileSync(new URL('../src/pages/organizador/OrganizadorGerenciamento.css', import.meta.url), 'utf8'))
function estilo(seletor, largura) {
  const resultado = {}
  css.walkRules(r => {
    if (!r.selectors.includes(seletor)) return
    let p = r.parent
    while (p) {
      if (p.type === 'atrule' && p.name === 'media' && largura > Number(p.params.match(/max-width:\s*(\d+)px/)[1])) return
      p = p.parent
    }
    r.walkDecls(d => { resultado[d.prop] = d.value })
  })
  return resultado
}
for (const largura of [360, 390, 768, 1024, 1440, 320, 720, 375]) test(`gerenciamento: regras responsivas em ${largura}px`, () => {
  assert.equal(estilo('.orgEventoFormulario .duasColunas', largura)['grid-template-columns'], largura <= 700 ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))')
  assert.equal(estilo('.orgDashboard .orgGerenciamento .orgEventoNumeros', largura)['grid-template-columns'], largura <= 600 ? 'minmax(0, 1fr)' : 'repeat(3, minmax(0, 1fr))')
  assert.equal(estilo('.orgDashboard .orgGerenciamento .orgEventoAcoes .ttBotao', largura)['min-height'], '44px')
  assert.equal(estilo('.orgEventoFormulario .orgFormularioGrupo .ttCampoControle', largura)['min-height'], '44px')
  assert.equal(estilo('.orgDashboard .orgGerenciamento .orgEvento', largura)['min-width'], '0')
  assert.equal(estilo('.orgDashboard .orgGerenciamento .orgEventoCabecalho > *', largura)['overflow-wrap'], 'anywhere')
  if (largura <= 600) assert.equal(estilo('.orgDashboard .orgGerenciamento .orgEventoAcoes .ttBotao', largura).flex, '1 1 100%')
})

test('estilos usam tokens, não cortam foco e não alcançam painéis O2, sidebar ou outros portais', () => {
  css.walkRules(r => r.selectors.forEach(s => assert.ok(s.startsWith('.orgDashboard .orgGerenciamento ') || s.startsWith('.orgEventoFormulario'), s)))
  assert.doesNotMatch(css.toString(), /#[\da-f]{3,8}\b|url\(|animation:|transition:|overflow(?:-x)?:\s*hidden|\.orgSidebar|\.orgIndicador|\.orgPainel|\.pp|\.forn|\.admin/)
  assert.equal(estilo('.orgEventoFormulario button:focus-visible', 360).outline, '3px solid var(--foco-cor)')
  assert.equal(estilo('.orgDashboard .orgGerenciamento .listaEventos', 360).overflow, 'visible')
  assert.equal(estilo('.orgDashboard .orgGerenciamento .orgEventoNumeros > div', 360)['overflow-wrap'], 'anywhere')
  const fonte = readFileSync(new URL('../src/pages/organizador/CriarEvento.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(fonte, /fetch\(|sessionStorage|localStorage|history\.|useNavegacao|services\//)
})
