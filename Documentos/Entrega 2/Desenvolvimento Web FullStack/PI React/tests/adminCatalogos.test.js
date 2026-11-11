import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { carregarAdmin, hooksAdmin, nodes, text } from './helpers/adminRuntime.js'
const util = carregarAdmin('services/admin.js', ['filtrarCatalogo', 'nomesPerfis'])
const formatar = carregarAdmin('services/painelEventoAdmin.js', ['moedaPainel', 'dataPainel'])
test('fechamento local usa callback atual e mantém handler estável para não reiniciar o foco do modal', () => {
  const calls = []
  const h = hooksAdmin({ ...util, useConsultaAdmin: () => ({ dados: [], carregando: false, erro: null }), ModalAdmin: 'modal', FiltroAdmin: 'filtro' })
  let memo
  h.env.useCallback = (fn, deps) => {
    if (!memo || deps.some((d, i) => d !== memo.deps[i])) memo = { fn, deps }
    return memo.fn
  }
  const { AdminCatalogo } = carregarAdmin('components/admin/AdminCatalogos.jsx', ['AdminCatalogo'], h.env)
  const render = aoFecharCotacao => h.render(AdminCatalogo, { tipo: 'cotacoes', cotacaoInicial: 21, aoFecharCotacao })
  const fechar = nodes(render(() => calls.push('anterior'))).find(n => n.type === 'modal').props.aoFechar
  assert.equal(nodes(render(() => calls.push('atual'))).find(n => n.type === 'modal').props.aoFechar, fechar)
  fechar()
  assert.deepEqual(calls, ['atual'])
  assert.equal(nodes(render()).some(n => n.type === 'modal'), false)
  h.close()
})
function fixture(tipo, dados) {
  const consulta = { dados, carregando: false, erro: null }, destinos = []
  consulta.recarregar = () => { consulta.recargas = (consulta.recargas || 0) + 1 }
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

test('Eventos mantém título único acessível, colunas e identidade retornada, sem ações de escrita', () => {
  const r = fixture('eventos', [{ id: 7, nome: 'Nome longo '.repeat(20), local: 'Local longo '.repeat(20), status: 'Em planejamento', usuario_id: 4, organizador_nome: 'Nome cadastrado', data: '2026-11-20', horario: '19:00:00' }])
  const v = r.render()
  assert.equal(v.props.className, 'admPagina admEventos')
  const titulos = nodes(v).filter(n => n.type === 'h1')
  assert.equal(titulos.length, 1); assert.equal(titulos[0].props.className, 'admSrOnly')
  assert.deepEqual(nodes(v).filter(n => n.type === 'th').map(text), ['Evento', 'Local', 'Estado', 'Organizador', 'Ações'])
  assert.match(text(v), /Nome cadastrado/)
  assert.match(text(v), /Exibindo\s+1\s+de\s+1\s+registros/)
  const visualizar = nodes(v).find(n => n.type === 'button' && text(n) === 'Visualizar')
  assert.match(visualizar.props['aria-label'], /^Visualizar evento Nome longo/)
  let focado = 0
  visualizar.props.onClick({ currentTarget: { focus() { focado++ } } })
  assert.equal(focado, 1)
  const modal = nodes(r.render()).find(n => n.type === 'modal')
  assert.equal(modal.props.titulo, 'Detalhes do evento')
  assert.equal(nodes(r.render()).find(n => n.type === 'resumo').props.evento.horario, '19:00:00')
  modal.props.aoFechar(); assert.equal(nodes(r.render()).some(n => n.type === 'modal'), false)
  nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Abrir painel').props.onClick()
  assert.deepEqual(r.destinos, [['evento', 7]])
  assert.equal(nodes(v).some(n => n.type === 'button' && /Editar|Excluir|Criar/.test(text(n))), false)
})

test('busca/estado combinam e permanecem ao atualizar; limpar restaura lista real', () => {
  const r = fixture('eventos', [{ id: 1, nome: 'Congresso São Paulo', status: 'Ativo' }, { id: 2, nome: 'Congresso', status: 'Cancelado' }])
  nodes(r.render()).find(n => n.type === 'input').props.onChange({ target: { value: 'SAO' } })
  nodes(r.render()).find(n => n.type === 'filtro').props.aoAlterar('Ativo')
  assert.match(text(r.render()), /Exibindo\s+1\s+de\s+2\s+registros/)
  nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Atualizar lista').props.onClick()
  assert.equal(r.consulta.recargas, 1)
  assert.equal(nodes(r.render()).find(n => n.type === 'input').props.value, 'SAO')
  assert.equal(nodes(r.render()).find(n => n.type === 'filtro').props.valor, 'Ativo')
  nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Limpar filtros').props.onClick()
  assert.match(text(r.render()), /Exibindo\s+2\s+de\s+2\s+registros/)
})

test('Eventos diferencia loading, falha, ausência de dados e filtro sem resultados', () => {
  const r = fixture('eventos', [{ id: 1, nome: 'Evento' }])
  nodes(r.render()).find(n => n.type === 'input').props.onChange({ target: { value: 'Outro' } })
  assert.match(text(r.render()), /Nenhum resultado para estes filtros/)
  r.consulta.dados = []; assert.match(text(r.render()), /Nenhum registro cadastrado/)
  r.consulta.carregando = true
  assert.ok(nodes(r.render()).some(n => n.type === 'skeleton'))
  assert.equal(nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Atualizar lista').props.disabled, true)
  r.consulta.carregando = false
  r.consulta.erro = Object.assign(Error('Sem permissão'), { status: 403 })
  const erro = nodes(r.render()).find(n => n.type === 'erro')
  assert.equal(erro.props.erro.status, 403); erro.props.aoAtualizar()
  assert.equal(r.consulta.recargas, 1)
  assert.equal(nodes(r.render()).some(n => n.type === 'table'), false)
})

const cssEventos = postcss.parse(readFileSync(new URL('../src/components/admin/AdminEventos.css', import.meta.url), 'utf8'))
function estiloEvento(seletor, largura) {
  const valores = {}
  cssEventos.walkRules(r => {
    if (!r.selectors.includes(seletor)) return
    for (let p = r.parent; p; p = p.parent) if (p.type === 'atrule' && largura > Number(p.params.match(/max-width:\s*(\d+)/)?.[1] ?? Infinity)) return
    r.walkDecls(d => { valores[d.prop] = d.value })
  })
  return valores
}
for (const largura of [1920, 1366, 768, 390, 360]) test('estrutura de Eventos em ' + largura + 'px', () => {
  assert.equal(estiloEvento('.admEventos .admFiltros', largura)['grid-template-columns'], largura <= 540 ? 'minmax(0, 1fr)' : largura <= 900 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 2fr) minmax(0, 1fr) auto')
  assert.equal(estiloEvento('.admEventos .admTabela table', largura)['min-width'], '780px')
  assert.equal(estiloEvento('.admEventos .admEventoNome > strong', largura)['overflow-wrap'], 'anywhere')
  assert.equal(estiloEvento('.admEventos .admAcoes button', largura)['white-space'], 'normal')
})
test('CSS de Eventos é isolado e não mascara rolagem ou altera modais', () => {
  cssEventos.walkRules(r => r.selectors.forEach(s => assert.ok(s.startsWith('.admEventos '))))
  assert.doesNotMatch(cssEventos.toString(), /overflow-x:\s*hidden|!important|\.admModal/)
  const r = fixture('cotacoes', [])
  assert.equal(r.render().props.className.includes('admEventos'), false)
  assert.equal(nodes(r.render()).find(n => n.type === 'h1').props.className, 'admSrOnly')
})

test('Usuários mantém colunas, título único e perfil retornado, independentemente do nome', () => {
  const r = fixture('usuarios', [{ id: 4, nome: 'Participante Teste', email: 'sintetico@example.invalid', perfil: 'organizador', senha: 'NAO_EXIBIR', token: 'TOKEN_NAO_EXIBIR' }])
  const v = r.render(), h1 = nodes(v).filter(n => n.type === 'h1')
  assert.equal(v.props.className, 'admPagina admUsuarios')
  assert.equal(h1.length, 1); assert.equal(h1[0].props.className, 'admSrOnly')
  assert.deepEqual(nodes(v).filter(n => n.type === 'th').map(text), ['ID', 'Nome', 'E-mail', 'Perfil', 'Ações'])
  assert.equal(nodes(v).find(n => n.type === 'badge').props.valor, 'organizador')
  const botao = nodes(v).find(n => n.type === 'button' && text(n) === 'Visualizar')
  assert.equal(botao.props['aria-label'], 'Visualizar usuário Participante Teste, ID 4')
  let foco = 0
  botao.props.onClick({ currentTarget: { focus() { foco++ } } })
  const detalhe = r.render(), modal = nodes(detalhe).find(n => n.type === 'modal')
  assert.equal(foco, 1); assert.equal(modal.props.titulo, 'Detalhes do usuário')
  assert.match(text(detalhe), /sintetico@example.invalid/)
  assert.match(text(detalhe), /Participante Teste/)
  assert.ok(nodes(detalhe).some(n => n.props.className === 'admUsuarioDetalhes'))
  assert.doesNotMatch(text(detalhe), /NAO_EXIBIR|TOKEN_NAO_EXIBIR/)
  assert.equal(nodes(detalhe).filter(n => n.type === 'badge').every(n => n.props.valor === 'organizador' && n.props.perfil), true)
  assert.equal(nodes(detalhe).some(n => n.type === 'button' && /Editar|Excluir|Bloquear|Alterar perfil/.test(text(n))), false)
  modal.props.aoFechar(); assert.equal(nodes(r.render()).some(n => n.type === 'modal'), false)
})

test('Usuários combina busca por nome/email e perfil, preserva filtros ao atualizar e limpa explicitamente', () => {
  const r = fixture('usuarios', [{ id: 1, nome: 'João', email: 'um@example.invalid', perfil: 'organizador' }, { id: 2, nome: 'Ana', email: 'dois@example.invalid', perfil: 'admin' }])
  const buscar = value => nodes(r.render()).find(n => n.type === 'input').props.onChange({ target: { value } })
  buscar('JOAO'); assert.match(text(r.render()), /Exibindo\s+1\s+de\s+2\s+registros/)
  buscar('DOIS@'); nodes(r.render()).find(n => n.type === 'filtro').props.aoAlterar('admin')
  assert.match(text(r.render()), /Ana/); assert.doesNotMatch(text(r.render()), /João/)
  nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Atualizar lista').props.onClick()
  assert.equal(r.consulta.recargas, 1)
  assert.equal(nodes(r.render()).find(n => n.type === 'input').props.value, 'DOIS@')
  assert.equal(nodes(r.render()).find(n => n.type === 'filtro').props.valor, 'admin')
  nodes(r.render()).find(n => n.type === 'filtro').props.aoAlterar('fornecedor')
  assert.match(text(r.render()), /Nenhum resultado para estes filtros/)
  nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Limpar filtros').props.onClick()
  assert.match(text(r.render()), /Exibindo\s+2\s+de\s+2\s+registros/)
})

test('Usuários diferencia carregamento, erros e ausência de cadastros sem mostrar dados em falhas', () => {
  const r = fixture('usuarios', [])
  assert.match(text(r.render()), /Nenhum registro cadastrado/)
  r.consulta.carregando = true
  assert.ok(nodes(r.render()).some(n => n.type === 'skeleton'))
  assert.equal(nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Atualizar lista').props.disabled, true)
  r.consulta.carregando = false
  for (const status of [401, 403, 500]) {
    r.consulta.erro = Object.assign(Error('Falha de consulta'), { status })
    const v = r.render(), erro = nodes(v).find(n => n.type === 'erro')
    assert.equal(erro.props.erro.status, status)
    assert.equal(nodes(v).some(n => n.type === 'table'), false)
    erro.props.aoAtualizar()
  }
  assert.equal(r.consulta.recargas, 3)
})

test('badges traduzem os quatro perfis retornados sem inferir perfil pelo nome', () => {
  const { BadgeAdmin } = carregarAdmin('components/admin/AdminUI.jsx', ['BadgeAdmin'], { nomesPerfis: util.nomesPerfis })
  for (const [valor, esperado] of Object.entries(util.nomesPerfis)) {
    const badge = BadgeAdmin({ valor, perfil: true })
    assert.equal(text(badge), esperado)
    assert.equal(badge.props.className, 'admBadge admBadge--perfil')
  }
})

const cssUsuarios = postcss.parse(readFileSync(new URL('../src/components/admin/AdminUsuarios.css', import.meta.url), 'utf8'))
function estiloUsuario(seletor, largura) {
  const valores = {}
  cssUsuarios.walkRules(r => {
    if (!r.selectors.includes(seletor)) return
    for (let p = r.parent; p; p = p.parent) if (p.type === 'atrule' && largura > Number(p.params.match(/max-width:\s*(\d+)/)?.[1] ?? Infinity)) return
    r.walkDecls(d => { valores[d.prop] = d.value })
  })
  return valores
}
for (const largura of [1920, 1366, 768, 390, 360]) test('Usuários: tabela, filtros e detalhes em ' + largura + 'px', () => {
  assert.equal(estiloUsuario('.admUsuarios .admFiltros', largura)['grid-template-columns'], largura <= 540 ? 'minmax(0, 1fr)' : largura <= 900 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 2fr) minmax(0, 1fr) auto')
  assert.equal(estiloUsuario('.admUsuarios .admTabela table', largura)['min-width'], '760px')
  assert.equal(estiloUsuario('.admUsuarios .admTabela td', largura)['overflow-wrap'], 'anywhere')
  assert.equal(estiloUsuario('.admUsuarios .admUsuarioIdentidade', largura)['min-width'], '0')
  assert.equal(estiloUsuario('.admUsuarios .admBadge--perfil', largura)['white-space'], 'normal')
  assert.equal(estiloUsuario('.admUsuarios .admUsuarioDetalhes .admDados', largura)['grid-template-columns'], 'minmax(0, 1fr)')
})
test('CSS de Usuários é restrito e não trunca nomes ou emails', () => {
  cssUsuarios.walkRules(r => r.selectors.forEach(s => assert.ok(s.startsWith('.admUsuarios '))))
  assert.doesNotMatch(cssUsuarios.toString(), /overflow(?:-x)?:\s*hidden|text-overflow:\s*ellipsis|!important/)
})

for (const tipo of ['cotacoes', 'propostas']) test(tipo + ': filtros, atualização, estados e ações de consulta', () => {
  const dados = [
    { id: 31, evento_id: 13, evento_nome: 'Evento longo '.repeat(20), fornecedor_id: 8, fornecedor_nome: 'Fornecedor longo '.repeat(20), cotacao_id: 21, modalidade: 'Fechada', status: 'Em avaliação', valor: '123456789012345.67' },
    { id: 32, evento_id: 14, evento_nome: 'Outro evento', fornecedor_id: 9, fornecedor_nome: 'Outro fornecedor', modalidade: 'Aberta', status: 'Recusada', valor: '0.00' },
  ]
  const r = fixture(tipo, dados), v = r.render()
  assert.equal(nodes(v).filter(n => n.type === 'h1').length, 1)
  assert.equal(nodes(v).find(n => n.type === 'h1').props.className, 'admSrOnly')
  assert.deepEqual(nodes(v).filter(n => n.type === 'th').map(text), tipo === 'cotacoes' ? ['ID', 'Evento', 'Modalidade', 'Estado', 'Ações'] : ['ID', 'Evento', 'Fornecedor', 'Valor proposto', 'Estado', 'Ações'])
  const filtrar = (titulo, valor) => nodes(r.render()).find(n => n.type === 'filtro' && n.props.titulo === titulo).props.aoAlterar(valor)
  filtrar('Estado', 'Em avaliação'); filtrar('Evento', '13')
  if (tipo === 'propostas') filtrar('Fornecedor', '8')
  assert.match(text(r.render()), /Exibindo\s+1\s+de\s+2\s+registros/)
  nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Atualizar lista').props.onClick()
  assert.equal(r.consulta.recargas, 1)
  assert.equal(nodes(r.render()).find(n => n.type === 'filtro' && n.props.titulo === 'Estado').props.valor, 'Em avaliação')
  assert.equal(nodes(r.render()).find(n => n.type === 'filtro' && n.props.titulo === 'Evento').props.valor, '13')
  const visualizar = nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Visualizar')
  assert.equal(visualizar.props['aria-label'], `Visualizar ${tipo === 'cotacoes' ? 'cotação' : 'proposta'} #31`)
  visualizar.props.onClick({ currentTarget: { focus() {} } })
  const modal = nodes(r.render()).find(n => n.type === 'modal')
  assert.equal(modal.props.titulo, tipo === 'cotacoes' ? 'Detalhes da cotação' : 'Detalhes da proposta')
  if (tipo === 'propostas') {
    assert.match(text(r.render()), /R\$ 123\.456\.789\.012\.345,67/)
    assert.match(text(r.render()), /não representa pagamento realizado/)
  } else assert.ok(nodes(r.render()).some(n => n.type === r.api.DetalhesCotacaoAdmin && n.props.id === 31))
  modal.props.aoFechar()
  filtrar('Evento', '99'); assert.match(text(r.render()), /Nenhum resultado para estes filtros/)
  nodes(r.render()).find(n => n.type === 'button' && text(n) === 'Limpar filtros').props.onClick()
  assert.match(text(r.render()), /Exibindo\s+2\s+de\s+2\s+registros/)
  assert.equal(nodes(r.render()).some(n => n.type === 'button' && /Aprovar|Recusar|Editar|Excluir/.test(text(n))), false)
  r.consulta.dados = []; assert.match(text(r.render()), /Nenhum registro cadastrado/)
  r.consulta.carregando = true; assert.ok(nodes(r.render()).some(n => n.type === 'skeleton'))
  r.consulta.carregando = false; r.consulta.erro = Object.assign(Error('Sem permissão'), { status: 403 })
  assert.equal(nodes(r.render()).find(n => n.type === 'erro').props.erro.status, 403)
})

test('cotação separa modalidade/estado e apresenta itens sem reinterpretar valores', () => {
  const r = fixture('cotacoes', [])
  r.consulta.dados = { id: 21, evento_id: 13, evento_nome: 'Evento autorizado', status: 'Aberta', modalidade: 'Fechada', prazo: '2026-11-30', observacoes: 'Observação cadastrada', itens: [{ id: 1, categoria: 'Áudio', descricao: 'Descrição '.repeat(50), valor_estimado: '1250.50' }] }
  const v = r.api.DetalhesCotacaoAdmin({ id: 21, aoAbrirPainel: id => r.destinos.push(id), aoSair() {} })
  assert.equal(nodes(v).find(n => n.type === 'badge').props.valor, 'Aberta')
  assert.match(text(v), /Fechada/); assert.match(text(v), /R\$ 1\.250,50/)
  assert.match(text(v), /Valores estimados; não representam despesas pagas/)
  const painel = nodes(v).find(n => n.type === 'button')
  assert.match(painel.props['aria-label'], /ID 13/)
  painel.props.onClick(); assert.deepEqual(r.destinos, [13])
  assert.ok(nodes(v).filter(n => n.type === 'th').every(n => n.props.scope === 'col'))
  r.consulta.dados.itens = []
  assert.match(text(r.api.DetalhesCotacaoAdmin({ id: 21 })), /Nenhum item cadastrado/)
})

test('badges comerciais preservam texto e usam tons semânticos; moeda mantém centavos', () => {
  const { BadgeAdmin } = carregarAdmin('components/admin/AdminUI.jsx', ['BadgeAdmin'], { nomesPerfis: util.nomesPerfis })
  for (const [valor, tom] of [['Em avaliação', 'alerta'], ['Aprovada', 'sucesso'], ['Recusada', 'erro']]) {
    const b = BadgeAdmin({ valor })
    assert.equal(text(b), valor); assert.equal(b.props.className, `admBadge admBadge--${tom}`)
  }
  assert.equal(formatar.moedaPainel('0.00'), 'R$ 0,00')
  assert.equal(formatar.moedaPainel('10.10'), 'R$ 10,10')
})

const cssComercial = postcss.parse(readFileSync(new URL('../src/components/admin/AdminComercial.css', import.meta.url), 'utf8'))
function estiloComercial(seletor, largura) {
  const valores = {}
  cssComercial.walkRules(r => {
    if (!r.selectors.includes(seletor)) return
    for (let p = r.parent; p; p = p.parent) if (p.type === 'atrule' && largura > Number(p.params.match(/max-width:\s*(\d+)/)?.[1] ?? Infinity)) return
    r.walkDecls(d => { valores[d.prop] = d.value })
  })
  return valores
}
for (const largura of [1920, 1366, 768, 390, 360]) test('Cotações e Propostas: estrutura em ' + largura + 'px', () => {
  for (const seletor of ['.admComercial .admFiltros', '.admComercial.admPropostas .admFiltros']) {
    const esperado = largura <= 540 ? 'minmax(0, 1fr)' : largura <= 1100 ? 'repeat(2, minmax(0, 1fr))' : seletor.includes('.admPropostas') ? 'repeat(3, minmax(0, 1fr)) auto' : 'repeat(2, minmax(0, 1fr)) auto'
    assert.equal(estiloComercial(seletor, largura)['grid-template-columns'], esperado)
  }
  assert.equal(estiloComercial('.admComercial .admTabela td', largura)['overflow-wrap'], 'anywhere')
  assert.equal(estiloComercial('.admComercial .admBadge', largura)['white-space'], 'normal')
  assert.equal(estiloComercial('.admComercial .admComercialDetalhes .admTabela table', largura)['min-width'], '540px')
})
test('CSS comercial não afeta Eventos/Usuários nem mascara overflow', () => {
  cssComercial.walkRules(r => r.selectors.forEach(s => assert.ok(s.startsWith('.admComercial ' ) || s.startsWith('.admComercial.adm'))))
  assert.doesNotMatch(cssComercial.toString(), /overflow-x:\s*hidden|!important/)
  assert.equal(fixture('eventos', []).render().props.className, 'admPagina admEventos')
  assert.equal(fixture('usuarios', []).render().props.className, 'admPagina admUsuarios')
})
