export function Menu({ pagina, setPagina, aoCriarNovoEvento, aoSair }) {
  return (
    <aside className="menu">
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
      <nav>
        <button
          className={pagina === 'eventos' ? 'ativo' : ''}
          onClick={() => setPagina('eventos')}
        >
          ▦ Meus Eventos
        </button>
        <button
          className={pagina === 'criar' ? 'ativo' : ''}
          onClick={() => setPagina('criar')}
        >
          ➕ Criar Evento
        </button>
        <button
          className={pagina === 'custos' ? 'ativo' : ''}
          onClick={() => setPagina('custos')}
        >
          📊 Custos
        </button>
        <button
          className={pagina === 'cotacao' ? 'ativo' : ''}
          onClick={() => setPagina('cotacao')}
        >
          ▣ Cotações & Concorrência
        </button>
        <button
          className={pagina === 'ticket' ? 'ativo' : ''}
          onClick={() => setPagina('ticket')}
        >
          ◇ Propostas & Ticket
        </button>
      </nav>
      <div className="menuRodape">
        <button
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
