import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers'
import { carregarAdmin, hooksAdmin, nodes, text } from './helpers/adminRuntime.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
function services(fetch = async () => ({ ok: true, json: async () => [] }), token = 'token-sintetico') {
  return carregarAdmin('services/admin.js', ['requisicaoAdmin', 'listarAdmin', 'criarDecisorAcesso', 'filtrarCatalogo', 'filtrarSolicitacoes', 'diaSolicitacao', 'nomesPerfis'], { fetch, apiUrl: x => x, sessionStorage: { getItem: () => token } })
}
const util = services()
const requests = [
  { id: 30, nome: 'Zélia', perfil_solicitado: 'organizador', criada_em: '2026-01-01T12:00:00Z', status: 'pendente' },
  { id: 2, nome: 'Ana', perfil_solicitado: 'fornecedor', criada_em: '2026-10-01T12:00:00Z', status: 'pendente' },
  { id: 4, nome: 'Bia', perfil_solicitado: 'fornecedor', criada_em: null, status: 'pendente' },
  { id: 5, nome: 'Analisada', perfil_solicitado: 'organizador', status: 'aprovado', criada_em: '2026-10-02T12:00:00Z' },
  { id: 6, nome: 'Rejeitada', status: 'rejeitado', criada_em: '2026-10-03T12:00:00Z' },
]
const ids = rows => Array.from(rows, x => x.id)
test('histórico, tipo, período de criação e ordenação utilizam os estados reais', () => {
  const f = { estado: 'pendente', tipo: '', inicio: '', fim: '', ordem: 'recentes' }
  for (const [mod, esperado] of [[{}, [2, 30, 4]], [{ ordem: 'antigas' }, [30, 2, 4]], [{ ordem: 'nome', tipo: 'fornecedor' }, [2, 4]], [{ estado: 'aprovado' }, [5]], [{ estado: 'rejeitado' }, [6]], [{ estado: '', inicio: '2026-10-01', fim: '2026-10-02' }, [5, 2]]]) assert.deepEqual(ids(util.filtrarSolicitacoes(requests, { ...f, ...mod })), esperado)
  assert.equal(util.filtrarSolicitacoes(requests, { ...f, inicio: '2026-10-02', fim: '2026-10-01' }).length, 0)
  assert.equal(util.diaSolicitacao('2026-10-02T01:00:00Z'), '2026-10-01')
})
test('catálogos filtram busca, perfil, estado, evento e fornecedor', () => {
  const dados = [{ id: 1, nome: 'Congresso São Paulo', email: 'a@example.invalid', perfil: 'participante', status: 'Cancelado', evento_id: 3, fornecedor_id: 7 }, { id: 2, nome: 'Outro', email: 'b@example.invalid', perfil: 'admin', status: 'Encerrado', evento_id: 4, fornecedor_id: 8 }]
  assert.deepEqual(ids(util.filtrarCatalogo('eventos', dados, { busca: 'SAO', estado: 'Cancelado' })), [1])
  assert.deepEqual(ids(util.filtrarCatalogo('usuarios', dados, { busca: 'b@', perfil: 'admin' })), [2])
  assert.deepEqual(ids(util.filtrarCatalogo('propostas', dados, { evento: '3', fornecedor: '7' })), [1])
  assert.equal(util.filtrarCatalogo('cotacoes', dados, { evento: '99' }).length, 0)
})
test('GET autenticado, contrato de lista e mensagens seguras de autorização/conflito', async () => {
  const calls = [], api = services(async (url, op) => { calls.push([url, op]); return { ok: true, json: async () => [] } })
  await api.listarAdmin('/usuarios'); assert.equal(calls[0][1].method, 'GET'); assert.equal(calls[0][1].headers.Authorization, 'Bearer token-sintetico')
  await assert.rejects(services(undefined, null).listarAdmin('/usuarios'), e => e.status === 401)
  for (const status of [401, 403, 404, 409, 500]) await assert.rejects(services(async () => ({ ok: false, status })).requisicaoAdmin('/usuarios'), e => e.status === status)
  await assert.rejects(services(async () => ({ ok: true, json: async () => ({}) })).listarAdmin('/usuarios'), /incompleta/)
})
test('trava evita decisões duplicadas por ID sem bloquear outra solicitação', async () => {
  const calls = [], resolves = [], decidir = util.criarDecisorAcesso((url, op) => { calls.push([url, op]); return new Promise(resolve => resolves.push(resolve)) })
  const a = decidir(2, 'aprovado'), b = decidir(3, 'rejeitado')
  assert.equal((await decidir(2, 'rejeitado')).ignorado, true); assert.equal(calls.length, 2)
  assert.equal(calls[0][0], '/solicitacoes-acesso/2'); assert.equal(calls[0][1].method, 'PATCH'); assert.equal(calls[0][1].body.status, 'aprovado')
  resolves[0]({ mensagem: 'Solicitação aprovada com sucesso!' }); resolves[1]({ mensagem: 'Solicitação rejeitada com sucesso!' }); await Promise.all([a, b])
})
function solicitacoes(enviar, dados = requests, confirmed = true) {
  const consulta = { dados: [...dados], carregando: false, erro: null, atualizar(fn) { this.dados = fn(this.dados) }, recarregar() { this.atualizacoes = (this.atualizacoes || 0) + 1 } }
  const h = hooksAdmin({ ...util, criarDecisorAcesso: () => util.criarDecisorAcesso(enviar), useConsultaAdmin: () => consulta, BadgeAdmin: 'badge', SkeletonAdmin: 'skeleton', ErroAdmin: 'erro', FiltroAdmin: 'filtro', window: { confirm: () => confirmed } })
  const { AdminSolicitacoes } = carregarAdmin('components/admin/AdminSolicitacoes.jsx', ['AdminSolicitacoes'], h.env)
  return { consulta, render: () => h.render(AdminSolicitacoes, { aoSair() {} }) }
}
test('botões ficam ocupados e callback antigo após sucesso não reenvia', async () => {
  let done, calls = 0; const r = solicitacoes(() => { calls++; return new Promise(resolve => { done = resolve }) })
  const action = nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Aprovar').props.onClick
  const pending = action(); await action(); assert.equal(calls, 1)
  assert.ok(nodes(r.render()).some(n => n.type === 'button' && text(n) === 'Processando…' && n.props.disabled))
  done({ mensagem: 'Solicitação aprovada com sucesso!' }); await pending; await action(); assert.equal(calls, 1); assert.match(text(r.render()), /com sucesso/)
  assert.equal(r.consulta.dados.find(s => s.id === 2).status, 'aprovado')
})
test('cancelar não envia; erro/conflito preserva item e exige nova consulta', async () => {
  let calls = 0; let r = solicitacoes(async () => { calls++ }, requests, false)
  await nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Aprovar').props.onClick(); assert.equal(calls, 0)
  for (const status of [409, 500, 401]) {
    r = solicitacoes(async () => { throw Object.assign(new Error('Resultado não confirmado'), { status }) })
    await nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Recusar').props.onClick()
    assert.equal(r.consulta.dados.find(s => s.id === 2).status, 'pendente')
    assert.ok(nodes(r.render()).some(n => n.props.role === 'alert'))
    assert.ok(nodes(r.render()).some(n => n.type === 'button' && text(n) === 'Recusar' && n.props.disabled))
  }
})
test('resposta de decisão incompleta não é apresentada como sucesso', async () => {
  const decidir = util.criarDecisorAcesso(async () => ({}))
  await assert.rejects(decidir(2, 'aprovado'), /Resultado não confirmado/)
  const r = solicitacoes(async () => ({}))
  await nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Aprovar').props.onClick()
  assert.equal(r.consulta.dados.find(s => s.id === 2).status, 'pendente')
  assert.ok(nodes(r.render()).some(n => n.props.role === 'alert'))
})
test('histórico não apresenta decisões e lote continua desabilitado', () => {
  const r = solicitacoes(async () => {}); nodes(r.render()).find(n => n.type === 'filtro' && n.props.titulo === 'Estado').props.aoAlterar('aprovado')
  const v = r.render(); assert.match(text(v), /Decisão registrada/); assert.equal(nodes(v).some(n => n.type === 'button' && text(n) === 'Aprovar'), false)
  assert.ok(nodes(v).find(n => n.type === 'button' && text(n) === 'Aprovar em lote').props.disabled)
})
test('loading/erro não exibem indicadores simulados e lista vazia é explícita', () => {
  const r = solicitacoes(async () => {}); r.consulta.carregando = true; assert.ok(nodes(r.render()).some(n => n.type === 'skeleton')); assert.equal(nodes(r.render()).some(n => n.props.className === 'admMetricas'), false)
  r.consulta.carregando = false; r.consulta.erro = Error('Falha'); assert.ok(nodes(r.render()).some(n => n.type === 'erro'))
  r.consulta.erro = null; r.consulta.dados = []; assert.match(text(r.render()), /Nenhuma solicitação/)
})
test('hook consulta uma vez e cancela resposta após desmontagem', async () => {
  let done, signal, calls = 0
  const h = hooksAdmin({ AbortController, listarAdmin: (_path, op) => { calls++; signal = op.signal; return new Promise(resolve => { done = resolve }) }, requisicaoAdmin() {} })
  const { useConsultaAdmin } = carregarAdmin('hooks/useConsultaAdmin.js', ['useConsultaAdmin'], h.env)
  const render = () => h.render(() => useConsultaAdmin('/usuarios'))
  assert.equal(render().carregando, true); render(); assert.equal(calls, 1); h.close(); assert.ok(signal.aborted); done([{ id: 1 }]); await tick(); assert.equal(render().carregando, true)
})
test('portal delega páginas e preserva navegação cotação-evento-painel', () => {
  const h = hooksAdmin({ AdminCatalogo: 'catalogo', AdminSolicitacoes: 'solicitacoes', PerfilPessoal: 'perfil', NavegacaoRecolhivel: 'nav', Icone: 'svg', IdentidadeConta: 'identidade' })
  const api = carregarAdmin('components/admin/AdminPortal.jsx', ['AdminPortal', 'AdminMenu'], h.env), render = () => h.render(api.AdminPortal, { aoSair() {} })
  assert.ok(nodes(render()).some(n => n.type === 'solicitacoes'))
  nodes(render()).find(n => n.type === api.AdminMenu).props.setSecao('propostas')
  nodes(render()).find(n => n.type === 'catalogo').props.aoAbrirCotacao(21)
  const cotacao = nodes(render()).find(n => n.type === 'catalogo'); assert.equal(cotacao.props.tipo, 'cotacoes'); assert.equal(cotacao.props.cotacaoInicial, 21)
  cotacao.props.aoAbrirPainel(13); assert.ok(nodes(render()).some(n => typeof n.type === 'function' && n.type.name === 'PaginaPainelAdmin'))
  assert.equal(nodes(api.AdminMenu({ secao: 'contas', setSecao() {}, aoSair() {} })).filter(n => n.props.disabled).length, 2)
})
