import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { transformSync } from 'rolldown/utils'

const jsx = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) })
const nodes = v => v && typeof v === 'object' ? [v, ...(v.children || []).flatMap(nodes)] : []
const text = v => v && typeof v === 'object' ? (v.children || []).map(text).join(' ') : String(v ?? '')
const button = (v, label) => nodes(v).find(n => n.type === 'button' && text(n).includes(label))
const identity = { id: 7, perfil: 'organizador', redes_sociais: null, dados_comerciais: null, edicao_disponivel: true }
function load(file, name, env = {}) {
  const source = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replaceAll('export function ', 'function ').replaceAll('export async function ', 'async function ')
  const result = transformSync(file, source, { jsx: { runtime: 'classic', pragma: 'jsx', pragmaFrag: 'Fragment' } })
  assert.equal(result.errors.length, 0)
  return vm.runInNewContext(result.code + '\n' + name, { jsx, Fragment: 'fragment', URL, AbortController, apiUrl: x => x, sessionStorage: { getItem: () => 'token-a' }, ...env })
}
function runtime(name, env = {}) {
  const cells = [], effects = []
  let cursor = 0
  const fn = load('components/perfil/PerfilProfissional.jsx', name, {
    useState(initial) { const i = cursor++; if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial; return [cells[i], v => { cells[i] = typeof v === 'function' ? v(cells[i]) : v }] },
    useRef(initial) { const i = cursor++; return cells[i] ?? (cells[i] = { current: initial }) },
    useEffect(fn, deps) { const i = cursor++; if (!cells[i] || deps.some((v, n) => v !== cells[i].deps[n])) effects.push(() => { cells[i]?.cleanup?.(); cells[i] = { deps, cleanup: fn() } }) },
    urlProfissionalSegura: v => v.startsWith('https://'), ...env,
  })
  return { render(props) { cursor = 0; const v = fn(props); effects.splice(0).forEach(f => f()); return v }, unmount() { cells.forEach(c => c?.cleanup?.()) } }
}
const props = extra => ({ titulo: 'Redes sociais', campos: [['instagram', 'Instagram'], ['linkedin', 'LinkedIn']], secao: null, token: 'token-a', id: 7, ...extra })

test('consulta omite campos vazios e links abrem com proteção de janela', () => {
  const r = runtime('SecaoProfissional')
  const v = r.render(props({ secao: { instagram: 'https://example.invalid/pessoa' } }))
  assert.match(text(v), /Instagram/); assert.doesNotMatch(text(v), /LinkedIn/)
  const a = nodes(v).find(n => n.type === 'a')
  assert.equal(a.props.rel, 'noopener noreferrer'); assert.equal(a.props.target, '_blank')
  assert.match(text(runtime('SecaoProfissional').render(props())), /Nenhuma informação cadastrada/)
})

test('salvar aguarda confirmação, evita envio duplo e remoção persiste null', async () => {
  let resolve, calls = 0, enviado
  const p = props({ secao: { instagram: 'https://example.invalid' }, aoSalvar(v) { calls++; enviado = v; return new Promise(res => { resolve = () => { p.secao = v; res(v) } }) } })
  const r = runtime('SecaoProfissional')
  button(r.render(p), 'Editar').props.onClick()
  const pendente = button(r.render(p), 'Remover informações').props.onClick({ preventDefault() {} })
  await r.render(p).props.onSubmit({ preventDefault() {} })
  assert.equal(calls, 1); assert.equal(enviado, null)
  assert.ok(button(r.render(p), 'Salvando').props.disabled)
  assert.doesNotMatch(text(r.render(p)), /Informações atualizadas/)
  resolve(); await pendente
  assert.match(text(r.render(p)), /Informações atualizadas/)
  assert.match(text(r.render(p)), /Nenhuma informação cadastrada/)
  assert.equal(nodes(r.render(p)).find(n => n.type === 'a'), undefined)
})

