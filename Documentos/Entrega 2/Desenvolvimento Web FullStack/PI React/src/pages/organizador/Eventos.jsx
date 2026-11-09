import { Skeleton, Botao, Badge, Alerta, EstadoVazio } from '../../components/ui/Primitivas.jsx'
import './Organizador.css'
import './OrganizadorDashboard.css'
import './OrganizadorGerenciamento.css'
import { VagasEvento } from '../../components/eventos/VagasEvento.jsx'
import { Icone } from '../../components/ui/Icone.jsx'
import { MidiaEvento, CapaEvento } from '../../components/eventos/MidiaEvento.jsx'
import { useState, useMemo } from 'react'

function dataDashboard(valor) {
  if (!valor) return 'Data não informada'
  // Datas civis não devem retroceder um dia por conversão de fuso.
  const data = new Date(/^\d{4}-\d{2}-\d{2}$/.test(valor) ? `${valor}T12:00:00-03:00` : valor)
  return Number.isNaN(data.getTime()) ? 'Data não informada' :
    data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

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
  const estados = ['Em planejamento', 'Ativo', 'Cancelado', 'Encerrado']
  const distribuicao = estados.map(estado => ({ estado, total: eventos.filter(evento => evento.status === estado).length }))
  const indicadores = [
    { titulo: 'Total de eventos', valor: eventos.length, descricao: 'Eventos da sua conta', icone: 'eventos' },
    { titulo: 'Eventos ativos', valor: totalAtivos, descricao: 'Publicados para participação', icone: 'acesso' },
    { titulo: 'Em planejamento', valor: totalPlanejamento, descricao: 'Eventos em preparação', icone: 'documento' },
    { titulo: 'Eventos encerrados', valor: distribuicao[3].total, descricao: 'Histórico preservado', icone: 'ticket' },
  ]
  const ativosResumo = eventos.filter(evento => evento.status === 'Ativo').slice(0, 3)
  return (
    <div className="organizadorPagina orgDashboard">
      <div className="tituloLinha orgDashboardIntroducao">
        <div>
          <p className="orgDashboardContexto">SEU ESPAÇO DE ORGANIZAÇÃO</p>
          <h1>Visão geral dos seus eventos</h1>
          <p>Acompanhe os estados dos eventos e continue a gestão em um só lugar.</p>
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
      {carregando ? <div className="orgDashboardCarregando" aria-label="Carregando resumo dos eventos">
        <div className="orgIndicadores">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="orgIndicadorSkeleton" linhas={3} rotulo={i === 0 ? 'Carregando eventos...' : 'Carregando indicador'} />)}</div>
        <div className="orgPaineis">{[0, 1].map(i => <Skeleton key={i} className="orgPainelSkeleton" linhas={5} rotulo="Carregando painel de eventos" />)}</div>
      </div> : !erro && <div className="orgDashboardResumo">
        <section aria-label="Indicadores dos seus eventos">
          <dl className="orgIndicadores">{indicadores.map((indicador, indice) => <div className={`orgIndicador${indice === 0 ? ' orgIndicadorDestaque' : ''}`} key={indicador.titulo}>
            <dt><Icone nome={indicador.icone} tamanho={20} />{indicador.titulo}</dt>
            <dd><strong>{indicador.valor}</strong><span>{indicador.descricao}</span></dd>
          </div>)}</dl>
          <p className="orgDashboardEscopo">Resumo de todos os eventos retornados para sua conta na última consulta, antes dos filtros abaixo.</p>
        </section>
        <div className="orgPaineis">
          <section className="orgPainel" aria-labelledby="org-distribuicao-titulo">
            <div className="orgPainelCabecalho"><Icone nome="eventos" /><h2 id="org-distribuicao-titulo">Distribuição por estado</h2></div>
            <p>Visão do ciclo de vida dos seus eventos.</p>
            {eventos.length === 0 ? <EstadoVazio titulo="O resumo aparecerá quando você tiver eventos." /> : <dl className="orgDistribuicao">
              {distribuicao.map(item => <div key={item.estado}><dt><Badge variante={({ Ativo: 'sucesso', Cancelado: 'erro', Encerrado: 'neutro', 'Em planejamento': 'neutro' })[item.estado]}>{item.estado}</Badge></dt><dd>{item.total}</dd></div>)}
            </dl>}
          </section>
          <section className="orgPainel" aria-labelledby="org-ativos-titulo">
            <div className="orgPainelCabecalho"><Icone nome="acesso" /><h2 id="org-ativos-titulo">Eventos ativos</h2></div>
            <p>Até 3 eventos ativos, na mesma ordem da listagem.</p>
            {ativosResumo.length === 0 ? <EstadoVazio titulo="Nenhum evento ativo nesta consulta." /> : <ul className="orgAtivosResumo">
              {ativosResumo.map(evento => <li key={evento.id}><h3>{evento.nome}</h3><p>{dataDashboard(evento.data)}{evento.horario ? ` · ${evento.horario.slice(0, 5)}` : ''}</p><p>{evento.local?.trim() || 'Local não cadastrado'}</p></li>)}
            </ul>}
          </section>
        </div>
      </div>}
      <section className="orgGerenciamento" aria-labelledby="org-gerenciamento-titulo">
      <div className="orgGerenciamentoCabecalho">
        <h2 id="org-gerenciamento-titulo">Gerenciamento de eventos</h2>
        <p>Localize um evento e utilize as ações disponíveis para seu estado.</p>
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
          aria-pressed={filtroStatus === 'Todos'}
          onClick={() => setFiltroStatus('Todos')}
        >
          Todos ({eventos.length})
        </Botao>
        <Botao
          className={filtroStatus === 'Ativo' ? 'ativo' : ''}
          aria-pressed={filtroStatus === 'Ativo'}
          onClick={() => setFiltroStatus('Ativo')}
        >
          Ativos ({totalAtivos})
        </Botao>
        <Botao
          className={filtroStatus === 'Em planejamento' ? 'ativo' : ''}
          aria-pressed={filtroStatus === 'Em planejamento'}
          onClick={() => setFiltroStatus('Em planejamento')}
        >
          Em planejamento ({totalPlanejamento})
        </Botao>
        {['Cancelado','Encerrado'].map(status=><Botao key={status} aria-pressed={filtroStatus===status} className={filtroStatus===status?'ativo':''} onClick={()=>setFiltroStatus(status)}>{status} ({eventos.filter(e=>e.status===status).length})</Botao>)}
      </div>}
      <div className="listaEventos">
        {carregando ? <Skeleton tipo="tabela" linhas={3} rotulo="Carregando eventos..." /> : erro ? (
          <Alerta variante="erro"><p>{erro}</p><Botao type="button" onClick={aoTentarNovamente}>Tentar novamente</Botao></Alerta>
        ) : eventosFiltrados.length === 0 ? (
          <EstadoVazio tipo={eventos.length === 0 ? "sem-dados" : "sem-resultados"} titulo={eventos.length === 0 ? 'Você ainda não possui eventos cadastrados.' : 'Nenhum evento encontrado para o filtro aplicado.'} />
        ) : (
          eventosFiltrados.map((evento) => (
            <article className="evento orgEvento" key={evento.id} aria-label={evento.nome}>
              <div className="orgEventoCabecalho">
              <CapaEvento eventoId={evento.id}/>
              <div className="eventoInfo">
                <h3>{evento.nome}</h3>
                <Badge variante={({Ativo: 'sucesso', Cancelado: 'erro', Encerrado: 'neutro', 'Em planejamento': 'neutro'})[evento.status] || 'neutro'}>{evento.status}</Badge>
                <p className="eventoMetadados">
                  <span><Icone nome="eventos" tamanho={16} /> {dataDashboard(evento.data)}{evento.horario ? ` · ${evento.horario.slice(0, 5)}` : ''}</span><span><Icone nome="local" tamanho={16} /> {evento.local?.trim() || 'Local não cadastrado'}</span>
                </p>
              </div>
              </div>
              <dl className="orgEventoNumeros">
              <div>
                <dt>Público previsto</dt>
                <dd>{evento.publico ?? 'Público não cadastrado'}</dd>
              </div>
              <div>
                <dt>Cotação</dt>
                <dd>{evento.cotacao ?? 'Não informada'}</dd>
              </div>
              <div>
                <dt>Ticket sugerido</dt>
                <dd>{evento.ticket ?? 'Não informado'}</dd>
              </div>
              </dl>
              <div className="orgEventoDisponibilidade"><VagasEvento evento={evento} /></div>
              <div className="orgEventoMidia"><MidiaEvento eventoId={evento.id} estado={evento.status} editar /></div>
              <div className="orgEventoAcoes" role="group" aria-label={`Ações de ${evento.nome}`}>
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
                className="orgEventoAcessar"
                title="Acessar cotações e custos deste evento"
                onClick={() => {
                  aoSelecionarEvento(evento)
                  setPagina('custos')
                }}
              >
                Custos e cotações
              </Botao>
              </div>
            </article>
          ))
        )}
      </div>
      </section>
    </div>
  )
}
