import { Marca } from '../../components/ui/Marca.jsx'
import { Skeleton, Botao, Campo, Badge, Alerta, EstadoVazio } from '../../components/ui/Primitivas.jsx'
import './Participante.css'
import { VagasEvento } from '../../components/eventos/VagasEvento.jsx'
import { PerfilPessoal } from '../../components/perfil/PerfilPessoal.jsx'
import { Icone } from '../../components/ui/Icone.jsx'
import { useState, useEffect, useRef } from 'react'
import { MidiaEvento, CapaEvento } from '../../components/eventos/MidiaEvento.jsx'
import { apiUrl } from '../../services/api.js'
import { capacidadesEventos } from '../../services/eventos.js'
import { NavegacaoRecolhivel } from '../../components/layout/NavegacaoRecolhivel.jsx'

export function PortalParticipante({ setPagina, aoSair, navegacao }) {
  const [eventosDisponiveis, setEventosDisponiveis] = useState([])
  const [meusIngressos, setMeusIngressos] = useState([])
  const [carregandoIngressos, setCarregandoIngressos] = useState(true)
  const [erroIngressos, setErroIngressos] = useState('')
  const [tentativaIngressos, setTentativaIngressos] = useState(0)
  const [abaLocal, setAbaLocal] = useState('inicio')
  const abaParticipante = navegacao ? navegacao.estado.aba : abaLocal
  function setAbaParticipante(valor) {
    if (navegacao) navegacao.mudar(atual => {
      const aba = typeof valor === 'function' ? valor(atual.aba) : valor
      return { aba, eventoId: aba === 'detalhes' ? atual.eventoId : null }
    })
    else setAbaLocal(valor)
  }
  const tituloRef = useRef(null)
  const secaoAnteriorRef = useRef(abaParticipante)
  useEffect(() => {
    // A montagem inicial e atualizacoes de dados nao devem roubar o foco.
    if (secaoAnteriorRef.current === abaParticipante) return
    secaoAnteriorRef.current = abaParticipante
    tituloRef.current?.focus()
  }, [abaParticipante])
  const [busca, setBusca] = useState('')
  const [inscricoesDisponiveis,setInscricoesDisponiveis]=useState(false)
  useEffect(()=>{
    let ativo=true
    capacidadesEventos(sessionStorage.getItem('token')).then(async r=>{
      if(!r.ok)throw new Error('Indisponível')
      const c=await r.json();if(ativo)setInscricoesDisponiveis(c.inscrever===true)
    }).catch(()=>{if(ativo)setInscricoesDisponiveis(false)})
    return()=>{ativo=false}
  },[])
  const idsEventosInscritos = new Set(
  meusIngressos.map((ingresso) => Number(ingresso.evento_id))
  )
  const [eventoLocal, setEventoSelecionado] = useState(null)
  const eventoSelecionado = navegacao && abaParticipante === 'detalhes'
    ? eventosDisponiveis.find(evento => evento.id === navegacao.estado.eventoId) || null : eventoLocal
  const [carregandoEventos, setCarregandoEventos] = useState(true)
  const [erroEventos, setErroEventos] = useState('')
  const [revisaoVagas,setRevisaoVagas]=useState(0)
  useEffect(() => {
    if (navegacao && abaParticipante === 'detalhes' && !carregandoEventos && !eventoSelecionado) {
      navegacao.mudar({ aba: 'eventos', eventoId: null }, true)
    }
  }, [navegacao, abaParticipante, carregandoEventos, eventoSelecionado])
  
  useEffect(() => {
  let ativo = true

  const buscarIngressos = async () => {
    setCarregandoIngressos(true)
    setErroIngressos('')

    try {
      const token = sessionStorage.getItem('token')

      const resposta = await fetch(
        apiUrl('/participante/inscricoes'),
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      if (!resposta.ok) {
        throw new Error('Não foi possível carregar seus ingressos.')
      }

      const dados = await resposta.json()
      if (!Array.isArray(dados)) throw new Error('Resposta de inscrições inválida.')
      if (ativo) setMeusIngressos(dados)

    } catch (erro) {
      console.error('Erro ao buscar ingressos:', erro)
      if (ativo) {
        setMeusIngressos([])
        setErroIngressos('Não foi possível consultar suas inscrições. Novas inscrições estão bloqueadas.')
      }
    } finally {
      if (ativo) setCarregandoIngressos(false)
    }
  }

  buscarIngressos()
  return () => { ativo = false }
}, [tentativaIngressos])
 
  useEffect(() => {
    let ativo = true
    const carregarEventos = async () => {
      try {
        setCarregandoEventos(true)
        setErroEventos('')

        const token = sessionStorage.getItem('token')

        const resposta = await fetch(
          apiUrl('/participante/eventos'),
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        )

        if (!resposta.ok) {
          throw new Error('Não foi possível carregar os eventos.')
        }

        const dados = await resposta.json()
        if (!Array.isArray(dados)) throw new Error('Resposta de eventos inválida.')
        if (ativo) setEventosDisponiveis(dados)
      } catch (erro) {
        if (ativo) {
          setEventosDisponiveis([])
          setErroEventos(erro.message)
        }
      } finally {
        if (ativo) setCarregandoEventos(false)
      }
    }

    carregarEventos()
    return () => { ativo = false }
  }, [revisaoVagas])

const [inscrevendoEventoId, setInscrevendoEventoId] = useState(null)

const aoInscreverEvento = async (evento) => {
  if (evento.lotado || !inscricoesDisponiveis || carregandoIngressos || erroIngressos || inscrevendoEventoId !== null || idsEventosInscritos.has(Number(evento.id))) return
  const confirmado = window.confirm(
    `Deseja se inscrever no evento "${evento.nome}"?`
  )

  if (!confirmado) return

  setInscrevendoEventoId(evento.id)

  try {
    const token = sessionStorage.getItem('token')

    if (!token) {
      alert('Sua sessão expirou. Faça login novamente.')
      setPagina('login')
      return
    }

    const resposta = await fetch(
      apiUrl('/participante/inscricoes'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          evento_id: evento.id
        })
      }
    )

    const dados = await resposta.json()

    if (!resposta.ok) {
      alert(dados.erro || 'Não foi possível realizar a inscrição.')
      return
    }

    alert('Inscrição realizada com sucesso!')
    setCarregandoIngressos(true)
    setTentativaIngressos((valor) => valor + 1)
    setAbaParticipante('ingressos')
  } catch (erro) {
    console.error('Erro ao realizar inscrição:', erro)
    alert('Não foi possível conectar ao servidor.')
  } finally {
    setRevisaoVagas(v=>v+1)
    setEventoSelecionado(null)
    setAbaParticipante(a=>a==='detalhes'?'eventos':a)
    setInscrevendoEventoId(null)
  }
}
  
  const menuParticipante = [
    ['inicio', 'Início'],
    ['eventos', 'Explorar eventos'],
    ['ingressos', 'Meus ingressos'],
    ['perfil', 'Meu perfil']
  ]

  const titulos = {
    inicio: 'Painel do Participante',
    eventos: 'Explorar eventos',
    detalhes: 'Detalhes do evento',
    ingressos: 'Meus ingressos',
    perfil: 'Meu perfil'
  }
  const tituloAtual = titulos[abaParticipante]
  // No perfil, o h1 pertence ao PerfilPessoal. O rótulo externo identifica o contexto e recebe foco.
  const TituloContexto = abaParticipante === 'perfil' ? 'p' : 'h1'
  const secaoAtual = abaParticipante === 'detalhes' ? 'eventos' : abaParticipante
  useEffect(() => {
    if (typeof document === 'undefined') return
    const anterior = document.title
    document.title = `${tituloAtual} | TrocaTicket`
    return () => { document.title = anterior }
  }, [tituloAtual])

  const eventosFiltrados = eventosDisponiveis.filter((evento) => {
    const texto = [
      evento.nome,
      evento.local,
      evento.categoria
    ].join(' ').toLowerCase()

    return texto.includes(busca.toLowerCase())
  })

  const avisoInscricoes = <>
    {!inscricoesDisponiveis && <Alerta variante="aviso" titulo="Inscrições indisponíveis">Novas inscrições estão temporariamente indisponíveis. Suas inscrições existentes foram preservadas.</Alerta>}
    {carregandoIngressos && <Skeleton tipo={abaParticipante === 'ingressos' ? 'tabela' : 'texto'} linhas={abaParticipante === 'ingressos' ? 3 : 1} rotulo="Consultando suas inscrições. Aguarde para se inscrever." />}
    {erroIngressos && <Alerta variante="erro" titulo="Não foi possível consultar suas inscrições"><p>{erroIngressos}</p><Botao type="button" onClick={() => {
      setCarregandoIngressos(true)
      setErroIngressos('')
      setTentativaIngressos((valor) => valor + 1)
    }}>Tentar novamente</Botao></Alerta>}
  </>

  const listaEventos = (
    <>
      {carregandoEventos && <div className="ppCarregamentoEventos" role="status" aria-busy="true">
        <span className="ttSrOnly">Carregando eventos...</span>
        <div className="ppEsqueletos" aria-hidden="true">
          {[0, 1, 2].map(i => <Skeleton key={i} tipo="card" linhas={5} className="ppSkeletonEvento" />)}
        </div>
      </div>}

      {erroEventos && (
        <Alerta variante="erro" titulo="Erro de consulta de eventos">{erroEventos}</Alerta>
      )}

      {!carregandoEventos &&
        !erroEventos &&
        eventosFiltrados.length === 0 && (
          <EstadoVazio tipo={eventosDisponiveis.length === 0 ? 'sem-dados' : 'sem-resultados'}
            titulo={eventosDisponiveis.length === 0 ? 'Nenhum evento disponível.' : 'Nenhum resultado encontrado pelos filtros.'} />
        )}

      {!carregandoEventos &&
        !erroEventos &&
        eventosFiltrados.map((evento) => (
          <article className="eventoCartao ppEventoCartao" key={evento.id} aria-labelledby={`participante-evento-${evento.id}`}>
            <div className="ppEventoCapa"><CapaEvento eventoId={evento.id}/></div>
            <div className="ppEventoConteudo">
            <div className="ppEventoEtiquetas">
              {evento.categoria && <Badge variante="informacao">{evento.categoria}</Badge>}
              {evento.status ? <Badge variante={({Ativo: 'sucesso', Cancelado: 'erro', Encerrado: 'neutro', 'Em planejamento': 'neutro'})[evento.status] || 'neutro'}>{evento.status}</Badge> : <span>Estado não informado</span>}
            </div>

            <h3 id={`participante-evento-${evento.id}`}>{evento.nome || 'Nome não informado'}</h3>

            <div className="ppEventoMetadados"><p>
              <strong>Data:</strong>{' '}
              {evento.data
                ? new Date(evento.data).toLocaleDateString(
                    'pt-BR',
                    { timeZone: 'UTC' }
                  )
                : 'Não informada'}
            </p>

            <p>
              <strong>Horário:</strong>{' '}
              {evento.horario || 'Não informado'}
            </p>

            </div><p className="ppEventoLocal">
              <strong>Local:</strong>{' '}
              {evento.local || 'Não informado'}
            </p>

            <div className="ppEventoDisponibilidade">
              <VagasEvento evento={evento} />
              {evento.inscritos_confirmados === undefined && <p>Disponibilidade não informada.</p>}
            </div>
            
            <div className="ppEventoAcoes"><Botao
  type="button"
  onClick={() => {
    setEventoSelecionado(evento)
    if (navegacao) navegacao.mudar({ aba: 'detalhes', eventoId: evento.id })
    else setAbaParticipante('detalhes')
  }}
  aria-label={`Ver detalhes de ${evento.nome || 'evento sem nome informado'}`}
  variante="primario" className="acaoEvento"
>
  Ver detalhes
</Botao>

            <Botao
  type="button"
  disabled={
    !inscricoesDisponiveis || carregandoIngressos || Boolean(erroIngressos) ||
    evento.lotado || idsEventosInscritos.has(Number(evento.id)) ||
    inscrevendoEventoId !== null
  }
  ocupado={inscrevendoEventoId === evento.id}
  onClick={() => aoInscreverEvento(evento)}
  variante="secundario" className="acaoEvento"
>
  {idsEventosInscritos.has(Number(evento.id))
    ? 'Já inscrito'
    : inscrevendoEventoId === evento.id
      ? 'Realizando inscrição...'
      : evento.lotado ? 'Lotado' : 'Inscrever-se'}
</Botao></div>
            </div>
          </article>
        ))}
    </>
  )

  return (
    <div className="participantePagina">
      <header className="ppCabecalho">
        <div className="ppCabecalhoInterno">
        <div className="ppMarca">
          <Marca />
          <small>PORTAL PARTICIPANTE</small>
        </div>
        <NavegacaoRecolhivel id="menu-participante" rotulo="Menu do participante" className="ppNavegacao">
        <div className="ppMenu">
          <nav className="ppSecoes" aria-label="Seções do participante">
            {menuParticipante.map(([id, label]) => (
              <Botao
                key={id}
                type="button"
                className={
                  secaoAtual === id ? 'ativo' : ''
                }
                variante="discreto"
                aria-current={secaoAtual === id ? 'page' : undefined}
                onClick={() => setAbaParticipante(id)}
              >
                <Icone nome={({ inicio: 'inicio', eventos: 'eventos', ingressos: 'ticket', perfil: 'perfil' })[id]} />{label}
              </Botao>
            ))}
          </nav>
          <div className="ppContaAcoes" role="group" aria-label="Ações do participante">
          <Botao type="button" variante="discreto" onClick={() => setAbaParticipante('eventos')}>
            <Icone nome="busca" /> Buscar eventos
          </Botao>
          <Botao
            type="button"
            variante="secundario"
            onClick={() => setPagina('solicitar-acesso')}
          >
            <Icone nome="acesso" /> Solicitar acesso
          </Botao>

          <Botao
            type="button"
            variante="discreto"
            onClick={aoSair}
          >
            <Icone nome="sair" /> Sair
          </Botao>
          </div>
        </div>
        </NavegacaoRecolhivel>
        </div>
      </header>
      <div className="ppEstrutura">
        <main className="ppConteudo" aria-labelledby="participante-titulo">
          <nav className="ppTrilha" aria-label="Localização no portal">
            TrocaTicket Participante <span aria-hidden="true">›</span> <span aria-current="page">{tituloAtual}</span>
          </nav>

          <div className="ppCabecalhoPagina">
            <div>
              <TituloContexto id="participante-titulo" className="ppTitulo" ref={tituloRef} tabIndex={-1}>{tituloAtual}</TituloContexto>
              <p>
                Descubra eventos e acompanhe sua participação
                no TrocaTicket.
              </p>
            </div>
          </div>

          {abaParticipante === 'inicio' && (
            <>
              <div className="fornHero">
                <div>
                  <p className="ppSobretitulo">DESCUBRA · PARTICIPE · CONECTE-SE</p><h2>Seu próximo encontro começa aqui.</h2>
                  <p>
                    Consulte os eventos disponíveis e acompanhe suas inscrições.
                  </p>
                </div>
              </div>

              <div className="fornIndicadores">
                <div>
                  <small>EVENTOS CADASTRADOS</small>
                  {carregandoEventos ? <Skeleton tipo="texto" linhas={1} rotulo="Consultando quantidade de eventos" /> :
                    <strong>{erroEventos ? '—' : eventosDisponiveis.length}</strong>}
                  <span>Na plataforma</span>
                </div>

                <div>
                  <small>SEU PERFIL</small>
                  <strong>Participante</strong>
                  <span>Perfil de acesso</span>
                </div>
              </div>

              <div className="fornCartao">
                <h2>Encontre seu próximo evento</h2>
                <p>
                  Confira os eventos cadastrados na plataforma.
                </p>

                <Botao
                  type="button"
                  className="principal"
                  onClick={() => setAbaParticipante('eventos')}
                >
                  Explorar eventos →
                </Botao>
              </div>
            </>
          )}

          {abaParticipante === 'eventos' && (
            <>
              <div className="fornHero">
                <div>
                  <p className="ppSobretitulo">EXPLORE O TROCATICKET</p><h2>Encontre experiências para participar.</h2>
                  <p>
                    Conheça os eventos cadastrados no TrocaTicket.
                  </p>
                </div>
              </div>

              <div className="ppBuscaBarra" role="search" aria-label="Busca local de eventos">
                <span className="ppBuscaIcone" aria-hidden="true"><Icone nome="busca" tamanho={22} /></span>
                <Campo id="participante-busca" label="Buscar eventos"
                  aria-label="Buscar eventos"
                  aria-describedby="participante-busca-dica"
                  placeholder="Buscar por nome, categoria ou local..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
                <p id="participante-busca-dica">Pesquise por nome, categoria ou local.</p>
              </div>
              <div className="ppAvisos">{avisoInscricoes}</div>
              <div className="fornLista ppGradeEventos">{listaEventos}</div>
            </>
          )}

          {abaParticipante === 'detalhes' && eventoSelecionado && (
  <section className="ppDetalhes" aria-labelledby="participante-detalhes-nome">
    <div className="ppDetalhesTopo">
    <Botao
      type="button"
      onClick={() => setAbaParticipante('eventos')}
      variante="discreto" className="voltar"
    >
      ← Voltar aos eventos
    </Botao>
    </div>
    <div className="ppDetalhesCabecalho">
    <Badge variante="informacao">
      {eventoSelecionado.categoria || 'Evento'}
    </Badge>

    <h2 id="participante-detalhes-nome">{eventoSelecionado.nome}</h2>
    <p>
      <strong>Status:</strong> <Badge variante={({Ativo: 'sucesso', Cancelado: 'erro', Encerrado: 'neutro', 'Em planejamento': 'neutro'})[eventoSelecionado.status] || 'neutro'}>{eventoSelecionado.status}</Badge>
    </p>
    </div>
    <div className="ppDetalhesGrade">
    <div className="ppDetalhesInformacoes">
    <div className="ppDetalhesMidia"><MidiaEvento eventoId={eventoSelecionado.id} /></div>

    <dl className="ppDetalhesDados">
    <div><dt>Data:</dt><dd>
      {eventoSelecionado.data
        ? new Date(eventoSelecionado.data).toLocaleDateString('pt-BR', {
            timeZone: 'UTC'
          })
        : 'Não informada'}
    </dd></div>

    <div><dt>Horário:</dt><dd>
      {eventoSelecionado.horario || 'Não informado'}
    </dd></div>

    <div className="ppDadoAmplo"><dt>Local:</dt><dd>
      {eventoSelecionado.local || 'Não informado'}
    </dd></div>

    <div><dt>Público estimado:</dt><dd>
      {eventoSelecionado.publico || 'Não informado'}
    </dd></div>
    </dl>
    <section className="ppDetalhesDescricao" aria-labelledby="participante-sobre-evento">
    <h3 id="participante-sobre-evento">Sobre o evento</h3>

    <p>
      {eventoSelecionado.descricao || 'Descrição não informada.'}
    </p>
    </section>
    </div>
    <aside className="ppDetalhesInscricao" aria-labelledby="participante-disponibilidade">
    <h3 id="participante-disponibilidade">Disponibilidade e inscrição</h3>
    <VagasEvento evento={eventoSelecionado} />
    {avisoInscricoes}
    <Botao
  type="button"
  disabled={
    !inscricoesDisponiveis || carregandoIngressos || Boolean(erroIngressos) ||
    eventoSelecionado.lotado || idsEventosInscritos.has(Number(eventoSelecionado.id)) ||
    inscrevendoEventoId !== null
  }
  ocupado={inscrevendoEventoId === eventoSelecionado.id}
  onClick={() => aoInscreverEvento(eventoSelecionado)}
  className="principal acaoEvento"
>
  {idsEventosInscritos.has(Number(eventoSelecionado.id))
    ? 'Já inscrito'
    : inscrevendoEventoId === eventoSelecionado.id
      ? 'Realizando inscrição...'
      : eventoSelecionado.lotado ? 'Lotado' : 'Inscrever-se'}
</Botao>
    </aside>
    </div>
  </section>
)}
          
          {abaParticipante === 'ingressos' && (
  <section className="ppInscricoes" aria-labelledby="participante-ingressos-titulo">
    <h2 id="participante-ingressos-titulo">Meus ingressos</h2>
    <p>Confira os eventos em que você está inscrito.</p>

    {avisoInscricoes}
    {!carregandoIngressos && !erroIngressos && (meusIngressos.length === 0 ? (
      <EstadoVazio tipo="sem-dados" titulo="Você ainda não possui inscrições em eventos." />
    ) : (
      <div className="ppGradeInscricoes">{meusIngressos.map((ingresso) => (
        <article
          key={ingresso.id}
          className="ppIngresso"
          aria-labelledby={`participante-inscricao-${ingresso.id}`}
        >
          <div className="ppIngressoTopo">
          <p className="ppIngressoNumero">Inscrição nº {ingresso.id}</p>
          <h3 id={`participante-inscricao-${ingresso.id}`}>{ingresso.evento_nome || 'Nome não informado'}</h3>
          </div>

          <dl className="ppIngressoDados">
          <div><dt>Data:</dt><dd>{ingresso.evento_data
              ? new Date(ingresso.evento_data).toLocaleDateString('pt-BR', {
                  timeZone: 'UTC'
                })
              : 'Não informada'}
          </dd></div>

          <div><dt>Horário:</dt><dd>{ingresso.evento_horario || 'Não informado'}</dd></div>

          <div><dt>Local:</dt><dd>{ingresso.evento_local || 'Não informado'}</dd></div>
          </dl>

          <div className="ppIngressoEstados">
          {ingresso.evento_status && <p>Estado do evento: <Badge variante={({Ativo: 'sucesso', Cancelado: 'erro', Encerrado: 'neutro', 'Em planejamento': 'neutro'})[ingresso.evento_status] || 'neutro'}>{ingresso.evento_status}</Badge></p>}

          <p>
            Status: <Badge variante={ingresso.status === 'Confirmada' ? 'sucesso' : ingresso.status === 'Cancelada' ? 'erro' : 'neutro'}>{ingresso.status || 'Não informado'}</Badge>
          </p>
          </div>
        </article>
      ))}</div>
    ))}
  </section>
          )}

          {abaParticipante === 'perfil' && (
            <div className="ppPerfil">
            <PerfilPessoal contexto="Participante" aoSair={aoSair}>
              <div className="perfilAcoes"><Botao type="button" variante="secundario" className="secundario" onClick={() => setPagina('solicitar-acesso')}>Solicitar acesso como organizador ou fornecedor</Botao></div>
            </PerfilPessoal>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

