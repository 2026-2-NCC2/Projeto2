import { useEffect } from 'react'

// Apenas persiste a pagina; restauracao e transicoes protegidas ficam no App.
export function useNavegacao(pagina) {
  useEffect(() => {
    if (pagina !== 'login') {
      sessionStorage.setItem('paginaAtual', pagina)
    }
  }, [pagina])
}
