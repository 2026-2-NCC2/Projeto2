import { useEffect, useRef, useState } from 'react'
import { Botao } from '../../components/ui/Primitivas.jsx'
import { LandingPage } from './LandingPage.jsx'
import './EntradaPublica.css'

// Somente navegação de apresentação. A sessão continua sendo validada pelo App.
export function EntradaPublica({ children, iniciarNoLogin = false, navegacao }) {
  const [loginLocal, setLoginAberto] = useState(iniciarNoLogin)
  const loginAberto = navegacao ? navegacao.estado.login : loginLocal
  const conteudo = useRef(null)
  const telaAnterior = useRef(loginAberto)
  useEffect(() => {
    if (telaAnterior.current === loginAberto) return
    telaAnterior.current = loginAberto
    conteudo.current?.querySelector(loginAberto ? '#login-email' : '[data-acesso-sistema]')?.focus()
  }, [loginAberto])
  function navegar(login) {
    if (navegacao) navegacao.mudar({ login })
    else setLoginAberto(login)
  }
  return <div className="entradaPublica" ref={conteudo}>
    {loginAberto ? <>
      <nav className="entradaPublicaRetorno" aria-label="Retorno à apresentação">
        <Botao variante="discreto" onClick={() => navegar(false)}>Voltar à apresentação</Botao>
      </nav>
      {children}
    </> : <LandingPage aoAcessar={() => navegar(true)} />}
  </div>
}
