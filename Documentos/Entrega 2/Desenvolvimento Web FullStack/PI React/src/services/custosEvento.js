import { custosDaApiParaInterface, custosDaInterfaceParaPut, custosSemanticamenteIguais } from '../utils/custos.js'

function falha(mensagem, resultadoIncerto = false) {
  return Object.assign(new Error(mensagem), { resultadoIncerto })
}

export function criarClienteCustos(construirUrl, { executarFetch = (...args) => fetch(...args), tempoMs = 10000 } = {}) {
  const destino = construirUrl('/eventos/1/custos')
  const base = ['/api', 'http://localhost:3001'].find(url => destino === `${url}/eventos/1/custos`)
  const disponivel = base !== undefined

  async function requisitar(metodo, eventoId, token, itens) {
    if (!disponivel) throw falha('Destino da API de custos não permitido.')
    if (!Number.isSafeInteger(eventoId) || eventoId <= 0) throw falha('Salve o evento antes de consultar ou salvar seus custos.')
    if (typeof token !== 'string' || !token.trim()) throw falha('Sessão ausente. Faça login novamente.')
    const url = construirUrl(`/eventos/${eventoId}/custos`)
    if (url !== `${base}/eventos/${eventoId}/custos`) throw falha('Destino da API de custos não permitido.')
    let body
    if (metodo === 'PUT') {
      try { body = JSON.stringify(custosDaInterfaceParaPut(itens)) }
      catch { throw falha('A lista contém custos inválidos. Corrija os itens antes de salvar.') }
    }
    const controller = new AbortController()
    let timer
    const incerto = metodo === 'PUT'
    const mensagem = incerto
      ? 'Resultado do salvamento incerto. O rascunho foi mantido. Consulte o servidor antes de tentar salvar novamente.'
      : 'Não foi possível carregar os custos. O rascunho foi mantido. Tente consultar novamente.'
    try {
      return await Promise.race([
        (async () => {
          const resposta = await executarFetch(url, {
            method: metodo, signal: controller.signal, redirect: 'error', credentials: 'omit',
            headers: { Authorization: `Bearer ${token}`, ...(incerto ? { 'Content-Type': 'application/json' } : {}) },
            ...(incerto ? { body } : {}),
          })
          if (!resposta.ok) throw falha(mensagem, incerto)
          const servidor = custosDaApiParaInterface(await resposta.json(), eventoId)
          if (incerto && !custosSemanticamenteIguais(itens, servidor)) throw falha(mensagem, true)
          return servidor
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(falha(mensagem, incerto)) }, tempoMs)
        }),
      ])
    } catch { throw falha(mensagem, incerto) }
    finally { clearTimeout(timer) }
  }

  return Object.freeze({ disponivel,
    carregar: (id, token) => requisitar('GET', id, token),
    salvar: (id, itens, token) => requisitar('PUT', id, token, itens),
  })
}
