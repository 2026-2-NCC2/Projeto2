import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { carregarAdmin, hooksAdmin, nodes, text } from './helpers/adminRuntime.js'
const api = carregarAdmin('services/adminPerfis.js', ['validarMudancaPerfil', 'perfisAdministraveis'])
const nomesPerfis = { participante: 'Participante', organizador: 'Organizador', fornecedor: 'Fornecedor', admin: 'Administrador' }
function modal({ capacidade = { alterar: true, modelo: 'unico' }, falha, enviar } = {}) {
  let token = 'sessao-a', salvos = 0, fechados = 0
  const calls = [], consulta = { dados: capacidade, carregando: false, erro: falha, recarregar() {} }
  const h = hooksAdmin({ useConsultaAdmin: () => consulta, nomesPerfis, ...api,
    ModalAdmin: 'modal', ErroAdmin: 'erro', SkeletonAdmin: 'skeleton', crypto: { randomUUID: () => 'chave-fixa-sintetica' },
    sessionStorage: { getItem: () => token }, AbortController, setTimeout, clearTimeout,
    alterarPerfilAdmin: async (...a) => { calls.push(a); return enviar ? enviar(...a) : { id: 1, perfil: a[1].perfil_novo } },
  })
  let callbackEstavel
  h.env.useCallback = fn => { callbackEstavel ??= fn; return callbackEstavel }
  const { AdminGestaoPerfis } = carregarAdmin('components/admin/AdminGestaoPerfis.jsx', ['AdminGestaoPerfis'], h.env)
  const props = { usuario: { id: 1, nome: 'Usuário sintético', perfil: 'participante' }, aoFechar() { fechados++ }, aoSalvar() { salvos++ }, aoSair() {} }
  return { calls, consulta, close: h.close, trocarSessao() { token = 'sessao-b' }, get salvos() { return salvos }, get fechados() { return fechados },
    render: () => h.render(AdminGestaoPerfis, props) }
}
function preencher(m) {
  nodes(m.render()).find(n => n.type === 'select').props.onChange({ target: { value: 'admin' } })
  nodes(m.render()).find(n => n.type === 'textarea').props.onChange({ target: { value: 'Motivo acadêmico sintético' } })
  nodes(m.render()).find(n => n.props.type === 'checkbox').props.onChange({ target: { checked: true } })
}
test('modelo único valida substituição e confirmação, com quatro perfis e motivo', () => {
  for (const p of ['organizador', 'fornecedor', 'admin']) assert.equal(api.validarMudancaPerfil('participante', p, 'Motivo sintético', true), true)
  for (const a of [['participante', 'participante', 'Motivo sintético', true], ['participante', 'root', 'Motivo sintético', true],
    ['participante', 'admin', 'curto', true], ['participante', 'admin', 'Motivo sintético', false]]) assert.equal(api.validarMudancaPerfil(...a), false)
});
test('modal mostra acessos removidos/concedidos e grava somente após confirmação', async () => {
  const m = modal(); assert.match(text(m.render()), /único perfil/)
  assert.equal(nodes(m.render()).filter(n => n.type === 'option').length, 4)
  preencher(m); const v = m.render(); assert.match(text(v), /Remover acesso:.*Participante/); assert.match(text(v), /Conceder acesso:.*Administrador/)
  await nodes(v).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.equal(m.salvos, 1); assert.equal(m.calls.length, 1); assert.equal(m.calls[0][1].confirmado, true)
  assert.match(text(m.render()), /sucesso/); m.close()
});
test('capacidade desligada, falha, carregamento ou resposta inválida não oferecem envio', () => {
  for (const capacidade of [{ alterar: false, modelo: 'unico' }, { alterar: 'true', modelo: 'unico' }, { alterar: true, modelo: 'multiplo' }]) {
    const m = modal({ capacidade }); assert.equal(nodes(m.render()).some(n => n.type === 'form'), false); m.close()
  }
  const m = modal({ falha: Object.assign(Error('Falha'), { status: 403 }) }); assert.equal(nodes(m.render()).some(n => n.type === 'form'), false)
  m.consulta.carregando = true; assert.ok(nodes(m.render()).some(n => n.type === 'skeleton')); m.close()
});
test('duplo envio é bloqueado e resultado incerto preserva chave e payload', async () => {
  let terminar, falhar = true
  const m = modal({ enviar: () => new Promise((resolve, reject) => { terminar = () => falhar ? reject(Object.assign(Error('Incerto'), { incerto: true })) : resolve({ id: 1, perfil: 'admin' }) }) })
  const fecharInicial = m.render().props.aoFechar
  preencher(m); const f = nodes(m.render()).find(n => n.type === 'form')
  assert.equal(m.render().props.aoFechar, fecharInicial)
  const p = f.props.onSubmit({ preventDefault() {} }); await f.props.onSubmit({ preventDefault() {} }); assert.equal(m.calls.length, 1)
  fecharInicial(); assert.equal(m.fechados, 0)
  terminar(); await p; const v = m.render(); assert.match(text(v), /mesma operação/)
  assert.equal(nodes(v).find(n => n.type === 'textarea').props.disabled, true)
  falhar = false; const retry = nodes(v).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); terminar(); await retry
  assert.equal(m.calls[0][2], m.calls[1][2]); assert.equal(JSON.stringify(m.calls[0][1]), JSON.stringify(m.calls[1][1])); m.close()
});
test('resposta de sessão antiga ou modal desmontado não confirma sucesso', async () => {
  for (const evento of ['sessao', 'fechar']) {
    let terminar; const m = modal({ enviar: () => new Promise(r => { terminar = r }) }); preencher(m)
    const p = nodes(m.render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
    if (evento === 'sessao') m.trocarSessao(); else m.close()
    terminar({ id: 1, perfil: 'admin' }); await p; assert.equal(m.salvos, 0); m.close()
  }
});
test('serviço usa JWT, idempotência e PATCH sem repetir escrita; mantém 401/403', async () => {
  let count = 0
  let status = 403
  const { alterarPerfilAdmin } = carregarAdmin('services/adminPerfis.js', ['alterarPerfilAdmin'], {
    apiUrl: x => x, sessionStorage: { getItem: () => 'jwt-sintetico' }, fetch: async (url, opts) => {
      count++; assert.equal(url, '/admin/usuarios/1/perfil'); assert.equal(opts.method, 'PATCH'); assert.equal(opts.headers['Idempotency-Key'], 'uuid');
      assert.equal(opts.headers.Authorization, 'Bearer jwt-sintetico')
      return { ok: false, status, json: async () => ({ erro: 'Acesso revogado', resultado_incerto: false }) }
    },
  })
  await assert.rejects(alterarPerfilAdmin(1, { perfil_novo: 'admin' }, 'uuid'), e => e.status === 403 && e.incerto === false)
  status = 401
  await assert.rejects(alterarPerfilAdmin(1, { perfil_novo: 'admin' }, 'uuid'), e => e.status === 401 && e.incerto === false && /Sessão expirada/.test(e.message))
  assert.equal(count, 2)
});
test('listagem abre o usuário correto, restaura foco no acionador e atualiza sem perder filtros', () => {
  let recargas = 0, focos = 0
  const pessoa = { id: 7, nome: 'Pessoa sintética', email: 'pessoa@example.invalid', perfil: 'organizador' }
  const consulta = { dados: [pessoa], carregando: false, erro: null, recarregar() { recargas++ } }
  const filtros = carregarAdmin('services/admin.js', ['filtrarCatalogo'])
  const h = hooksAdmin({ ...filtros, nomesPerfis, useConsultaAdmin: () => consulta, AdminGestaoPerfis: 'gestao',
    FiltroAdmin: 'filtro', BadgeAdmin: 'badge' })
  const { AdminCatalogo } = carregarAdmin('components/admin/AdminCatalogos.jsx', ['AdminCatalogo'], h.env)
  const render = () => h.render(AdminCatalogo, { tipo: 'usuarios' })
  nodes(render()).find(n => n.type === 'input').props.onChange({ target: { value: 'sintética' } })
  nodes(render()).find(n => n.props['aria-label']?.startsWith('Gerenciar perfis de')).props.onClick({ currentTarget: { focus() { focos++ } } })
  const aberto = nodes(render()).find(n => n.type === 'gestao')
  assert.equal(aberto.props.usuario.id, 7); assert.equal(focos, 1)
  aberto.props.aoSalvar(); aberto.props.aoFechar()
  assert.equal(recargas, 2); assert.equal(nodes(render()).some(n => n.type === 'gestao'), false)
  assert.equal(nodes(render()).find(n => n.type === 'input').props.value, 'sintética'); h.close()
});
test('ação Gerenciar perfis utiliza modal existente; CSS mantém toque e responsividade', () => {
  const source = readFileSync(new URL('../src/components/admin/AdminCatalogos.jsx', import.meta.url), 'utf8')
  assert.match(source, /Gerenciar perfis de/); assert.match(source, /AdminGestaoPerfis/)
  const css = postcss.parse(readFileSync(new URL('../src/components/admin/AdminUsuarios.css', import.meta.url), 'utf8'))
  assert.match(css.toString(), /min-height: 44px/); assert.match(css.toString(), /:focus-visible/)
  assert.doesNotMatch(css.toString(), /overflow-x:\s*hidden/)
});
