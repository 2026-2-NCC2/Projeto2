import { carregarAdmin, jsx } from './adminRuntime.js'

// Fixtures antigas removem imports. Executamos aqui as primitivas reais para
// manter as assercoes existentes sobre controles nativos e acessibilidade.
let id = 0
export const primitivasFixture = { ...carregarAdmin('components/ui/Primitivas.jsx',
  ['Botao', 'Campo', 'Badge', 'Alerta', 'Skeleton', 'EstadoVazio'], { useId: () => `fixture-${++id}` }), ...carregarAdmin('components/ui/Marca.jsx', ['Marca']) }
const componentes = new Set(Object.values(primitivasFixture))
export function jsxPrimitivas(type, props, ...children) {
  return componentes.has(type)
    ? type({ ...props, children: children.flat(Infinity) })
    : jsx(type, props, ...children)
}
