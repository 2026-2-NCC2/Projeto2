import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { carregarAdmin, hooksAdmin, nodes, text } from './helpers/adminRuntime.js'
import { primitivasFixture, jsxPrimitivas } from './helpers/primitivasFixture.js'
import { formatarMoeda } from '../src/utils/formatarMoeda.js'

const ok = dados => ({ ok: true, json: async () => dados })
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const cotacao = { id: 8, evento_id: 4, evento_nome: 'Evento sintético', evento_local: 'Local sintético',
  itens: [{ categoria: 'Áudio' }], prazo: '2030-05-01', observacoes: 'Condições sintéticas', status: 'Aberta' }
const proposta = { id: 10, evento_nome: 'Proposta sintética', valor: '12.34', status: 'Em avaliação', categoria: 'Áudio' }

function fornecedor({ cotacoes = [cotacao], propostas = [], fetch, pagina = 'fornecedor-mural', navegacao } = {}) {
  const chamadas = [], destinos = [], avisos = []
  let saidas = 0
  const h = hooksAdmin({ ...primitivasFixture, jsx: jsxPrimitivas, Icone: 'svg', IdentidadeConta: 'identidade', NavegacaoRecolhivel: 'navegacao-recolhivel',
    CapaEvento: 'capa', MidiaEvento: 'midia', PortfolioFornecedor: 'portfolio', formatarMoeda, AbortController,
    apiUrl: p => p, sessionStorage: { getItem: () => 'token-sintetico' }, console: { error() {} }, alert: m => avisos.push(m),
    fetch: async (url, opcoes) => { chamadas.push([url, opcoes]); return fetch ? fetch(url, opcoes) : ok(url.endsWith('/cotacoes') ? cotacoes : propostas) },
  })
  const fn = carregarAdmin('pages/fornecedor/PortalFornecedor.jsx', ['PortalFornecedor'], h.env).PortalFornecedor
  const props = { pagina, setPagina: p => { destinos.push(p); props.pagina = p }, aoSair: () => saidas++, PerfilFornecedor: 'perfil', navegacao }
  const render = () => h.render(fn, props)
  const ir = pagina => { props.pagina = pagina; return render() }
  const alterar = (id, value) => nodes(render()).find(n => n.props.id === id).props.onChange({ target: { value } })
  return { render, ir, alterar, chamadas, destinos, avisos, close: () => h.close(), saidas: () => saidas }
}
const botao = (v, nome) => nodes(v).find(n => n.type === 'button' && text(n).trim() === nome)
const linhas = v => nodes(v).filter(n => n.props.className === 'fornTabelaLinha')

test('URL da proposta aguarda cotação da consulta autorizada e não mistura rascunhos entre IDs', async () => {
  const nav = { estado: { cotacaoId: 8 }, mudar(d) { this.estado = d } }
  const p = fornecedor({ pagina: 'fornecedor-proposta', navegacao: nav, cotacoes: [cotacao, { ...cotacao, id: 9, evento_nome: 'Outro evento sintético' }] })
  const inicial = p.render()
  assert.match(text(inicial), /Restaurando cotação/)
  assert.equal(nodes(inicial).some(n => n.type === 'form'), false)
  await tick()
  assert.match(text(p.render()), /Evento sintético/)
  p.alterar('fornecedor-proposta-1', '123.45')
  nav.estado = { cotacaoId: 9 }; p.render()
  const novo = p.render()
  assert.match(text(novo), /Outro evento sintético/)
  assert.equal(nodes(novo).find(n => n.props.id === 'fornecedor-proposta-1').props.value, '')
  nav.estado = { cotacaoId: 8 }; p.render()
  assert.match(text(p.render()), /Evento sintético/)
  assert.ok(p.chamadas.every(([, opts]) => !opts.method || opts.method === 'GET'))
  p.close()
})

test('cotação de URL não disponível para a conta nunca renderiza formulário nem mantém ID inválido', async () => {
  const nav = { estado: { cotacaoId: 999 }, mudar(d) { this.estado = d } }
  const p = fornecedor({ pagina: 'fornecedor-proposta', navegacao: nav })
  p.render(); await tick(); p.render()
  assert.equal(nodes(p.render()).some(n => n.type === 'form'), false)
  assert.equal(nav.estado.cotacaoId, null)
  assert.ok(p.destinos.includes('fornecedor-mural')); p.close()
})

