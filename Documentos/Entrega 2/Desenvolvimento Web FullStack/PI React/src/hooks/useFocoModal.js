import { useEffect, useRef } from 'react'

// Os setters de seleção são estáveis; rerenders não reiniciam o foco.
export function useFocoModal(selecionado, setSelecionado) {
  const modalRef = useRef(null)
  const aberto = Boolean(selecionado)

  useEffect(() => {
    if (!aberto || !modalRef.current) return
    const modal = modalRef.current
    const origem = document.activeElement
    modal.focus()

    function teclado(evento) {
      if (evento.key === 'Escape') {
        evento.preventDefault()
        evento.stopPropagation()
        setSelecionado(null)
        return
      }
      if (evento.key !== 'Tab') return

      const itens = Array.from(modal.querySelectorAll(
        'button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]',
      )).filter(item => item.tabIndex >= 0 && !item.matches(':disabled') &&
        !item.closest('[hidden], [inert]') && item.getClientRects().length > 0)
      const primeiro = itens[0]
      const ultimo = itens.at(-1)
      if (!primeiro) {
        evento.preventDefault()
        modal.focus()
      } else if (!itens.includes(document.activeElement) ||
        (!evento.shiftKey && document.activeElement === ultimo) ||
        (evento.shiftKey && document.activeElement === primeiro)) {
        evento.preventDefault()
        const destino = evento.shiftKey ? ultimo : primeiro
        destino.focus()
      }
    }

    document.addEventListener('keydown', teclado, true)
    return () => {
      document.removeEventListener('keydown', teclado, true)
      if (origem?.isConnected && origem.getClientRects().length > 0 && !origem.matches(':disabled')) origem.focus()
    }
  }, [aberto, setSelecionado])

  return modalRef
}
