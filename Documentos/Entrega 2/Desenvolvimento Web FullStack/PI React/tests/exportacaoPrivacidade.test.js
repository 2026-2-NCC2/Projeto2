import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { carregarAdmin, hooksAdmin, nodes, text } from './helpers/adminRuntime.js'
import { primitivasFixture, jsxPrimitivas } from './helpers/primitivasFixture.js'
const require = createRequire(import.meta.url)
const { gerarExportacao } = require('../../PI Backend/exportacao-privacidade.cjs')
const ok = dados => ({ estado: 'disponivel', dados })
const fixture = () => JSON.parse(gerarExportacao({ versao: 1, situacao: 'disponivel', categorias: {
  cadastro: ok({ id: 7, perfil: 'organizador' }), perfil_pessoal: ok({}), perfil_profissional: ok({}),
  atividades: ok({ eventos_organizados: 1, inscricoes: 0, propostas_enviadas: 0, solicitacoes_acesso: 0 }),
  portfolio: ok({ itens: 0 }), aceites: ok([]),
} }, { id: 7, perfil: 'organizador' }))
const resposta = d => ({ ok: true, headers: new Headers({ 'content-type': 'application/json; charset=utf-8',
  'content-disposition': 'attachment; filename="dados-privacidade.json"' }),
  body: new Blob([JSON.stringify(d)]).stream() })
function ambiente(patch = {}) {
  let token = 'a', cliques = 0, criado = 0, removido = 0, revogado = 0, chamada, blob
  const pendentes = []
  const env = { apiUrl: p => '/api' + p, sessionStorage: { getItem: () => token },
    fetch: async (...args) => { chamada = args; return resposta(fixture()) },
    Uint8Array, TextDecoder, Blob, setTimeout: fn => pendentes.push(fn),
    URL: { createObjectURL(b) { criado++; blob = b; return 'blob:sintetico' }, revokeObjectURL() { revogado++ } },
    document: { createElement(tag) { assert.equal(tag, 'a'); return { click() { cliques++ }, remove() { removido++ } } }, body: { appendChild() {} } }, ...patch }
  const api = carregarAdmin('services/exportacaoPrivacidade.js', ['baixarCopiaPrivacidade', 'validarExportacao'], env)
  return { ...api, trocar: v => { token = v }, estado: () => ({ cliques, criado, removido, revogado, chamada, blob }), limpar: () => pendentes.forEach(fn => fn()) }
}

test('exportação: contrato backend/frontend, GET autenticado sem corpo, anexo fixo e descarte de URL', async () => {
  const a = ambiente(); await a.baixarCopiaPrivacidade('a', 7)
  const s = a.estado()
  assert.equal(s.chamada[0], '/api/minha-privacidade/exportacao')
  assert.equal(s.chamada[1].method, 'GET'); assert.equal(s.chamada[1].cache, 'no-store')
  assert.equal(s.chamada[1].headers.Authorization, 'Bearer a'); assert.equal(s.chamada[1].body, undefined)
  assert.equal(s.cliques, 1); assert.equal(s.removido, 1)
  assert.deepEqual(JSON.parse(await s.blob.text()), fixture())
  a.limpar(); assert.equal(a.estado().revogado, 1)
})

test('exportação: erros HTTP nunca são lidos nem baixados como arquivo', async () => {
  for (const status of [400, 401, 403, 429, 500, 503]) {
    const a = ambiente({ fetch: async () => ({ ok: false, status, json() { throw Error('Não ler erro interno') } }) })
    await assert.rejects(a.baixarCopiaPrivacidade('a', 7)); assert.equal(a.estado().criado, 0)
  }
})

test('exportação: valida versão, titular, projeção fechada, estados e campos livres não autorizados', async () => {
  for (const alterar of [d => { d.versao = 2 }, d => { d.categorias.cadastro.dados.id = 8 },
    d => { d.categorias.cadastro.dados.senha = 'SEGREDO' }, d => { d.categorias.cadastro.dados.nome = 'TERCEIRO' },
    d => { d.categorias.perfil_pessoal.dados = { biografia: 'TERCEIRO' } },
    d => { d.categorias.portfolio.estado = 'desconhecido' }, d => { d.categorias.atividades.dados.inscricoes = -1 },
    d => { d.snapshot_transacional_unico = true }, d => { d.escopo = 'integral' },
    d => { d.categorias.aceites.dados = [{ documento: 'termos-uso', versao: 'A.1', aceito_em: '2030-01-01T00:00:00.000Z', fluxo: 'cadastro', hash_documento: 'SEGREDO' }] }]) {
    const d = fixture(); alterar(d)
    const a = ambiente({ fetch: async () => resposta(d) })
    await assert.rejects(a.baixarCopiaPrivacidade('a', 7)); assert.equal(a.estado().cliques, 0)
  }
  const d = fixture(); d.categorias.portfolio = { estado: 'nao_habilitado', dados: null }; d.situacao_consulta = 'limitada'
  const a = ambiente({ fetch: async () => resposta(d) }); await a.baixarCopiaPrivacidade('a', 7); assert.equal(a.estado().cliques, 1); a.limpar()
})

