import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import { carregarAdmin, hooksAdmin, nodes, text } from './helpers/adminRuntime.js'
import { primitivasFixture, jsxPrimitivas } from './helpers/primitivasFixture.js'

function entrada(iniciarNoLogin = false, navegacao) {
  const pendentes = [], focos = [], seletores = []
  const h = hooksAdmin({ ...primitivasFixture, jsx: jsxPrimitivas, LandingPage: 'landing' })
  const registrarEfeito = h.env.useEffect
  h.env.useEffect = (fn, deps) => registrarEfeito(() => { pendentes.push(fn) }, deps)
  const { EntradaPublica } = carregarAdmin('pages/publicas/EntradaPublica.jsx', ['EntradaPublica'], h.env)
  const login = { type: 'login', props: {}, children: [] }
  const render = () => {
    const v = h.render(EntradaPublica, { iniciarNoLogin, children: login, navegacao })
    v.props.ref.current = { querySelector(seletor) {
      seletores.push(seletor)
      // Simula os destinos presentes após o commit, sem navegação real de teclado.
      const certo = nodes(v).some(n => n.type === 'login') ? '#login-email' : '[data-acesso-sistema]'
      assert.equal(seletor, certo)
      return { focus: () => focos.push(seletor) }
    } }
    pendentes.splice(0).forEach(fn => fn())
    return v
  }
  return { render, focos, seletores, login, close: h.close }
}

test('visitante começa na landing sem montar login ou mover foco prematuramente', () => {
  const e = entrada(), v = e.render()
  assert.equal(nodes(v).filter(n => n.type === 'landing').length, 1)
  assert.equal(nodes(v).some(n => n.type === 'login'), false)
  assert.deepEqual(e.focos, [])
  e.close()
})

test('acesso abre o login recebido sem duplicá-lo e retorno foca o acionador da landing', () => {
  const e = entrada()
  nodes(e.render()).find(n => n.type === 'landing').props.aoAcessar()
  let v = e.render()
  assert.ok(nodes(v).includes(e.login))
  assert.equal(nodes(v).some(n => n.type === 'landing'), false)
  assert.deepEqual(e.focos, ['#login-email'])
  e.render(); assert.equal(e.focos.length, 1)
  const voltar = nodes(v).find(n => n.type === 'button')
  assert.equal(text(voltar).trim(), 'Voltar à apresentação')
  assert.equal(voltar.props.type, 'button')
  voltar.props.onClick(); v = e.render()
  assert.equal(nodes(v).some(n => n.type === 'login'), false)
  assert.deepEqual(e.focos, ['#login-email', '[data-acesso-sistema]'])
  e.close()
})

test('sessão rejeitada abre diretamente o login existente, mantendo retorno disponível', () => {
  const e = entrada(true), v = e.render()
  assert.ok(nodes(v).includes(e.login))
  assert.equal(nodes(v).some(n => n.type === 'landing'), false)
  assert.deepEqual(e.focos, [])
  nodes(v).find(n => n.type === 'button').props.onClick()
  assert.ok(nodes(e.render()).some(n => n.type === 'landing'))
  e.close()
})

test('remontagem após sair do portal apresenta landing e não reaproveita escolha local do login', () => {
  const anterior = entrada()
  nodes(anterior.render()).find(n => n.type === 'landing').props.aoAcessar()
  assert.ok(nodes(anterior.render()).includes(anterior.login)); anterior.close()
  const nova = entrada()
  assert.ok(nodes(nova.render()).some(n => n.type === 'landing')); nova.close()
})

test('retorno/avanço controlado pelo histórico foca e-mail e acionador sem estado local divergente', () => {
  const navegacao = { estado: { login: false }, mudar(dados) { this.estado = dados } }
  const e = entrada(false, navegacao)
  nodes(e.render()).find(n => n.type === 'landing').props.aoAcessar()
  assert.ok(nodes(e.render()).includes(e.login))
  navegacao.estado = { login: false }; e.render()
  navegacao.estado = { login: true }; e.render()
  assert.deepEqual(e.focos, ['#login-email', '[data-acesso-sistema]', '#login-email'])
  e.close()
})

test('Acessar sistema é botão nativo com callback, nome e sem URL inventada', () => {
  let acessos = 0
  const { LandingPage } = carregarAdmin('pages/publicas/LandingPage.jsx', ['LandingPage'], {
    ...primitivasFixture, jsx: jsxPrimitivas, Icone: 'svg', LinksTransparencia: 'nav',
  })
  const v = LandingPage({ aoAcessar: () => acessos++ })
  const b = nodes(v).find(n => n.props['data-acesso-sistema'])
  assert.equal(b.type, 'button'); assert.equal(b.props.type, 'button')
  assert.equal(text(b).trim(), 'Acessar sistema')
  b.props.onClick(); assert.equal(acessos, 1)
  assert.equal(nodes(v).some(n => n.props.href === '/login' || n.props.href === '/cadastro'), false)
  assert.doesNotMatch(text(v), /Integração futura/)
})

test('landing integrada mantém um h1 e acesso acessível sem alterar conteúdo legal', () => {
  const env = { jsx: createElement, Fragment }
  const { Botao } = carregarAdmin('components/ui/Primitivas.jsx', ['Botao'], env)
  const { Marca } = carregarAdmin('components/ui/Marca.jsx', ['Marca'], env)
  const { Icone } = carregarAdmin('components/ui/Icone.jsx', ['Icone'], env)
  const { LinksTransparencia } = carregarAdmin('pages/publicas/Transparencia.jsx', ['LinksTransparencia'], env)
  const { LandingPage } = carregarAdmin('pages/publicas/LandingPage.jsx', ['LandingPage'], { ...env, Botao, Marca, Icone, LinksTransparencia })
  const html = renderToStaticMarkup(createElement(LandingPage, { aoAcessar() {} }))
  assert.equal((html.match(/<h1\b/g) || []).length, 1)
  assert.match(html, /<button[^>]*data-acesso-sistema="true"[^>]*type="button"/)
  assert.match(html, /cadastro permanece bloqueado/)
  for (const rota of ['/privacidade', '/termos', '/contato-privacidade', '/preferencias-privacidade']) assert.ok(html.includes(`href="${rota}"`))
})

test('entrada só coordena apresentação, sem armazenamento, API ou decisão de autorização', () => {
  const source = readFileSync(new URL('../src/pages/publicas/EntradaPublica.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /fetch\(|sessionStorage|localStorage|token|validarSessao|location|history\.|setTimeout/)
  const css = postcss.parse(readFileSync(new URL('../src/pages/publicas/EntradaPublica.css', import.meta.url), 'utf8'))
  css.walkRules(r => r.selectors.forEach(s => assert.ok(s.startsWith('.entradaPublica'))))
  assert.match(css.toString(), /:focus-visible/)
  assert.doesNotMatch(css.toString(), /animation:|transition:|url\(/)
})