test('skeletons de consultas e indicadores nao apresentam ausencias ou contagens ficticias', () => {
  const p = fornecedor({ fetch: () => new Promise(() => {}) })
  const v = p.render()
  assert.match(text(v), /Carregando oportunidades/); assert.match(text(v), /Consultando quantidade/)
  assert.match(text(v), /Carregando propostas/)
  assert.doesNotMatch(text(v), /Nenhuma cotação disponível|Nenhuma proposta enviada|0 EVENTOS/)
  assert.match(text(p.ir('fornecedor-enviadas')), /Carregando propostas/)
})

test('cotacoes vazias e busca sem resultados sao estados diferentes', async () => {
  const vazio = fornecedor({ cotacoes: [] }); vazio.render(); await tick()
  assert.match(text(vazio.render()), /Nenhuma cotação disponível no momento/)
  const p = fornecedor(); p.render(); await tick()
  p.alterar('fornecedor-busca', 'inexistente')
  assert.match(text(p.render()), /Nenhum resultado encontrado pelos filtros/)
  assert.doesNotMatch(text(p.render()), /Nenhuma cotação disponível/)
})

test('busca local conserva pesquisa por evento, categoria e local sem novas consultas', async () => {
  const p = fornecedor(); p.render(); await tick(); const antes = p.chamadas.length
  for (const termo of ['EVENTO SINTÉTICO', 'áudio', 'local sintético']) {
    p.alterar('fornecedor-busca', termo); assert.match(text(p.render()), /Evento sintético/)
  }
  assert.equal(p.chamadas.length, antes)
})

test('nenhuma proposta e filtro sem correspondencias mantem mensagens distintas', async () => {
  const vazio = fornecedor({ propostas: [], pagina: 'fornecedor-enviadas' }); vazio.render(); await tick()
  assert.match(text(vazio.render()), /Nenhuma proposta enviada/)
  const p = fornecedor({ propostas: [proposta], pagina: 'fornecedor-enviadas' }); p.render(); await tick()
  botao(p.render(), 'Aprovada').props.onClick()
  assert.match(text(p.render()), /Nenhum resultado encontrado pelos filtros/)
  assert.doesNotMatch(text(p.render()), /Nenhuma proposta enviada/)
  assert.equal(linhas(p.render()).length, 0)
})

