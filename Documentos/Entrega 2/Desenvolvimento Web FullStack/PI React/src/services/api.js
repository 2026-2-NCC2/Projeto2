const BASES_API = Object.freeze({
  principal: 'http://localhost:3001',
  isolado: '/api',
})

// A escolha do modo e explicita: uma configuracao invalida nunca usa o principal.
export function criarConstrutorUrlApi(modo = 'principal') {
  if (modo !== 'principal' && modo !== 'isolado') {
    throw new TypeError('Modo de API invalido.')
  }

  const base = BASES_API[modo]

  return function construirUrlApi(caminho) {
    if (typeof caminho !== 'string' || !caminho.startsWith('/') ||
        caminho.startsWith('//') || /[\s\p{Cc}\\#]/u.test(caminho) ||
        /%(?![\da-f]{2})/iu.test(caminho)) {
      throw new TypeError('Caminho de API invalido.')
    }

    // Evita normalizacao de segmentos que poderia escapar do prefixo /api.
    let rota
    try {
      rota = decodeURIComponent(caminho.split('?')[0])
    } catch {
      throw new TypeError('Caminho de API invalido.')
    }

    if (/[\s\p{Cc}\\?#]/u.test(rota) || rota.includes('//') ||
        rota.split('/').some(segmento => segmento === '.' || segmento === '..')) {
      throw new TypeError('Caminho de API invalido.')
    }

    return `${base}${caminho}`
  }
}

function selecionarModoApi(ambiente) {
  if (!ambiente || typeof ambiente !== 'object') {
    throw new TypeError('Configuracao de execucao da API ausente.')
  }

  const { MODE: modoVite, TROCATICKET_API_MODO: modoApi } = ambiente
  if (modoVite === 'isolado' && modoApi === 'isolado') return 'isolado'
  if ((modoVite === 'development' || modoVite === 'production') &&
      (modoApi === undefined || modoApi === 'principal')) return 'principal'

  throw new TypeError('Configuracao de execucao da API invalida ou inconsistente.')
}

// MODE vem do Vite; o marcador isolado e definido somente pela config exclusiva.
export const apiUrl = criarConstrutorUrlApi(selecionarModoApi(import.meta.env))
