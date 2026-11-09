// History API simulada; não abre navegador nem altera URLs reais.
export function historicoFixture({ externo = true, indisponivel = false, hash = '' } = {}) {
  const ouvintes = new Set(), escritas = []
  const entradas = externo ? [{ state: null, externo: true, hash: '' }, { state: null, hash }] : [{ state: null, hash }]
  let indice = entradas.length - 1, saiu = false
  const copiar = v => JSON.parse(JSON.stringify(v))
  const window = {
    location: { get hash() { return entradas[indice].hash } },
    history: {
      get state() { return entradas[indice].state },
      pushState(state, titulo, url) {
        if (indisponivel) throw Error('History API indisponível')
        if (url !== undefined && !url.startsWith('#/')) throw Error('Somente fragmentos internos')
        entradas.splice(indice + 1); entradas.push({ state: copiar(state), hash: url ?? entradas[indice].hash }); indice++
        escritas.push('push')
      },
      replaceState(state, titulo, url) {
        if (indisponivel) throw Error('History API indisponível')
        if (url !== undefined && !url.startsWith('#/')) throw Error('Somente fragmentos internos')
        entradas[indice].state = copiar(state); entradas[indice].hash = url ?? entradas[indice].hash; escritas.push('replace')
      },
      go(delta) { mover(delta) },
    },
    addEventListener(tipo, fn) { if (tipo !== 'popstate') throw Error('Evento inesperado'); ouvintes.add(fn) },
    removeEventListener(tipo, fn) { if (tipo !== 'popstate') throw Error('Evento inesperado'); ouvintes.delete(fn) },
  }
  function mover(delta) {
    if (indice + delta < 0 || indice + delta >= entradas.length) return
    indice += delta
    if (entradas[indice].externo) { saiu = true; return }
    ouvintes.forEach(fn => fn({ state: window.history.state }))
  }
  return { window, entradas, escritas, back: () => mover(-1), forward: () => mover(1),
    emitir: (state, hash) => { if (hash !== undefined) entradas[indice].hash = hash; ouvintes.forEach(fn => fn({ state })) }, ouvintes: () => ouvintes.size, saiu: () => saiu }
}
