import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement, Fragment, useEffect, useRef, useState, useId } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { carregarAdmin, hooksAdmin, nodes, text } from './helpers/adminRuntime.js'

const avisos = carregarAdmin('pages/auth/avisoCadastro.js', ['guardarAvisoCadastro', 'lerAvisoCadastro', 'limparAvisoCadastro'])
function pagina(nome, fetch, extras = {}) {
  const destinos = [], sessao = [], h = hooksAdmin({
    ...avisos, fetch, apiUrl: p => p, Campo: 'Campo', Botao: 'Botao', Alerta: 'Alerta', Icone: 'svg', console: { error() {} },
  })
  const fn = carregarAdmin(`pages/auth/${nome}.jsx`, [nome], h.env)[nome]
  const props = { setPagina: p => destinos.push(p), aoAutenticarSessao: (...args) => sessao.push(args), ...extras }
  const render = () => h.render(fn, props)
  const alterar = (id, valor) => nodes(render()).find(n => n.type === 'Campo' && n.props.id === id).props.onChange({ target: { value: valor } })
  const enviar = () => nodes(render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
  return { render, alterar, enviar, destinos, sessao, props }
}
const resposta = (ok, dados) => ({ ok, json: async () => dados })
function preencherCadastro(p) {
  for (const [id, valor] of Object.entries({ 'cadastro-nome': 'Pessoa sintética', 'cadastro-email': 'p@example.invalid', 'cadastro-senha': 'senha-sintetica', 'cadastro-confirmar': 'senha-sintetica' })) p.alterar(id, valor)
}

test('login preserva POST, payload e autoridade do perfil retornado pelo servidor', async () => {
  const chamadas = [], p = pagina('Login', async (...args) => { chamadas.push(args); return resposta(true, { token: 'token-falso', usuario: { perfil: 'participante' } }) })
  nodes(p.render()).find(n => n.type === 'button' && text(n) === 'Acesso administrativo').props.onClick()
  p.alterar('login-email', 'p@example.invalid'); p.alterar('login-senha', 'senha-sintetica'); await p.enviar()
  assert.equal(chamadas.length, 1); assert.equal(chamadas[0][0], '/login')
  assert.equal(chamadas[0][1].method, 'POST'); assert.equal(chamadas[0][1].headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(chamadas[0][1].body), { email: 'p@example.invalid', senha: 'senha-sintetica' })
  assert.deepEqual(p.sessao, [['token-falso', 'participante']]); assert.deepEqual(p.destinos, [])
})

test('login preserva selecao visual de perfil sem transforma-la em permissao', () => {
  const p = pagina('Login', () => { throw Error('Não deve consultar') })
  const fornecedor = nodes(p.render()).find(n => n.type === 'button' && text(n) === 'Fornecedor')
  fornecedor.props.onClick()
  assert.equal(nodes(p.render()).find(n => n.type === 'button' && text(n) === 'Fornecedor').props['aria-pressed'], true)
  assert.match(text(p.render()), /Encontre oportunidades/)
})

test('erro conhecido de login fica persistente e preserva campos', async () => {
  const p = pagina('Login', async () => resposta(false, { erro: 'Credenciais inválidas' }))
  p.alterar('login-email', 'p@example.invalid'); await p.enviar()
  for (let i = 0; i < 3; i++) assert.match(text(p.render()), /Credenciais inválidas/)
  assert.equal(nodes(p.render()).find(n => n.type === 'Campo' && n.props.id === 'login-email').props.value, 'p@example.invalid')
  assert.equal(p.sessao.length, 0)
})

test('falha de transporte e rejeicao da validacao de sessao nao anunciam sucesso', async () => {
  for (const transporte of [true, false]) {
    const p = pagina('Login', async () => { if (transporte) throw Error('Falha sintética'); return resposta(true, { token: 'falso', usuario: { perfil: 'admin' } }) },
      { aoAutenticarSessao: async () => { throw Error('Sessão recusada') } })
    await p.enviar(); assert.match(text(p.render()), /Não foi possível confirmar o acesso/)
    assert.deepEqual(p.destinos, [])
  }
})

test('login ocupado bloqueia envios duplicados e navegação pelo botao do formulario', async () => {
  let chamadas = 0, concluir
  const p = pagina('Login', () => { chamadas++; return new Promise(resolve => { concluir = resolve }) })
  const pendente = p.enviar(); await p.enviar(); assert.equal(chamadas, 1)
  const v = p.render(); assert.equal(nodes(v).find(n => n.type === 'form').props['aria-busy'], true)
  assert.ok(nodes(v).filter(n => n.type === 'Campo').every(n => n.props.ocupado))
  assert.equal(nodes(v).find(n => n.type === 'Botao' && n.props.type === 'submit').props.ocupado, true)
  concluir(resposta(false, {})); await pendente
  assert.equal(nodes(p.render()).find(n => n.type === 'form').props['aria-busy'], false)
})

test('cadastro preserva validacao de confirmacao sem chamar API', async () => {
  let chamadas = 0
  const p = pagina('Cadastro', async () => { chamadas++; return resposta(true, {}) })
  p.alterar('cadastro-senha', 'a'); p.alterar('cadastro-confirmar', 'b'); await p.enviar()
  assert.equal(chamadas, 0); assert.match(text(p.render()), /As senhas não coincidem/)
  assert.equal(nodes(p.render()).find(n => n.type === 'Campo' && n.props.id === 'cadastro-confirmar').props.erro, 'As senhas não coincidem.')
})

test('cadastro preserva payload participante e redireciona imediatamente com aviso em memoria', async () => {
  const chamadas = [], p = pagina('Cadastro', async (...args) => { chamadas.push(args); return resposta(true, {}) })
  preencherCadastro(p); await p.enviar()
  assert.equal(chamadas[0][0], '/usuarios'); assert.equal(chamadas[0][1].method, 'POST')
  assert.deepEqual(JSON.parse(chamadas[0][1].body), { nome: 'Pessoa sintética', email: 'p@example.invalid', senha: 'senha-sintetica', perfil: 'participante' })
  assert.deepEqual(p.destinos, ['login'])
  const login = pagina('Login', async () => { throw Error('Consulta inesperada') })
  assert.match(text(login.render()), /Conta criada com sucesso! Faça login/)
  assert.equal(avisos.lerAvisoCadastro(), '')
  assert.match(text(login.render()), /Conta criada com sucesso! Faça login/)
})

test('falha conhecida de cadastro preserva mensagem do servidor sem redirecionar', async () => {
  const p = pagina('Cadastro', async () => resposta(false, { erro: 'Cadastro recusado' }))
  preencherCadastro(p); await p.enviar()
  assert.match(text(p.render()), /Cadastro recusado/); assert.deepEqual(p.destinos, [])
  assert.equal(avisos.lerAvisoCadastro(), '')
})

test('cadastro com resultado incerto mantem orientacao e nao repete automaticamente', async () => {
  let chamadas = 0
  const p = pagina('Cadastro', async () => { chamadas++; return { ok: true, json: async () => { throw Error('Resposta perdida') } } })
  preencherCadastro(p); await p.enviar()
  for (let i = 0; i < 3; i++) assert.match(text(p.render()), /cadastro pode ter sido recebido.*antes de reenviar/)
  assert.equal(chamadas, 1); assert.deepEqual(p.destinos, []); assert.equal(avisos.lerAvisoCadastro(), '')
})

test('cadastro trava submissao simultanea sem mudar valores enviados', async () => {
  let chamadas = 0, concluir
  const p = pagina('Cadastro', () => { chamadas++; return new Promise(resolve => { concluir = resolve }) })
  preencherCadastro(p); const pendente = p.enviar(); await p.enviar()
  assert.equal(chamadas, 1); assert.ok(nodes(p.render()).filter(n => n.type === 'Campo').every(n => n.props.ocupado))
  concluir(resposta(false, {})); await pendente
})

test('renderizacao React real associa campos, preserva required e funcionalidades indisponiveis', () => {
  const env = { jsx: createElement, Fragment, useEffect, useRef, useState, useId, Icone: () => null, ...avisos, apiUrl: p => p }
  const prim = carregarAdmin('components/ui/Primitivas.jsx', ['Alerta', 'Campo', 'Botao'], env)
  for (const nome of ['Login', 'Cadastro']) {
    const Component = carregarAdmin(`pages/auth/${nome}.jsx`, [nome], { ...env, ...prim })[nome]
    const html = renderToStaticMarkup(createElement(Component, { setPagina() {} }))
    const labels = Array.from(html.matchAll(/<label for="([^"]+)"/g), m => m[1])
    assert.equal(labels.length, nome === 'Login' ? 2 : 4)
    for (const id of labels) assert.ok(html.includes(`id="${id}"`))
    assert.equal((html.match(/required=""/g) || []).length, labels.length)
    assert.match(html, /autoComplete="/); assert.doesNotMatch(html, /noValidate/)
    if (nome === 'Login') assert.match(html, /disabled=""[^>]*title="Funcionalidade indisponível">Esqueci minha senha/)
  }
})

test('estilos sao locais e feedback nao depende de alert, timer ou storage', () => {
  const css = readFileSync(new URL('../src/pages/auth/Autenticacao.css', import.meta.url), 'utf8')
  assert.match(css, /\.autenticacaoPagina/); assert.match(css, /max-width: 600px/)
  for (const nome of ['Login', 'Cadastro', 'avisoCadastro']) {
    const arquivo = nome === 'avisoCadastro' ? `${nome}.js` : `${nome}.jsx`
    const source = readFileSync(new URL(`../src/pages/auth/${arquivo}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /\balert\(|setTimeout|localStorage|sessionStorage/)
  }
})
