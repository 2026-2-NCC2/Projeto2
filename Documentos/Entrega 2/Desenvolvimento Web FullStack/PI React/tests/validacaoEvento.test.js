import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { createElement, useState, act } from 'react'
import { validarFormularioEvento } from '../src/utils/validarEvento.js'
import { montarRouter, apiSintetica } from './helpers/routerDom.js'

const require = createRequire(import.meta.url)
const { validarEvento } = require('../../PI Backend/services/eventos.cjs')
const base = () => ({ nome: 'Evento sintético', data: '2030-05-10', horario: '12:01', local: 'Local', publico: 20, categoria: 'Workshop', descricao: '', capacidade_maxima: null })
const agora = '2030-05-10T15:00:00.000Z'
const vetores = [
  ['ontem', agora, '2030-05-09', '23:59', false],
  ['hoje passado', agora, '2030-05-10', '11:59', false],
  ['igual ao instante atual', agora, '2030-05-10', '12:00', false],
  ['hoje futuro', agora, '2030-05-10', '12:01', true],
  ['amanhã', agora, '2030-05-11', '00:00', true],
  ['dia UTC diferente de Brasília', '2030-05-10T02:59:30Z', '2030-05-10', '00:00', true],
  ['minuto já iniciado', '2030-05-10T15:00:00.500Z', '2030-05-10', '12:00', false],
  ['meia-noite igual', '2030-05-10T03:00:00Z', '2030-05-10', '00:00', false],
  ['virada do ano', '2030-12-31T23:59:59Z', '2031-01-01', '00:00', true],
  ['bissexto', '2028-02-29T03:00:00Z', '2028-02-29', '00:01', true],
]
for (const [nome, instante, data, horario, aceito] of vetores) test('frontend e backend concordam: ' + nome, () => {
  const dados = { ...base(), data, horario }, opcoes = { agora: new Date(instante) }
  assert.equal(Object.keys(validarFormularioEvento(dados, opcoes)).length === 0, aceito)
  if (aceito) assert.doesNotThrow(() => validarEvento(dados, { ...opcoes, criacao: true }))
  else assert.throws(() => validarEvento(dados, { ...opcoes, criacao: true }), e => e.respostaStatus === 400 && e.inicioPassado)
})

for (const tz of ['UTC', 'Pacific/Kiritimati', 'America/Los_Angeles']) test('calendário civil independente do fuso do processo/navegador: ' + tz, () => {
  const codigo = `import {agendaBrasilia,validarFormularioEvento} from './src/utils/validarEvento.js';console.log(JSON.stringify([agendaBrasilia(new Date('2030-05-10T02:59:30Z')),validarFormularioEvento(${JSON.stringify({ ...base(), horario: '00:00' })},{agora:new Date('2030-05-10T02:59:30Z')})]))`
  const r = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', codigo], { cwd: new URL('..', import.meta.url), env: { ...process.env, TZ: tz }, encoding: 'utf8' }))
  assert.deepEqual(r, [{ data: '2030-05-09', horario: '23:59:30' }, {}])
})

for (const [campo, valor] of [['nome', ' '], ['nome', 'n'.repeat(101)], ['local', 'l'.repeat(201)], ['categoria', ''], ['descricao', 'd'.repeat(10001)],
  ['data', '2030-02-30'], ['data', '0001-01-01'], ['horario', '24:00'], ['horario', '1:00'],
  ...[0, -1, 1.5, 2147483648, Infinity, NaN, '20', ''].map(v => ['publico', v]),
  ...[0, -1, 1.5, 2147483648].map(v => ['capacidade_maxima', v]),
]) test('erro específico do campo ' + campo + ': ' + String(valor).slice(0, 25), () => {
  const erros = validarFormularioEvento({ ...base(), [campo]: valor }, { controleCapacidade: true, agora: new Date(agora) })
  assert.equal(typeof erros[campo], 'string')
})
test('capacidade respeita inscritos conhecidos e campo opcional não inventa limite', () => {
  assert.ok(validarFormularioEvento({ ...base(), capacidade_maxima: 2, inscritos_confirmados: 3 }, { controleCapacidade: true }).capacidade_maxima)
  assert.equal(validarFormularioEvento({ ...base(), capacidade_maxima: null, inscritos_confirmados: 3 }, { controleCapacidade: true }).capacidade_maxima, undefined)
})
test('histórico publicado mantém descrição/capacidade; planejamento não ganha exceção nova', () => {
  const historico = { ...base(), id: 7, status: 'Ativo', data: '2000-01-01', horario: '00:00', descricao: 'Aviso atualizado' }
  assert.deepEqual(validarFormularioEvento(historico), {})
  assert.doesNotThrow(() => validarEvento(historico))
  assert.ok(validarFormularioEvento({ ...historico, status: 'Em planejamento' }).data)
})

