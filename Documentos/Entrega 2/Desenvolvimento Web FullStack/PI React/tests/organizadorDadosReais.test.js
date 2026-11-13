import { primitivasFixture, jsxPrimitivas } from './helpers/primitivasFixture.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { transformSync } from 'rolldown/utils'

const jsx = jsxPrimitivas
const nodes = v => v && typeof v === 'object' ? [v, ...(v.children || []).flatMap(nodes)] : []
const text = v => v && typeof v === 'object' ? (v.children || []).map(text).join(' ') : String(v ?? '')
function renderizador(file, name, props, extra = {}) {
  const states = []
  let cursor = 0
  const source = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/gm, '').replaceAll('export function ', 'function ')
  const result = transformSync(file, source, { jsx: { runtime: 'classic', pragma: 'jsx' } })
  assert.equal(result.errors.length, 0)
  const fn = vm.runInNewContext(result.code + '\n' + name, {
    ...primitivasFixture, jsx, VagasEvento: 'vagas', MidiaEvento: 'section', CapaEvento: 'capa', Icone: 'svg', useMemo: fn => fn(),
    useState(initial) {
      const i = cursor++
      if (!(i in states)) states[i] = initial
      return [states[i], value => { states[i] = value }]
    },
    formatarMoeda: value => String(value), ...extra,
  })
  return () => { cursor = 0; return fn(props) }
}

test('perfil organizador reutiliza o formulário pessoal persistente', () => {
  const view = renderizador('pages/organizador/Perfil.jsx', 'PerfilOrganizador', {}, { PerfilPessoal: 'perfil-pessoal' })()
  assert.equal(view.type, 'perfil-pessoal')
  assert.equal(view.props.contexto, 'Gestão Corporativa')
})

function ticket(publico, custos, salvar = async () => {}) {
  return renderizador('pages/organizador/Ticket.jsx', 'Ticket', {
    evento: { nome: 'Evento cadastrado', publico }, custos, setPagina() {}, aoFinalizarESalvar: salvar,
  })
}
for (const publico of [undefined, null, '', 0, -1, 'inválido']) test('ticket bloqueia público ausente/inválido: ' + publico, () => {
  const view = ticket(publico, [{ id: 1, valor: 100 }])()
  assert.match(text(view), /Cadastre um público previsto válido/)
  assert.doesNotMatch(text(view), /NaN|Infinity|600|TICKET SUGERIDO/)
})
for (const custos of [[], [{ valor: null }], [{ valor: 'ruim' }], [{ valor: -1 }]]) test('ticket bloqueia custos ausentes/inválidos: ' + JSON.stringify(custos), () => {
  assert.match(text(ticket(10, custos)()), /Cadastre custos válidos/)
})
test('ticket soma valores reais, lista todos os custos e permite ajustar o acréscimo', () => {
  const render = ticket(10, [1, 2, 3, 4].map(id => ({ id, categoria: 'Item ' + id, valor: '25.00' })))
  let view = render()
  assert.match(text(view), /10,00/)
  assert.match(text(view), /Item 4/)
  assert.doesNotMatch(text(view), /Cotações suficientes/)
  assert.ok(!nodes(view).some(n => n.props.className === 'barraCusto'))
  nodes(view).find(n => n.type === 'input').props.onChange({ target: { value: '30' } })
  view = render()
  assert.match(text(view), /13,00/)
  assert.match(text(view), /não será salvo/)
})

test('ticket explica a base do acréscimo e anuncia o valor recalculado de forma acessível', () => {
  const render = ticket(10, [{ id: 1, valor: 100 }])
  let view = render()
  const controle = nodes(view).find(n => n.props.id === 'ticket-margem')
  const ajuda = nodes(view).find(n => n.props.id === controle.props['aria-describedby'])
  assert.match(text(ajuda), /custo total.*público previsto/)
  assert.match(controle.props['aria-valuetext'], /0% de acréscimo/)
  controle.props.onChange({ target: { value: '25' } })
  view = render()
  assert.match(nodes(view).find(n => n.props.id === 'ticket-margem').props['aria-valuetext'], /25%/)
  const resultado = nodes(view).find(n => n.props.className === 'preco')
  assert.equal(resultado.props['aria-live'], 'polite')
  assert.equal(resultado.props['aria-atomic'], 'true')
  assert.match(text(resultado), /12,50/)
})
test('salvamento aguarda resposta e não navega por conta própria', async () => {
  let resolver, calls = 0
  const render = ticket(10, [{ id: 1, valor: 100 }], () => { calls++; return new Promise(resolve => { resolver = resolve }) })
  const pendente = nodes(render()).find(n => n.type === 'button' && n.props.className.split(' ').includes('principal')).props.onClick()
  assert.equal(calls, 1)
  assert.ok(nodes(render()).some(n => n.type === 'button' && n.props.disabled))
  resolver()
  await pendente
  assert.ok(!nodes(render()).some(n => n.type === 'button' && n.props.disabled))
})
test('eventos sem local, público, cotação e ticket mostram ausência de dados', () => {
  const view = renderizador('pages/organizador/Eventos.jsx', 'Eventos', { eventos: [{ id: 1, nome: 'Evento real', local: '  ' }] })()
  assert.match(text(view), /Local não cadastrado/)
  assert.match(text(view), /Público não cadastrado/)
  assert.match(text(view), /Não informada/)
  assert.match(text(view), /Não informado/)
  assert.doesNotMatch(text(view), /São Paulo|5\/5/)
})
test('App inicia evento vazio e não atribui cotação ou ticket simulados ao salvar', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(source, /useState\(dadosNovoEvento\)/)
  assert.doesNotMatch(source, /Summit Corporativo de Inovação & Tecnologia 2026|cotacao: '5\/5'|ticket: formatarMoeda\(ticketSugerido\)|eventoClicado\.publico \|\| 500/)
  const factory = source.match(/function dadosNovoEvento\(\) \{[\s\S]*?\n {2}\}/)[0]
  const evento = vm.runInNewContext(factory + '; dadosNovoEvento()')
  for (const campo of ['nome', 'data', 'horario', 'local', 'publico']) assert.equal(evento[campo], '')
})
