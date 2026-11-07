import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { createElement, Fragment, useId } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { carregarAdmin, nodes, text } from './helpers/adminRuntime.js'

let proximoId = 0
const ui = carregarAdmin('components/ui/Primitivas.jsx', ['Botao', 'Campo', 'Badge', 'Alerta', 'EstadoVazio', 'Skeleton'], {
  useId: () => `teste-${++proximoId}`,
})

test('botoes nativos preservam nome, callback, submit explicito e variantes', () => {
  for (const variante of ['primario', 'secundario', 'discreto', 'destrutivo']) {
    let chamadas = 0
    const v = ui.Botao({ variante, children: 'Continuar', onClick: () => chamadas++ })
    assert.equal(v.type, 'button'); assert.equal(v.props.type, 'button')
    assert.equal(v.props.disabled, false); assert.match(v.props.className, new RegExp(`ttBotao--${variante}`))
    assert.equal(text(v), 'Continuar'); v.props.onClick(); assert.equal(chamadas, 1)
  }
  assert.equal(ui.Botao({ type: 'submit', children: 'Salvar' }).props.type, 'submit')
  assert.equal(ui.Botao({ 'aria-label': 'Abrir menu' }).props['aria-label'], 'Abrir menu')
})

test('ocupacao bloqueia o botao sem esconder sua acao e disabled permanece nativo', () => {
  const v = ui.Botao({ ocupado: true, children: 'Salvar' })
  assert.equal(v.props.disabled, true); assert.equal(v.props['aria-busy'], true)
  assert.match(text(v), /Salvar/); assert.match(text(v), /Em andamento/)
  assert.equal(nodes(v).find(n => n.props.className === 'ttProgresso').props['aria-hidden'], 'true')
  assert.equal(ui.Botao({ disabled: true }).props.disabled, true)
  assert.match(ui.Botao({ variante: 'inexistente' }).props.className, /--primario/)
})

test('campo associa label, dica, erro e descricao externa sem perder atributos nativos', () => {
  const onChange = () => {}
  const v = ui.Campo({ id: 'email', label: 'E-mail', dica: 'Use seu endereço', erro: 'Endereço inválido',
    obrigatorio: true, type: 'email', autoComplete: 'email', value: 'x', onChange, 'aria-describedby': 'externo' })
  const input = nodes(v).find(n => n.type === 'input'), label = nodes(v).find(n => n.type === 'label')
  assert.equal(label.props.htmlFor, input.props.id)
  assert.equal(input.props.required, true); assert.equal(input.props['aria-invalid'], true)
  assert.equal(input.props['aria-describedby'], 'externo email-dica email-erro')
  assert.equal(input.props.autoComplete, 'email'); assert.equal(input.props.type, 'email')
  assert.equal(input.props.value, 'x'); assert.equal(input.props.onChange, onChange)
  assert.equal(nodes(v).find(n => n.props.id === 'email-erro').props.role, 'alert')
})

test('campos recebem IDs distintos e suportam selecao, texto longo e estados bloqueados', () => {
  const primeiro = ui.Campo({ label: 'Nome' }), segundo = ui.Campo({ label: 'Nome' })
  const input = v => nodes(v).find(n => n.type === 'input')
  assert.notEqual(input(primeiro).props.id, input(segundo).props.id)
  assert.equal(input(primeiro).props['aria-invalid'], undefined)
  assert.equal(input(primeiro).props['aria-describedby'], undefined)
  assert.equal(input(ui.Campo({ label: 'Nome', ocupado: true })).props.disabled, true)
  assert.equal(input(ui.Campo({ label: 'Nome', disabled: true })).props.disabled, true)
  assert.equal(input(ui.Campo({ label: 'Nome', readOnly: true })).props.readOnly, true)
  const option = { type: 'option', props: { value: 'a' }, children: ['A'] }
  const select = nodes(ui.Campo({ label: 'Tipo', como: 'select', children: option })).find(n => n.type === 'select')
  assert.equal(select.children[0], option)
  assert.equal(nodes(ui.Campo({ label: 'Descrição', como: 'textarea', rows: 5 })).find(n => n.type === 'textarea').props.rows, 5)
})

test('badges nao inferem estados de negocio e mantem informacao textual', () => {
  for (const variante of ['sucesso', 'alerta', 'erro', 'informacao', 'neutro']) {
    const v = ui.Badge({ variante, children: 'Estado informado' })
    assert.match(v.props.className, new RegExp(`ttTom--${variante}`)); assert.equal(text(v), 'Estado informado')
    assert.equal(v.props.role, undefined)
  }
  assert.match(ui.Badge({ variante: 'desconhecida' }).props.className, /--neutro/)
})

test('alertas sao persistentes, distinguem urgencia e nao contem fechamento automatico', () => {
  for (const variante of ['sucesso', 'erro', 'aviso', 'informacao']) {
    const v = ui.Alerta({ variante, titulo: 'Resultado', children: 'Confira os dados' })
    assert.equal(v.props.role, variante === 'erro' ? 'alert' : 'status')
    assert.equal(v.props['aria-atomic'], 'true'); assert.match(text(v), /Resultado.*Confira os dados/)
    assert.equal(nodes(v).some(n => n.type === 'button'), false)
  }
  assert.match(ui.Alerta({ variante: 'aviso' }).props.className, /--alerta/)
})

