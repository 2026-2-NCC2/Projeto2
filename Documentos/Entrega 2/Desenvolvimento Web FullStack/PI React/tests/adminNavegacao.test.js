import test from 'node:test'
import assert from 'node:assert/strict'
import { carregarAdmin, hooksAdmin, nodes } from './helpers/adminRuntime.js'

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
  assert.ok(nodes(render()).some(n => n.type === 'perfil' && n.props.contexto === 'Administração'))
  nav.estado = { secao: 'contas', eventoId: null, cotacaoId: null }
  assert.ok(nodes(render()).some(n => n.type === 'solicitacoes'))
  h.close()
})
