export function Menu({ pagina, setPagina, aoCriarNovoEvento, aoSair }) {
  return (
    <aside className="menu" aria-label="Navegação do organizador">
      <div className="logo">
        ▣ <span>TrocaTicket</span>
      </div>
      <button
        className="novo"
        onClick={() => {
          aoCriarNovoEvento()
          setPagina('criar')
        }}
      >
        + Novo evento
      </button>
      <nav aria-label="Seções do organizador">
        <button
          aria-current={pagina === 'eventos' ? 'page' : undefined}
          className={pagina === 'eventos' ? 'ativo' : ''}
          onClick={() => setPagina('eventos')}
        >
          ▦ Meus Eventos
        </button>
        <button
          aria-current={pagina === 'criar' ? 'page' : undefined}
          className={pagina === 'criar' ? 'ativo' : ''}
          onClick={() => setPagina('criar')}
        >
          ➕ Criar Evento
        </button>
        <button
          aria-current={pagina === 'custos' ? 'page' : undefined}
          className={pagina === 'custos' ? 'ativo' : ''}
          onClick={() => setPagina('custos')}
        >
          📊 Custos
        </button>
        <button
          aria-current={pagina === 'cotacao' ? 'page' : undefined}
          className={pagina === 'cotacao' ? 'ativo' : ''}
          onClick={() => setPagina('cotacao')}
        >
          ▣ Cotações & Concorrência
        </button>
        <button
          aria-current={pagina === 'ticket' ? 'page' : undefined}
          className={pagina === 'ticket' ? 'ativo' : ''}
          onClick={() => setPagina('ticket')}
        >
          ◇ Propostas & Ticket
        </button>
      </nav>
      <div className="menuRodape">
        <button
          aria-current={pagina === 'perfil' ? 'page' : undefined}
          className={pagina === 'perfil' ? 'ativo' : ''}
          onClick={() => setPagina('perfil')}
        >
          ◉ Perfil
        </button>
        <button onClick={aoSair}>↪ Sair</button>
      </div>
    </aside>
  )
}
