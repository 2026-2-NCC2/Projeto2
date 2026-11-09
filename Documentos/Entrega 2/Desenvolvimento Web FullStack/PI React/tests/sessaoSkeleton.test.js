import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import postcss from 'postcss'
import { carregarAdmin } from './helpers/adminRuntime.js'

const { Skeleton } = carregarAdmin('components/ui/Primitivas.jsx', ['Skeleton'], { jsx: createElement, Fragment })
const ler = p => readFileSync(new URL('../src/' + p, import.meta.url), 'utf8')
const css = postcss.parse(ler('SessaoSkeleton.css'))

test('skeleton de sessão é neutro, anuncia validação e não cria controles ou dados de usuário', () => {
  const html = renderToStaticMarkup(createElement(Skeleton, { tipo: 'card', linhas: 5, rotulo: 'Validando sessão...', className: 'sessaoSkeleton' }))
  assert.match(html, /role="status" aria-busy="true"/)
  assert.match(html, /class="ttSrOnly">Validando sessão/)
  assert.match(html, /class="ttSkeletonVisual" aria-hidden="true"/)
  assert.equal((html.match(/class="ttSkeletonTexto"/g) || []).length, 5)
  assert.doesNotMatch(html, /<button|<input|<a\b|tabindex|organizador|participante|fornecedor|admin|@|<img/)
})

test('estilos de restauração são locais e reutilizam movimento reduzido e cores das primitivas', () => {
  css.walkRules(r => r.selectors.forEach(s => assert.ok(s.startsWith('.sessaoSkeleton'))))
  assert.doesNotMatch(css.toString(), /animation:|transition:|#[\da-f]{3,8}\b|url\(|overflow.*hidden/)
  const compartilhado = ler('components/ui/Primitivas.css')
  assert.match(compartilhado, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ttSkeletonVisual span[\s\S]*animation: none/)
  assert.match(compartilhado, /var\(--skeleton-base\)/)
  assert.match(compartilhado, /\.ttSrOnly\s*\{[^}]*clip-path/)
})

for (const largura of [360, 390, 768, 1024, 1440, 720]) test(`skeleton neutro: dimensionamento limitado em ${largura}px`, () => {
  const estilo = {}
  css.walkRules(r => {
    if (r.selector !== '.sessaoSkeleton') return
    if (r.parent.type === 'atrule' && largura > 540) return
    r.walkDecls(d => { estilo[d.prop] = d.value })
  })
  assert.equal(estilo['min-width'], '0')
  assert.equal(estilo.width, largura <= 540 ? 'calc(100% - 32px)' : 'min(960px, calc(100% - 40px))')
  assert.equal(estilo.margin, 'clamp(24px, 5vw, 64px) auto')
})
