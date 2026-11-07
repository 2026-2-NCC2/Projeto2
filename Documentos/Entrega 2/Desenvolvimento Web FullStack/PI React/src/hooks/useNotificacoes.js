import { useCallback, useId, useRef, useState } from 'react'

// Estado local ao consumidor; nenhuma mensagem desaparece automaticamente.
export function useNotificacoes() {
  const prefixo = useId()
  const sequencia = useRef(0)
  const [notificacoes, setNotificacoes] = useState([])
  const notificar = useCallback(({ tipo = 'informacao', titulo, mensagem }) => {
    const id = `${prefixo}-${++sequencia.current}`
    const variante = ['sucesso', 'erro', 'aviso', 'informacao'].includes(tipo) ? tipo : 'informacao'
    setNotificacoes(atuais => [...atuais, { id, tipo: variante, titulo, mensagem }])
    return id
  }, [prefixo])
  const dispensar = useCallback(id => setNotificacoes(atuais => atuais.filter(item => item.id !== id)), [])
  return { notificacoes, notificar, dispensar }
}
