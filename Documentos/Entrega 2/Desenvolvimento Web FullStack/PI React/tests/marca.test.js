import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import { carregarAdmin } from './helpers/adminRuntime.js'

const ler = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const { Marca } = carregarAdmin('components/ui/Marca.jsx', ['Marca'], { jsx: createElement })
const render = props => renderToStaticMarkup(createElement(Marca, props))

test('marca apresenta um nome acessível único e SVG decorativo sem recursos externos', () => {
  const html = render({})
  assert.equal((html.match(/role="img"/g) || []).length, 1)
  assert.match(html, /aria-label="TrocaTicket"/)
  assert.match(html, /<svg[^>]*viewBox="0 0 64 64"[^>]*aria-hidden="true"[^>]*focusable="false"/)
  assert.match(html, /ttMarcaTroca[^>]*>Troca/); assert.match(html, /ttMarcaTicket[^>]*>Ticket/)
  assert.doesNotMatch(html, /<img|<image|<use|https?:|onClick|href=/)
})

test('variantes compacta, clara e somente símbolo preservam o nome acessível', () => {
  const html = render({ compacto: true, tom: 'claro', somenteSimbolo: true, className: 'exemplo' })
  assert.match(html, /ttMarca--compacta/); assert.match(html, /ttMarca--clara/)
  assert.match(html, /exemplo/); assert.match(html, /aria-label="TrocaTicket"/)
  assert.doesNotMatch(html, /ttMarcaNome/)
  assert.match(render({ tom: 'desconhecido' }), /ttMarcaNome/)
  assert.doesNotMatch(render({ tom: 'desconhecido' }), /ttMarca--clara/)
})

test('CSS da marca usa tokens, mantém proporções e adapta contraste em superfícies escuras', () => {
  const css = postcss.parse(ler('src/components/ui/Marca.css'))
  css.walkRules(r => assert.ok(r.selector.split(',').every(s => /^\.(ttMarca|adminMarca\.marcaAdmin)/.test(s.trim()))))
  css.walkDecls(d => assert.doesNotMatch(d.value, /#[\da-f]{3,8}\b|url\(/i))
  assert.match(css.toString(), /--marca-grafite: var\(--superficie-cartao\)/)
  assert.match(css.toString(), /color: var\(--marca-coral\)/)
  assert.match(css.toString(), /white-space: nowrap/)
  assert.match(css.toString(), /max-width: 390px/)
})

test('favicon preserva os dois tickets e rotações do símbolo reutilizável', () => {
  const favicon = ler('public/favicon.svg'), html = render({ somenteSimbolo: true })
  const d = 'M12 19H52V26A6 6 0 0 0 52 38V45H12V38A6 6 0 0 0 12 26Z'
  assert.equal(favicon.split(d).length - 1, 2)
  assert.equal(html.split(d).length - 1, 2)
  for (const r of ['rotate(-34 32 32)', 'rotate(32 32 32)']) {
    assert.ok(favicon.includes(r)); assert.ok(html.includes(r))
  }
  assert.match(favicon, /#252B35/); assert.match(favicon, /#F26457/)
  assert.match(favicon, /viewBox="0 0 64 64"/)
})

test('oito locais de identidade reutilizam Marca sem substituir menções comuns', () => {
  for (const p of ['components/layout/Cabecalho.jsx', 'components/layout/Menu.jsx', 'components/admin/AdminPortal.jsx',
    'pages/auth/Login.jsx', 'pages/auth/Cadastro.jsx', 'pages/auth/SolicitarAcesso.jsx',
    'pages/participante/PortalParticipante.jsx', 'pages/fornecedor/PortalFornecedor.jsx']) {
    const s = ler('src/' + p)
    assert.match(s, /import \{ Marca \} from/)
    assert.match(s, /<Marca(?: compacto)? \/>/)
    assert.doesNotMatch(s, /<Icone nome="ticket" \/> <span>TrocaTicket<\/span>|<span>TT<\/span><strong>TrocaTicket/)
  }
  assert.match(ler('src/pages/participante/PortalParticipante.jsx'), /Conheça os eventos cadastrados no TrocaTicket/)
})

test('documento preserva metadados e aponta para o favicon e título novos', () => {
  const html = ler('index.html')
  assert.match(html, /<title>TrocaTicket \| Plataforma de Eventos<\/title>/)
  assert.match(html, /rel="icon" type="image\/svg\+xml" href="\/favicon.svg"/)
  assert.match(html, /name="viewport"/); assert.match(html, /lang="pt-br"/)
  assert.doesNotMatch(html, /vite\.svg|react\.svg/)
})
