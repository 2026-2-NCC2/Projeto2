import { useEffect, useRef, useState } from 'react'
import { validarSessao } from '../services/autenticacao.js'

export function useAutenticacao(pagina) {
  const [sessao, setSessao] = useState(null)
  const [verificando, setVerificando] = useState(true)
  const [erro, setErro] = useState('')
  const geracao = useRef(0)
  const tokenAtual = sessionStorage.getItem('token')

  function invalidar() {
    geracao.current += 1
    for (const chave of ['token', 'perfil', 'paginaAtual']) sessionStorage.removeItem(chave)
    setSessao(null)
    setVerificando(false)
  }

  async function iniciarSessao(token, perfil) {
    const atual = ++geracao.current
    const validada = await validarSessao(token, perfil)
    if (atual !== geracao.current) return null
    sessionStorage.setItem('token', validada.token)
    sessionStorage.setItem('perfil', validada.perfil)
    setErro('')
    setSessao(validada)
    setVerificando(false)
    return validada.perfil
  }

  useEffect(() => {
    const controller = new AbortController()
    const atual = ++geracao.current
    const token = tokenAtual
    async function restaurar() {
      try {
        if (!token) return
        const validada = await validarSessao(token, sessionStorage.getItem('perfil'), controller.signal)
        if (atual === geracao.current) setSessao(validada)
      } catch (falha) {
        if (atual !== geracao.current) return
        for (const chave of ['token', 'perfil', 'paginaAtual']) sessionStorage.removeItem(chave)
        setErro(falha.message)
      } finally {
        if (atual === geracao.current) setVerificando(false)
      }
    }
    restaurar()
    return () => { geracao.current += 1; controller.abort() }
  }, [pagina, tokenAtual])

  // A troca ou remocao do token nunca reaproveita uma validacao anterior.
  // Revalidacoes de navegacao preservam o portal e seus rascunhos em memoria.
  // Somente uma sessao ja confirmada para o mesmo token pode permanecer visivel.
  const autenticada = sessao?.token === tokenAtual ? sessao : null
  return { sessao: autenticada, verificando: verificando || Boolean(tokenAtual && !autenticada), erro, iniciarSessao, invalidar }
}
