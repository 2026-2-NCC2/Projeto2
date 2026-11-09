import { Menu } from './Menu.jsx'
import { NavegacaoRecolhivel } from './NavegacaoRecolhivel.jsx'
import { Marca } from '../ui/Marca.jsx'
import { IdentidadeConta } from './IdentidadeConta.jsx'
import { useRef } from 'react'
import './OrganizadorLayout.css'

export function Layout({ children: filhos, pagina, setPagina, aoCriarNovoEvento, aoSair }) {
  const conteudoRef = useRef(null)
  const titulos = { eventos: 'Meus eventos', criar: 'Criar evento', custos: 'Custos',
    cotacao: 'Cotações e concorrência', ticket: 'Propostas e ticket', perfil: 'Meu perfil' }
  return (
    <div className="orgLayout">
      <a className="orgPular" href="#org-conteudo" onClick={evento => {
        evento.preventDefault()
        conteudoRef.current?.focus()
      }}>Ir para o conteúdo</a>
      <div className="orgSidebar">
        <div className="orgMarca"><Marca /><small>PORTAL DO ORGANIZADOR</small></div>
        <NavegacaoRecolhivel id="menu-organizador" rotulo="Menu do organizador" className="orgNavegacao">
          <Menu
            pagina={pagina}
            setPagina={setPagina}
            aoCriarNovoEvento={aoCriarNovoEvento}
            aoSair={aoSair}
          />
        </NavegacaoRecolhivel>
      </div>
      <header className="orgCabecalho">
        <div className="orgContexto"><p className="orgSobretitulo">Portal do organizador</p><p className="orgTitulo" id="org-titulo-secao">{titulos[pagina] || 'Organizador'}</p></div>
        <div className="orgConta"><IdentidadeConta /></div>
      </header>
      <main className="orgConteudo" id="org-conteudo" ref={conteudoRef} tabIndex={-1} aria-labelledby="org-titulo-secao">{filhos}</main>
    </div>
  )
}
