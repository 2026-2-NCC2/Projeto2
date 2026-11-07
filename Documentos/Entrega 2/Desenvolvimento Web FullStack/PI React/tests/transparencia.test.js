import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement, Fragment, useEffect, useRef, useState, useId } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import { carregarAdmin } from './helpers/adminRuntime.js'
import { documentosTransparencia, documentoDaRota } from '../src/pages/publicas/documentosTransparencia.js'
import { contatoPrivacidade, configuracaoPrivacidade } from '../src/config/privacidade.js'
import termosUso from '../src/pages/publicas/termosUso.json' with { type: 'json' }

const ler = p => readFileSync(new URL('../src/' + p, import.meta.url), 'utf8')
const env = { jsx: createElement, Fragment, useEffect, useRef, useState, useId }
const { Marca } = carregarAdmin('components/ui/Marca.jsx', ['Marca'], env)
const prim = carregarAdmin('components/ui/Primitivas.jsx', ['Campo', 'Botao', 'Alerta'], env)
const api = carregarAdmin('pages/publicas/Transparencia.jsx', ['EntradaAplicacao', 'PaginaTransparencia', 'LinksTransparencia'], {
  ...env, ...prim, Marca, documentosTransparencia, documentoDaRota, contatoPrivacidade,
})
const render = (componente, props) => renderToStaticMarkup(createElement(componente, props))

for (const documento of ['privacidade', 'termos', 'contato-privacidade']) test(`/${documento} é público e não monta a aplicação autenticada`, () => {
  let montagens = 0
  function AppProtegido() { montagens++; throw Error('Aplicação autenticada não deveria montar') }
  assert.equal(documentoDaRota('/' + documento), documento)
  assert.equal(documentoDaRota('/' + documento + '/'), documento)
  const html = render(api.EntradaAplicacao, { caminho: '/' + documento, children: createElement(AppProtegido) })
  assert.equal(montagens, 0)
  assert.match(html, /Minuta pendente de aprovação/)
  assert.match(html, /não é um documento definitivo aprovado/)
  assert.match(html, /Não há declaração de conformidade/)
  assert.match(html, /<h1>/); assert.equal((html.match(/<h1>/g) || []).length, 1)
  assert.doesNotMatch(html, /<form|<input|<script/)
  assert.match(html, /href="\/">Voltar à página inicial/)
})

test('entrada pública não amplia a lista de caminhos nem modifica o filho existente', () => {
  const child = createElement('div', null, 'Aplicação existente')
  for (const caminho of ['/', '/admin', '/perfil', '/eventos', '/login', '/cadastro', '/privacidade/extra', '//termos', '/TERMOS', '/toString']) {
    assert.equal(documentoDaRota(caminho), null)
    assert.equal(api.EntradaAplicacao({ caminho, children: child }), child)
  }
  assert.equal(documentoDaRota(null), null)
  assert.equal(api.PaginaTransparencia({ documento: '__proto__' }), null)
  const main = ler('main.jsx')
  assert.match(main, /<EntradaAplicacao><App \/><\/EntradaAplicacao>/)
})