test('exportação: headers incorretos, JSON inválido e limite de tamanho impedem criação do arquivo', async () => {
  for (const alterar of [r => { r.headers.delete('content-disposition') }, r => { r.headers.set('content-type', 'text/html') },
    r => { r.headers.set('content-length', '5000001') },
    r => { r.body = new Blob(['não é JSON']).stream() },
    r => { r.body = new Blob([new Uint8Array(5_000_001)]).stream() }]) {
    const a = ambiente({ fetch: async () => { const r = resposta(fixture()); alterar(r); return r } })
    await assert.rejects(a.baixarCopiaPrivacidade('a', 7)); assert.equal(a.estado().criado, 0)
  }
})

test('exportação: sessão trocada antes da consulta ou durante a leitura e abort não permitem download', async () => {
  let a = ambiente(); a.trocar('b'); await assert.rejects(a.baixarCopiaPrivacidade('a', 7)); assert.equal(a.estado().chamada, undefined)
  a = ambiente({ fetch: async () => { a.trocar('b'); return resposta(fixture()) } })
  await assert.rejects(a.baixarCopiaPrivacidade('a', 7)); assert.equal(a.estado().cliques, 0)
  const c = new AbortController()
  a = ambiente({ fetch: async () => { const r = resposta(fixture()); c.abort(); return r } })
  await assert.rejects(a.baixarCopiaPrivacidade('a', 7, c.signal)); assert.equal(a.estado().criado, 0)
})

test('exportação: troca de sessão no meio do stream cancela leitura e não disponibiliza arquivo', async () => {
  let a, cancelado = false, liberado = false
  a = ambiente({ fetch: async () => ({ ...resposta(fixture()), body: { getReader: () => ({
    async read() { a.trocar('b'); return { done: false, value: new Uint8Array([123]) } },
    async cancel() { cancelado = true }, releaseLock() { liberado = true },
  }) } }) })
  await assert.rejects(a.baixarCopiaPrivacidade('a', 7))
  assert.equal(cancelado, true); assert.equal(liberado, true); assert.equal(a.estado().criado, 0)
})

test('exportação: falha ao disponibilizar remove link e revoga objeto temporário', async () => {
  const a = ambiente({ document: { createElement() { return { click() { throw Error('Falha sintética') }, remove() {} } }, body: { appendChild() {} } } })
  await assert.rejects(a.baixarCopiaPrivacidade('a', 7)); a.limpar(); assert.equal(a.estado().revogado, 1)
})

const tick = () => new Promise(r => setTimeout(r, 0))
test('interface: aviso persistente, botão acessível, bloqueio síncrono duplicado e erro persistente', async () => {
  let chamadas = 0, rejeitar
  const h = hooksAdmin({ ...primitivasFixture, jsx: jsxPrimitivas, AbortController,
    baixarCopiaPrivacidade: () => { chamadas++; return new Promise((_, reject) => { rejeitar = reject }) } })
  const { DownloadPrivacidade } = carregarAdmin('components/perfil/PrivacidadeConta.jsx', ['DownloadPrivacidade'], h.env)
  const props = { token: 'a', id: 7 }, render = () => h.render(DownloadPrivacidade, props)
  let v = render(); assert.match(text(v), /Não é uma exportação completa/); assert.match(text(v), /arquivo ficará no seu dispositivo/)
  assert.match(text(v), /quota distribuída/)
  const b = nodes(v).find(n => n.type === 'button'); const p = b.props.onClick(); b.props.onClick()
  assert.equal(chamadas, 1); v = render(); assert.equal(nodes(v).find(n => n.type === 'button').props.disabled, true)
  rejeitar(Error('SEGREDO_NAO_EXIBIR')); await p; await tick(); v = render()
  assert.match(text(v), /Download não confirmado/); assert.doesNotMatch(text(v), /SEGREDO_NAO_EXIBIR/)
  assert.equal(nodes(v).find(n => n.type === 'button').props.disabled, false); h.close()
})

test('interface: mudança de sessão e desmontagem abortam somente a operação correspondente', async () => {
  const chamadas = []
  const h = hooksAdmin({ ...primitivasFixture, jsx: jsxPrimitivas, AbortController,
    baixarCopiaPrivacidade: (token, id, signal) => new Promise(resolve => chamadas.push({ token, id, signal, resolve })) })
  const { DownloadPrivacidade } = carregarAdmin('components/perfil/PrivacidadeConta.jsx', ['DownloadPrivacidade'], h.env)
  const render = props => h.render(DownloadPrivacidade, props)
  let v = render({ token: 'a', id: 7 }); nodes(v).find(n => n.type === 'button').props.onClick()
  v = render({ token: 'b', id: 8 }); assert.equal(chamadas[0].signal.aborted, true)
  nodes(v).find(n => n.type === 'button').props.onClick()
  chamadas[0].resolve(); await tick()
  v = render({ token: 'b', id: 8 }); assert.equal(nodes(v).find(n => n.type === 'button').props.disabled, true)
  h.close(); assert.equal(chamadas[1].signal.aborted, true); chamadas[1].resolve(); await tick()
})
