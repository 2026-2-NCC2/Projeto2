import { useState, useEffect } from 'react'
import { apiUrl } from '../../services/api.js'

export function PortalParticipante({ setPagina, aoSair }) {
  const [eventosDisponiveis, setEventosDisponiveis] = useState([])
  const [meusIngressos, setMeusIngressos] = useState([])
  const [carregandoIngressos, setCarregandoIngressos] = useState(false)
  const [erroIngressos, setErroIngressos] = useState('')
  const [abaParticipante, setAbaParticipante] = useState('inicio')
  const [busca, setBusca] = useState('')
  const idsEventosInscritos = new Set(
  meusIngressos.map((ingresso) => Number(ingresso.evento_id))
  )
  const [eventoSelecionado, setEventoSelecionado] = useState(null)
  const [carregandoEventos, setCarregandoEventos] = useState(true)
  const [erroEventos, setErroEventos] = useState('')
  
  useEffect(() => {
  if (abaParticipante !== 'ingressos' && abaParticipante !== 'eventos') return

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
      setMeusIngressos(dados)

    } catch (erro) {
      console.error('Erro ao buscar ingressos:', erro)
      setErroIngressos(erro.message)
    } finally {
      setCarregandoIngressos(false)
    }
  }

  buscarIngressos()
}, [abaParticipante])
 
  useEffect(() => {
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
        setEventosDisponiveis(dados)
      } catch (erro) {
        setErroEventos(erro.message)
      } finally {
        setCarregandoEventos(false)
      }
    }

    carregarEventos()
  }, [])

const [inscrevendoEventoId, setInscrevendoEventoId] = useState(null)

