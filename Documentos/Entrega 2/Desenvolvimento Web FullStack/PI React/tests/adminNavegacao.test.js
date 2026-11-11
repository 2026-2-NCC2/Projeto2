import test from 'node:test'
import assert from 'node:assert/strict'
import { carregarAdmin, hooksAdmin, nodes } from './helpers/adminRuntime.js'
import { setImmediate } from 'node:timers'

test('seções e vínculos administrativos usam navegação controlada sem executar operações administrativas', () => {
  const nav = { estado: { secao: 'usuarios', eventoId: null, cotacaoId: null }, mudar(d) { this.estado = d } }
  const h = hooksAdmin({ AdminCatalogo: 'catalogo', AdminSolicitacoes: 'solicitacoes', NavegacaoRecolhivel: 'menu', PerfilPessoal: 'perfil', Icone: 'svg' })
  const { AdminPortal } = carregarAdmin('components/admin/AdminPortal.jsx', ['AdminPortal'], h.env)
  const render = () => h.render(AdminPortal, { navegacao: nav, aoSair() {} })
  assert.equal(nodes(render()).find(n => n.type === 'catalogo').props.tipo, 'usuarios')
  nodes(render()).find(n => n.type === 'catalogo').props.aoAbrirPainel(7)
  assert.equal(nav.estado.secao, 'painel'); assert.equal(nav.estado.eventoId, 7)
  assert.ok(nodes(render()).some(n => n.props.eventoId === 7 && typeof n.props.aoSelecionar === 'function'))
  nav.estado = { secao: 'cotacoes', eventoId: null, cotacaoId: 12 }
  assert.equal(nodes(render()).find(n => n.type === 'catalogo').props.cotacaoInicial, 12)
  nav.estado = { secao: 'perfil', eventoId: null, cotacaoId: null }
  assert.ok(nodes(render()).some(n => n.type === 'perfil' && n.props.contexto === 'Administração' && typeof n.props.aoSair === 'function'))
  nav.estado = { secao: 'contas', eventoId: null, cotacaoId: null }
  assert.ok(nodes(render()).some(n => n.type === 'solicitacoes'))
  h.close()
})

test('fechar cotação aberta por URL substitui o destino e não reabre na remontagem', () => {
  const calls = []
  const nav = { estado: { secao: 'cotacoes', eventoId: null, cotacaoId: 21 }, mudar(d, substituir) { calls.push(substituir); this.estado = d } }
  const h = hooksAdmin({ AdminCatalogo: 'catalogo', NavegacaoRecolhivel: 'menu' })
  const { AdminPortal } = carregarAdmin('components/admin/AdminPortal.jsx', ['AdminPortal'], h.env)
  const render = () => h.render(AdminPortal, { navegacao: nav })
  let focos = 0
  nodes(render()).find(n => n.type === 'main').props.ref.current = { focus() { focos++ } }
  nodes(render()).find(n => n.type === 'catalogo').props.aoFecharCotacao()
  assert.deepEqual(calls, [true])
  assert.equal(nav.estado.cotacaoId, null)
  assert.equal(nodes(render()).find(n => n.type === 'catalogo').props.cotacaoInicial, null)
  assert.equal(focos, 1)
  h.close()
})

test('consulta inicial preserva erro HTTP e evento; nova tentativa cancela a anterior sem consultas duplicadas', async () => {
  const calls = [], pendentes = []
  const h = hooksAdmin({ AbortController, listarAdmin: (rota, { signal }) => {
    calls.push({ rota, signal })
    return new Promise((resolve, reject) => pendentes.push({ resolve, reject }))
  } })
  const { useConsultaAdmin } = carregarAdmin('hooks/useConsultaAdmin.js', ['useConsultaAdmin'], h.env)
  const { PaginaPainelAdmin } = carregarAdmin('components/admin/AdminPortal.jsx', ['PaginaPainelAdmin'], { ...h.env, useConsultaAdmin, PainelEventoAdmin: 'painel' })
  const render = () => h.render(PaginaPainelAdmin, { eventoId: 7 })
  assert.equal(render().props.carregando, true)
  const erro = Object.assign(Error('Acesso negado'), { status: 403 })
  pendentes[0].reject(erro); await new Promise(r => setImmediate(r))
  assert.equal(render().props.erro, erro)
  const retry = render().props.aoAtualizar
  retry(); retry()
  assert.equal(render().props.carregando, true)
  render(); assert.equal(calls.length, 2)
  assert.equal(calls[0].signal.aborted, true)
  pendentes[1].resolve([{ id: 7 }]); await new Promise(r => setImmediate(r))
  assert.equal(render().props.eventoId, 7)
  assert.equal(render().props.erro, null)
  assert.equal(render().props.eventos.length, 1)
  assert.ok(calls.every(c => c.rota === '/admin/eventos'))
  h.close()
})
