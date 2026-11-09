import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import { build } from 'vite'
import { carregarAdmin } from './helpers/adminRuntime.js'
import { documentoDaRota } from '../src/pages/publicas/documentosTransparencia.js'
import termos from '../src/pages/publicas/termosUso.json' with { type: 'json' }

const ler = p => readFileSync(new URL('../src/' + p, import.meta.url), 'utf8')
const env = { jsx: createElement, Fragment }
const { Marca } = carregarAdmin('components/ui/Marca.jsx', ['Marca'], env)
const { Icone } = carregarAdmin('components/ui/Icone.jsx', ['Icone'], env)
const { LinksTransparencia, EntradaAplicacao } = carregarAdmin('pages/publicas/Transparencia.jsx', ['LinksTransparencia', 'EntradaAplicacao'], { ...env, documentoDaRota })
const { LandingPage } = carregarAdmin('pages/publicas/LandingPage.jsx', ['LandingPage'], { ...env, Marca, Icone, LinksTransparencia })
const render = () => renderToStaticMarkup(createElement(LandingPage))
const css = postcss.parse(ler('pages/publicas/LandingPage.css'))

test('landing renderiza isoladamente sem sessão, API ou contexto dos portais', () => {
  const html = render()
  assert.match(html, /class="lpPagina"/)
  assert.match(html, /<header/); assert.match(html, /<main/); assert.match(html, /<footer/)
  assert.doesNotMatch(html, /<form|<input|<iframe|<script|<img|<video/)
})

test('marca original aparece no cabeçalho e rodapé e ícones são decorativos', () => {
  const html = render()
  assert.equal((html.match(/role="img" aria-label="TrocaTicket"/g) || []).length, 2)
  for (const [, atributos] of html.matchAll(/<svg([^>]*)>/g)) {
    assert.match(atributos, /aria-hidden="true"/)
    assert.match(atributos, /focusable="false"/)
  }
  assert.match(html, /class="lpComposicao" aria-hidden="true"/)
})

test('hierarquia possui um h1, quatro seções nomeadas e títulos de cards subordinados', () => {
  const html = render()
  assert.equal((html.match(/<h1\b/g) || []).length, 1)
  assert.equal((html.match(/<h2\b/g) || []).length, 3)
  assert.equal((html.match(/<h3\b/g) || []).length, 7)
  assert.equal((html.match(/<section\b/g) || []).length, 4)
  for (const [, titulo] of html.matchAll(/<section[^>]*aria-labelledby="([^"]+)"/g)) assert.ok(html.includes(`id="${titulo}"`))
})

test('âncoras e atalho de conteúdo têm destinos únicos focáveis sem ordem artificial de Tab', () => {
  const html = render()
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1])
  assert.equal(new Set(ids).size, ids.length)
  for (const [, destino] of html.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(ids.includes(destino), destino)
    assert.match(html, new RegExp(`<(?:section|main)[^>]*id="${destino}"[^>]*tabindex="-1"`))
  }
  assert.match(html, /class="lpPular" href="#lp-conteudo"/)
  assert.match(html, /aria-label="Seções da apresentação"/)
  assert.match(html, /aria-label="Navegação do rodapé"/)
  assert.doesNotMatch(html, /tabindex="[0-9]+"/)
})

test('os três perfis descrevem apenas fluxos implementados e inscrições condicionais', () => {
  const html = render()
  for (const perfil of ['Participante', 'Organizador', 'Fornecedor']) assert.ok(html.includes(`<h3>${perfil}</h3>`))
  for (const texto of ['quando disponível', 'próprias inscrições', 'planeje custos', 'cotações disponíveis', 'itens solicitados', 'propostas enviadas']) assert.ok(html.includes(texto), texto)
  assert.doesNotMatch(html, /checkout|pagamentos|QR Code|ingressos digitais|inteligência artificial|depoimentos|mil usuários|gratuito|patrocínio/i)
})

test('Sobre o TrocaTicket apresenta funcionalidades reais sem alegações acadêmicas ou comerciais inventadas', () => {
  const html = render()
  assert.match(html, /<h2 id="lp-projeto-titulo">Sobre o TrocaTicket<\/h2>/)
  assert.match(html, /plataforma de eventos que reúne participantes, organizadores e fornecedores/)
  for (const texto of ['estimativas de custos', 'cotações e propostas', 'Plataforma de eventos']) assert.ok(html.includes(texto))
  assert.doesNotMatch(html, /FECAP|acad[eê]mic|universit[aá]ri|faculdade|Fundação de Comércio/i)
  assert.doesNotMatch(html, /certificad|patrocinad|aprovado pela|parceria com|professor|@/i)
})

