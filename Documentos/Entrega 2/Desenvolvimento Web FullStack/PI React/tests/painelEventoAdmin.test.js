import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { setImmediate } from 'node:timers'
import { transformSync } from 'rolldown/utils'
import postcss from 'postcss'

const jsx = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(x => x !== null && x !== false && x !== undefined) })
const nodes = v => v && typeof v === 'object' ? [v, ...(v.children || []).flatMap(nodes)] : []
const text = v => v && typeof v === 'object' ? (v.children || []).map(text).join(' ') : String(v ?? '')
const serviceSource = readFileSync(new URL('../src/services/painelEventoAdmin.js', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replaceAll('export ', '')
function service(fetch) { return vm.runInNewContext(serviceSource + ';({consultarPainelEvento,moedaPainel,dataPainel})', { fetch, apiUrl: x => x, BigInt }) }
const baseService = service(() => { throw Error('Transporte não injetado') })
const componentSource = readFileSync(new URL('../src/components/admin/PainelEventoAdmin.jsx', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replaceAll('export ', '')
const compiled = transformSync('PainelEventoAdmin.jsx', componentSource, { jsx: { runtime: 'classic', pragma: 'jsx', pragmaFrag: 'Fragment' } })
assert.equal(compiled.errors.length, 0)
function runtime(consultar = async () => dados, document = {}) {
  const states = [], effects = [], deps = []; let cursor = 0, ec = 0
  const context = { jsx, Fragment: 'fragment', ...baseService, consultarPainelEvento: consultar, AbortController, document,
    sessionStorage: { getItem: () => 'token-sintetico' },
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], v => { states[i] = typeof v === 'function' ? v(states[i]) : v }] },
    useEffect(fn, d) { const i = ec++; if (!deps[i] || d.some((v, j) => v !== deps[i][j])) { effects[i]?.(); deps[i] = d; effects[i] = fn() } },
  }
  const api = vm.runInNewContext(compiled.code + ';({PainelEventoAdmin,ConteudoPainelEvento,ResumoEventoAdmin,EstadoEventoAdmin,SkeletonPainel,ConsultaPainel,LinkSecaoPainel})', context)
  return { ...api, render(props = { eventoId: 13 }) { cursor = 0; ec = 0; return api.ConsultaPainel(props) }, close() { effects.forEach(e => e?.()) } }
}
const dados = { evento: { id: 13, nome: 'Evento sintético', data: '2030-01-02', horario: '10:30:00', local: 'Local', status: 'Ativo', publico: 999, organizador_nome: 'Organizador', capacidade_maxima: null, inscritos_confirmados: 5, vagas_restantes: null, lotado: false }, custos: [{ id: 1, categoria: 'Som', descricao: 'Equipamento', valor_estimado: '10.30' }], cotacoes: [{ id: 21, modalidade: 'Fechada', status: 'Aberta', prazo: '2030-01-01', itens: [{ id: 41, categoria: 'Som', descricao: 'Item sintético', valor_estimado: '10.30' }] }], propostas: [{ id: 31, cotacao_id: 21, fornecedor_nome: 'Fornecedor', valor: '20.50', status: 'Em avaliação' }], resumo: { custos: 1, cotacoes: 1, itens: 1, propostas: 1, total_custos_estimados: '10.30' }, consultado_em: '2030-01-01T12:00:00Z', aviso: 'Consultas separadas.' }
const tick = () => new Promise(resolve => setImmediate(resolve))

test('serviço usa somente GET autenticado, propaga cancelamento e valida contrato', async () => {
  const calls = [], signal = new AbortController().signal
  const s = service(async (url, op) => { calls.push({ url, op }); return { ok: true, json: async () => dados } })
  assert.equal((await s.consultarPainelEvento(13, { token: 'teste', signal })).evento.id, 13)
  assert.equal(calls[0].url, '/admin/eventos/13/painel'); assert.equal(calls[0].op.method, 'GET'); assert.equal(calls[0].op.headers.Authorization, 'Bearer teste'); assert.equal(calls[0].op.signal, signal)
  await assert.rejects(s.consultarPainelEvento(13), e => e.status === 401)
  const bad = service(async () => ({ ok: true, json: async () => ({ ...dados, evento: { id: 14 } }) }))
  await assert.rejects(bad.consultarPainelEvento(13, { token: 'teste' }), /incompletos/)
})
test('401,403,404 e erro técnico têm mensagens seguras', async () => {
  for (const status of [401, 403, 404, 500]) { const s = service(async () => ({ ok: false, status })); await assert.rejects(s.consultarPainelEvento(13, { token: 'teste' }), e => e.status === status && !e.message.includes('undefined')) }
})
test('resumo distingue capacidade NULL, lotação, zero vagas e estado terminal', () => {
  const r = runtime(); let v = r.ResumoEventoAdmin({ evento: dados.evento }); assert.match(text(v), /Sem limite configurado/); assert.match(text(v), /999/)
  v = r.ResumoEventoAdmin({ evento: { ...dados.evento, status: 'Cancelado', capacidade_maxima: 5, vagas_restantes: 0, lotado: true } }); assert.match(text(v), /Lotado/); assert.match(text(v), /não aceitam novas inscrições/)
  for (const estado of ['Ativo', 'Em planejamento', 'Cancelado', 'Encerrado']) { const badge = r.EstadoEventoAdmin({ estado }); assert.equal(text(badge), estado); assert.ok(!badge.props.className.includes('neutro')) }
})
test('navegação por âncoras resolve seções e relação proposta-cotação; estimativas separadas', () => {
  const r = runtime(), v = r.ConteudoPainelEvento({ dados }), all = [...nodes(v), ...nodes(r.ResumoEventoAdmin({ evento: dados.evento }))], ids = new Set(all.map(x => x.props.id).filter(Boolean))
  const links = all.filter(x => x.type === r.LinkSecaoPainel)
  assert.equal(links.length, 6)
  for (const link of links) {
    assert.ok(ids.has(link.props.destino))
    assert.equal(r.LinkSecaoPainel(link.props).props.href, '#/admin?secao=painel&evento=13')
    assert.equal(all.find(x => x.props.id === link.props.destino).props.tabIndex, -1)
  }
  assert.match(text(v), /não representam contratação ou pagamento/); assert.match(text(v), /não são somados aos custos/)
  assert.equal(all.filter(x => x.props.id === 'pea-cotacao-21').length, 1)
})

test('links internos impedem troca do fragmento e focam/rolam o destino, inclusive na ativação por teclado', () => {
  const calls = []
  const r = runtime(undefined, { getElementById(id) {
    assert.equal(id, 'pea-custos')
    return { focus: op => calls.push(['foco', op.preventScroll]), scrollIntoView: op => calls.push(['rolagem', op.block]) }
  } })
  const link = r.LinkSecaoPainel({ destino: 'pea-custos', eventoId: 13, children: 'Custos' })
  link.props.onClick({ preventDefault() { calls.push('impediu') } })
  assert.deepEqual(calls, ['impediu', ['foco', true], ['rolagem', 'start']])
  calls.length = 0
  link.props.onClick({ ctrlKey: true, preventDefault() { throw Error('Não bloquear abertura em nova aba') } })
  assert.equal(calls.length, 0)
})

test('lista inicial distingue rede, 401 e 403 de vazio; seleção é preservada na recuperação', () => {
  const r = runtime(), calls = []
  const props = { eventos: [], carregando: false, eventoId: 13, aoSelecionar() {}, aoSair: () => calls.push('login'), aoAtualizar: () => calls.push('recarga') }
  for (const status of [undefined, 401, 403]) {
    const erro = Object.assign(Error(status === 403 ? 'Você não tem permissão para esta consulta.' : 'Falha na consulta'), { status })
    const v = r.PainelEventoAdmin({ ...props, erro })
    assert.ok(!text(v).includes('Nenhum evento cadastrado'))
    assert.match(text(v), status === 403 ? /não tem permissão/ : /Falha na consulta/)
    const select = nodes(v).find(n => n.type === 'select')
    assert.equal(select.props.value, 13); assert.equal(select.props.disabled, true)
    const botao = nodes(v).find(n => n.type === 'button')
    assert.equal(text(botao), status === 401 ? 'Entrar novamente' : 'Tentar novamente')
    botao.props.onClick()
  }
  assert.deepEqual(calls, ['recarga', 'login', 'recarga'])
  const v = r.PainelEventoAdmin({ ...props, eventos: [dados.evento], erro: null })
  assert.ok(nodes(v).some(n => n.type === r.ConsultaPainel && n.props.eventoId === 13))
})
test('relações vazias e seleção sem evento têm mensagens claras', () => {
  const r = runtime(), v = r.ConteudoPainelEvento({ dados: { ...dados, custos: [], cotacoes: [], propostas: [] } })
  for (const mensagem of ['Nenhum custo', 'Nenhuma cotação', 'Nenhuma proposta']) assert.ok(text(v).includes(mensagem))
  const props = { eventos: [dados.evento], carregando: false, erro: '', eventoId: null, aoSelecionar() {} }
  assert.match(text(r.PainelEventoAdmin(props)), /Selecione um evento para consultar/)
  let selected; const view = r.PainelEventoAdmin({ ...props, aoSelecionar: id => { selected = id } }); nodes(view).find(n => n.type === 'select').props.onChange({ target: { value: '13' } }); assert.equal(selected, 13)
})
test('skeleton, sucesso, erro, sessão expirada e tentativa novamente', async () => {
  let resolve; const r = runtime(() => new Promise(done => { resolve = done }))
  assert.equal(r.render().type, r.SkeletonPainel); resolve(dados); await tick(); assert.equal(r.render().type, r.ConteudoPainelEvento)
  let saiu = false; const e = runtime(async () => { throw Object.assign(new Error('Sessão expirada'), { status: 401 }) }); e.render({ eventoId: 13, aoSair: () => { saiu = true } }); await tick(); const err = e.render({ eventoId: 13, aoSair: () => { saiu = true } }); assert.equal(err.props.role, 'alert'); nodes(err).find(n => n.type === 'button').props.onClick(); assert.equal(saiu, true)
  const retry = runtime(async () => { throw Error('Sem conexão') }); retry.render(); await tick(); nodes(retry.render()).find(n => n.type === 'button').props.onClick(); assert.equal(retry.render().type, retry.SkeletonPainel)
})
test('desmontagem aborta e resultado antigo não substitui o painel', async () => {
  let done, signal; const r = runtime((_id, op) => { signal = op.signal; return new Promise(resolve => { done = resolve }) }); r.render(); r.close(); assert.ok(signal.aborted); done(dados); await tick(); assert.equal(r.render().type, r.SkeletonPainel)
})
test('formatação preserva centavos e CSS prevê tablet, celular e movimento reduzido', () => {
  assert.equal(baseService.moedaPainel('9999999999999999.99'), 'R$ 9.999.999.999.999.999,99'); assert.equal(baseService.dataPainel('2030-01-02'), '02/01/2030')
  const css = postcss.parse(readFileSync(new URL('../src/components/admin/PainelEventoAdmin.css', import.meta.url), 'utf8')), media = []; css.walkAtRules('media', r => media.push(r.params))
  assert.ok(media.some(x => x.includes('1000px'))); assert.ok(media.some(x => x.includes('540px'))); assert.ok(media.some(x => x.includes('prefers-reduced-motion')))
})
