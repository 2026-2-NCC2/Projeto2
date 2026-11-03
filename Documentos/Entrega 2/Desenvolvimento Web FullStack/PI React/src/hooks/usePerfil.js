import { useEffect, useState } from 'react'
import { apiUrl } from '../services/api.js'

export function usePerfil() {
  const token = sessionStorage.getItem('token')
  const [estado, setEstado] = useState({ token: null, perfil: null, erro: '' })
  useEffect(() => {
    let ativo = true
    const controller = new AbortController()
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
        if (ativo) setEstado({ token, perfil, erro: '' })
      } catch (erro) {
        if (ativo) setEstado({ token, perfil: null, erro: erro.message })
      }
    }
    carregar()
    return () => { ativo = false; controller.abort() }
  }, [token])
  return estado.token === token ? estado : { perfil: null, erro: '' }
}
