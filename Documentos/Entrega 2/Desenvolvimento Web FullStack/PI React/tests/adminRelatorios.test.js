import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { setImmediate } from 'node:timers'
import { carregarAdmin, hooksAdmin, nodes, text } from './helpers/adminRuntime.js'
const { nomesPerfis, diaSolicitacao, normalizarBusca } = carregarAdmin('services/admin.js', ['nomesPerfis', 'diaSolicitacao', 'normalizarBusca'])
const { moedaPainel } = carregarAdmin('services/painelEventoAdmin.js', ['moedaPainel'])
const { relatoriosAdmin, validarDadosRelatorio, filtrarRelatorio, filtrosRelatorio, agruparRelatorio, diaEventoRelatorio } = carregarAdmin('services/relatoriosAdmin.js', ['relatoriosAdmin', 'validarDadosRelatorio', 'filtrarRelatorio', 'filtrosRelatorio', 'agruparRelatorio', 'diaEventoRelatorio'], { diaSolicitacao, normalizarBusca })
const evento = (id = 1) => ({ id, nome: 'Evento sintético', data: '2026-11-20T03:00:00.000Z', horario: '10:00:00', local: 'Local', categoria: 'Social', usuario_id: 7, organizador_nome: 'Organizador', status: 'Ativo' })
const usuario = (id = 1) => ({ id, nome: 'João', email: 'sintetico@example.invalid', perfil: 'organizador' })
const pedido = (id = 1) => ({ id, usuario_id: 9, nome: 'Solicitante', perfil_solicitado: 'organizador', status: 'pendente', criada_em: '2026-11-21T01:00:00Z' })
const cotacao = (id = 1) => ({ id, evento_id: 7, evento_nome: 'Evento sintético', modalidade: 'Fechada', status: 'Aberta', prazo: '2026-11-30', criada_em: '2026-11-21T01:00:00Z' })
const proposta = (id = 1) => ({ id, evento_id: 7, evento_nome: 'Evento sintético', fornecedor_id: 9, fornecedor_nome: 'Fornecedor sintético', valor: '123456789012345.67', status: 'Em avaliação', criada_em: '2026-11-21T01:00:00Z' })
const registros = [['eventos', evento()], ['usuarios', usuario()], ['solicitacoes', pedido()], ['cotacoes', cotacao()], ['propostas', proposta()]]
const util = { relatoriosAdmin, validarDadosRelatorio, filtrarRelatorio, filtrosRelatorio, agruparRelatorio, diaEventoRelatorio, nomesPerfis, diaSolicitacao, moedaPainel }
function fixture(tipo, dados) {
  const calls = []
  const consulta = { dados, carregando: false, erro: null, recarregar() { calls.push('recarregar') } }
  const h = hooksAdmin({ ...util, useConsultaAdmin: rota => { calls.push(rota); return consulta }, FiltroAdmin: 'filtro', BadgeAdmin: 'badge', EstadoAdmin: 'estado', SkeletonAdmin: 'skeleton', ErroAdmin: 'erro' })
  const api = carregarAdmin('components/admin/AdminRelatorios.jsx', ['DadosRelatorioAdmin', 'AdminRelatorios', 'GrupoRelatorio'], h.env)
  return { calls, consulta, api, render: () => h.render(api.DadosRelatorioAdmin, { tipo, aoSair() {} }), renderGrupo: props => api.GrupoRelatorio(props) }
}
test('validação mantém listas acima de mil e rejeita IDs duplicados/registro incompleto sem total falso', () => {
  const dados = Array.from({ length: 2001 }, (_, i) => evento(i + 1))
  assert.equal(validarDadosRelatorio('eventos', dados).length, 2001)
  assert.equal(agruparRelatorio(dados, 'status')[0].quantidade, 2001)
  for (const d of [null, {}, [evento(), evento()], [{ ...evento(), local: undefined }], [{ ...evento(), data: '2026-02-30' }]]) {
    assert.throws(() => validarDadosRelatorio('eventos', d), /incompleta/)
  }
  assert.throws(() => validarDadosRelatorio('usuarios', [{ ...usuario(), email: null }]), /incompleta/)
  assert.throws(() => validarDadosRelatorio('solicitacoes', [{ ...pedido(), criada_em: 'inválida' }]), /incompleta/)
})
test('Eventos combina estado, categoria, dono e realização; agrupa somente resultados filtrados', () => {
  const dados = [evento(), { ...evento(2), status: 'Cancelado' }, { ...evento(3), categoria: null, usuario_id: 8 }]
  const lista = filtrarRelatorio('eventos', dados, { ...filtrosRelatorio, estado: 'Ativo', categoria: 'Social', organizador: '7', inicio: '2026-11-20', fim: '2026-11-20' })
  assert.deepEqual(Array.from(lista, e => e.id), [1])
  assert.deepEqual(JSON.parse(JSON.stringify(agruparRelatorio(lista, 'status'))), [{ valor: 'Ativo', quantidade: 1 }])
  assert.ok(agruparRelatorio(dados, 'categoria').some(g => g.valor === 'Não informada'))
  assert.equal(diaEventoRelatorio(evento().data), '2026-11-20')
})
test('Usuários combina perfil/busca insensível a acentos e ignora período inexistente', () => {
  const dados = [usuario(), { ...usuario(2), perfil: 'admin' }]
  assert.equal(filtrarRelatorio('usuarios', dados, { ...filtrosRelatorio, perfil: 'organizador', busca: 'JOAO' }).length, 1)
  assert.equal(filtrarRelatorio('usuarios', dados, { ...filtrosRelatorio, perfil: 'admin', busca: 'EXAMPLE.INVALID' }).length, 1)
  assert.equal(filtrarRelatorio('usuarios', dados, { ...filtrosRelatorio, inicio: '2099-01-01' }).length, 2)
  assert.equal(agruparRelatorio(dados, 'perfil').length, 2)
})
test('Solicitações usa dia do pedido em São Paulo, não data de decisão', () => {
  const dados = [pedido(), { ...pedido(2), criada_em: '2026-11-21T03:00:00Z', status: 'aprovado' }]
  const lista = filtrarRelatorio('solicitacoes', dados, { ...filtrosRelatorio, perfil: 'organizador', estado: 'pendente', inicio: '2026-11-20', fim: '2026-11-20' })
  assert.deepEqual(Array.from(lista, e => e.id), [1])
  assert.equal(filtrarRelatorio('solicitacoes', dados, { ...filtrosRelatorio, inicio: '2026-11-22', fim: '2026-11-20' }).length, 0)
})
test('Cotações separa modalidade/estado e combina evento, criação em São Paulo ou prazo de calendário', () => {
  const dados = [cotacao(), { ...cotacao(2), modalidade: 'Aberta', status: 'Fechada', evento_id: 8 },
    { ...cotacao(3), criada_em: '2026-11-21T03:00:00Z' }]
  const filtros = { ...filtrosRelatorio, estado: 'Aberta', modalidade: 'Fechada', evento: '7', inicio: '2026-11-20', fim: '2026-11-20' }
  assert.deepEqual(Array.from(filtrarRelatorio('cotacoes', dados, filtros), e => e.id), [1])
  assert.equal(filtrarRelatorio('cotacoes', dados, { ...filtros, dataReferencia: 'prazo' }).length, 0)
  assert.equal(filtrarRelatorio('cotacoes', dados, { ...filtros, dataReferencia: 'prazo', inicio: '2026-11-30', fim: '2026-11-30' }).length, 2)
  assert.deepEqual(JSON.parse(JSON.stringify(agruparRelatorio(dados, 'status'))), [{ valor: 'Aberta', quantidade: 2 }, { valor: 'Fechada', quantidade: 1 }])
  assert.deepEqual(JSON.parse(JSON.stringify(agruparRelatorio(dados, 'modalidade'))), [{ valor: 'Aberta', quantidade: 1 }, { valor: 'Fechada', quantidade: 2 }])
  const f = fixture('cotacoes', dados)
  let v = f.render()
  assert.match(text(v), /Período de criação da cotação/)
  const referencia = nodes(v).find(n => n.type === 'select')
  assert.equal(referencia.props['aria-describedby'], 'adm-relatorio-periodo')
  referencia.props.onChange({ target: { value: 'prazo' } })
  v = f.render()
  assert.match(text(v), /Período do prazo da cotação/)
  assert.deepEqual(nodes(v).filter(n => n.type === 'th').map(text), ['ID', 'Evento', 'Modalidade', 'Estado', 'Prazo', 'Data de criação'])
  assert.equal(nodes(v).find(n => n.type === 'filtro' && n.props.titulo === 'Evento').props.opcoes.length, 2)
})
test('Propostas combina estado, evento, fornecedor e criação, preservando valores e distribuição', () => {
  const dados = [proposta(), { ...proposta(2), status: 'Aprovada', fornecedor_id: 10 },
    { ...proposta(3), status: 'Recusada', evento_id: 8 }, { ...proposta(4), criada_em: '2026-11-21T00:00:00-03:00' }]
  const lista = filtrarRelatorio('propostas', dados, { ...filtrosRelatorio, estado: 'Em avaliação', evento: '7', fornecedor: '9', inicio: '2026-11-20', fim: '2026-11-20' })
  assert.deepEqual(Array.from(lista, e => e.id), [1])
  assert.equal(agruparRelatorio(dados, 'status').length, 3)
  assert.equal(agruparRelatorio(lista, 'status')[0].quantidade, 1)
  const f = fixture('propostas', dados), v = f.render()
  assert.match(text(v), /R\$ 123\.456\.789\.012\.345,67/)
  assert.match(text(v), /propostas comerciais, não representam pagamentos realizados, faturamento ou receita/)
  assert.match(text(v), /não de aprovação ou recusa/)
  assert.deepEqual(nodes(v).filter(n => n.type === 'th').map(text), ['ID', 'Evento', 'Fornecedor', 'Valor proposto', 'Estado', 'Data de criação'])
  assert.equal(nodes(v).find(n => n.type === 'filtro' && n.props.titulo === 'Fornecedor').props.opcoes.length, 2)
  assert.equal(moedaPainel('0.00'), 'R$ 0,00')
})
test('listas comerciais completas acima de mil e dados incompletos não produzem indicadores parciais', () => {
  for (const [tipo, criar] of [['cotacoes', cotacao], ['propostas', proposta]]) {
    const dados = Array.from({ length: 2001 }, (_, i) => criar(i + 1))
    assert.equal(validarDadosRelatorio(tipo, dados).length, 2001)
    assert.equal(agruparRelatorio(dados, 'status')[0].quantidade, 2001)
    for (const invalido of [{ ...criar(), evento_id: null }, { ...criar(), criada_em: null },
      { ...criar(), criada_em: '2026-11-20T10:00:00' }, { ...criar(), criada_em: '2026-02-30T10:00:00Z' },
      tipo === 'cotacoes' ? { ...criar(), prazo: '2026-02-30' } : { ...criar(), valor: 'inválido' }]) {
      assert.throws(() => validarDadosRelatorio(tipo, [invalido]), /incompleta/)
    }
  }
})
for (const [tipo, registro] of registros) test(tipo + ': consulta exclusiva, total/filtrado, atualização e limpeza', () => {
  const f = fixture(tipo, [registro, { ...registro, id: 2 }]), v = f.render()
  assert.deepEqual(f.calls, [relatoriosAdmin[tipo].rota])
  assert.match(text(v), /Total consultado\s+2/)
  assert.match(text(v), /Após os filtros\s+2/)
  const grupo = nodes(v).find(n => n.type === f.api.GrupoRelatorio)
  assert.equal(grupo.props.dados.length, 2)
  if (tipo === 'usuarios') {
    assert.equal(nodes(v).some(n => n.type === 'input' && n.props.type === 'date'), false)
    nodes(v).find(n => n.type === 'input').props.onChange({ target: { value: 'inexistente' } })
  } else nodes(v).find(n => n.type === 'filtro' && n.props.titulo === 'Estado').props.aoAlterar('inexistente')
  assert.match(text(f.render()), /Nenhum resultado para estes filtros/)
  assert.match(text(f.render()), /Total consultado\s+2/)
  assert.match(text(f.render()), /Após os filtros\s+0/)
  nodes(f.render()).find(n => n.type === 'button' && text(n) === 'Atualizar relatório').props.onClick()
  assert.ok(f.calls.includes('recarregar'))
  assert.match(text(f.render()), /Nenhum resultado para estes filtros/)
  nodes(f.render()).find(n => n.type === 'button' && text(n) === 'Limpar filtros').props.onClick()
  assert.match(text(f.render()), /Após os filtros\s+2/)
  assert.ok(nodes(f.render()).filter(n => n.type === 'th').every(n => n.props.scope === 'col'))
})
for (const [tipo] of registros) test(tipo + ': carregamento, vazio, erro, 401/403 e resposta incompleta não confundem total com zero', () => {
  const f = fixture(tipo, [])
  assert.match(text(f.render()), /Nenhum registro cadastrado/)
  f.consulta.carregando = true; assert.ok(nodes(f.render()).some(n => n.type === 'skeleton'))
  f.consulta.carregando = false
  for (const status of [401, 403, 500]) {
    f.consulta.erro = Object.assign(Error('Falha'), { status })
    assert.equal(nodes(f.render()).find(n => n.type === 'erro').props.erro.status, status)
    assert.doesNotMatch(text(f.render()), /Total consultado|Após os filtros/)
  }
  f.consulta.erro = null; f.consulta.dados = [{ id: 1 }]
  assert.ok(nodes(f.render()).some(n => n.type === 'erro'))
})

