import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { carregarAdmin, hooksAdmin, nodes, text } from './helpers/adminRuntime.js'
import { primitivasFixture, jsxPrimitivas } from './helpers/primitivasFixture.js'
import { criarRascunhoCustos, rascunhoCustosTemAlteracoes } from '../src/utils/rascunhosCustos.js'
import { formatarMoeda } from '../src/utils/formatarMoeda.js'

function pagina(nome, props, extras = {}) {
  const h = hooksAdmin({ ...primitivasFixture, jsx: jsxPrimitivas, Icone: 'svg', VagasEvento: 'vagas',
    CapaEvento: 'capa', MidiaEvento: 'midia', ConsultaPortfolios: 'portfolio', useMemo: fn => fn(),
    formatarMoeda, rascunhoCustosTemAlteracoes, console: { error() {} }, ...extras })
  const fn = carregarAdmin(`pages/organizador/${nome}.jsx`, [nome], h.env)[nome]
  return { props, render: () => h.render(fn, props), close: () => h.close() }
}
const botao = (v, label) => nodes(v).find(n => n.type === 'button' && text(n).trim() === label)
const campo = (v, id) => nodes(v).find(n => n.props.id === id)

test('eventos diferencia skeleton, falha, ausencia e filtro sem mostrar dados antigos', () => {
  const p = pagina('Eventos', { eventos: [{ id: 1, nome: 'Evento sintético', status: 'Ativo' }], carregando: true })
  assert.match(text(p.render()), /Carregando eventos/); assert.doesNotMatch(text(p.render()), /Evento sintético/)
  p.props.carregando = false; p.props.erro = 'Falha de consulta'
  assert.match(text(p.render()), /Falha de consulta/); assert.doesNotMatch(text(p.render()), /Evento sintético/)
  p.props.erro = ''; p.props.eventos = []
  assert.match(text(p.render()), /Você ainda não possui eventos/)
  p.props.eventos = [{ id: 1, nome: 'Evento sintético', status: 'Ativo' }]
  nodes(p.render()).find(n => n.type === 'input').props.onChange({ target: { value: 'inexistente' } })
  assert.match(text(p.render()), /Nenhum evento encontrado para o filtro/)
})

test('eventos preserva navegacao, capacidades e callbacks de transicao', () => {
  const evento = { id: 1, nome: 'Evento sintético', status: 'Em planejamento' }, chamadas = []
  const p = pagina('Eventos', { eventos: [evento], capacidades: { criar: true, cancelar: true, publicar: true },
    aoCriarNovoEvento: () => chamadas.push('novo'), setPagina: v => chamadas.push(v),
    aoMudarEstado: (...args) => chamadas.push(args), aoPublicarEvento: v => chamadas.push(v) })
  botao(p.render(), 'Cancelar evento').props.onClick(); botao(p.render(), 'Publicar').props.onClick()
  assert.deepEqual(chamadas, [[evento, 'cancelar'], evento])
  nodes(p.render()).find(n => n.type === 'button' && text(n).includes('Novo evento')).props.onClick()
  assert.deepEqual(chamadas.slice(-2), ['novo', 'criar'])
})