test('fornecedor recupera busca e filtros e identifica a cotação da ação sem enviar proposta', async () => {
  const p = fornecedor({ propostas: [proposta] }); p.render(); await tick()
  try {
    const total = p.chamadas.length
    let focos = 0
    nodes(p.render()).find(n => n.props.id === 'fornecedor-busca').props.ref.current = { focus() { focos++ } }
    p.alterar('fornecedor-busca', 'sem-correspondencia')
    botao(p.render(), 'Limpar busca').props.onClick()
    assert.equal(focos, 1)
    const enviar = nodes(p.render()).find(n => n.props['aria-label']?.startsWith('Elaborar proposta para'))
    assert.match(enviar.props['aria-label'], /Evento sintético, cotação #8/)
    p.ir('fornecedor-enviadas')
    botao(p.render(), 'Todas').props.ref.current = { focus() { focos++ } }
    botao(p.render(), 'Aprovada').props.onClick()
    botao(p.render(), 'Mostrar todas as propostas').props.onClick()
    assert.equal(linhas(p.render()).length, 1)
    assert.equal(focos, 2)
    assert.equal(p.chamadas.length, total)
  } finally { p.close() }
  const vazio = fornecedor({ pagina: 'fornecedor-enviadas' }); vazio.render(); await tick()
  try {
    botao(vazio.render(), 'Explorar oportunidades').props.onClick()
    assert.deepEqual(vazio.destinos, ['fornecedor-mural'])
    assert.equal(vazio.chamadas.some(([, opcoes]) => opcoes?.method === 'POST'), false)
  } finally { vazio.close() }
})

test('falhas de consulta permanecem visiveis e nao aparecem como ausencia de dados', async () => {
  const p = fornecedor({ fetch: async () => ({ ok: false, json: async () => ({ erro: 'Consulta indisponível' }) }) })
  p.render(); await tick()
  for (let i = 0; i < 3; i++) {
    const v = p.render()
    assert.match(text(v), /Consulta indisponível/); assert.match(text(v), /Erro de consulta de cotações/)
    assert.ok(nodes(v).some(n => n.props.role === 'alert'))
    assert.doesNotMatch(text(v), /Nenhuma cotação disponível|0 EVENTOS/)
  }
  assert.doesNotMatch(text(p.ir('fornecedor-enviadas')), /Nenhuma proposta enviada/)
})

test('reconsulta de propostas conserva GET autenticado, abortSignal e tentativa manual', async () => {
  let consultas = 0
  const p = fornecedor({ pagina: 'fornecedor-enviadas', fetch: async url => {
    if (url.endsWith('/cotacoes')) return ok([])
    return ++consultas === 1 ? { ok: false, json: async () => ({ erro: 'Falha controlada' }) } : ok([proposta])
  } })
  p.render(); await tick(); botao(p.render(), 'Tentar novamente').props.onClick()
  p.render(); await tick()
  assert.equal(consultas, 2); assert.equal(linhas(p.render()).length, 1)
  const gets = p.chamadas.filter(([url]) => url === '/fornecedor/propostas')
  assert.equal(gets[0][1].headers.Authorization, 'Bearer token-sintetico')
  assert.equal(gets[0][1].signal.aborted, true); assert.equal(gets[1][1].signal.aborted, false)
  p.close(); assert.equal(gets[1][1].signal.aborted, true)
})

test('historico mantem quatro colunas, regiao focavel, status e valores monetarios', async () => {
  const dados = [proposta, { ...proposta, id: 11, evento_nome: 'Aprovada sintética', valor: '20.10', status: 'Aprovada' },
    { ...proposta, id: 12, evento_nome: 'Recusada sintética', valor: '1.01', status: 'Recusada' }]
  const p = fornecedor({ propostas: dados, pagina: 'fornecedor-enviadas' }); p.render(); await tick()
  const v = p.render(), regiao = nodes(v).find(n => n.props.className === 'fornTabela')
  assert.equal(regiao.props.role, 'region'); assert.equal(regiao.props.tabIndex, 0)
  assert.equal(nodes(regiao).filter(n => n.props.role === 'table').length, 1)
  assert.equal(nodes(regiao).filter(n => n.props.role === 'columnheader').length, 4)
  assert.equal(linhas(v).length, 3)
  for (const linha of linhas(v)) assert.equal(nodes(linha).filter(n => n.props.role === 'cell').length, 4)
  for (const valor of ['12,34', '20,10', '1,01', '33,45']) assert.ok(text(v).includes(valor))
  assert.match(text(v), /Em avaliação/); assert.match(text(v), /Aprovada/); assert.match(text(v), /Recusada/)
})

test('formulario mantem labels, min, step, required e aceite nativo', async () => {
  const p = fornecedor(); p.render(); await tick()
  botao(p.render(), 'Elaborar proposta →').props.onClick()
  const v = p.render(), form = nodes(v).find(n => n.type === 'form')
  const valor = nodes(form).find(n => n.props.id === 'fornecedor-proposta-1')
  assert.equal(valor.props.type, 'number'); assert.equal(valor.props.min, '0.01'); assert.equal(valor.props.step, '0.01')
  assert.equal(nodes(form).filter(n => ['input', 'textarea'].includes(n.type) && n.props.required).length, 4)
  assert.equal(nodes(form).find(n => n.type === 'textarea').props.rows, '5')
  assert.equal(nodes(form).find(n => n.type === 'input' && n.props.type === 'checkbox').props.required, true)
  for (const label of nodes(form).filter(n => n.props.htmlFor)) assert.ok(nodes(form).some(n => n.props.id === label.props.htmlFor))
})

test('POST conserva cotacao, conversao numerica, condicoes e detalhes sem acrescentar campos', async () => {
  const p = fornecedor({ fetch: async (url, opcoes) => opcoes.method === 'POST' ? ok({ proposta_id: 99 }) : ok(url.endsWith('/cotacoes') ? [cotacao] : []) })
  p.render(); await tick(); botao(p.render(), 'Elaborar proposta →').props.onClick()
  p.alterar('fornecedor-proposta-1', '100.25'); p.alterar('fornecedor-proposta-2', 'Pagamento sintético'); p.alterar('fornecedor-proposta-3', 'Detalhes sintéticos')
  await nodes(p.render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
  const posts = p.chamadas.filter(([, opts]) => opts.method === 'POST')
  assert.equal(posts.length, 1); assert.equal(posts[0][0], '/fornecedor/propostas')
  assert.equal(posts[0][1].headers.Authorization, 'Bearer token-sintetico')
  assert.deepEqual(JSON.parse(posts[0][1].body), { cotacao_id: 8, valor: 100.25, condicoes_pagamento: 'Pagamento sintético', detalhes_tecnicos: 'Detalhes sintéticos' })
  assert.deepEqual(p.avisos, ['Proposta enviada com sucesso!']); assert.equal(p.destinos.at(-1), 'fornecedor-enviadas')
  assert.match(text(p.render()), /100,25/)
})

test('falha de envio conserva campos, tratamento existente e nao repete automaticamente', async () => {
  const p = fornecedor({ fetch: async (url, opts) => opts.method === 'POST' ? { ok: false, json: async () => ({ erro: 'Proposta recusada' }) } : ok(url.endsWith('/cotacoes') ? [cotacao] : []) })
  p.render(); await tick(); botao(p.render(), 'Elaborar proposta →').props.onClick(); p.alterar('fornecedor-proposta-1', '12.34')
  await nodes(p.render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.deepEqual(p.avisos, ['Proposta recusada']); assert.equal(p.destinos.at(-1), 'fornecedor-proposta')
  assert.equal(nodes(p.render()).find(n => n.props.id === 'fornecedor-proposta-1').props.value, '12.34')
  assert.equal(p.chamadas.filter(([, opts]) => opts.method === 'POST').length, 1)
})

test('abrir outra cotacao continua descartando valores apenas conforme o fluxo existente', async () => {
  const p = fornecedor({ cotacoes: [cotacao, { ...cotacao, id: 9, evento_nome: 'Outro evento' }] }); p.render(); await tick()
  botao(p.render(), 'Elaborar proposta →').props.onClick(); p.alterar('fornecedor-proposta-1', '50')
  botao(p.render(), 'Cancelar').props.onClick()
  nodes(p.render()).filter(n => n.type === 'button' && text(n).trim() === 'Elaborar proposta →')[1].props.onClick()
  for (const id of [1, 2, 3]) assert.equal(nodes(p.render()).find(n => n.props.id === `fornecedor-proposta-${id}`).props.value, '')
})

test('contratos continuam bloqueados, paginas antigas e componentes compartilhados preservados', async () => {
  const p = fornecedor({ pagina: 'fornecedor-cotacoes' }); p.render(); await tick()
  const atual = nodes(p.render()).find(n => n.props['aria-current'] === 'page')
  assert.equal(text(atual).trim(), 'Propostas enviadas')
  const bloqueado = nodes(p.render()).find(n => n.type === 'button' && text(n).includes('Contratos ativos'))
  assert.equal(bloqueado.props.disabled, true); assert.equal(bloqueado.props.onClick, undefined)
  assert.match(text(p.ir('fornecedor-contratos')), /Contratos ativos indisponíveis/)
  assert.ok(nodes(p.ir('fornecedor-catalogo')).some(n => n.type === 'portfolio'))
  assert.ok(nodes(p.ir('fornecedor-perfil')).some(n => n.type === 'perfil'))
  botao(p.render(), 'Sair').props.onClick(); assert.equal(p.saidas(), 1)
})

test('capas e galerias recebem os mesmos IDs de evento', async () => {
  const p = fornecedor(); p.render(); await tick()
  assert.equal(nodes(p.render()).find(n => n.type === 'capa').props.eventoId, cotacao.evento_id)
  assert.equal(nodes(p.render()).find(n => n.type === 'midia').props.eventoId, cotacao.evento_id)
  assert.ok(nodes(p.render()).some(n => n.type === 'identidade'))
})

test('CSS limita efeitos ao fornecedor e conserva rolagem horizontal localizada', () => {
  const css = postcss.parse(readFileSync(new URL('../src/pages/fornecedor/Fornecedor.css', import.meta.url), 'utf8'))
  css.walkRules(r => assert.ok(r.selector.split(',').every(s => s.trim().startsWith('.fornecedorPagina'))))
  css.walkDecls(d => assert.doesNotMatch(d.value, /#[\da-f]{3,8}\b|\brgba?\(/i))
  assert.doesNotMatch(css.toString(), /grid-template|position:\s*fixed|overflow:\s*hidden/)
  assert.match(css.toString(), /overflow-x: auto/); assert.match(css.toString(), /:focus-visible/)
})
