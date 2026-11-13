import test from 'node:test'
import assert from 'node:assert/strict'
import { act } from 'react'
import { montarRouter, apiSintetica } from './helpers/routerDom.js'

const botao = (r, nome) => [...r.document.querySelectorAll('button')].find(b => b.textContent.trim() === nome)
function apiPerfil(tokenEsperado, id) {
  const calls = [], base = apiSintetica('fornecedor')
  let perfil = { id, nome: `Fornecedor sintético ${id}`, email: `f${id}@example.invalid`, perfil: 'fornecedor', telefone: null, biografia: '', edicao_disponivel: true, imagens_disponiveis: false }
  return { calls, async fetch(url, options = {}) {
    const path = new URL(url).pathname
    calls.push([path, options])
    assert.equal(options.headers?.Authorization, `Bearer ${tokenEsperado}`)
    if (path === '/perfil') {
      if (options.method === 'PATCH') perfil = { ...perfil, ...JSON.parse(options.body) }
      return { ok: true, status: 200, json: async () => perfil }
    }
    return base(url, options)
  } }
}

test('Meu perfil no rodapé reutiliza formulário/privacidade; edição envia somente campos pessoais da sessão', async () => {
  const api = apiPerfil('sessao-ficticia-7', 7)
  const r = await montarRouter({ url: '/#/fornecedor-mural', dados: { token: 'sessao-ficticia-7', perfil: 'fornecedor' }, fetch: api.fetch })
  try {
    const rodape = r.document.querySelector('.fornMenuRodape')
    assert.deepEqual([...rodape.querySelectorAll('button')].map(b => b.textContent.trim()), ['Meu perfil', 'Sair'])
    await r.clicar(botao(r, 'Meu perfil'))
    assert.equal(r.window.location.hash, '#/fornecedor-perfil')
    assert.equal(r.document.querySelectorAll('h1').length, 1)
    assert.equal(r.document.querySelector('h1').textContent, 'Meu perfil')
    assert.equal(botao(r, 'Meu perfil').getAttribute('aria-current'), 'page')
    assert.ok(botao(r, 'Consultar meus dados pessoais'))
    await r.clicar(botao(r, 'Editar dados'))
    const campo = r.document.querySelector('.perfilDados input[autocomplete="name"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(r.window.HTMLInputElement.prototype, 'value').set.call(campo, 'Nome sintético alterado')
      campo.dispatchEvent(new r.window.Event('input', { bubbles: true }))
    })
    await r.clicar(botao(r, 'Salvar alterações'))
    assert.match(r.document.body.textContent, /Perfil atualizado/)
    const patch = api.calls.find(([, o]) => o.method === 'PATCH')
    assert.equal(patch[0], '/perfil')
    assert.deepEqual(JSON.parse(patch[1].body), { nome: 'Nome sintético alterado', telefone: '', biografia: '' })
    await r.back()
    assert.equal(r.window.location.hash, '#/fornecedor-mural')
    await r.forward()
    assert.equal(r.window.location.hash, '#/fornecedor-perfil')
    assert.match(r.document.body.textContent, /Meu perfil/)
  } finally { await r.close() }
})

test('URL do perfil restaura com F5 e nova sessão não reutiliza identidade anterior', async () => {
  for (const id of [7, 8]) {
    const token = `sessao-ficticia-${id}`, api = apiPerfil(token, id)
    const r = await montarRouter({ url: '/#/fornecedor-perfil', dados: { token, perfil: 'fornecedor' }, fetch: api.fetch, strictMode: true })
    try {
      assert.equal(r.document.querySelector('.perfilDados input[autocomplete="name"]').value, `Fornecedor sintético ${id}`)
      assert.equal(r.document.querySelectorAll('h1').length, 1)
      assert.ok(api.calls.filter(([p]) => p === '/perfil').length > 0)
    } finally { await r.close() }
  }
})

test('contratos não convertem propostas aprovadas em contratações e oferecem consulta comercial existente', async () => {
  const base = apiSintetica('fornecedor'), calls = []
  const r = await montarRouter({ url: '/#/fornecedor-contratos', dados: { token: 'sintetico', perfil: 'fornecedor' }, fetch: async (url, o) => {
    calls.push([new URL(url).pathname, o])
    if (new URL(url).pathname === '/fornecedor/propostas') return { ok: true, status: 200, json: async () => [{ id: 1, evento_nome: 'Evento sintético', status: 'Aprovada', valor: '100.00' }] }
    return base(url, o)
  } })
  try {
    assert.match(r.document.body.textContent, /proposta aprovada não comprova contrato formalizado/)
    assert.ok([...r.document.querySelectorAll('button')].some(b => b.disabled && /Contratos ativos/.test(b.textContent)))
    assert.equal(calls.some(([p]) => /contratos/.test(p)), false)
    await r.clicar(botao(r, 'Consultar propostas enviadas'))
    assert.equal(r.window.location.hash, '#/fornecedor-enviadas')
    assert.match(r.document.body.textContent, /Evento sintético/)
  } finally { await r.close() }
})