test('formulario de evento preserva limites, transformacoes e campos congelados', async () => {
  let atualizado, envios = 0
  const evento = { id: 1, nome: 'Teste', publico: 100, status: 'Ativo', capacidade_maxima: 30 }
  const p = pagina('CriarEvento', { evento, podeSalvar: true, controleCapacidade: true,
    setEvento: fn => { atualizado = fn(evento) }, aoAvancarParaCustos: () => envios++, setPagina() {} })
  const v = p.render(), cap = campo(v, 'capacidade-evento')
  assert.equal(cap.props.max, '2147483647'); assert.equal(cap.props.required, false)
  cap.props.onChange({ target: { value: '' } }); assert.equal(atualizado.capacidade_maxima, null)
  assert.equal(atualizado.publico, 100)
  assert.ok(nodes(v).filter(n => n.type === 'input' && n !== cap).every(n => n.props.disabled))
  assert.equal(nodes(v).find(n => n.type === 'textarea').props.maxLength, 10000)
  for (const label of nodes(v).filter(n => n.type === 'label')) assert.ok(campo(v, label.props.htmlFor))
  p.props.salvando = true
  await nodes(p.render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.equal(envios, 0); assert.equal(nodes(p.render()).find(n => n.type === 'fieldset').props.disabled, true)
})

function custos(confirmar = true) {
  const rascunho = criarRascunhoCustos(0); rascunho.get.estado = 'carregado'; rascunho.basePersistida = []
  const confirmacoes = [], destinos = []
  const p = pagina('Custos', { evento: { id: 1, nome: 'Sintético' }, custos: [], rascunho,
    persistencia: { disponivel: true, carregar() {}, salvar() {} }, aoUsarServidor() {}, aoAlterarFormularioPendente() {},
    setPagina: p => destinos.push(p), setCustos: fn => { p.props.custos = fn(p.props.custos) } },
  { window: { confirm: m => { confirmacoes.push(m); return confirmar } } })
  const alterar = (id, value) => campo(p.render(), id).props.onChange({ target: { value } })
  const enviar = () => nodes(p.render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
  return { ...p, alterar, enviar, rascunho, confirmacoes, destinos }
}

test('custos mantem validacao decimal e nao introduz mascara ou arredondamento', () => {
  const p = custos(); p.alterar('custo-categoria', 'Áudio'); p.alterar('custo-descricao', 'Item sintético')
  p.alterar('custo-valor', '1,234'); p.enviar()
  assert.match(text(p.render()), /no máximo duas casas/); assert.equal(p.props.custos.length, 0)
  p.alterar('custo-valor', '0,29'); p.enviar()
  assert.equal(p.props.custos[0].valor, 0.29); assert.match(text(p.render()), /0,29/)
  assert.equal(nodes(p.render()).find(n => n.type === 'form').props.noValidate, true)
  assert.equal(campo(p.render(), 'custo-valor').props.inputMode, 'decimal')
})

test('cancelar confirmacao de remocao do custo preserva rascunho', () => {
  const p = custos(false); p.props.custos = [{ id: 'local-1', categoria: 'Áudio', descricao: 'Item sintético', valor: 12.34 }]
  botao(p.render(), 'Remover').props.onClick()
  assert.equal(p.confirmacoes.length, 1); assert.equal(p.props.custos.length, 1)
  assert.equal(p.props.custos[0].valor, 12.34)
})

test('custos incertos, conflitos e erros permanecem visiveis e bloqueiam salvamento', () => {
  const p = custos(); p.rascunho.put.estado = 'resultadoIncerto'; p.rascunho.put.erro = 'Resultado não confirmado'
  p.rascunho.conflitoRemoto = true
  for (let i = 0; i < 3; i++) {
    const v = p.render(); assert.match(text(v), /Resultado não confirmado/); assert.match(text(v), /rascunho foi preservado/)
    assert.equal(botao(v, 'Salvar custos no banco').props.disabled, true)
    assert.ok(botao(v, 'Verificar resultado no servidor'))
  }
})

test('cotacao diferencia carregamento de propostas de erro e ausencia', async () => {
  let responder
  const p = pagina('Cotacao', { evento: { id: 1 }, custos: [], publicacao: {} },
    { sessionStorage: { getItem: () => 'sintetico' }, apiUrl: p => p, fetch: () => new Promise(resolve => { responder = resolve }) })
  assert.match(text(p.render()), /Carregando propostas/)
  responder({ ok: true, json: async () => [] }); await new Promise(resolve => setTimeout(resolve, 0))
  assert.match(text(p.render()), /Nenhuma proposta recebida/); assert.doesNotMatch(text(p.render()), /Carregando propostas/)
})

test('cotacao conserva confirmacao e PATCH de avaliacao sem modificar payload', async () => {
  const chamadas = [], avisos = [], proposta = { id: 2, evento_id: 1, status: 'Em avaliação', valor: '12.34' }
  const p = pagina('Cotacao', { evento: { id: 1 }, custos: [], publicacao: {} },
    { sessionStorage: { getItem: () => 'sintetico' }, apiUrl: p => p, window: { confirm: () => true }, alert: m => avisos.push(m),
      fetch: async (url, opcoes) => { chamadas.push([url, opcoes]); return { ok: true, json: async () => url.endsWith('/status') ? { mensagem: 'Confirmada' } : [proposta] } } })
  p.render(); await new Promise(resolve => setTimeout(resolve, 0))
  await nodes(p.render()).find(n => n.type === 'button' && text(n).includes('Aprovar proposta')).props.onClick()
  assert.equal(chamadas[1][0], '/organizador/propostas/2/status'); assert.equal(chamadas[1][1].method, 'PATCH')
  assert.deepEqual(JSON.parse(chamadas[1][1].body), { status: 'Aprovada' }); assert.deepEqual(avisos, [])
  assert.match(text(p.render()), /Confirmada/)
  assert.match(text(p.render()), /Aprovada/)
})

test('avaliacao com falha preserva proposta e mensagem persistente sem reenvio automatico', async () => {
  const chamadas = [], proposta = { id: 2, evento_id: 1, status: 'Em avaliação', valor: '12.34' }
  const p = pagina('Cotacao', { evento: { id: 1 }, custos: [], publicacao: {} }, {
    sessionStorage: { getItem: () => 'sintetico' }, apiUrl: p => p, window: { confirm: () => true },
    fetch: async url => { chamadas.push(url); if (url.endsWith('/status')) throw Error('Resposta não recebida'); return { ok: true, json: async () => [proposta] } },
  })
  p.render(); await new Promise(resolve => setTimeout(resolve, 0))
  await nodes(p.render()).find(n => n.type === 'button' && text(n).includes('Aprovar proposta')).props.onClick()
  for (let i = 0; i < 3; i++) {
    assert.match(text(p.render()), /Resposta não recebida/)
    assert.match(text(p.render()), /Consulte as propostas antes de repetir/)
    assert.match(text(p.render()), /Em avaliação/)
  }
  assert.equal(chamadas.length, 2)
})

test('publicacao mantem prazo, observacoes, custos revisados e navegacao confirmada', async () => {
  const itens = [{ id: 1, categoria: 'Áudio', valor: 12.34 }], chamadas = [], destinos = [], avisos = []
  const p = pagina('Cotacao', { evento: {}, custos: itens, setPagina: v => destinos.push(v), publicacao: {
    publicar: async dados => { chamadas.push(dados); return { contextoAtual: true, estado: 'sucesso', mensagem: 'Publicada' } },
  } }, { alert: m => avisos.push(m) })
  campo(p.render(), 'cotacao-campo-1').props.onChange({ target: { value: '2030-05-01' } })
  campo(p.render(), 'cotacao-campo-2').props.onChange({ target: { value: 'Condições sintéticas' } })
  await nodes(p.render()).find(n => n.type === 'button' && text(n).includes('Publicar Cotação')).props.onClick()
  assert.equal(chamadas[0].prazo, '2030-05-01'); assert.equal(chamadas[0].observacoes, 'Condições sintéticas')
  assert.equal(chamadas[0].custosRevisados, itens); assert.deepEqual(destinos, ['ticket']); assert.deepEqual(avisos, ['Publicada'])
})

test('CSS local conserva grades e nao invade outros portais', () => {
  const css = readFileSync(new URL('../src/pages/organizador/Organizador.css', import.meta.url), 'utf8')
  assert.doesNotMatch(css, /grid-template|position:\s*fixed|#[\da-f]{3,8}\b/)
  for (const regra of css.split('\n').filter(l => l.includes('{'))) assert.ok(regra.startsWith('.organizadorPagina'))
})
