import { useEffect, useState } from 'react'
import { apiUrl } from '../services/api.js'

export function usePerfil() {
  const token = sessionStorage.getItem('token')
  const [estado, setEstado] = useState({ token: null, perfil: null, erro: '', erroStatus: null })
  const [tentativa, setTentativa] = useState(0)
  useEffect(() => {
    let ativo = true
    let atualizado = false
    const controller = new AbortController()
    function sincronizar(evento) {
      if (!ativo || evento.detail?.token !== token || sessionStorage.getItem('token') !== token) return
      atualizado = true
      setEstado({ token, perfil: evento.detail.perfil, erro: '', erroStatus: null })
    }
    if (typeof window !== 'undefined') window.addEventListener('trocaticket:perfil-atualizado', sincronizar)
    async function carregar() {
      try {
        if (!token) throw Object.assign(new Error('Sessão expirada. Entre novamente.'), { status: 401 })
        let resposta
        try {
          resposta = await fetch(apiUrl('/perfil'), {
            headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
          })
        } catch (falha) {
          if (controller.signal.aborted) return
          throw new Error('Não foi possível conectar. Tente carregar o perfil novamente.', { cause: falha })
        }
        if (!resposta.ok) throw Object.assign(new Error(resposta.status === 401 ? 'Sessão expirada. Entre novamente.' :
          resposta.status === 403 ? 'Você não tem permissão para consultar este perfil.' : 'Não foi possível carregar sua identidade.'), { status: resposta.status })
        let perfil
        try { perfil = await resposta.json() }
        catch { throw new Error('Resposta de perfil inválida.') }
        if (!perfil || typeof perfil.nome !== 'string' || typeof perfil.email !== 'string') {
          throw new Error('Resposta de perfil inválida.')
        }
        if (ativo && !atualizado && sessionStorage.getItem('token') === token) setEstado({ token, perfil, erro: '', erroStatus: null })
      } catch (erro) {
        if (ativo && !atualizado && sessionStorage.getItem('token') === token) setEstado({ token, perfil: null, erro: erro.message, erroStatus: erro.status ?? null })
      }
    }
    carregar()
    return () => {
      ativo = false; controller.abort()
      if (typeof window !== 'undefined') window.removeEventListener('trocaticket:perfil-atualizado', sincronizar)
    }
  }, [token, tentativa])
  function recarregar() {
    setEstado({ token: null, perfil: null, erro: '', erroStatus: null })
    setTentativa(valor => valor + 1)
  }
  return { ...(estado.token === token ? estado : { perfil: null, erro: '', erroStatus: null }), recarregar }
}
