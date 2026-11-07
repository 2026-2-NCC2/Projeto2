import { Marca } from '../ui/Marca.jsx'
import { Icone } from '../ui/Icone.jsx'
export function Menu({ pagina, setPagina, aoCriarNovoEvento, aoSair }) {
  return (
    <aside className="menu" aria-label="Navegação do organizador">
      <div className="logo">
        <Marca compacto />
      </div>
      <button
        className="novo"
        onClick={() => {
          aoCriarNovoEvento()
          setPagina('criar')
        }}
      >
        <Icone nome="adicionar" /> Novo evento
      </button>
      <nav aria-label="Seções do organizador">
        <button
          aria-current={pagina === 'eventos' ? 'page' : undefined}
          className={pagina === 'eventos' ? 'ativo' : ''}
          onClick={() => setPagina('eventos')}
        >
          <Icone nome="eventos" /> Meus eventos
        </button>
        <button
          aria-current={pagina === 'criar' ? 'page' : undefined}
          className={pagina === 'criar' ? 'ativo' : ''}
          onClick={() => setPagina('criar')}
        >
          <Icone nome="adicionar" /> Criar evento
        </button>
        <button
          aria-current={pagina === 'custos' ? 'page' : undefined}
          className={pagina === 'custos' ? 'ativo' : ''}
          onClick={() => setPagina('custos')}
        >
          <Icone nome="custos" /> Custos
        </button>
        <button
          aria-current={pagina === 'cotacao' ? 'page' : undefined}
          className={pagina === 'cotacao' ? 'ativo' : ''}
          onClick={() => setPagina('cotacao')}
        >
          <Icone nome="documento" /> Cotações e concorrência
        </button>
        <button
          aria-current={pagina === 'ticket' ? 'page' : undefined}
          className={pagina === 'ticket' ? 'ativo' : ''}
          onClick={() => setPagina('ticket')}
        >
          <Icone nome="ticket" /> Propostas e ticket
        </button>
      </nav>
      <div className="menuRodape">
        <button
          aria-current={pagina === 'perfil' ? 'page' : undefined}
          className={pagina === 'perfil' ? 'ativo' : ''}
          onClick={() => setPagina('perfil')}
        >
          <Icone nome="perfil" /> Perfil
        </button>
        <button onClick={aoSair}><Icone nome="sair" /> Sair</button>
      </div>
    </aside>
  )
}