const aoInscreverEvento = async (evento) => {
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

    setAbaParticipante('ingressos')
  } catch (erro) {
    console.error('Erro ao realizar inscrição:', erro)
    alert('Não foi possível conectar ao servidor.')
  } finally {
    setInscrevendoEventoId(null)
  }
}
  
  const menuParticipante = [
    ['inicio', '⌂ Início'],
    ['eventos', '▦ Explorar eventos'],
    ['ingressos', '▣ Meus ingressos'],
    ['perfil', '♙ Meu perfil']
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

  const listaEventos = (
    <>
      {carregandoEventos && <p>Carregando eventos...</p>}

      {erroEventos && (
        <p style={{ color: 'red' }}>{erroEventos}</p>
      )}

      {!carregandoEventos &&
        !erroEventos &&
        eventosFiltrados.length === 0 && (
          <p>Nenhum evento encontrado.</p>
        )}

      {!carregandoEventos &&
        !erroEventos &&
        eventosFiltrados.map((evento) => (
          <article className="fornCartao" key={evento.id}>
            <span className="tag">
              {evento.categoria || 'Evento'}
            </span>

            <h3>{evento.nome}</h3>

            <p>
              <strong>📅 Data:</strong>{' '}
              {evento.data
                ? new Date(evento.data).toLocaleDateString(
                    'pt-BR',
                    { timeZone: 'UTC' }
                  )
                : 'Não informada'}
            </p>

            <p>
              <strong>🕒 Horário:</strong>{' '}
              {evento.horario || 'Não informado'}
            </p>

            <p>
              <strong>📍 Local:</strong>{' '}
              {evento.local || 'Não informado'}
            </p>

            <p>
              <strong>👥 Público:</strong>{' '}
              {evento.publico || 'Não informado'}
            </p>

            <p>
              <strong>Status:</strong> {evento.status}
            </p>

            {evento.descricao && <p>{evento.descricao}</p>}
            
            <button
  type="button"
  onClick={() => {
    setEventoSelecionado(evento)
    setAbaParticipante('detalhes')
  }}
  style={{
    backgroundColor: 'white',
    color: '#3528b8',
    border: '1px solid #3528b8',
    borderRadius: '6px',
    padding: '10px 18px',
    cursor: 'pointer',
    marginTop: '12px',
    marginRight: '10px'
  }}
>
  🔎 Ver detalhes
</button>

            <button
  type="button"
  disabled={
    idsEventosInscritos.has(Number(evento.id)) ||
    inscrevendoEventoId !== null
  }
  onClick={() => aoInscreverEvento(evento)}
  style={{
    backgroundColor: idsEventosInscritos.has(Number(evento.id))
      ? '#6c757d'
      : '#3528b8',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 18px',
    cursor: idsEventosInscritos.has(Number(evento.id))
      ? 'not-allowed'
      : inscrevendoEventoId !== null
        ? 'wait'
        : 'pointer',
    marginTop: '12px'
  }}
>
  {idsEventosInscritos.has(Number(evento.id))
    ? '✓ Já inscrito'
    : inscrevendoEventoId === evento.id
      ? 'Realizando inscrição...'
      : '🎟️ Inscrever-se'}
</button>
          </article>
        ))}
    </>
  )

  return (
    <div className="portalFornecedor">
      <div className="fornTopo">
        <div className="logo">
          ▣ <span>TrocaTicket</span>
          <small>PORTAL PARTICIPANTE</small>
        </div>

        <span className="fornSelo">
          ● Área do participante
        </span>
      </div>

      <div className="fornCorpo">
        <aside className="fornMenu">
          <button
            type="button"
            className="novo"
            onClick={() => setAbaParticipante('eventos')}
          >
            ⌕ Buscar eventos
          </button>

          <nav>
            {menuParticipante.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={
                  abaParticipante === id ? 'ativo' : ''
                }
                onClick={() => setAbaParticipante(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => setPagina('solicitar-acesso')}
          >
            ♧ Solicitar acesso
          </button>

          <button
            type="button"
            className="fornSair"
            onClick={aoSair}
          >
            ↪ Sair
          </button>
        </aside>

        <main className="fornConteudo">
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
                  <h2>Bem-vindo ao TrocaTicket!</h2>
                  <p>
                    Explore eventos e encontre novas experiências.
                  </p>
                </div>
              </div>

              <div className="fornIndicadores">
                <div>
                  <small>EVENTOS CADASTRADOS</small>
                  <strong>
                    {carregandoEventos
                      ? '...'
                      : erroEventos
                        ? '—'
                        : eventosDisponiveis.length}
                  </strong>
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

                <button
                  type="button"
                  className="principal"
                  onClick={() => setAbaParticipante('eventos')}
                >
                  Explorar eventos →
                </button>
              </div>
            </>
          )}

          {abaParticipante === 'eventos' && (
            <>
              <div className="fornHero">
                <div>
                  <h2>🎟️ Eventos disponíveis para consulta</h2>
                  <p>
                    Conheça os eventos cadastrados no TrocaTicket.
                  </p>
                </div>
              </div>

              <input
                aria-label="Buscar eventos"
                placeholder="⌕ Buscar por nome, categoria ou local..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />

              <div
                className="fornLista"
                style={{ marginTop: '20px' }}
              >
                {listaEventos}
              </div>
            </>
          )}

          {abaParticipante === 'detalhes' && eventoSelecionado && (
  <section className="fornCartao">
    <button
      type="button"
      onClick={() => setAbaParticipante('eventos')}
      style={{ marginBottom: '20px', cursor: 'pointer' }}
    >
      ← Voltar aos eventos
    </button>

    <span className="tag">
      {eventoSelecionado.categoria || 'Evento'}
    </span>

    <h2>{eventoSelecionado.nome}</h2>

    <p>
      <strong>📅 Data:</strong>{' '}
      {eventoSelecionado.data
        ? new Date(eventoSelecionado.data).toLocaleDateString('pt-BR', {
            timeZone: 'UTC'
          })
        : 'Não informada'}
    </p>

    <p>
      <strong>🕒 Horário:</strong>{' '}
      {eventoSelecionado.horario || 'Não informado'}
    </p>

    <p>
      <strong>📍 Local:</strong>{' '}
      {eventoSelecionado.local || 'Não informado'}
    </p>

    <p>
      <strong>👥 Público:</strong>{' '}
      {eventoSelecionado.publico || 'Não informado'}
    </p>

    <p>
      <strong>Status:</strong> {eventoSelecionado.status}
    </p>

    <h3>Sobre o evento</h3>

    <p>
      {eventoSelecionado.descricao || 'Descrição não informada.'}
    </p>
    <button
  type="button"
  disabled={
    idsEventosInscritos.has(Number(eventoSelecionado.id)) ||
    inscrevendoEventoId !== null
  }
  onClick={() => aoInscreverEvento(eventoSelecionado)}
  style={{
    backgroundColor: idsEventosInscritos.has(Number(eventoSelecionado.id))
      ? '#6c757d'
      : '#3528b8',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '12px 20px',
    marginTop: '20px',
    cursor: idsEventosInscritos.has(Number(eventoSelecionado.id))
      ? 'not-allowed'
      : 'pointer'
  }}
>
  {idsEventosInscritos.has(Number(eventoSelecionado.id))
    ? '✓ Já inscrito'
    : inscrevendoEventoId === eventoSelecionado.id
      ? 'Realizando inscrição...'
      : '🎟️ Inscrever-se'}
</button>
  </section>
)}
          
          {abaParticipante === 'ingressos' && (
  <div className="fornCartao">
    <h2>🎫 Meus ingressos</h2>
    <p>Confira os eventos em que você está inscrito.</p>

    {carregandoIngressos ? (
      <p>Carregando seus ingressos...</p>
    ) : erroIngressos ? (
      <p style={{ color: '#dc3545' }}>
        {erroIngressos}
      </p>
    ) : meusIngressos.length === 0 ? (
      <p>Você ainda não possui inscrições em eventos.</p>
    ) : (
      meusIngressos.map((ingresso) => (
        <div
          key={ingresso.id}
          className="fornCartao"
          style={{ marginTop: '16px' }}
        >
          <h3>{ingresso.evento_nome}</h3>

          <p>
            📅 Data: {ingresso.evento_data
              ? new Date(ingresso.evento_data).toLocaleDateString('pt-BR', {
                  timeZone: 'UTC'
                })
              : 'Não informada'}
          </p>

          <p>
            🕒 Horário: {ingresso.evento_horario || 'Não informado'}
          </p>

          <p>📍 Local: {ingresso.evento_local}</p>

          <p>🎟️ Inscrição nº {ingresso.id}</p>

          <p>
            Status: <strong>{ingresso.status}</strong>
          </p>
        </div>
      ))
    )}
  </div>
          )}

          {abaParticipante === 'perfil' && (
            <div className="fornCartao">
              <h2>👤 Meu perfil</h2>

              <p>
                Sua conta está ativa como participante.
              </p>

              <p>
                Você também pode solicitar acesso como
                organizador ou fornecedor.
              </p>

              <button
                type="button"
                className="principal"
                onClick={() => setPagina('solicitar-acesso')}
              >
                Solicitar acesso →
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