test('estados vazios distinguem ausencia, filtros, indisponibilidade e permissao', () => {
  const esperados = { 'sem-dados': /Nenhum dado/, 'sem-resultados': /filtros/, indisponivel: /indisponível/, 'sem-permissao': /permissão/ }
  for (const [tipo, mensagem] of Object.entries(esperados)) assert.match(text(ui.EstadoVazio({ tipo })), mensagem)
  const acao = ui.Botao({ children: 'Limpar filtros' })
  const v = ui.EstadoVazio({ tipo: 'sem-resultados', titulo: 'Sem correspondências', children: 'Ajuste a busca', acao })
  assert.match(text(v), /Sem correspondências.*Ajuste a busca.*Limpar filtros/)
  assert.equal(nodes(v).find(n => n.type === 'button').props.type, 'button')
})

test('skeletons anunciam uma unica mensagem e ocultam formas decorativas', () => {
  for (const tipo of ['texto', 'card', 'avatar', 'tabela']) {
    const v = ui.Skeleton({ tipo, linhas: 4, rotulo: 'Carregando eventos' })
    assert.equal(v.props.role, 'status'); assert.equal(v.props['aria-busy'], 'true')
    assert.match(text(v), /Carregando eventos/)
    const visual = nodes(v).find(n => n.props.className === 'ttSkeletonVisual')
    assert.equal(visual.props['aria-hidden'], 'true')
    const formas = nodes(visual).filter(n => ['ttSkeletonAvatar', 'ttSkeletonCapa', 'ttSkeletonTexto', 'ttSkeletonLinhaTabela'].includes(n.props.className))
    assert.equal(formas.length, tipo === 'avatar' ? 1 : tipo === 'card' ? 5 : 4)
    assert.equal(nodes(v).some(n => ['input', 'button', 'select'].includes(n.type)), false)
  }
})

test('skeleton limita linhas invalidas sem criar elementos interativos', () => {
  const linhas = props => nodes(ui.Skeleton(props)).filter(n => n.props.className === 'ttSkeletonTexto').length
  assert.equal(linhas({ linhas: -3 }), 1); assert.equal(linhas({ linhas: 1000 }), 20)
  assert.equal(linhas({ linhas: NaN }), 3); assert.equal(linhas({ tipo: 'desconhecido' }), 3)
})

test('CSS compartilhado usa tokens, foco visivel e movimento reduzido sem alterar layout global', () => {
  const css = postcss.parse(readFileSync(new URL('../src/components/ui/Primitivas.css', import.meta.url), 'utf8'))
  css.walkDecls(d => assert.doesNotMatch(d.value, /#[\da-f]{3,8}\b|\brgba?\(/i))
  css.walkRules(r => {
    if (r.parent.type === 'atrule' && r.parent.name === 'keyframes') return
    assert.ok(r.selector.split(',').every(s => s.trim().startsWith('.') || s.trim().startsWith('textarea.ttCampo')))
  })
  const reduced = css.nodes.find(n => n.type === 'atrule' && n.name === 'media' && n.params.includes('prefers-reduced-motion'))
  assert.ok(reduced); assert.match(reduced.toString(), /animation: none/)
  assert.match(css.toString(), /:focus-visible/); assert.match(css.toString(), /outline: 3px solid var\(--foco-cor\)/)
  assert.match(css.toString(), /\.ttBotao:disabled/); assert.match(css.toString(), /:hover:enabled/)
})

test('APIs administrativas permanecem disponiveis sem migrar paginas', () => {
  const admin = carregarAdmin('components/admin/AdminUI.jsx', ['BadgeAdmin', 'EstadoAdmin', 'SkeletonAdmin', 'ErroAdmin', 'ModalAdmin', 'FiltroAdmin'], {
    nomesPerfis: { admin: 'Administrador' }, EstadoEventoAdmin: 'estado', useFocoModal: () => ({ current: null }),
  })
  assert.equal(text(admin.BadgeAdmin({ valor: 'admin', perfil: true })), 'Administrador')
  assert.equal(admin.SkeletonAdmin({ rotulo: 'Consultando' }).props.role, 'status')
  let saiu = false
  nodes(admin.ErroAdmin({ erro: { status: 401, message: 'Sessão expirada' }, aoSair: () => { saiu = true } })).find(n => n.type === 'button').props.onClick()
  assert.equal(saiu, true)
  assert.equal(nodes(admin.ModalAdmin({ titulo: 'Detalhes', aoFechar() {} })).find(n => n.props.role === 'dialog').props['aria-modal'], 'true')
})

test('React real renderiza IDs de campos e semantica de controles sem depender das fixtures JSX', () => {
  const real = carregarAdmin('components/ui/Primitivas.jsx', ['Campo', 'Botao', 'Alerta', 'Skeleton'], { jsx: createElement, Fragment, useId })
  const html = renderToStaticMarkup(createElement('form', null,
    createElement(real.Campo, { label: 'Nome', name: 'nome', obrigatorio: true, dica: 'Nome completo' }),
    createElement(real.Campo, { label: 'Descrição', name: 'descricao', como: 'textarea', erro: 'Confira o texto' }),
    createElement(real.Botao, { ocupado: true, type: 'submit' }, 'Salvar'),
    createElement(real.Alerta, { variante: 'erro' }, 'Não foi possível salvar'),
    createElement(real.Skeleton, { tipo: 'tabela', rotulo: 'Consultando' })))
  const labels = Array.from(html.matchAll(/<label for="([^"]+)"/g), m => m[1])
  assert.equal(labels.length, 2); assert.notEqual(labels[0], labels[1])
  for (const id of labels) assert.ok(html.includes(`id="${id}"`))
  assert.match(html, /required=""/); assert.match(html, /aria-invalid="true"/)
  assert.match(html, /<button[^>]*type="submit"[^>]*disabled=""[^>]*aria-busy="true"/)
  assert.match(html, /role="alert"/); assert.match(html, /aria-hidden="true"/)
  assert.match(html, /Nome completo/); assert.match(html, /Consultando/)
})