async function formulario(t, { dados = base(), enviar, administrativo = false, instante = agora } = {}) {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(instante) })
  const { CriarEvento } = await import('../src/pages/organizador/CriarEvento.jsx')
  const chamadas = []
  function Formulario() {
    const [evento, setEvento] = useState(dados)
    return createElement(CriarEvento, { evento, setEvento, setPagina() {}, administrativo, podeSalvar: true, controleCapacidade: true,
      aoAvancarParaCustos: async () => { chamadas.push({ ...evento }); await enviar?.(evento) } })
  }
  const r = await montarRouter({ url: '/#/criar', routes: [{ path: '*', element: createElement(Formulario) }] })
  t.after(() => r.close())
  return { ...r, chamadas, async enviar() { await act(async () => r.document.querySelector('form').dispatchEvent(new r.window.Event('submit', { bubbles: true, cancelable: true }))); await r.settle() },
    async alterar(id, valor) { const campo = r.document.getElementById(id)
      await act(async () => { Object.getOwnPropertyDescriptor(r.window.HTMLInputElement.prototype, 'value').set.call(campo, valor); campo.dispatchEvent(new r.window.Event('input', { bubbles: true })); campo.dispatchEvent(new r.window.Event('change', { bubbles: true })) }); await r.settle()
    },
  }
}
for (const dados of [{ ...base(), nome: '' }, { ...base(), data: '2030-05-09' }, { ...base(), horario: '11:59' }, { ...base(), horario: '12:00' }, { ...base(), publico: 0 }, { ...base(), capacidade_maxima: -1 }]) test('formulário inválido não envia e identifica o primeiro erro: ' + JSON.stringify(dados), async t => {
  const r = await formulario(t, { dados }); await r.enviar()
  assert.equal(r.chamadas.length, 0)
  const campo = r.document.activeElement
  assert.equal(campo.getAttribute('aria-invalid'), 'true')
  assert.ok(r.document.getElementById(campo.getAttribute('aria-describedby').split(' ').at(-1)).textContent)
  assert.equal(r.document.querySelector('form').noValidate, true)
})
test('mensagem desaparece ao corrigir; valores permanecem e envio futuro acontece uma vez', async t => {
  const r = await formulario(t, { dados: { ...base(), horario: '11:59' } }); await r.enviar()
  assert.equal(r.document.activeElement.id, 'criarevento-campo-3')
  assert.equal(r.document.getElementById('criarevento-campo-2').min, '2030-05-10')
  await r.alterar('criarevento-campo-3', '12:01'); assert.equal(r.document.getElementById('criarevento-campo-3-erro'), null)
  await r.enviar(); assert.equal(r.chamadas.length, 1); assert.equal(r.chamadas[0].nome, base().nome)
})
test('API falha com mensagem própria, foco no alerta e valores preservados; permite nova tentativa', async t => {
  let falhar = true
  const r = await formulario(t, { enviar: async () => { if (falhar) throw Object.assign(Error('Capacidade alterada no servidor. Revise o valor.'), { status: 409 }) } })
  await r.enviar(); assert.match(r.document.activeElement.textContent, /Capacidade alterada no servidor/)
  assert.equal(r.document.activeElement.getAttribute('role'), 'alert'); assert.equal(r.document.getElementById('criarevento-campo-1').value, base().nome)
  falhar = false; await r.enviar(); assert.equal(r.chamadas.length, 2)
})
test('duplo submit é bloqueado imediatamente e fieldset permanece ocupado até concluir', async t => {
  let liberar
  const r = await formulario(t, { enviar: () => new Promise(resolve => { liberar = resolve }) })
  await act(async () => { for (let i = 0; i < 2; i++) r.document.querySelector('form').dispatchEvent(new r.window.Event('submit', { bubbles: true, cancelable: true })) })
  assert.equal(r.chamadas.length, 1); assert.equal(r.document.querySelector('fieldset').disabled, true)
  assert.equal(r.document.querySelector('form').getAttribute('aria-busy'), 'true')
  await act(async () => liberar()); assert.equal(r.document.querySelector('fieldset').disabled, false)
})
test('edição publicada histórica não usa min de hoje nem bloqueia salvamento permitido', async t => {
  const r = await formulario(t, { dados: { ...base(), id: 7, data: '2000-01-01', status: 'Ativo' } })
  assert.equal(r.document.getElementById('criarevento-campo-2').min, '1000-01-01')
  await r.enviar(); assert.equal(r.chamadas.length, 1)
})
test('formulário administrativo compartilha bloqueio de início passado sem habilitar capacidade', async t => {
  const r = await formulario(t, { administrativo: true, dados: { ...base(), data: '2000-01-01' } }); await r.enviar()
  assert.equal(r.chamadas.length, 0); assert.equal(r.document.activeElement.id, 'criarevento-campo-2')
})

