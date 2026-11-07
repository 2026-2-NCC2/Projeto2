import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { transformSync } from 'rolldown/utils'
export const jsx = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(v => v !== null && v !== undefined && v !== false) })
export const nodes = v => v && typeof v === 'object' ? [v, ...(v.children || []).flatMap(nodes)] : []
export const text = v => v && typeof v === 'object' ? (v.children || []).map(text).join(' ') : String(v ?? '')
export function carregarAdmin(file, nomes, env = {}) {
  const source = readFileSync(new URL('../../src/' + file, import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replaceAll('export ', '')
  const compiled = transformSync(file, source, { jsx: { runtime: 'classic', pragma: 'jsx', pragmaFrag: 'Fragment' } })
  if (compiled.errors.length) throw Error('Falha ao compilar fixture JSX')
  return vm.runInNewContext(compiled.code + ';({' + nomes.join(',') + '})', { jsx, Fragment: 'fragment', Marca: 'marca', ...env })
}
export function hooksAdmin(env = {}) {
  const values = [], effects = [], deps = []; let cursor = 0, ec = 0
  return { env: { ...env,
    useState(initial) { const i = cursor++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial; return [values[i], v => { values[i] = typeof v === 'function' ? v(values[i]) : v }] },
    useRef(initial) { const i = cursor++; if (!(i in values)) values[i] = { current: initial }; return values[i] },
    useCallback(fn) { return fn },
    useEffect(fn, d) { const i = ec++; if (!deps[i] || d.some((v, j) => v !== deps[i][j])) { effects[i]?.(); deps[i] = d; effects[i] = fn() } },
  }, render(fn, props) { cursor = 0; ec = 0; return fn(props) }, close() { effects.forEach(f => f?.()) } }
}
