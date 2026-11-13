import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { carregarAdmin, nodes, text } from './helpers/adminRuntime.js'
import { lerDestinoNavegacao, urlDestinoNavegacao } from '../src/hooks/useNavegacao.js'

function fixture() {
  const caminhos = [], destinos = [], recargas = []
  const dados = {
    '/solicitacoes-acesso': [{ id: 1, status: 'pendente' }, { id: 2, status: 'aprovado' }, { id: 3, status: 'pendente' }],
    '/admin/eventos': [{ id: 1, status: 'Ativo' }, { id: 2, status: 'Cancelado' }],
    '/usuarios': [{ id: 1, perfil: 'admin' }, { id: 2, perfil: 'fornecedor' }, { id: 3, perfil: 'participante' }],
  }
  const recursos = Object.fromEntries(Object.entries(dados).map(([p, dados]) => [p, { dados, carregando: false, erro: null, recarregar() { recargas.push(p) } }]))
  const { AdminVisaoGeral } = carregarAdmin('components/admin/AdminVisaoGeral.jsx', ['AdminVisaoGeral'], {
    useConsultaAdmin(p) { caminhos.push(p); return recursos[p] }, SkeletonAdmin: 'skeleton', ErroAdmin: 'erro', Icone: 'icone',
  })
  return { recursos, caminhos, destinos, recargas, render: () => AdminVisaoGeral({ aoNavegar: s => destinos.push(s), aoSair() {} }) }
}
const cards = v => nodes(v).filter(n => n.type === 'article')
const valores = v => nodes(v).filter(n => n.props.className === 'admResumoValor').map(text)

test('indicadores usam apenas três listas reais; pendências filtram status e totais incluem todos os perfis/estados', () => {
  const f = fixture(), v = f.render()
  assert.deepEqual(f.caminhos, ['/solicitacoes-acesso', '/admin/eventos', '/usuarios'])
  assert.deepEqual(valores(v), ['2', '2', '3'])
  assert.match(text(v), /sem filtro de período/)
  assert.doesNotMatch(text(v), /R\$|receita|crescimento|pagamento|%/i)
})
test('carregamento e erros não exibem zero ou valores antigos; outras consultas continuam independentes', () => {
  const f = fixture()
  f.recursos['/usuarios'].carregando = true
  let v = f.render()
  assert.equal(nodes(cards(v)[2]).some(n => n.type === 'skeleton'), true)
  assert.deepEqual(valores(v), ['2', '2'])
  assert.equal(nodes(v).find(n => text(n) === 'Atualizar resumo').props.disabled, true)
  f.recursos['/usuarios'].carregando = false
  f.recursos['/usuarios'].erro = new Error('Consulta indisponível')
  v = f.render()
  const erro = nodes(cards(v)[2]).find(n => n.type === 'erro')
  assert.equal(erro.props.erro.message, 'Consulta indisponível')
  assert.deepEqual(valores(v), ['2', '2'])
  erro.props.aoAtualizar(); assert.deepEqual(f.recargas, ['/usuarios'])
})
test('listas vazias exibem zero confirmado; histórico sem pendências não equivale a ausência de registros', () => {
  const f = fixture()
  Object.values(f.recursos).forEach(r => { r.dados = [] })
  assert.deepEqual(valores(f.render()), ['0', '0', '0'])
  assert.equal(cards(f.render()).filter(n => text(n).includes('Nenhum registro cadastrado.')).length, 3)
  f.recursos['/solicitacoes-acesso'].dados = [{ status: 'rejeitado' }]
  assert.match(text(cards(f.render())[0]), /Nenhuma solicitação pendente/)
  assert.doesNotMatch(text(cards(f.render())[0]), /Nenhum registro cadastrado/)
})
for (const status of [401, 403]) test('restrição de acesso ' + status + ' oculta indicadores e atalhos', () => {
  const f = fixture(), erro = Object.assign(new Error('Acesso recusado'), { status })
  f.recursos['/usuarios'].erro = erro
  const v = f.render()
  assert.equal(cards(v).length, 0)
  assert.equal(nodes(v).some(n => n.type === 'nav'), false)
  assert.equal(nodes(v).find(n => n.type === 'erro').props.erro, erro)
})
test('atalhos e cards usam somente navegação existente; atualização recarrega as três consultas', () => {
  const f = fixture(), v = f.render()
  const nav = nodes(v).find(n => n.type === 'nav')
  nodes(nav).filter(n => n.type === 'button').forEach(n => n.props.onClick())
  assert.deepEqual(f.destinos, ['cotacoes', 'propostas'])
  nodes(v).find(n => n.type === 'button' && text(n) === 'Atualizar resumo').props.onClick()
  assert.deepEqual(f.recargas, ['/solicitacoes-acesso', '/admin/eventos', '/usuarios'])
  nodes(cards(v)[0]).find(n => n.type === 'button').props.onClick()
  assert.equal(f.destinos.at(-1), 'contas')
  nodes(cards(v)[1]).find(n => n.type === 'button').props.onClick()
  nodes(cards(v)[2]).find(n => n.type === 'button').props.onClick()
  assert.deepEqual([...new Set(f.destinos)].sort(), ['contas', 'cotacoes', 'eventos', 'propostas', 'usuarios'])
})
test('início e solicitações têm URLs distintas e restauráveis; painel e detalhes mantêm contrato', () => {
  assert.equal(lerDestinoNavegacao('#/admin').dados.secao, 'inicio')
  for (const url of ['#/admin', '#/admin?secao=contas', '#/admin?secao=painel&evento=8', '#/admin?secao=cotacoes&cotacao=2']) {
    assert.equal(urlDestinoNavegacao(lerDestinoNavegacao(url)), url)
  }
  assert.equal(lerDestinoNavegacao('#/admin?secao=inicio&evento=8'), null)
  assert.equal(lerDestinoNavegacao('#/admin?secao=relatorios').dados.secao, 'relatorios')
})

