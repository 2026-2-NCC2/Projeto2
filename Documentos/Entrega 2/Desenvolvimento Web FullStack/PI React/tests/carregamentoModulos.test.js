import test from 'node:test'
import assert from 'node:assert/strict'
import { act, createElement, useState } from 'react'
import { build } from 'vite'
import { Buffer } from 'node:buffer'
import { montarRouter, apiSintetica } from './helpers/routerDom.js'
const { criarCarregador, criarTelaSobDemanda } = await import('../src/components/ui/ModuloSobDemanda.jsx')

test('carregador compartilha tentativas simultâneas, permite retry e reutiliza sucesso', async () => {
  let chamadas = 0
  const modulo = { Tela: () => null }
  const carregar = criarCarregador(async () => {
    chamadas++
    if (chamadas === 1) throw Error('Rede sintética indisponível')
    return modulo
  })
  const a = carregar(), b = carregar()
  assert.equal(a, b)
  await assert.rejects(a, erro => erro.carregamentoModulo === true)
  assert.equal(await carregar(), modulo)
  assert.equal(await carregar(), modulo)
  assert.equal(chamadas, 2)
})

test('falha de módulo tem foco e retry sem recarga ou perda de estado; remontagem reutiliza sucesso', async () => {
  let falhar, concluir, tentativas = 0
  const carregar = criarCarregador(() => {
    tentativas++
    return new Promise((resolve, reject) => { falhar = reject; concluir = resolve })
  })
  const Tela = criarTelaSobDemanda(carregar, 'Tela')
  function Pagina() {
    const [rascunho, guardar] = useState('Sem rascunho')
    const [visivel, mostrar] = useState(true)
    return createElement('main', null,
      createElement('p', null, rascunho),
      createElement('button', { onClick: () => guardar('Rascunho sintético preservado') }, 'Guardar rascunho'),
      createElement('button', { onClick: () => mostrar(v => !v) }, 'Alternar módulo'),
      visivel && createElement(Tela))
  }
  const r = await montarRouter({ routes: [{ path: '*', element: createElement(Pagina) }] })
  const botao = texto => [...r.document.querySelectorAll('button')].find(b => b.textContent === texto)
  try {
    assert.match(r.document.body.textContent, /Carregando tela/)
    await r.clicar(botao('Guardar rascunho'))
    await act(async () => { falhar(Error('Falha sintética de importação')) })
    await r.settle()
    assert.match(r.document.body.textContent, /Não foi possível carregar esta tela/)
    assert.equal(r.document.activeElement, r.document.querySelector('[role="alert"]'))
    await r.clicar(botao('Tentar novamente'))
    assert.match(r.document.body.textContent, /Carregando tela/)
    await act(async () => { concluir({ Tela: () => createElement('h1', null, 'Módulo disponível') }) })
    await r.settle()
    assert.match(r.document.body.textContent, /Módulo disponível/)
    assert.match(r.document.body.textContent, /Rascunho sintético preservado/)
    await r.clicar(botao('Alternar módulo'))
    await r.clicar(botao('Alternar módulo'))
    assert.match(r.document.body.textContent, /Módulo disponível/)
    assert.doesNotMatch(r.document.body.textContent, /Não foi possível carregar/)
    assert.equal(tentativas, 2)
  } finally { await r.close() }
})

test('rotas reais dos quatro perfis não produzem aviso de folha sem element', async t => {
  const avisos = []
  t.mock.method(console, 'warn', (...args) => avisos.push(args.join(' ')))
  for (const [perfil, url] of [['organizador', '/#/criar'], ['participante', '/#/participante'], ['fornecedor', '/#/fornecedor-mural'], ['admin', '/#/admin']]) {
    const r = await montarRouter({ url, dados: { token: 'sintetico', perfil }, fetch: apiSintetica(perfil) })
    try { assert.doesNotMatch(r.document.body.textContent, /Validando sessão|Carregando tela|Página não encontrada/) }
    finally { await r.close() }
  }
  assert.equal(avisos.some(a => /Matched leaf route|does not have an element/.test(a)), false, avisos.join('\n'))
})

test('build mantém portais fora das dependências iniciais e não produz chunk acima de 500 kB', async () => {
  const result = await build({ logLevel: 'silent', build: { write: false } })
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(r => r.output)
  const chunks = outputs.filter(o => o.type === 'chunk')
  const porArquivo = new Map(chunks.map(c => [c.fileName, c]))
  const iniciais = new Set()
  function visitar(chunk) {
    if (!chunk || iniciais.has(chunk)) return
    iniciais.add(chunk)
    chunk.imports.forEach(id => visitar(porArquivo.get(id)))
  }
  chunks.filter(c => c.isEntry).forEach(visitar)
  const modulos = [...iniciais].flatMap(c => Object.keys(c.modules)).join('\n')
  assert.doesNotMatch(modulos, /PortalParticipante\.jsx|PortalFornecedor\.jsx|AdminPortal\.jsx|pages\/organizador\/(?:Eventos|Custos|Ticket|Cotacao|CriarEvento)\.jsx/)
  assert.ok(chunks.some(c => c.dynamicImports.length > 0))
  assert.ok(chunks.every(c => Buffer.byteLength(c.code) < 500_000))
  assert.ok([...iniciais].reduce((total, c) => total + Buffer.byteLength(c.code), 0) < 592_190 * .8)
})
