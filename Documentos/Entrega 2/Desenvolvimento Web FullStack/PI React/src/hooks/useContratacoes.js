import { useEffect, useState } from 'react'
import { capacidadesContratacoes, listarContratacoes } from '../services/contratacoes.js'

export function useContratacoes(evento) {
  const token = sessionStorage.getItem('token')
  const [tentativa, tentar] = useState(0)
  const [estado, guardar] = useState({ token: null, evento: null, carregando: true, disponivel: false, dados: [], erro: null })
  useEffect(() => {
    let atual = true
    const controle = new AbortController()
    guardar({ token, evento, carregando: true, disponivel: false, dados: [], erro: null })
    ;(async () => {
      try {
        const caps = await capacidadesContratacoes(controle.signal)
        if (typeof caps.disponivel !== 'boolean') throw Error('Capacidade de contratações não confirmada.')
        const dados = caps.disponivel ? await listarContratacoes(evento, controle.signal) : []
        if (atual && sessionStorage.getItem('token') === token) guardar({ token, evento, carregando: false, disponivel: caps.disponivel, dados, erro: null })
      } catch (erro) {
        if (atual && sessionStorage.getItem('token') === token) guardar({ token, evento, carregando: false, disponivel: false, dados: [], erro })
      }
    })()
    return () => { atual = false; controle.abort() }
  }, [token, evento, tentativa])
  return { ...(estado.token === token && estado.evento === evento ? estado : { carregando: true, disponivel: false, dados: [], erro: null }), recarregar: () => tentar(v => v + 1) }
}
