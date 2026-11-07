import { Skeleton, Botao, Badge, Alerta, EstadoVazio } from '../../components/ui/Primitivas.jsx'
import './Organizador.css'
import { VagasEvento } from '../../components/eventos/VagasEvento.jsx'
import { Icone } from '../../components/ui/Icone.jsx'
import { MidiaEvento, CapaEvento } from '../../components/eventos/MidiaEvento.jsx'
import { useState, useMemo } from 'react'

export function Eventos({eventos, carregando = false, erro = '', aoTentarNovamente, setPagina, aoSelecionarEvento, aoCriarNovoEvento, aoMudarEstado, aoPublicarEvento, capacidades = {}}) {
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
    <div className="organizadorPagina">
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
        <Botao
          className="principal pequeno"
          disabled={!capacidades.criar}
          onClick={() => {
            aoCriarNovoEvento()
            setPagina('criar')
          }}
        >
          <Icone nome="adicionar" /> Novo evento
        </Botao>
      </div>
      {!capacidades.criar && <Alerta variante="informacao">Novos cadastros, edições e publicações estão temporariamente indisponíveis. O histórico continua disponível para consulta.</Alerta>}
      <p>Eventos publicados permitem somente ajustes na descrição. Cancelar ou encerrar preserva custos, cotações, propostas e inscrições.</p>
      {!carregando && !erro && <div className="filtros">
        <input
          aria-label="Filtrar eventos por nome"
          placeholder="Filtrar por nome do evento..."
          value={termoBusca}
          onChange={(eventoDisparado) => setTermoBusca(eventoDisparado.target.value)}
        />
        <Botao
          className={filtroStatus === 'Todos' ? 'ativo' : ''}
          onClick={() => setFiltroStatus('Todos')}
        >
          Todos ({eventos.length})
        </Botao>
        <Botao
          className={filtroStatus === 'Ativo' ? 'ativo' : ''}
          onClick={() => setFiltroStatus('Ativo')}
        >
          Ativos ({totalAtivos})
        </Botao>
        <Botao
          className={filtroStatus === 'Em planejamento' ? 'ativo' : ''}
          onClick={() => setFiltroStatus('Em planejamento')}
        >
          Em planejamento ({totalPlanejamento})
        </Botao>
        {['Cancelado','Encerrado'].map(status=><Botao key={status} className={filtroStatus===status?'ativo':''} onClick={()=>setFiltroStatus(status)}>{status} ({eventos.filter(e=>e.status===status).length})</Botao>)}
      </div>}
      <div className="listaEventos">
        {carregando ? <Skeleton tipo="tabela" linhas={3} rotulo="Carregando eventos..." /> : erro ? (
          <Alerta variante="erro"><p>{erro}</p><Botao type="button" onClick={aoTentarNovamente}>Tentar novamente</Botao></Alerta>
        ) : eventosFiltrados.length === 0 ? (
          <EstadoVazio tipo={eventos.length === 0 ? "sem-dados" : "sem-resultados"} titulo={eventos.length === 0 ? 'Você ainda não possui eventos cadastrados.' : 'Nenhum evento encontrado para o filtro aplicado.'} />
        ) : (
          eventosFiltrados.map((evento) => (
            <div className="evento" key={evento.id}>
              <CapaEvento eventoId={evento.id}/>
              <div className="eventoInfo">
                <h2>{evento.nome}</h2>
                <Badge variante={({Ativo: 'sucesso', Cancelado: 'erro', Encerrado: 'neutro', 'Em planejamento': 'neutro'})[evento.status] || 'neutro'}>{evento.status}</Badge>
                <p className="eventoMetadados">
                  <span><Icone nome="eventos" tamanho={16} /> {evento.data}</span><span><Icone nome="local" tamanho={16} /> {evento.local?.trim() || 'Local não cadastrado'}</span>
                </p>
                <MidiaEvento eventoId={evento.id} estado={evento.status} editar />
              </div>
              <div className="numero">
                <small>PREVISTOS</small>
                <strong>{evento.publico ?? 'Público não cadastrado'}</strong><VagasEvento evento={evento} />
              </div>
              <div className="numero">
                <small>COTAÇÃO</small>
                <strong>{evento.cotacao ?? 'Não informada'}</strong>
              </div>
              <div className="numero">
                <small>TICKET SUGERIDO</small>
                <strong>{evento.ticket ?? 'Não informado'}</strong>
              </div>
              {['Em planejamento','Ativo'].includes(evento.status) && <Botao variante="destrutivo" type="button" className="secundario" disabled={!capacidades.cancelar} onClick={()=>aoMudarEstado(evento,'cancelar')}>Cancelar evento</Botao>}
              {evento.status==='Ativo' && <Botao variante="secundario" type="button" className="secundario" disabled={!capacidades.encerrar} title="Disponível após o horário de início" onClick={()=>aoMudarEstado(evento,'encerrar')}>Encerrar evento</Botao>}
              {evento.status === 'Em planejamento' && (
                <Botao
                  type="button"
                  onClick={() => aoPublicarEvento(evento)}
                  className="secundario acaoPublicar"
                  disabled={!capacidades.publicar}
                >
                  Publicar
                </Botao>
              )}
              <Botao
                className="seta"
                title="Acessar cotações e custos deste evento"
                onClick={() => {
                  aoSelecionarEvento(evento)
                  setPagina('custos')
                }}
              >
                ›
              </Botao>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
