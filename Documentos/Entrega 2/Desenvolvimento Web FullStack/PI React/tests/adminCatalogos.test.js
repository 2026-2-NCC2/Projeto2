import test from 'node:test'
import assert from 'node:assert/strict'
import { carregarAdmin, hooksAdmin, nodes, text } from './helpers/adminRuntime.js'
const util = carregarAdmin('services/admin.js', ['filtrarCatalogo', 'nomesPerfis'])
const formatar = carregarAdmin('services/painelEventoAdmin.js', ['moedaPainel', 'dataPainel'])
function fixture(tipo, dados) {
  const consulta = { dados, carregando: false, erro: null, recarregar() {} }, destinos = []
  const h = hooksAdmin({ ...util, ...formatar, useConsultaAdmin: () => consulta, BadgeAdmin: 'badge', EstadoAdmin: 'estado', SkeletonAdmin: 'skeleton', ErroAdmin: 'erro', ModalAdmin: 'modal', FiltroAdmin: 'filtro', CapaEvento: 'capa', MidiaEvento: 'midia', ResumoEventoAdmin: 'resumo' })
  const api = carregarAdmin('components/admin/AdminCatalogos.jsx', ['AdminCatalogo', 'DetalhesCotacaoAdmin'], h.env)
  return { consulta, api, destinos, render: () => h.render(api.AdminCatalogo, { tipo, aoAbrirPainel: id => destinos.push(['evento', id]), aoAbrirCotacao: id => destinos.push(['cotacao', id]) }) }
}
test('eventos têm quatro filtros, resumo de capacidade e link para painel', () => {
  const r = fixture('eventos', [{ id: 13, nome: 'Sintético', status: 'Cancelado', capacidade_maxima: null, inscritos_confirmados: 5, vagas_restantes: null }])
  assert.deepEqual(Array.from(nodes(r.render()).find(n => n.type === 'filtro').props.opcoes, o => o.valor), ['Ativo', 'Em planejamento', 'Cancelado', 'Encerrado'])
  nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Visualizar').props.onClick({ currentTarget: { focus() {} } })
  assert.equal(nodes(r.render()).find(n => n.type === 'resumo').props.evento.inscritos_confirmados, 5)
  nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Abrir painel do evento').props.onClick(); assert.deepEqual(r.destinos, [['evento', 13]])
})
test('usuários preservam busca/perfil e não renderizam campos sensíveis extras', () => {
  const r = fixture('usuarios', [{ id: 1, nome: 'Ana', email: 'a@example.invalid', perfil: 'admin', senha: 'SEGREDO_NAO_RENDERIZAR', token: 'TOKEN_PRIVADO' }])
  nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Visualizar').props.onClick({ currentTarget: { focus() {} } })
  assert.doesNotMatch(text(r.render()), /SEGREDO_NAO_RENDERIZAR|TOKEN_PRIVADO/)
  assert.ok(nodes(r.render()).find(n => n.type === 'filtro' && n.props.titulo === 'Perfil'))
  nodes(r.render()).find(n => n.type === 'input').props.onChange({ target: { value: 'Inexistente' } }); assert.match(text(r.render()), /Nenhum resultado para estes filtros/)
})
test('propostas filtram e navegam sem ações administrativas de escrita', () => {
  const r = fixture('propostas', [{ id: 31, evento_id: 13, evento_nome: 'Evento', fornecedor_id: 8, fornecedor_nome: 'Fornecedor', cotacao_id: 21, valor: '20.30', status: 'Em avaliação' }])
  for (const titulo of ['Estado', 'Evento', 'Fornecedor']) assert.ok(nodes(r.render()).find(n => n.type === 'filtro' && n.props.titulo === titulo))
  nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Visualizar').props.onClick({ currentTarget: { focus() {} } })
  assert.match(text(r.render()), /não representa pagamento realizado/)
  nodes(r.render()).find(n => n.type === 'button' && text(n).startsWith('Ver cotação')).props.onClick()
  nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Ver painel do evento').props.onClick()
  assert.deepEqual(r.destinos, [['cotacao', 21], ['evento', 13]])
  assert.equal(nodes(r.render()).some(n => n.type === 'button' && /Aprovar|Recusar|Editar/.test(text(n))), false)
})
test('cotação carrega itens sob demanda e mantém estados loading/erro/vazio', () => {
  const r = fixture('cotacoes', [{ id: 21, evento_id: 13, evento_nome: 'Evento', status: 'Aberta' }])
  nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Visualizar').props.onClick({ currentTarget: { focus() {} } })
  assert.ok(nodes(r.render()).find(n => n.type === r.api.DetalhesCotacaoAdmin && n.props.id === 21))
  r.consulta.carregando = true; assert.ok(nodes(r.render()).some(n => n.type === 'skeleton'))
  r.consulta.carregando = false; r.consulta.erro = Error('Falha'); assert.ok(nodes(r.render()).some(n => n.type === 'erro'))
  r.consulta.erro = null; r.consulta.dados = []; assert.match(text(r.render()), /Nenhum registro cadastrado/)
})
test('detalhe de cotação recusa retorno incompleto sem quebrar o modal', () => {
  const r = fixture('cotacoes', [])
  r.consulta.dados = null
  const v = r.api.DetalhesCotacaoAdmin({ id: 21, aoAbrirPainel() {}, aoSair() {} })
  assert.equal(v.type, 'erro')
  assert.match(v.props.erro.message, /incompletos/)
})