for (const falha of ['API', 'rede', 'sucesso']) test('formulário do App trata ' + falha + ' sem alertas ou perda dos dados', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(agora) })
  const api = apiSintetica('organizador'), envios = []
  const r = await montarRouter({ url: '/#/criar', dados: { token: 'jwt-sintetico', perfil: 'organizador' }, fetch: async (input, opcoes = {}) => {
    const path = new URL(input).pathname
    if (path === '/eventos/capacidades') return { ok: true, status: 200, json: async () => ({ criar: true, editar: true }) }
    if (path === '/eventos' && opcoes.method === 'POST') {
      envios.push(JSON.parse(opcoes.body))
      if (falha === 'rede') throw new TypeError('Failed to fetch')
      return falha === 'API' ? { ok: false, status: 400, json: async () => ({ erro: 'Data e horário recusados pelo servidor.' }) }
        : { ok: true, status: 201, json: async () => ({ evento: { id: 7 } }) }
    }
    return api(input, opcoes)
  } })
  try {
    globalThis.alert = () => { throw Error('Não deve usar alert para este formulário') }
    const submit = async () => { await act(async () => r.document.querySelector('form').dispatchEvent(new r.window.Event('submit', { bubbles: true, cancelable: true }))); await r.settle() }
    await submit(); assert.equal(envios.length, 0)
    for (const [id, valor] of [['criarevento-campo-1', 'Evento sintético'], ['criarevento-campo-2', '2030-05-10'], ['criarevento-campo-3', '12:01'], ['criarevento-campo-4', 'Local'], ['criarevento-campo-5', '20']]) {
      const campo = r.document.getElementById(id)
      await act(async () => { Object.getOwnPropertyDescriptor(r.window.HTMLInputElement.prototype, 'value').set.call(campo, valor); campo.dispatchEvent(new r.window.Event('input', { bubbles: true })); campo.dispatchEvent(new r.window.Event('change', { bubbles: true })) })
    }
    await submit(); assert.equal(envios.length, 1)
    if (falha === 'sucesso') assert.equal(r.window.location.hash, '#/custos?evento=7')
    else {
      assert.equal(r.document.getElementById('criarevento-campo-1').value, 'Evento sintético')
      assert.match(r.document.activeElement.textContent, falha === 'API' ? /Data e horário recusados pelo servidor/ : /Verifique a conexão/)
      assert.equal(r.document.activeElement.getAttribute('role'), 'alert')
    }
  } finally { await r.close() }
})
