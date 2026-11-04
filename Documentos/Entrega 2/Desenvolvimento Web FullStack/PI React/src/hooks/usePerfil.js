import { useEffect, useState } from 'react'
import { apiUrl } from '../services/api.js'

export function usePerfil() {
  const token = sessionStorage.getItem('token')
  const [estado, setEstado] = useState({ token: null, perfil: null, erro: '' })
  const [tentativa, setTentativa] = useState(0)
  useEffect(() => {
    let ativo = true
    let atualizado = false
    const controller = new AbortController()
    function sincronizar(evento) {
      if (!ativo || evento.detail?.token !== token || sessionStorage.getItem('token') !== token) return
      atualizado = true
      setEstado({ token, perfil: evento.detail.perfil, erro: '' })
    }
    if (typeof window !== 'undefined') window.addEventListener('trocaticket:perfil-atualizado', sincronizar)
    async function carregar() {
      try {
        if (!token) throw new Error('Faça login novamente.')
        const resposta = await fetch(apiUrl('/perfil'), {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
        })
        if (!resposta.ok) throw new Error('Não foi possível carregar sua identidade.')
        const perfil = await resposta.json()
        if (!perfil || typeof perfil.nome !== 'string' || typeof perfil.email !== 'string') {
          throw new Error('Resposta de perfil inválida.')
        }
        if (ativo && !atualizado) setEstado({ token, perfil, erro: '' })
      } catch (erro) {
        if (ativo && !atualizado) setEstado({ token, perfil: null, erro: erro.message })
      }
    }
    carregar()
    return () => {
      ativo = false; controller.abort()
      if (typeof window !== 'undefined') window.removeEventListener('trocaticket:perfil-atualizado', sincronizar)
    }
  }, [token, tentativa])
  function recarregar() {
    setEstado({ token: null, perfil: null, erro: '' })
    setTentativa(valor => valor + 1)
  }
  return { ...(estado.token === token ? estado : { perfil: null, erro: '' }), recarregar }
}