const css = postcss.parse(readFileSync(new URL('../src/components/admin/AdminVisaoGeral.css', import.meta.url), 'utf8'))
function estilo(seletor, largura) {
  const resultado = {}
  css.walkRules(r => {
    if (!r.selectors.includes(seletor)) return
    for (let p = r.parent; p; p = p.parent) if (p.type === 'atrule' && largura > Number(p.params.match(/max-width:\s*(\d+)/)?.[1] ?? Infinity)) return
    r.walkDecls(d => { resultado[d.prop] = d.value })
  })
  return resultado
}
for (const largura of [1920, 1366, 768, 390, 360, 320, 375]) test('dashboard responsivo em ' + largura + 'px', () => {
  assert.equal(estilo('.admVisaoGeral .admResumoGrade', largura)['grid-template-columns'], largura <= 1100 ? 'minmax(0, 1fr)' : 'repeat(3, minmax(0, 1fr))')
  assert.equal(estilo('.admVisaoGeral .admResumoCartao', largura)['min-width'], '0')
  assert.equal(estilo('.admVisaoGeral .admResumoAtalhos', largura)['flex-wrap'], 'wrap')
  if (largura <= 540) assert.equal(estilo('.admVisaoGeral .admResumoAtalhos button', largura).width, '100%')
})
test('CSS do dashboard é restrito; estados e foco reutilizam componentes administrativos', () => {
  css.walkRules(r => r.selectors.forEach(s => assert.ok(s.startsWith('.admVisaoGeral '))))
  assert.doesNotMatch(css.toString(), /overflow-x:\s*hidden|#[\da-f]{3,8}\b/)
  const f = fixture(), v = f.render()
  assert.equal(nodes(v).filter(n => n.type === 'h1').length, 1)
  assert.equal(v.props['aria-labelledby'], 'adm-inicio-titulo')
  assert.equal(nodes(v).find(n => n.type === 'h1').props.className, 'admSrOnly')
  assert.equal(estilo('.admVisaoGeral .admResumoCartao', 1366).display, 'flex')
  assert.equal(estilo('.admVisaoGeral .admResumoConsultar', 1366)['margin-top'], 'auto')
  assert.equal(estilo('.admVisaoGeral .admResumoApresentacao', 360)['flex-wrap'], 'wrap')
})
