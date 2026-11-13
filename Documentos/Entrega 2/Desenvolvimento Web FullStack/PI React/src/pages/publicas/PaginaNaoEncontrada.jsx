import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { Marca } from '../../components/ui/Marca.jsx'
import './PaginaNaoEncontrada.css'

export function PaginaNaoEncontrada({ destino = '/inicio', acessoNegado = false, reiniciarDocumento = false }) {
  const titulo = useRef(null)
  const texto = acessoNegado ? 'Acesso não autorizado' : 'Página não encontrada'
  useEffect(() => {
    const anterior = document.title
    document.title = `${texto} | TrocaTicket`
    titulo.current?.focus()
    return () => { document.title = anterior }
  }, [texto])
  return <main className="ttPaginaStatus">
    <Marca />
    <section className="ttPaginaStatusCartao" aria-labelledby="pagina-status-titulo">
    <p className="ttPaginaStatusContexto">CONTINUE SUA EXPERIÊNCIA</p>
    <p className="ttPaginaStatusCodigo">{acessoNegado ? '403' : '404'}</p>
    <h1 id="pagina-status-titulo" ref={titulo} tabIndex={-1}>{texto}</h1>
    <p>{acessoNegado ? 'Sua conta não possui acesso a esta seção.' : 'Não encontramos este endereço. Você pode continuar pelo início ou voltar ao seu portal.'}</p>
    <nav aria-label="Continuar navegação">
      {reiniciarDocumento ? <a href="/#/inicio">Ir para o início</a> : <Link to="/inicio">Ir para o início</Link>}
      {destino !== '/inicio' && (reiniciarDocumento ? <a href={`/#${destino}`}>Ir para meu portal</a> : <Link to={destino}>Ir para meu portal</Link>)}
    </nav>
    </section>
  </main>
}