for (const [tipo, registro] of registros) test(tipo + ': recarga preserva controles/filtros focáveis e anuncia conclusão sem indicadores antigos', () => {
  const f = fixture(tipo, [registro])
  let v = f.render()
  if (tipo === 'usuarios') nodes(v).find(n => n.type === 'input').props.onChange({ target: { value: 'sintetico' } })
  else nodes(v).find(n => n.type === 'filtro' && n.props.titulo === 'Estado').props.aoAlterar(registro.status)
  const antes = nodes(f.render()).filter(n => n.type === 'input' || n.type === 'filtro').map(n => n.type)
  nodes(f.render()).find(n => n.type === 'button' && text(n) === 'Atualizar relatório').props.onClick()
  assert.equal(f.calls.filter(c => c === 'recarregar').length, 1)
  f.consulta.carregando = true; v = f.render()
  assert.deepEqual(nodes(v).filter(n => n.type === 'input' || n.type === 'filtro').map(n => n.type), antes)
  const botao = nodes(v).find(n => n.type === 'button' && text(n) === 'Atualizar relatório')
  assert.equal(botao.props['aria-disabled'], true); assert.notEqual(botao.props.disabled, true)
  botao.props.onClick(); assert.equal(f.calls.filter(c => c === 'recarregar').length, 1)
  assert.ok(nodes(v).some(n => n.props['aria-busy'] === true))
  assert.ok(nodes(v).some(n => n.props.role === 'status' && n.props['aria-live'] === 'polite' && /Carregando/.test(text(n))))
  assert.doesNotMatch(text(v), /Total consultado|Após os filtros/)
  f.consulta.carregando = false; v = f.render()
  assert.equal(nodes(v).find(n => n.type === 'button' && text(n) === 'Atualizar relatório').props['aria-disabled'], false)
  assert.match(text(v), /Consulta do relatório concluída/)
  if (tipo === 'usuarios') assert.equal(nodes(v).find(n => n.type === 'input').props.value, 'sintetico')
  else assert.equal(nodes(v).find(n => n.type === 'filtro' && n.props.titulo === 'Estado').props.valor, registro.status)
})

