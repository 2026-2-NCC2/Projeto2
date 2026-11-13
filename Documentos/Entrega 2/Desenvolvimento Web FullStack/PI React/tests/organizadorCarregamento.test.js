import test from 'node:test'
import assert from 'node:assert/strict'
import { act } from 'react'
import { montarRouter, apiSintetica } from './helpers/routerDom.js'

const texto = r => r.document.body.textContent
const menu = (r, nome) => [...r.document.querySelectorAll('.menu button')].find(b => b.textContent.trim() === nome)
const dados = { token: 'jwt-sintetico', perfil: 'organizador' }
function carregou(r, hash) {
  assert.equal(r.window.location.hash, hash)
  assert.doesNotMatch(texto(r), /Validando sessão|Página não encontrada|Acesso não autorizado/)
  assert.ok(r.document.querySelector('.orgLayout'))
}

for (const strictMode of [false, true]) test('Novo evento abre e permite todas as seções, inclusive após logout/login; StrictMode=' + strictMode, async () => {
  const calls = []
  const r = await montarRouter({ url: '/#/eventos', dados, strictMode, fetch: apiSintetica('organizador', { calls }) })
  try {
    assert.match(texto(r),/Visão geral dos seus eventos/)
    await r.clicar(menu(r,'Novo evento'))
    assert.equal(r.window.location.hash,'#/criar')
    assert.doesNotMatch(texto(r),/Validando sessão/)
    assert.ok(r.document.querySelector('[aria-label="Dados do evento"]'))
    for(const [nome,rota] of [['Custos','custos'],['Propostas e ticket','ticket'],['Cotações e concorrência','cotacao'],['Perfil','perfil'],['Meus eventos','eventos'],['Criar evento','criar']]){
      await r.clicar(menu(r,nome));assert.equal(r.window.location.hash,'#/'+rota);assert.doesNotMatch(texto(r),/Validando sessão|Página não encontrada|Acesso não autorizado/)
    }
    assert.ok(calls.some(([p])=>p==='/eventos'))
    await r.clicar(menu(r, 'Sair'))
    assert.equal(r.window.sessionStorage.getItem('token'), null)
    await r.navegar('/entrar')
    await act(async () => {
      r.document.querySelector('form').dispatchEvent(new r.window.Event('submit', { bubbles: true, cancelable: true }))
    })
    await r.settle()
    carregou(r, '#/eventos')
    assert.ok(calls.some(([p, o]) => p === '/login' && o.method === 'POST'))
    await r.clicar(menu(r, 'Criar evento'))
    carregou(r, '#/criar')
    await r.clicar(menu(r, 'Custos'))
    carregou(r, '#/custos')
  }finally{await r.close()}
})

test('Evento salvo → rascunho novo: histórico restaura o ID e não confunde os contextos', async () => {
  const calls = []
  const r = await montarRouter({ url: '/#/custos?evento=7', dados, strictMode: true, fetch: apiSintetica('organizador', { calls }) })
  try {
    carregou(r, '#/custos?evento=7')
    assert.match(r.document.querySelector('.orgEventoContexto').textContent, /Evento sintético.*Evento #7/)
    await r.clicar(menu(r, 'Novo evento'))
    carregou(r, '#/criar')
    assert.match(r.document.querySelector('.orgEventoContexto').textContent, /rascunho local/)
    assert.doesNotMatch(r.document.querySelector('.orgEventoContexto').textContent, /Evento #7/)
    await r.back()
    carregou(r, '#/custos?evento=7')
    assert.match(r.document.querySelector('.orgEventoContexto').textContent, /Evento #7/)
    await r.forward()
    carregou(r, '#/criar')
    assert.ok(calls.some(([p]) => p === '/eventos/7'))
    assert.ok(calls.every(([p, o]) => !p.includes('novo:') && (!o.method || o.method === 'GET')))
  } finally { await r.close() }
})

test('URLs sem evento abrem diretamente e após remontagem (F5)', async () => {
  for (const pagina of ['criar', 'custos', 'ticket', 'cotacao']) {
    let r = await montarRouter({ url: '/#/' + pagina, dados, strictMode: true, fetch: apiSintetica('organizador') })
    try {
      carregou(r, '#/' + pagina)
      await r.clicar(menu(r, 'Novo evento'))
      carregou(r, '#/criar')
      const hash = r.window.location.hash
      await r.close()
      r = await montarRouter({ url: '/' + hash, dados, strictMode: true, fetch: apiSintetica('organizador') })
      carregou(r, hash)
    } finally { await r.close() }
  }
})
