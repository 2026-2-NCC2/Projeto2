import { Cabecalho } from './Cabecalho.jsx'
import { Menu } from './Menu.jsx'
import { NavegacaoRecolhivel } from './NavegacaoRecolhivel.jsx'

export function Layout({ children: filhos, pagina, setPagina, aoCriarNovoEvento, aoSair }) {
  return (
    <>
      <Cabecalho />
      <div className="layout">
        <NavegacaoRecolhivel id="menu-organizador" rotulo="Menu do organizador">
          <Menu
            pagina={pagina}
            setPagina={setPagina}
            aoCriarNovoEvento={aoCriarNovoEvento}
            aoSair={aoSair}
          />
        </NavegacaoRecolhivel>
        <main className="conteudo">{filhos}</main>
      </div>
    </>
  )
}
