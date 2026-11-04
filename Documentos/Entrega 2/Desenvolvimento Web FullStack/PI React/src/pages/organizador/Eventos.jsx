import { Icone } from '../../components/ui/Icone.jsx'
import { MidiaEvento } from '../../components/eventos/MidiaEvento.jsx'
import { useState, useMemo } from 'react'

export function Eventos({eventos, carregando = false, erro = '', aoTentarNovamente, setPagina, aoSelecionarEvento, aoCriarNovoEvento, aoExcluirEvento, aoPublicarEvento}) {
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
            Meus eventos{' '}
            <small>
              {carregando || erro ? 'Consulta pendente' : `${eventos.length} eventos cadastrados (${totalAtivos} ativos)`}
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
          <Icone nome="adicionar" /> Novo evento
        </button>
      </div>
      {!carregando && !erro && <div className="filtros">
        <input
          aria-label="Filtrar eventos por nome"
          placeholder="Filtrar por nome do evento..."
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
      </div>}
      <div className="listaEventos">
        {carregando ? <p role="status">Carregando eventos...</p> : erro ? (
          <div role="alert"><p>{erro}</p><button type="button" onClick={aoTentarNovamente}>Tentar novamente</button></div>
        ) : eventosFiltrados.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            {eventos.length === 0 ? 'Você ainda não possui eventos cadastrados.' : 'Nenhum evento encontrado para o filtro aplicado.'}
          </div>
        ) : (
          eventosFiltrados.map((evento) => (
            <div className="evento" key={evento.id}>
              <div className="eventoIdentidade" aria-hidden="true"><Icone nome="eventos" tamanho={26} /></div>
              <div className="eventoInfo">
                <h2>{evento.nome}</h2>
                <span className={evento.status === 'Ativo' ? 'status' : 'status statusPlanejamento'}>{evento.status}</span>
                <p className="eventoMetadados">
                  <span><Icone nome="eventos" tamanho={16} /> {evento.data}</span><span><Icone nome="local" tamanho={16} /> {evento.local?.trim() || 'Local não cadastrado'}</span>
                </p>
                <MidiaEvento eventoId={evento.id} editar />
              </div>
              <div className="numero">
                <small>PREVISTOS</small>
                <strong>{evento.publico ?? 'Público não cadastrado'}</strong>
              </div>
              <div className="numero">
                <small>COTAÇÃO</small>
                <strong>{evento.cotacao ?? 'Não informada'}</strong>
              </div>
              <div className="numero">
                <small>TICKET SUGERIDO</small>
                <strong>{evento.ticket ?? 'Não informado'}</strong>
              </div>
              <button
                type="button"
                onClick={() => aoExcluirEvento(evento)}
                className="secundario acaoExcluir"
              >
                Excluir
              </button>
              {evento.status === 'Em planejamento' && (
                <button
                  type="button"
                  onClick={() => aoPublicarEvento(evento)}
                  className="secundario acaoPublicar"
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
