import { Marca } from '../../components/ui/Marca.jsx'
import { Skeleton, Botao, Campo, Badge, Alerta, EstadoVazio } from '../../components/ui/Primitivas.jsx'
import './Participante.css'
import { VagasEvento } from '../../components/eventos/VagasEvento.jsx'
import { PerfilPessoal } from '../../components/perfil/PerfilPessoal.jsx'
import { Icone } from '../../components/ui/Icone.jsx'
import { useState, useEffect } from 'react'
import { MidiaEvento, CapaEvento } from '../../components/eventos/MidiaEvento.jsx'
import { apiUrl } from '../../services/api.js'
import { capacidadesEventos } from '../../services/eventos.js'

export function PortalParticipante({ setPagina, aoSair }) {
  const [eventosDisponiveis, setEventosDisponiveis] = useState([])
  const [meusIngressos, setMeusIngressos] = useState([])
  const [carregandoIngressos, setCarregandoIngressos] = useState(true)
  const [erroIngressos, setErroIngressos] = useState('')
  const [tentativaIngressos, setTentativaIngressos] = useState(0)
  const [abaParticipante, setAbaParticipante] = useState('inicio')
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
  const [eventoSelecionado, setEventoSelecionado] = useState(null)
  const [carregandoEventos, setCarregandoEventos] = useState(true)
  const [erroEventos, setErroEventos] = useState('')
  const [revisaoVagas,setRevisaoVagas]=useState(0)
  
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
    ingressos: 'Meus ingressos',
    perfil: 'Meu perfil'
  }

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
      {carregandoEventos && <Skeleton tipo="card" rotulo="Carregando eventos..." />}

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
          <article className="fornCartao eventoCartao" key={evento.id}>
            <div className="ppEventoCapa"><CapaEvento eventoId={evento.id}/></div>
            <div className="ppEventoConteudo">
            <Badge variante="informacao">
              {evento.categoria || 'Evento'}
            </Badge>

            <h3>{evento.nome}</h3>

            <p>
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

            <p>
              <strong>Local:</strong>{' '}
              {evento.local || 'Não informado'}
            </p>

            <p>
              <strong>Público estimado:</strong>{' '}
              {evento.publico || 'Não informado'}
            </p>

            <p>
              <strong>Status:</strong> <Badge variante={({Ativo: 'sucesso', Cancelado: 'erro', Encerrado: 'neutro', 'Em planejamento': 'neutro'})[evento.status] || 'neutro'}>{evento.status}</Badge>
            </p>

            <VagasEvento evento={evento} />
            {evento.descricao && <p>{evento.descricao}</p>}
            
            <div className="ppEventoAcoes"><Botao
  type="button"
  onClick={() => {
    setEventoSelecionado(evento)
    setAbaParticipante('detalhes')
  }}
  variante="secundario" className="secundario acaoEvento"
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
  className="principal acaoEvento"
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
    <div className="portalFornecedor participantePagina">
      <div className="fornTopo">
        <div className="logo">
          <Marca />
          <small>PORTAL PARTICIPANTE</small>
        </div>

        <span className="fornSelo">
          Área do participante
        </span>
      </div>

      <div className="fornCorpo">
        <aside className="fornMenu">
          <Botao
            type="button"
            className="novo"
            onClick={() => setAbaParticipante('eventos')}
          >
            <Icone nome="busca" /> Buscar eventos
          </Botao>

          <nav>
            {menuParticipante.map(([id, label]) => (
              <Botao
                key={id}
                type="button"
                className={
                  abaParticipante === id ? 'ativo' : ''
                }
                variante="discreto"
                aria-current={abaParticipante === id ? 'page' : undefined}
                onClick={() => setAbaParticipante(id)}
              >
                <Icone nome={({ inicio: 'inicio', eventos: 'eventos', ingressos: 'ticket', perfil: 'perfil' })[id]} />{label}
              </Botao>
            ))}
          </nav>

          <Botao
            type="button"
            onClick={() => setPagina('solicitar-acesso')}
          >
            <Icone nome="acesso" /> Solicitar acesso
          </Botao>

          <Botao
            type="button"
            variante="discreto" className="fornSair"
            onClick={aoSair}
          >
            <Icone nome="sair" /> Sair
          </Botao>
        </aside>

        <main className="fornConteudo ppConteudo">
          <div className="fornTrilha">
            TrocaTicket Participante › {titulos[abaParticipante]}
          </div>

          <div className="fornTitulo">
            <div>
              <h1>{titulos[abaParticipante]}</h1>
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
                  <strong>Ativo</strong>
                  <span>Participante</span>
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
                  placeholder="Buscar por nome, categoria ou local..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
                <p>Pesquise por nome, categoria ou local.</p>
              </div>
              <div className="ppAvisos">{avisoInscricoes}</div>
              <div className="fornLista ppGradeEventos">{listaEventos}</div>
            </>
          )}

          {abaParticipante === 'detalhes' && eventoSelecionado && (
  <section className="fornCartao eventoDetalhes ppDetalhes">
    <Botao
      type="button"
      onClick={() => setAbaParticipante('eventos')}
      variante="discreto" className="voltar"
    >
      ← Voltar aos eventos
    </Botao>

    <Badge variante="informacao">
      {eventoSelecionado.categoria || 'Evento'}
    </Badge>

    <div className="eventoDetalhesTitulo"><div className="eventoIdentidade" aria-hidden="true"><Icone nome="eventos" tamanho={30} /></div><h2>{eventoSelecionado.nome}</h2></div>
    <MidiaEvento eventoId={eventoSelecionado.id} />

    <p>
      <strong>Data:</strong>{' '}
      {eventoSelecionado.data
        ? new Date(eventoSelecionado.data).toLocaleDateString('pt-BR', {
            timeZone: 'UTC'
          })
        : 'Não informada'}
    </p>

    <p>
      <strong>Horário:</strong>{' '}
      {eventoSelecionado.horario || 'Não informado'}
    </p>

    <p>
      <strong>Local:</strong>{' '}
      {eventoSelecionado.local || 'Não informado'}
    </p>

    <p>
      <strong>Público estimado:</strong>{' '}
      {eventoSelecionado.publico || 'Não informado'}
    </p>

    <p>
      <strong>Status:</strong> <Badge variante={({Ativo: 'sucesso', Cancelado: 'erro', Encerrado: 'neutro', 'Em planejamento': 'neutro'})[eventoSelecionado.status] || 'neutro'}>{eventoSelecionado.status}</Badge>
    </p>

    <VagasEvento evento={eventoSelecionado} />
    {avisoInscricoes}
    <h3>Sobre o evento</h3>

    <p>
      {eventoSelecionado.descricao || 'Descrição não informada.'}
    </p>
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
  </section>
)}
          
          {abaParticipante === 'ingressos' && (
  <div className="ppInscricoes">
    <h2>Meus ingressos</h2>
    <p>Confira os eventos em que você está inscrito.</p>

    {avisoInscricoes}
    {!carregandoIngressos && !erroIngressos && (meusIngressos.length === 0 ? (
      <EstadoVazio tipo="sem-dados" titulo="Você ainda não possui inscrições em eventos." />
    ) : (
      <div className="ppGradeInscricoes">{meusIngressos.map((ingresso) => (
        <div
          key={ingresso.id}
          className="fornCartao ppIngresso"
        >
          <h3>{ingresso.evento_nome}</h3>

          <p>
            Data: {ingresso.evento_data
              ? new Date(ingresso.evento_data).toLocaleDateString('pt-BR', {
                  timeZone: 'UTC'
                })
              : 'Não informada'}
          </p>

          <p>
            Horário: {ingresso.evento_horario || 'Não informado'}
          </p>

          <p>Local: {ingresso.evento_local}</p>

          <p>Inscrição nº {ingresso.id}</p>
          {ingresso.evento_status && <p>Estado do evento: <Badge variante={({Ativo: 'sucesso', Cancelado: 'erro', Encerrado: 'neutro', 'Em planejamento': 'neutro'})[ingresso.evento_status] || 'neutro'}>{ingresso.evento_status}</Badge></p>}

          <p>
            Status: <Badge variante={ingresso.status === 'Confirmada' ? 'sucesso' : ingresso.status === 'Cancelada' ? 'erro' : 'neutro'}>{ingresso.status}</Badge>
          </p>
        </div>
      ))}</div>
    ))}
  </div>
          )}

          {abaParticipante === 'perfil' && (
            <PerfilPessoal contexto="Participante">
              <div className="perfilAcoes"><Botao type="button" variante="secundario" className="secundario" onClick={() => setPagina('solicitar-acesso')}>Solicitar acesso como organizador ou fornecedor</Botao></div>
            </PerfilPessoal>
          )}
        </main>
      </div>
    </div>
  )
}

