import { Cabecalho } from './Cabecalho.jsx'
import { Menu } from './Menu.jsx'

export function Layout({ children: filhos, pagina, setPagina, aoCriarNovoEvento, aoSair }) {
  return (
    <>
      <Cabecalho />
      <div className="layout">
        <Menu
          pagina={pagina}
          setPagina={setPagina}
          aoCriarNovoEvento={aoCriarNovoEvento}
          aoSair={aoSair}
        />
        <main className="conteudo">{filhos}</main>
      </div>
    </>
  )
}