test('falha preserva rascunho sem sucesso; desmontar aborta envio pendente', async () => {
  const p = props({ aoSalvar: async () => { throw new Error('Link inválido') } })
  const r = runtime('SecaoProfissional')
  button(r.render(p), 'Editar').props.onClick()
  nodes(r.render(p)).find(n => n.type === 'input').props.onChange({ target: { value: 'https://example.invalid/rascunho' } })
  await r.render(p).props.onSubmit({ preventDefault() {} })
  assert.match(text(r.render(p)), /Link inválido/)
  assert.doesNotMatch(text(r.render(p)), /Informações atualizadas/)
  assert.equal(nodes(r.render(p)).find(n => n.type === 'input').props.value, 'https://example.invalid/rascunho')
  let signal, resolve
  p.aoSalvar = (_, s) => { signal = s; return new Promise(res => { resolve = res }) }
  const pendente = r.render(p).props.onSubmit({ preventDefault() {} })
  r.unmount(); assert.equal(signal.aborted, true); resolve(null); await pendente
  assert.doesNotMatch(text(r.render(p)), /Informações atualizadas/)
})

test('serviço autentica GET/PATCH e valida ID, resposta, URL e sessão antes de confirmar', async () => {
  const calls = []
  const acessar = load('services/perfilProfissional.js', 'acessarProfissional', { fetch: async (...args) => { calls.push(args); return { ok: true, json: async () => identity } } })
  await acessar('token-a', 7)
  await acessar('token-a', 7, { redes_sociais: null })
  assert.equal(calls[0][0], '/perfil/profissional'); assert.equal(calls[0][1].method, 'GET')
  assert.equal(calls[1][1].method, 'PATCH'); assert.equal(calls[1][1].headers.Authorization, 'Bearer token-a')
  assert.deepEqual(JSON.parse(calls[1][1].body), { redes_sociais: null })
  for (const perfil of [{ ...identity, id: 8 }, { ...identity, edicao_disponivel: false }, { ...identity, redes_sociais: { instagram: 'javascript:alert(1)' } }, { ...identity, dados_comerciais: undefined }]) {
    const acessar = load('services/perfilProfissional.js', 'acessarProfissional', { fetch: async () => ({ ok: true, json: async () => perfil }) })
    await assert.rejects(acessar('token-a', 7))
  }
  const outraSessao = load('services/perfilProfissional.js', 'acessarProfissional', { fetch: async () => ({ ok: true, json: async () => identity }), sessionStorage: { getItem: () => 'outro' } })
  await assert.rejects(outraSessao('token-a', 7), /sessão foi alterada/)
  const bloqueado = load('services/perfilProfissional.js', 'acessarProfissional', { fetch: async () => ({ ok: false, status: 503, json: async () => ({ erro: 'Recurso indisponível' }) }) })
  await assert.rejects(bloqueado('token-a', 7), e => e.indisponivel === true)
})

test('página bloqueia formulário antes da ativação e oferece nova consulta', async () => {
  const r = runtime('PerfilProfissional', { acessarProfissional: async () => { throw Object.assign(new Error('Recurso indisponível'), { indisponivel: true }) } })
  r.render({ token: 'token-a', id: 7 })
  await new Promise(resolve => setTimeout(resolve, 0))
  const v = r.render({ token: 'token-a', id: 7 })
  assert.match(text(v), /Recurso indisponível/)
  assert.equal(nodes(v).find(n => n.type === 'input'), undefined)
  assert.ok(button(v, 'Tentar novamente'))
})

for (const perfil of ['admin', 'participante', 'fornecedor', 'organizador']) test(`página ${perfil} oferece campos conforme o papel confirmado`, async () => {
  const r = runtime('PerfilProfissional', { acessarProfissional: async () => ({ ...identity, perfil }) })
  const p = { token: 'token-a', id: 7 }
  r.render(p)
  await new Promise(resolve => setTimeout(resolve, 0))
  const secoes = nodes(r.render(p)).filter(n => typeof n.type === 'function' && n.type.name === 'SecaoProfissional')
  assert.equal(secoes.length, ['admin', 'participante'].includes(perfil) ? 1 : 2)
  assert.equal(secoes[0].props.campos.length, 5)
  if (secoes.length === 2) {
    assert.equal(secoes[1].props.campos.some(([k]) => k === 'categorias_servicos'), perfil === 'fornecedor')
    if (perfil === 'organizador') assert.equal(secoes[1].props.campos.find(([k]) => k === 'nome_comercial')[1], 'Nome da organização')
  }
})
