import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'

const ler = nome => postcss.parse(readFileSync(new URL(`../src/${nome}`, import.meta.url), 'utf8'))
const catalogos = ler('components/admin/AdminPaginas.css')
const painel = ler('components/admin/PainelEventoAdmin.css')
const tokens = {}
ler('index.css').walkDecls(d => { if (d.prop.startsWith('--')) tokens[d.prop] = d.value })
const resolver = valor => valor.replace(/var\((--[\w-]+)\)/g, (_, nome) => {
  assert.ok(tokens[nome], `Token global definido: ${nome}`)
  return resolver(tokens[nome])
})
function regra(css, seletor) {
  const valores = {}
  css.walkRules(r => {
    if (r.selector === seletor && r.parent.type === 'root') r.walkDecls(d => { valores[d.prop] = d.value })
  })
  assert.ok(Object.keys(valores).length, seletor)
  return valores
}
function luminancia(hex) {
  assert.match(hex, /^#[\da-f]{6}$/i)
  const canais = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
  return canais.reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0)
}
function contraste(texto, fundo) {
  const a = luminancia(resolver(texto)), b = luminancia(resolver(fundo))
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
}

test('badges e mensagens administrativas compartilham os tons semânticos das primitivas', () => {
  for (const tom of ['sucesso', 'alerta', 'erro']) {
    for (const prefixo of ['admBadge', 'admMensagem']) {
      const r = regra(catalogos, `.${prefixo}--${tom}`)
      assert.equal(r.color, `var(--estado-${tom}-texto)`)
      assert.equal(r.background, `var(--estado-${tom}-fundo)`)
      assert.ok(contraste(r.color, r.background) >= 4.5, `${prefixo} ${tom}: AA`)
    }
  }
  const invalido = regra(catalogos, '.admFiltros input[aria-invalid=true]')
  assert.equal(invalido['border-color'], 'var(--estado-alerta-texto)')
  assert.equal(invalido.background, 'var(--estado-alerta-fundo)')
  assert.equal(regra(catalogos, '.admBadge--neutro').background, 'var(--superficie-neutra)')
})

test('painel harmoniza estados e lotação sem usar Coral como significado de erro ou sucesso', () => {
  for (const [seletor, tom] of [['.peaEstado--ativo', 'sucesso'], ['.peaEstado--cancelado', 'erro'], ['.peaMetricas .peaAlerta', 'alerta'], ['.peaErro', 'erro']]) {
    const r = regra(painel, seletor)
    assert.equal(r.color, `var(--estado-${tom}-texto)`)
    assert.equal(r.background, `var(--estado-${tom}-fundo)`)
    assert.ok(contraste(r.color, r.background) >= 4.5, seletor)
  }
  assert.equal(regra(painel, '.peaEstado--encerrado').background, 'var(--superficie-neutra)')
  assert.equal(regra(painel, '.peaMetricas article:nth-child(2)').background, 'var(--estado-info-fundo)')
  assert.ok(contraste('var(--texto-secundario)', 'var(--estado-info-fundo)') >= 4.5)
})

test('controles do painel mantêm alvos mínimos e cores acessíveis dos estados de interação', () => {
  assert.equal(regra(painel, '.peaCabecalho select')['min-height'], '44px')
  assert.equal(regra(painel, '.peaErro button')['min-height'], '44px')
  assert.equal(regra(painel, '.peaCabecalho select').background, 'var(--superficie-cartao)')
  assert.equal(regra(painel, '.peaHero').color, 'var(--superficie-cartao)')
  for (const [texto, fundo] of [
    ['--acao-hover-texto', '--acao-hover-fundo'], ['--desabilitado-texto', '--desabilitado-fundo'],
    ['--link-cor', '--marca-coral-suave'], ['--texto-secundario', '--superficie-neutra'],
  ]) assert.ok(contraste(`var(${texto})`, `var(${fundo})`) >= 4.5, `${texto} sobre ${fundo}`)
})