test('interface pública e portais não reintroduzem referências acadêmicas fora dos documentos legais', () => {
  const legais = new Set(['pages/publicas/documentosTransparencia.js', 'pages/publicas/termosUso.json'])
  const padrao = /FECAP|acad[eê]mic|universit[aá]ri|faculdade|Fundação de Comércio Álvares Penteado/i
  let examinados = 0
  function examinar(diretorio, relativo = '', preservarLegais = false) {
    for (const item of readdirSync(diretorio, { withFileTypes: true })) {
      const caminho = new URL(item.name + (item.isDirectory() ? '/' : ''), diretorio)
      const nome = relativo + item.name
      if (item.isDirectory()) examinar(caminho, nome + '/', preservarLegais)
      else if (/\.(jsx?|json|css|html|svg)$/i.test(item.name)) {
        if (preservarLegais && legais.has(nome)) continue
        assert.doesNotMatch(readFileSync(caminho, 'utf8'), padrao, nome)
        examinados++
      }
    }
  }
  examinar(new URL('../src/', import.meta.url), '', true)
  examinar(new URL('../public/', import.meta.url))
  assert.doesNotMatch(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), padrao)
  assert.ok(examinados > 50)
})

test('rodapé reutiliza destinos públicos reais sem criar rotas ou contatos fictícios', () => {
  const html = render(), hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1])
  const publicos = ['/privacidade', '/termos', '/contato-privacidade', '/preferencias-privacidade']
  for (const caminho of publicos) assert.ok(hrefs.includes(caminho))
  for (const href of hrefs) assert.ok(href.startsWith('#lp-') || publicos.includes(href), href)
  for (const p of publicos.filter(p => p !== '/preferencias-privacidade')) assert.ok(documentoDaRota(p))
  assert.match(ler('pages/publicas/Transparencia.jsx'), /caminho === '\/preferencias-privacidade'/)
  assert.doesNotMatch(html, /mailto:|tel:|href="(?:\/login|\/cadastro|#)"/)
})

test('acesso futuro é texto não interativo e não oferece controles sem ação', () => {
  const html = render()
  assert.match(html, /<p class="lpAcessoFuturo">Acessar sistema<span>Integração futura<\/span><\/p>/)
  assert.doesNotMatch(html, /<button|role="button"|aria-disabled|onclick=/i)
  assert.match(html, /class="lpLinkDestaque" href="#lp-como-funciona"/)
})

test('integração preserva entrada de transparência e cadastro/Termos não são publicados', () => {
  assert.doesNotMatch(ler('main.jsx'), /LandingPage/)
  assert.match(ler('main.jsx'), /<EntradaAplicacao><App \/><\/EntradaAplicacao>/)
  assert.doesNotMatch(ler('App.jsx'), /LandingPage/)
  assert.match(ler('App.jsx'), /<EntradaPublica iniciarNoLogin=\{Boolean\(autenticacao.erro\)\}/)
  const child = createElement('div', null, 'Aplicação atual')
  for (const caminho of ['/', '/landing', '/login', '/cadastro', '/participante']) assert.equal(EntradaAplicacao({ caminho, children: child }), child)
  assert.equal(termos.estado, 'minuta')
  assert.match(render(), /cadastro permanece bloqueado/)
  assert.match(render(), /não declara conformidade com a LGPD/)
  assert.match(render(), /decisões jurídicas e operacionais/)
})

test('landing não introduz tecnologia externa, rastreamento, armazenamento ou requisições', () => {
  const source = ler('pages/publicas/LandingPage.jsx')
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|sessionStorage|localStorage|document\.|window\.|useEffect|https?:\/\/|<img|<iframe|<script|@import/)
  assert.doesNotMatch(css.toString(), /url\(|@import|@font-face/)
})

