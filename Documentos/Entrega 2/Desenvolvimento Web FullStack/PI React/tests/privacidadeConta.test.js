import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement, Fragment, useId } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { carregarAdmin, hooksAdmin, nodes, text } from './helpers/adminRuntime.js'
import { primitivasFixture, jsxPrimitivas } from './helpers/primitivasFixture.js'
const { validarConsultaPrivacidade } = carregarAdmin('services/privacidadeConta.js', ['validarConsultaPrivacidade'])

const ok = dados => ({ estado: 'disponivel', dados })
const fixture = () => ({ versao: 1, situacao: 'disponivel', categorias: {
  cadastro: ok({ id: 7, nome: 'Pessoa sintética', email: 'p@example.invalid', perfil: 'organizador' }),
  perfil_pessoal: ok({ telefone: null, biografia: null }), perfil_profissional: ok({ redes_sociais: null, dados_comerciais: null }),
  atividades: ok({ eventos_organizados: 1, inscricoes: 0, propostas_enviadas: 0, solicitacoes_acesso: 0 }),
  portfolio: ok({ itens: 0 }), aceites: ok([]),
}, limitacoes: ['Consulta sem snapshot único.'] })
const ler = p => readFileSync(new URL('../src/' + p, import.meta.url), 'utf8')
const tick = () => new Promise(r => setTimeout(r, 0))

test('serviço faz somente GET autenticado, sem ID na URL, sem corpo e sem cache', async () => {
  let chamada
  const { consultarPrivacidadeConta } = carregarAdmin('services/privacidadeConta.js', ['consultarPrivacidadeConta'], {
    apiUrl: p => '/api' + p, sessionStorage: { getItem: () => 'sessao-a' },
    fetch: async (...args) => { chamada = args; return { ok: true, json: async () => fixture() } },
  })
  assert.equal((await consultarPrivacidadeConta('sessao-a', 7)).categorias.cadastro.dados.id, 7)
  assert.equal(chamada[0], '/api/minha-privacidade/dados')
  assert.equal(chamada[1].method, 'GET'); assert.equal(chamada[1].cache, 'no-store')
  assert.equal(chamada[1].headers.Authorization, 'Bearer sessao-a'); assert.equal(chamada[1].body, undefined)
})

test('serviço recusa sessão trocada, versão desconhecida, ID divergente e categoria ausente', async () => {
  for (const alterar of [d => { d.versao = 2 }, d => { d.categorias.cadastro.dados.id = 8 }, d => { delete d.categorias.aceites }, d => { d.categorias.atividades.dados.inscricoes = -1 }]) {
    const d = fixture(); alterar(d); assert.throws(() => validarConsultaPrivacidade(d, 7))
  }
  const { consultarPrivacidadeConta } = carregarAdmin('services/privacidadeConta.js', ['consultarPrivacidadeConta'], {
    apiUrl: String, sessionStorage: { getItem: () => 'sessao-b' }, fetch: async () => ({ ok: true, json: async () => fixture() }),
  })
  await assert.rejects(consultarPrivacidadeConta('sessao-a', 7), /sessão mudou/)
})

test('401, 403 e 503 não exibem conteúdo do erro interno nem dados parciais', async () => {
  for (const status of [401, 403, 503]) {
    const { consultarPrivacidadeConta } = carregarAdmin('services/privacidadeConta.js', ['consultarPrivacidadeConta'], {
      apiUrl: String, fetch: async () => ({ ok: false, status, json() { throw Error('Não ler erro interno') } }),
    })
    await assert.rejects(consultarPrivacidadeConta('sessao-a', 7), status === 503 ? /indisponível/ : /Faça login novamente/)
  }
})

const envSSR = { jsx: createElement, Fragment, useId }
const primSSR = carregarAdmin('components/ui/Primitivas.jsx', ['Alerta', 'Botao', 'EstadoVazio', 'Skeleton'], envSSR)
const { ConteudoPrivacidadeConta } = carregarAdmin('components/perfil/PrivacidadeConta.jsx', ['ConteudoPrivacidadeConta'], { ...envSSR, ...primSSR })
const render = dados => renderToStaticMarkup(createElement(ConteudoPrivacidadeConta, { dados }))

test('conteúdo diferencia ausência de aceites de infraestrutura pendente e funcionalidade desativada', () => {
  const d = fixture()
  assert.match(render(d), /Nenhum aceite registrado nesta consulta/)
  d.situacao = 'limitada'; d.categorias.aceites = { estado: 'infraestrutura_pendente', dados: null }
  d.categorias.portfolio = { estado: 'nao_habilitado', dados: null }
  const html = render(d)
  assert.match(html, /Consulta com limitações/); assert.match(html, /Infraestrutura pendente/)
  assert.match(html, /Funcionalidade não habilitada/); assert.doesNotMatch(html, /Nenhum aceite registrado/)
})

