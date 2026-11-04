import { Icone } from '../ui/Icone.jsx'
import { useRef, useState } from 'react'

// Navegação no fluxo da página: sem overlay ou bloqueio de foco.
export function NavegacaoRecolhivel({ id, rotulo, className = '', children }) {
  const [aberto, setAberto] = useState(false)
  const botaoRef = useRef(null)

  function fechar() {
    setAberto(false)
    if (botaoRef.current?.getClientRects().length) botaoRef.current.focus()
  }

  return (
    <div className={`navegacaoRecolhivel ${className}`} onKeyDown={evento => {
      if (evento.key === 'Escape' && aberto) {
        evento.preventDefault()
        evento.stopPropagation()
        fechar()
      }
    }}>
      <button
        type="button"
        className="alternarNavegacao"
        ref={botaoRef}
        aria-expanded={aberto}
        aria-controls={id}
        aria-label={rotulo}
        onClick={() => setAberto(atual => !atual)}
      >
        <Icone nome="menu" /> Menu
      </button>
      <div id={id} className="painelNavegacao" data-aberto={aberto}
        onClick={evento => {
          if (aberto && evento.target.closest('button, a')) fechar()
        }}>
        {children}
      </div>
    </div>
  )
}