test('estilos são isolados, usam tokens existentes e não animam nem ocultam overflow da página', () => {
  const tokens = new Set()
  postcss.parse(ler('index.css')).walkDecls(d => { if (d.prop.startsWith('--')) tokens.add(d.prop) })
  css.walkRules(r => r.selectors.forEach(s => assert.ok(s.startsWith('.lpPagina'), s)))
  css.walkDecls(d => {
    assert.doesNotMatch(d.value, /#[\da-f]{3,8}\b|!important/i)
    for (const [, token] of d.value.matchAll(/var\((--[\w-]+)\)/g)) assert.ok(tokens.has(token), token)
    assert.ok(!['animation', 'transition', 'scroll-behavior'].includes(d.prop))
    assert.ok(!d.prop.startsWith('overflow') || d.value !== 'hidden')
  })
  assert.match(css.toString(), /:focus-visible/)
  assert.match(css.toString(), /\.lpPular:focus/)
})

function estilo(seletor, largura) {
  const resultado = {}
  css.walkRules(r => {
    if (!r.selectors.includes(seletor)) return
    let parent = r.parent
    while (parent) {
      if (parent.type === 'atrule' && parent.name === 'media') {
        const max = parent.params.match(/max-width:\s*(\d+)px/)
        if (!max || largura > Number(max[1])) return
      }
      parent = parent.parent
    }
    r.walkDecls(d => { resultado[d.prop] = d.value })
  })
  return resultado
}

for (const largura of [360, 390, 768, 1024, 1440, 720]) test(`landing: regras responsivas em ${largura}px${largura === 720 ? ' (refluxo equivalente a 1440px/200%)' : ''}`, () => {
  assert.equal(estilo('.lpPagina', largura)['min-width'], '0')
  assert.equal(estilo('.lpPagina', largura)['overflow-wrap'], 'anywhere')
  assert.equal(estilo('.lpPagina .lpHero', largura)['grid-template-columns'], largura <= 800 ? 'minmax(0, 1fr)' : 'minmax(0, 1.1fr) minmax(0, 1fr)')
  assert.equal(estilo('.lpPagina .lpPerfis', largura)['grid-template-columns'], largura <= 800 ? 'minmax(0, 1fr)' : 'repeat(3, minmax(0, 1fr))')
  assert.equal(estilo('.lpPagina .lpBeneficiosGrade', largura)['grid-template-columns'], largura <= 800 ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))')
  assert.equal(estilo('.lpPagina .lpNavegacao', largura)['flex-wrap'], 'wrap')
  assert.equal(estilo('.lpPagina .lpNavegacao a', largura)['min-height'], '44px')
  assert.equal(estilo('.lpPagina .lpLinkDestaque', largura)['min-height'], '48px')
  assert.equal(estilo('.lpPagina .transparenciaLinks a', largura)['min-height'], '44px')
  assert.equal(estilo('.lpPagina .lpCabecalho', largura).height, 'auto')
  // A decoração cabe no contêiner sem transformações que ampliem o overflow.
  assert.equal(estilo('.lpPagina .lpOrbita', largura).inset, '5% 0')
  assert.equal(estilo('.lpPagina .lpOrbita', largura).transform, undefined)
})

test('contraste dos textos e ações atende AA nas combinações de tokens usadas', () => {
  const lum = hex => {
    const rgb = hex.match(/[\da-f]{2}/gi).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
  }
  for (const [frente, fundo] of [['252B35', 'F2F5F6'], ['626B76', 'F2F5F6'], ['626B76', 'FFFFFF'], ['626B76', 'FFF0ED'], ['B83F35', 'FFFFFF'], ['B83F35', 'FFF0ED'], ['B83F35', 'F2F5F6'], ['252B35', 'F26457'], ['FFFFFF', 'B83F35']]) {
    const a = lum(frente), b = lum(fundo)
    assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, `${frente}/${fundo}`)
  }
})

test('build isolado resolve JSX, imports e CSS sem integrar entrada nem gravar artefatos', async () => {
  const resultado = await build({ configFile: false, envFile: false, root: fileURLToPath(new URL('..', import.meta.url)), logLevel: 'silent',
    build: { write: false, lib: { entry: fileURLToPath(new URL('../src/pages/publicas/LandingPage.jsx', import.meta.url)), formats: ['es'], name: 'LandingPage' },
      rollupOptions: { external: ['react', 'react/jsx-runtime'] } } })
  const outputs = (Array.isArray(resultado) ? resultado : [resultado]).flatMap(r => r.output)
  assert.ok(outputs.some(o => o.type === 'chunk' && /LandingPage/.test(o.code)))
  assert.ok(outputs.some(o => o.type === 'asset' && o.fileName.endsWith('.css') && String(o.source).includes('.lpPagina')))
})