test('links nativos, sumários e destino do atalho de teclado apontam para conteúdo existente', () => {
  for (const documento of Object.keys(documentosTransparencia)) {
    const html = render(api.PaginaTransparencia, { documento })
    for (const rota of Object.keys(documentosTransparencia)) assert.ok(html.includes(`href="/${rota}"`))
    for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(html.includes(`id="${id}"`), id)
    assert.match(html, /<main[^>]*id="transparencia-conteudo"[^>]*tabindex="-1"/)
    assert.doesNotMatch(html, /tabindex="[1-9]|onclick=/i)
    assert.match(html, /aria-label="Nesta página"/)
  }
})

test('contato sem configuração não oferece endereço fictício, formulário ou envio', () => {
  assert.equal(configuracaoPrivacidade.email, '')
  assert.equal(contatoPrivacidade(), null)
  const html = render(api.PaginaTransparencia, { documento: 'contato-privacidade' })
  assert.match(html, /Canal ainda não operacional/)
  assert.match(html, /antes de permitir uso real/)
  assert.match(html, /Nenhuma solicitação é enviada ou registrada/)
  assert.doesNotMatch(html, /mailto:|<form|<input|<button/)
})

test('configuração futura aceita sintaxe de e-mail e recusa placeholders e injeção em mailto', () => {
  for (const invalido of ['', null, 'a@example.invalid', 'a@example.com', 'a@localhost', 'a@dominio.test', 'a@empresa.org?subject=x', 'a@empresa.org\r\nBcc:x@y.org']) {
    assert.equal(contatoPrivacidade(invalido), null)
  }
  // Validação sintática apenas: não comprova existência ou monitoramento da caixa.
  assert.equal(contatoPrivacidade(' atendimento@instituicao.edu.br '), 'atendimento@instituicao.edu.br')
})

test('minutas registram pendências e descrevem funcionalidades sem fabricar pagamentos ou aceites', () => {
  const politica = render(api.PaginaTransparencia, { documento: 'privacidade' })
  for (const texto of ['Categorias de dados', 'Dados obrigatórios e opcionais', 'Bases legais', 'Segurança', 'Retenção', 'backups', 'Direitos dos titulares']) {
    assert.ok(politica.toLowerCase().includes(texto.toLowerCase()), texto)
  }
  assert.match(politica, /não foram definidas e validadas/)
  assert.match(politica, /Não há prazo geral de exclusão aprovado/)
  const termos = render(api.PaginaTransparencia, { documento: 'termos' })
  assert.match(termos, /não implementa checkout, cobrança, assinaturas ou renovação automática/)
  assert.match(termos, /sem registro de aceite nesta etapa/)
  assert.match(termos, /proteja sua senha/)
})

test('login e cadastro renderizam os três links sem introduzir consentimento genérico nos formulários', () => {
  const avisos = carregarAdmin('pages/auth/avisoCadastro.js', ['guardarAvisoCadastro', 'lerAvisoCadastro', 'limparAvisoCadastro'])
  for (const nome of ['Login', 'Cadastro']) {
    const componente = carregarAdmin(`pages/auth/${nome}.jsx`, [nome], { ...env, ...prim, ...avisos, Marca, Icone: () => null })[nome]
    const html = render(componente, { setPagina() {}, aoAutenticarSessao() {} })
    for (const rota of Object.keys(documentosTransparencia)) assert.ok(html.includes(`href="/${rota}"`))
    assert.match(html, /aria-label="Privacidade e transparência"/)
    assert.doesNotMatch(html, /name="(?:aceite|consentimento)"/)
    if (nome === 'Cadastro') assert.match(html, /id="cadastro-aceite" type="checkbox"/)
  }
})

test('estilos públicos são isolados, responsivos e mantêm foco e alvos de links', () => {
  const css = postcss.parse(ler('pages/publicas/Transparencia.css'))
  css.walkRules(r => assert.ok(r.selector.split(',').every(s => s.trim().startsWith('.transparencia'))))
  css.walkDecls(d => assert.doesNotMatch(d.value, /#[\da-f]{3,8}\b|url\(/i))
  assert.match(css.toString(), /:focus-visible/)
  assert.match(css.toString(), /min-height: 44px/)
  assert.match(css.toString(), /max-width: 540px/)
  assert.doesNotMatch(css.toString(), /animation:|transition:/)
})

test('página de Termos exibe título, introdução e todos os parágrafos do artefato usado no hash', () => {
  const html = render(api.PaginaTransparencia, { documento: 'termos' })
  const escapar = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' })[c])
  assert.ok(html.includes(`<h1>${escapar(termosUso.titulo)}</h1>`))
  assert.ok(html.includes(escapar(termosUso.descricao)))
  const artigo = html.match(/<article[^>]*>(.*?)<\/article>/s)[1]
  const paragrafos = [...artigo.matchAll(/<p>(.*?)<\/p>/gs)].map(m => m[1])
  assert.deepEqual(paragrafos, termosUso.secoes.flatMap(s => s.textos).map(escapar))
  for (const s of termosUso.secoes) assert.ok(artigo.includes(escapar(s.titulo)))
})
