import { useState, useMemo } from 'react'

export function Eventos({eventos, setPagina, aoSelecionarEvento, aoCriarNovoEvento, aoExcluirEvento, aoPublicarEvento}) {
  const [termoBusca, setTermoBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('Todos')
  const eventosFiltrados = useMemo(() => {
    return eventos.filter((evento) => {
      const correspondeTexto = evento.nome
        .toLowerCase()
        .includes(termoBusca.toLowerCase())
      const correspondeStatus =
        filtroStatus === 'Todos' || evento.status === filtroStatus
      return correspondeTexto && correspondeStatus
    })
  }, [eventos, termoBusca, filtroStatus])
  const totalAtivos = eventos.filter((itemEvento) => itemEvento.status === 'Ativo').length
  const totalPlanejamento = eventos.filter(
    (itemEvento) => itemEvento.status === 'Em planejamento'
  ).length
  return (
    <div>
      <div className="tituloLinha">
        <div>
          <p className="trilhaNavegacao">
            TrocaTicket › Gestão Corporativa › Meus Eventos
          </p>
          <h1>
            Meus eventos:{' '}
            <small>
              {eventos.length} eventos cadastrados ({totalAtivos} ativos)
            </small>
          </h1>
          <p>
            Acompanhamento centralizado de cotações, orçamentos e preço sugerido.
          </p>
        </div>
        <button
          className="principal pequeno"
          onClick={() => {
            aoCriarNovoEvento()
            setPagina('criar')
          }}
        >
          + Novo Evento
        </button>
      </div>
      <div className="filtros">
        <input
          placeholder="🔍 Filtrar por nome do evento..."
          value={termoBusca}
          onChange={(eventoDisparado) => setTermoBusca(eventoDisparado.target.value)}
        />
        <button
          className={filtroStatus === 'Todos' ? 'ativo' : ''}
          onClick={() => setFiltroStatus('Todos')}
        >
          Todos ({eventos.length})
        </button>
        <button
          className={filtroStatus === 'Ativo' ? 'ativo' : ''}
          onClick={() => setFiltroStatus('Ativo')}
        >
          Ativos ({totalAtivos})
        </button>
        <button
          className={filtroStatus === 'Em planejamento' ? 'ativo' : ''}
          onClick={() => setFiltroStatus('Em planejamento')}
        >
          Em planejamento ({totalPlanejamento})
        </button>
      </div>
      <div className="listaEventos">
        {eventosFiltrados.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            Nenhum evento encontrado para o filtro aplicado.
          </div>
        ) : (
          eventosFiltrados.map((evento) => (
            <div className="evento" key={evento.id}>
              <div className="barra"></div>
              <div className="eventoInfo">
                <h2>{evento.nome}</h2>
                <span className="status">{evento.status}</span>
                <p>
                  ▣ {evento.data} &nbsp; ◉ {evento.local || 'São Paulo - SP'}
                </p>
              </div>
              <div className="numero">
                <small>PREVISTOS</small>
                <strong>{evento.publico}</strong>
              </div>
              <div className="numero">
                <small>COTAÇÃO</small>
                <strong>{evento.cotacao}</strong>
              </div>
              <div className="numero">
                <small>TICKET SUGERIDO</small>
                <strong>{evento.ticket}</strong>
              </div>
              <button
              type="button"
              onClick={() => aoExcluirEvento(evento)}
              style={{
              backgroundColor: '#dc3545',
              color: 'white',
             border: 'none',
             borderRadius: '6px',
              padding: '8px 12px',
              cursor: 'pointer'
              }}
            >
            Excluir
            </button>
              {evento.status === 'Em planejamento' && (
              <button
    type="button"
    onClick={() => aoPublicarEvento(evento)}
    style={{
      backgroundColor: '#198754',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      padding: '8px 12px',
      cursor: 'pointer'
    }}
  >
    Publicar
  </button>
              )}
              <button
                className="seta"
                title="Acessar cotações e custos deste evento"
                onClick={() => {
                  aoSelecionarEvento(evento)
                  setPagina('custos')
                }}
              >
                ›
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