test('hook mantém opções durante atualização opt-in e limpa dados após falha, preservando o padrão dos demais consumidores', async () => {
  let rejeitar, count = 0
  const h = hooksAdmin({ AbortController, listarAdmin: async () => {
    if (++count === 1) return [evento()]
    return new Promise((_, reject) => { rejeitar = reject })
  } })
  const { useConsultaAdmin } = carregarAdmin('hooks/useConsultaAdmin.js', ['useConsultaAdmin'], h.env)
  const render = () => h.render(() => useConsultaAdmin('/admin/eventos', true, true))
  render(); await new Promise(r => setImmediate(r))
  assert.equal(render().dados.length, 1)
  render().recarregar(); assert.equal(render().carregando, true); assert.equal(render().dados.length, 1)
  rejeitar(Object.assign(Error('Negado'), { status: 403 })); await new Promise(r => setImmediate(r))
  assert.equal(render().dados.length, 0); assert.equal(render().erro.status, 403)
  h.close()
})
test('período inválido é descrito aos campos e não exibe indicadores zero', () => {
  const f = fixture('eventos', [evento()])
  let datas = nodes(f.render()).filter(n => n.type === 'input' && n.props.type === 'date')
  datas[0].props.onChange({ target: { value: '2026-11-22' } }); datas[1].props.onChange({ target: { value: '2026-11-20' } })
  const v = f.render(); datas = nodes(v).filter(n => n.type === 'input' && n.props.type === 'date')
  assert.ok(datas.every(n => n.props['aria-invalid'] && n.props['aria-describedby'] === 'adm-relatorio-periodo-erro'))
  assert.ok(nodes(v).some(n => n.props.role === 'alert')); assert.doesNotMatch(text(v), /Total consultado/)
})
test('seletor monta somente o relatório escolhido com key distinta e mantém um único h1', () => {
  const h = hooksAdmin(util)
  const { AdminRelatorios, DadosRelatorioAdmin } = carregarAdmin('components/admin/AdminRelatorios.jsx', ['AdminRelatorios', 'DadosRelatorioAdmin'], h.env)
  const render = () => h.render(AdminRelatorios, {})
  const primeiro = nodes(render()).find(n => n.type === DadosRelatorioAdmin)
  assert.equal(primeiro.props.tipo, 'eventos'); assert.equal(primeiro.props.key, 'eventos')
  for (const [tipo] of registros) {
    nodes(render()).find(n => n.type === 'select').props.onChange({ target: { value: tipo } })
    const filhos = nodes(render()).filter(n => n.type === DadosRelatorioAdmin)
    assert.equal(filhos.length, 1)
    assert.equal(filhos[0].props.tipo, tipo)
    assert.equal(filhos[0].props.key, tipo)
  }
  nodes(render()).find(n => n.type === 'select').props.onChange({ target: { value: 'usuarios' } })
  const v = render(), filho = nodes(v).find(n => n.type === DadosRelatorioAdmin)
  assert.equal(filho.props.tipo, 'usuarios'); assert.equal(filho.props.key, 'usuarios')
  assert.equal(nodes(v).filter(n => n.type === DadosRelatorioAdmin).length, 1)
  assert.equal(nodes(v).filter(n => n.type === 'h1').length, 1)
  assert.deepEqual(nodes(v).filter(n => n.type === 'option').map(n => n.props.value), registros.map(([tipo]) => tipo))
  assert.doesNotMatch(text(v), /CSV|Exportar/)
})
test('hook reutilizado cancela a consulta desmontada, sem resposta atrasada', async () => {
  let terminar, signal
  const h = hooksAdmin({ AbortController, listarAdmin: (_r, op) => { signal = op.signal; return new Promise(r => { terminar = r }) } })
  const { useConsultaAdmin } = carregarAdmin('hooks/useConsultaAdmin.js', ['useConsultaAdmin'], h.env)
  const render = () => h.render(() => useConsultaAdmin('/usuarios'))
  assert.equal(render().carregando, true); h.close(); assert.equal(signal.aborted, true)
  terminar([usuario()]); await new Promise(r => setImmediate(r))
  assert.equal(render().carregando, true)
})
const css = postcss.parse(readFileSync(new URL('../src/components/admin/AdminRelatorios.css', import.meta.url), 'utf8'))
function estilo(s, width) {
  const v = {}; css.walkRules(r => {
    if (!r.selectors.includes(s)) return
    for (let p = r.parent; p; p = p.parent) if (p.type === 'atrule' && width > Number(p.params.match(/max-width:\s*(\d+)/)?.[1] ?? Infinity)) return
    r.walkDecls(d => { v[d.prop] = d.value })
  }); return v
}
for (const width of [1920, 1366, 768, 390, 360]) test('Relatórios responsivos em ' + width + 'px', () => {
  assert.equal(estilo('.admRelatorios .admFiltros', width)['grid-template-columns'], width <= 540 ? 'minmax(0, 1fr)' : width <= 1000 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))')
  assert.equal(estilo('.admRelatorios .admRelatorioTotais', width)['grid-template-columns'], width <= 540 ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))')
  assert.equal(estilo('.admRelatorios .admRelatorioSeletor select', width)['min-height'], '44px')
})
