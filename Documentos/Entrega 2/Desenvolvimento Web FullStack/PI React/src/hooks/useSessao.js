import { useCallback } from 'react'

// Apenas coordena o logout; estados e invalidacao de respostas ficam no App.
export function useSessao({ confirmarDescarteDaSessao, limparRascunhosDaSessao, paginaAtualRef, definirPagina, invalidarAutenticacao }) {
  const aoSair = useCallback(() => {
    if (!confirmarDescarteDaSessao()) return

    sessionStorage.removeItem('token')
    sessionStorage.removeItem('perfil')
    sessionStorage.removeItem('paginaAtual')
    invalidarAutenticacao?.()
    limparRascunhosDaSessao()
    paginaAtualRef.current = 'login'
    definirPagina('login')
  }, [confirmarDescarteDaSessao, limparRascunhosDaSessao, paginaAtualRef, definirPagina, invalidarAutenticacao])

  return { aoSair }
}
