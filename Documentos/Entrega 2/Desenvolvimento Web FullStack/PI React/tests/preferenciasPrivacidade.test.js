import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement, Fragment, useId } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { carregarAdmin } from './helpers/adminRuntime.js'
import { tecnologiasNecessarias } from '../src/pages/publicas/inventarioPrivacidade.js'
import { documentosTransparencia, documentoDaRota } from '../src/pages/publicas/documentosTransparencia.js'
import { contatoPrivacidade } from '../src/config/privacidade.js'

const ler = p => readFileSync(new URL('../src/' + p, import.meta.url), 'utf8')
const env = { jsx: createElement, Fragment, useId }
const { Marca } = carregarAdmin('components/ui/Marca.jsx', ['Marca'], env)
const { Alerta } = carregarAdmin('components/ui/Primitivas.jsx', ['Alerta'], env)
const api = carregarAdmin('pages/publicas/Transparencia.jsx', ['EntradaAplicacao', 'PaginaTransparencia', 'PaginaPreferenciasPrivacidade'], {
  ...env, Marca, Alerta, tecnologiasNecessarias, documentosTransparencia, documentoDaRota, contatoPrivacidade,
  // Falha se o caminho público tentar ler/gravar sessão ou executar consultas.
  sessionStorage: new Proxy({}, { get() { throw Error('Acesso indevido à sessão') } }),
  localStorage: new Proxy({}, { get() { throw Error('Persistência indevida') } }),
  fetch() { throw Error('Consulta indevida') },
})
const render = (componente, props) => renderToStaticMarkup(createElement(componente, props))

test('preferências são públicas, sem montar o App, ler sessão ou consultar serviços', () => {
  function AppProtegido() { throw Error('App não deveria montar') }
  for (const caminho of ['/preferencias-privacidade', '/preferencias-privacidade/']) {
    const html = render(api.EntradaAplicacao, { caminho, children: createElement(AppProtegido) })
    assert.match(html, /<h1>Preferências de privacidade<\/h1>/)
    assert.match(html, /não grava preferências/)
  }
})

test('rota nova não amplia acesso aos caminhos protegidos nem aceita prefixos semelhantes', () => {
  const child = createElement('span', null, 'Aplicação existente')
  for (const caminho of ['/', '/admin', '/perfil', '/eventos', '/preferencias-privacidade/extra', '//preferencias-privacidade', '/PREFERENCIAS-PRIVACIDADE']) {
    assert.equal(api.EntradaAplicacao({ caminho, children: child }), child)
  }
})

test('inventário explica as três chaves existentes e a remoção sem prometer exclusão da conta', () => {
  const html = render(api.PaginaPreferenciasPrivacidade)
  for (const chave of ['token', 'perfil', 'paginaAtual']) assert.ok(html.includes(chave))
  assert.match(html, /logout confirmado/)
  assert.match(html, /restauração de abas depende do navegador/)
  assert.match(html, /não exclui sua conta/)
  const fontes = ler('hooks/useAutenticacao.js') + ler('hooks/useNavegacao.js')
  const chaves = [...fontes.matchAll(/sessionStorage\.setItem\('([^']+)'/g)].map(m => m[1])
  assert.deepEqual([...new Set(chaves)].sort(), ['paginaAtual', 'perfil', 'token'])
})

test('sem serviços opcionais não há banner, toggles, aceite, recusa ou persistência fictícios', () => {
  const html = render(api.PaginaPreferenciasPrivacidade)
  assert.match(html, /Não há tecnologias opcionais para escolher/)
  assert.match(html, /não há consentimento opcional a revogar/)
  assert.match(html, /aceite dos Termos de Uso é separado/)
  assert.doesNotMatch(html, /<form|<input|<button|<script|<iframe|role="(?:switch|dialog)"/)
})

test('recursos de rede e limites de auditoria ficam explícitos, sem garantias jurídicas', () => {
  const html = render(api.PaginaPreferenciasPrivacidade)
  assert.match(html, /Supabase Storage/)
  assert.match(html, /endereço IP/)
  assert.match(html, /hospedagem, proxy/)
  assert.match(html, /não declara conformidade com a LGPD/)
  assert.match(html, /canal real ainda precisa estar operacional/)
  assert.match(html, /Termos de Uso continuam em revisão/)
  assert.doesNotMatch(html, /mailto:/)
})

test('links entre todas as páginas públicas incluem preferências e retorno à página inicial', () => {
  for (const documento of Object.keys(documentosTransparencia)) {
    assert.match(render(api.PaginaTransparencia, { documento }), /href="\/preferencias-privacidade"/)
  }
  const html = render(api.PaginaPreferenciasPrivacidade)
  for (const rota of [...Object.keys(documentosTransparencia), 'preferencias-privacidade']) assert.ok(html.includes(`href="/${rota}"`))
  assert.match(html, /href="\/">Voltar à página inicial/)
})

test('estrutura semântica permite teclado com atalho, foco no conteúdo e inventário legível', () => {
  const html = render(api.PaginaPreferenciasPrivacidade)
  assert.equal((html.match(/<h1>/g) || []).length, 1)
  assert.match(html, /<main id="preferencias-conteudo" tabindex="-1"/)
  for (const [, id] of html.matchAll(/(?:href="#|aria-labelledby=")([^"]+)"/g)) assert.ok(html.includes(`id="${id}"`), id)
  assert.equal((html.match(/<dt>/g) || []).length, tecnologiasNecessarias.length)
  assert.doesNotMatch(html, /tabindex="[1-9]|onclick=/i)
  const css = ler('pages/publicas/Transparencia.css')
  assert.match(css, /:focus-visible/)
  assert.match(css, /min-height: 44px/)
  assert.doesNotMatch(css, /animation:|transition:/)
})