test('atividades vazias são diferentes de consulta indisponível e limitação não pode parecer completa', () => {
  const d = fixture()
  for (const k of Object.keys(d.categorias.atividades.dados)) d.categorias.atividades.dados[k] = 0
  assert.match(render(d), /Nenhuma atividade própria encontrada nesta consulta/)
  d.categorias.aceites = { estado: 'infraestrutura_pendente', dados: null }
  assert.throws(() => validarConsultaPrivacidade(d, 7))
  d.situacao = 'limitada'
  assert.equal(validarConsultaPrivacidade(d, 7), d)
})

test('cadastro, perfil e contagens são legíveis; campos internos e ações futuras não são renderizados', () => {
  const d = fixture(); d.categorias.cadastro.dados.senha = 'HASH_PROIBIDO'
  const html = render(d)
  for (const s of ['Pessoa sintética', 'Eventos organizados', 'Inscrições', 'Não informado', 'Exportação integral, exclusão e protocolos']) assert.ok(html.includes(s))
  assert.doesNotMatch(html, /HASH_PROIBIDO|<form|<input|<button/)
  assert.match(html, /href="\/contato-privacidade"/)
})

test('aceite mostra versão, momento e hash do documento sem inventar aceite retroativo', () => {
  const d = fixture(); d.categorias.aceites.dados = [{ documento: 'termos-uso', versao: 'SINTETICA.1', hash_documento: 'a'.repeat(64), aceito_em: '2030-01-01T00:00:00Z', fluxo: 'cadastro' }]
  const html = render(d)
  assert.match(html, /SINTETICA.1/); assert.match(html, /datetime="2030-01-01T00:00:00Z"/i)
  assert.match(html, /SHA-256 do documento/); assert.ok(html.includes('a'.repeat(64)))
})

function runtime(consulta) {
  const h = hooksAdmin({ ...primitivasFixture, jsx: jsxPrimitivas, AbortController, consultarPrivacidadeConta: consulta })
  const { PrivacidadeConta } = carregarAdmin('components/perfil/PrivacidadeConta.jsx', ['PrivacidadeConta'], h.env)
  return { render: (props = { token: 'a', id: 7 }) => h.render(PrivacidadeConta, props), close: h.close }
}
test('carregamento usa skeleton; falha persistente permite repetir sem sucesso falso', async () => {
  let chamadas = 0
  const r = runtime(async () => { chamadas++; throw Error('Consulta não confirmada') })
  assert.match(text(r.render()), /Carregando dados de privacidade/)
  await tick(); const v = r.render()
  assert.match(text(v), /Consulta não confirmada/)
  assert.ok(nodes(v).some(n => n.props.role === 'alert'))
  nodes(v).find(n => n.type === 'button').props.onClick(); r.render(); await tick()
  assert.equal(chamadas, 2); r.close()
})
test('troca de titular aborta requisição antiga e não exibe resposta fora de ordem', async () => {
  const chamadas = []
  const r = runtime((token, id, signal) => new Promise(resolve => chamadas.push({ token, id, signal, resolve })))
  r.render(); r.render({ token: 'b', id: 8 })
  assert.equal(chamadas[0].signal.aborted, true)
  chamadas[0].resolve(fixture()); await tick()
  const v = r.render({ token: 'b', id: 8 })
  assert.match(text(v), /Carregando dados de privacidade/)
  assert.ok(!nodes(v).some(n => typeof n.type === 'function' && n.props.dados))
  r.close(); assert.equal(chamadas[1].signal.aborted, true)
})

test('acesso compartilhado abre e fecha por botão nativo sem desmontar formulários de perfil', () => {
  const h = hooksAdmin({ ...primitivasFixture, jsx: jsxPrimitivas, PrivacidadeConta: 'privacidade' })
  const { AcessoPrivacidadeConta } = carregarAdmin('components/perfil/PerfilPessoal.jsx', ['AcessoPrivacidadeConta'], h.env)
  const props = { token: 'a', id: 7 }, botao = v => nodes(v).find(n => n.type === 'button')
  let v = h.render(AcessoPrivacidadeConta, props)
  assert.equal(botao(v).props['aria-expanded'], false); botao(v).props.onClick()
  v = h.render(AcessoPrivacidadeConta, props)
  assert.equal(botao(v).props['aria-expanded'], true)
  assert.ok(nodes(v).some(n => n.type === 'privacidade' && n.props.id === 7))
  assert.ok(nodes(v).some(n => n.props.id === botao(v).props['aria-controls']))
  assert.match(ler('components/perfil/PerfilPessoal.jsx'), /<AcessoPrivacidadeConta key=.*token=\{token\} id=\{perfil.id\}/)
  for (const p of ['pages/organizador/Perfil.jsx', 'pages/participante/PortalParticipante.jsx', 'App.jsx']) assert.match(ler(p), /<PerfilPessoal/)
})

test('CSS é local, responsivo, usa tokens e mantém foco visível sem animações', () => {
  const css = ler('components/perfil/PrivacidadeConta.css')
  assert.match(css, /auto-fit/); assert.match(css, /min\(100%, 230px\)/); assert.match(css, /:focus-visible/)
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|animation:|transition:/i)
})
