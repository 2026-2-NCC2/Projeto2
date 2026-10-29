import { apiUrl } from '../../services/api.js'
import { useEffect, useState } from 'react';

export function AdminTopo({ aoSair }) {
  return (
    <header className="adminTopo">
      <div className="adminMarca"><span>TT</span><strong>TrocaTicket</strong><small>Gestão Corporativa</small></div>
      <div className="adminSeguro">Ambiente Seguro SSL 256-bit</div>
      <label className="adminBusca"><span>⌕</span><input aria-label="Busca geral" placeholder="Buscar por CNPJ, Razão Social ou Protocolo" /></label>
      <button className="adminIcone" aria-label="Notificações">●</button>
      <button className="adminUsuario" onClick={aoSair}><span>RA</span><strong>Roberto Albuquerque<small>Administrador & Compliance Sênior</small></strong></button>
    </header>
  )
}

export function AdminMenu({ secao, setSecao, aoSair }) {
  const itens = [
    ['painel', '▦', 'Painel de evento'],
    ['eventos', '□', 'Eventos'],
    ['usuarios', '♙', 'Usuários'],
    ['cotacoes', '▣', 'Cotações'],
    ['propostas', '◇', 'Propostas'],
    ['contas', '▥', 'Fornecedores & Contas'],
    ['relatorios', '▤', 'Relatórios'],
  ]
  return (
    <aside className="adminMenu">
      <button className="adminNovo">⊕ &nbsp; + Novo evento</button>
      <nav>{itens.map(([id, icone, texto]) => <button key={id} className={secao === id ? 'ativo' : ''} onClick={() => setSecao(id)}><span>{icone}</span>{texto}</button>)}</nav>
      <div className="adminAuditoria"><strong>♙ AUDITORIA ATIVA</strong><p>Sessão sob custódia de compliance. Todos os registros auditados geram hash SHA-256 irrevogável.</p></div>
      <div className="adminMenuRodape"><button>◎ Perfil</button><button className="sair" onClick={aoSair}>↪ Sair</button></div>
    </aside>
  )
}

export function CartaoMetrica({ titulo, valor, texto, tom = 'roxo' }) {
  return <article className={`adminMetrica ${tom}`}><div><small>{titulo}</small><span>▣</span></div><strong>{valor}</strong><p>{texto}</p></article>
}

export function AdminPortal({ aoSair }) {
  const [propostaSelecionada, setPropostaSelecionada] = useState(null)
  useEffect(() => {
  if (!propostaSelecionada) return

  function fecharComEsc(evento) {
    if (evento.key === 'Escape') {
      setPropostaSelecionada(null)
    }
  }

  window.addEventListener('keydown', fecharComEsc)

  return () => {
    window.removeEventListener('keydown', fecharComEsc)
  }
}, [propostaSelecionada])
  const [propostasAdmin, setPropostasAdmin] = useState([])
  const [carregandoPropostas, setCarregandoPropostas] = useState(false)
  const [erroPropostas, setErroPropostas] = useState('')
  const [cotacaoSelecionada, setCotacaoSelecionada] = useState(null)
  useEffect(() => {
  if (!cotacaoSelecionada) return

  function fecharComEsc(evento) {
    if (evento.key === 'Escape') {
      setCotacaoSelecionada(null)
    }
  }

  window.addEventListener('keydown', fecharComEsc)

  return () => {
    window.removeEventListener('keydown', fecharComEsc)
  }
}, [cotacaoSelecionada])
  const [cotacoesAdmin, setCotacoesAdmin] = useState([])
  const [carregandoCotacoes, setCarregandoCotacoes] = useState(false)
  const [erroCotacoes, setErroCotacoes] = useState('')
  const [usuarioSelecionado, setUsuarioSelecionado] = useState(null)
  useEffect(() => {
    if (!usuarioSelecionado) return
  
    function fecharComEsc(evento) {
      if (evento.key === 'Escape') {
        setUsuarioSelecionado(null)
      }
    }
  
    window.addEventListener('keydown', fecharComEsc)
  
    return () => {
      window.removeEventListener('keydown', fecharComEsc)
    }
  }, [usuarioSelecionado])
  const [filtroPerfil, setFiltroPerfil] = useState('todos')
  const [eventoSelecionado, setEventoSelecionado] = useState(null)
  useEffect(() => {
    if (!eventoSelecionado) return
  
    function fecharComEsc(evento) {
      if (evento.key === 'Escape') {
        setEventoSelecionado(null)
      }
    }
  
    window.addEventListener('keydown', fecharComEsc)
  
    return () => {
      window.removeEventListener('keydown', fecharComEsc)
    }
  }, [eventoSelecionado])
  const [secao, setSecao] = useState('contas')
  const [eventosAdmin, setEventosAdmin] = useState([])
  const [usuariosAdmin, setUsuariosAdmin] = useState([])
  const [buscaUsuarios, setBuscaUsuarios] = useState('')
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(false)
  const [erroUsuarios, setErroUsuarios] = useState('')
  useEffect(() => {
    if (secao !== 'usuarios') return
  
    async function carregarUsuarios() {
      setCarregandoUsuarios(true)
      setErroUsuarios('')
  
      try {
        const token = sessionStorage.getItem('token')
  
        const resposta = await fetch(apiUrl('/usuarios'), {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })
  
        if (!resposta.ok) {
          throw new Error('Não foi possível carregar os usuários.')
        }
  
        const dados = await resposta.json()
        setUsuariosAdmin(dados)
      } catch (erro) {
        setErroUsuarios(erro.message)
      } finally {
        setCarregandoUsuarios(false)
      }
    }
  
    carregarUsuarios()
  }, [secao])
  const [carregandoEventos, setCarregandoEventos] = useState(false)
  const [erroEventos, setErroEventos] = useState('')
  useEffect(() => {
  if (secao !== 'eventos') return

  const buscarEventosAdmin = async () => {
    setCarregandoEventos(true)
    setErroEventos('')

    try {
      const token = sessionStorage.getItem('token')

      const resposta = await fetch(
        apiUrl('/admin/eventos'),
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
      setEventosAdmin(dados)

    } catch (erro) {
      console.error(erro)
      setErroEventos(erro.message)
    } finally {
      setCarregandoEventos(false)
    }
  }

  buscarEventosAdmin()
  }, [secao])
  const [buscaEventos, setBuscaEventos] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [aba, setAba] = useState('todos')
  const [ordem, setOrdem] = useState('Risco')
  const [selecionados, setSelecionados] = useState([])
  const [solicitacoes, setSolicitacoes] = useState([])
  const [mensagem, setMensagem] = useState('')
  const [, setCarregando] = useState(true)
  useEffect(() => {
  const buscarSolicitacoes = async () => {
    try {
      const token = sessionStorage.getItem('token')

      const resposta = await fetch(
        apiUrl('/solicitacoes-acesso'),
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      const dados = await resposta.json()

      if (!resposta.ok) {
        throw new Error(dados.erro || 'Erro ao buscar solicitações.')
      }

      const lista = Array.isArray(dados)
        ? dados
        : dados.solicitacoes || []

      setSolicitacoes(
        lista
          .filter((item) => item.status === 'pendente')
          .map((item) => ({
            id: item.id,
            nome: item.nome,
            tipo: item.perfil_solicitado === 'organizador' ? 'Org' : 'Forn',
            hora: item.criada_em
              ? new Date(item.criada_em).toLocaleString('pt-BR')
              : '',
            documento: item.email,
            atuacao: item.perfil_solicitado === 'organizador'
              ? 'Organizador de eventos'
              : 'Fornecedor',
            detalhe: item.justificativa,
            responsavel: item.nome,
            cargo: 'Solicitante',
            score: 100,
            risco: 'Pendente de análise',
            docs: 0,
            urgente: false
          }))
      )
    } catch (erro) {
      console.error('Erro ao carregar solicitações:', erro)
      setMensagem(erro.message)
    } finally {
      setCarregando(false)
    }
  }

  buscarSolicitacoes()
  }, [])
  const filtradas = solicitacoes.filter((item) => aba === 'todos' || (aba === 'organizadores' ? item.tipo === 'Org' : item.tipo === 'Forn'))
  const totalPendentes = solicitacoes.length

  const totalOrganizadores = solicitacoes.filter(
  (item) => item.tipo === 'Org'
  ).length

  const totalFornecedores = solicitacoes.filter(
  (item) => item.tipo === 'Forn'
  ).length
  const percentualOrganizadores = totalPendentes > 0
  ? Math.round((totalOrganizadores / totalPendentes) * 100)
  : 0

  const percentualFornecedores = totalPendentes > 0
  ? 100 - percentualOrganizadores
  : 0
  const alternar = (id) => setSelecionados((atuais) => atuais.includes(id) ? atuais.filter((item) => item !== id) : [...atuais, id])
  const atualizar = async (id, acao) => {
  const status = acao === 'homologado'
    ? 'aprovado'
    : 'rejeitado'

  const confirmado = window.confirm(
    `Deseja realmente ${status === 'aprovado' ? 'aprovar' : 'rejeitar'} a solicitação #HOM-${id}?`
  )

  if (!confirmado) return

  try {
    const token = sessionStorage.getItem('token')

    const resposta = await fetch(
      apiUrl(`/solicitacoes-acesso/${id}`),
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      }
    )

    const dados = await resposta.json()

    if (!resposta.ok) {
      alert(dados.erro || 'Erro ao atualizar solicitação.')
      return
    }

    setSolicitacoes((atuais) =>
      atuais.filter((item) => item.id !== id)
    )

    setSelecionados((atuais) =>
      atuais.filter((item) => item !== id)
    )

    setMensagem(`Solicitação #HOM-${id} ${status} com sucesso!`)

  } catch (erro) {
    console.error('Erro ao atualizar solicitação:', erro)
    alert('Não foi possível conectar ao servidor.')
  }
}

  useEffect(() => {
  if (secao !== 'cotacoes') return

  async function carregarCotacoes() {
    setCarregandoCotacoes(true)
    setErroCotacoes('')

    try {
      const token = sessionStorage.getItem('token')

      const resposta = await fetch(apiUrl('/admin/cotacoes'), {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!resposta.ok) {
        if (resposta.status === 401) {
          throw new Error('Sessão expirada. Saia e entre novamente.')
        }

        throw new Error('Não foi possível carregar as cotações.')
      }

      const dados = await resposta.json()
      setCotacoesAdmin(dados)
    } catch (erro) {
      setErroCotacoes(erro.message)
    } finally {
      setCarregandoCotacoes(false)
    }
  }

  carregarCotacoes()
  }, [secao])
  useEffect(() => {
  if (secao !== 'propostas') return

  async function carregarPropostas() {
    setCarregandoPropostas(true)
    setErroPropostas('')

    try {
      const token = sessionStorage.getItem('token')

      const resposta = await fetch(apiUrl('/admin/propostas'), {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!resposta.ok) {
        if (resposta.status === 401) {
          throw new Error('Sessão expirada. Saia e entre novamente.')
        }

        throw new Error('Não foi possível carregar as propostas.')
      }

      const dados = await resposta.json()
      setPropostasAdmin(dados)
    } catch (erro) {
      setErroPropostas(erro.message)
    } finally {
      setCarregandoPropostas(false)
    }
  }

  carregarPropostas()
}, [secao])
  return (
    <div className="adminApp">
      <AdminTopo aoSair={aoSair} />
      <div className="adminEstrutura">
        <AdminMenu secao={secao} setSecao={setSecao} aoSair={aoSair} />
        <main className="adminConteudo">
          {secao === 'eventos' ? (
  <section className="adminHero">
    <div>
      <h1>Gestão de Eventos</h1>
      <div className="adminResumoEventos">
  <p>
    Total de eventos: <strong>{eventosAdmin.length}</strong>
  </p>

  <p>
    Eventos ativos:{' '}
    <strong>
      {eventosAdmin.filter(
        (evento) => evento.status === 'Ativo'
      ).length}
    </strong>
  </p>

  <p>
    Em planejamento:{' '}
    <strong>
      {eventosAdmin.filter(
        (evento) => evento.status === 'Em planejamento'
      ).length}
    </strong>
  </p>
</div>
      <p>Gerencie e acompanhe os eventos cadastrados no TrocaTicket.</p>
      <div className="adminBuscaEventos">
  <input
    type="text"
    placeholder="Pesquisar evento pelo nome..."
    value={buscaEventos}
    onChange={(e) => setBuscaEventos(e.target.value)}
  />
</div>
<div className="adminFiltroStatus">
  <label htmlFor="filtroStatusEventos">Filtrar por status:</label>

  <select
    id="filtroStatusEventos"
    value={filtroStatus}
    onChange={(e) => setFiltroStatus(e.target.value)}
  >
    <option value="todos">Todos os eventos</option>
    <option value="Ativo">Ativo</option>
    <option value="Em planejamento">Em planejamento</option>
  </select>
</div>
      {carregandoEventos ? (
  <p>Carregando eventos...</p>
) : erroEventos ? (
  <p role="alert">{erroEventos}</p>
) : eventosAdmin.length === 0 ? (
  <p>Nenhum evento cadastrado.</p>
) : (
  <div className="adminTabelaEventos">
  <table>
    <thead>
      <tr>
        <th>Evento</th>
        <th>Local</th>
        <th>Status</th>
        <th>Organizador</th>
      </tr>
    </thead>

    <tbody>
      {eventosAdmin
  .filter((evento) => {
    const correspondeNome = evento.nome
      .toLowerCase()
      .includes(buscaEventos.toLowerCase().trim())

    const correspondeStatus =
      filtroStatus === 'todos' ||
      evento.status?.toLowerCase() === filtroStatus.toLowerCase()

    return correspondeNome && correspondeStatus
  })
  .map((evento) => (
    <tr key={evento.id}>
    <td>{evento.nome}</td>
    <td>{evento.local}</td>
    <td>{evento.status}</td>
    <td>{evento.organizador_nome || `#${evento.usuario_id}`}</td>
  
    <td>
      <button
        type="button"
        className="adminBotaoVisualizar"
        onClick={() => {
          setEventoSelecionado(evento)
        }}
      >
        Visualizar
      </button>
    </td>
    </tr>
      ))}
    </tbody>
  </table>
</div>
)}
{eventoSelecionado && (
  <div
    className="adminModalOverlay"
    onClick={() => setEventoSelecionado(null)}
  >
    <div
      className="adminDetalhesEvento"
      role="dialog"
      aria-modal="true"
      aria-label="Detalhes do evento"
      onClick={(e) => e.stopPropagation()}
    >
    <h3>Detalhes do Evento</h3>

    <p><strong>Nome:</strong> {eventoSelecionado.nome}</p>
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
  {eventoSelecionado.horario?.slice(0, 5) || 'Não informado'}
</p>
    <p><strong>Local:</strong> {eventoSelecionado.local}</p>
    <p><strong>Categoria:</strong> {eventoSelecionado.categoria}</p>
    <p><strong>Público:</strong> {eventoSelecionado.publico}</p>
    <p><strong>Descrição:</strong> {eventoSelecionado.descricao || 'Sem descrição'}</p>
    <p><strong>Status:</strong> {eventoSelecionado.status}</p>
    <p><strong>Organizador:</strong>{' '}{eventoSelecionado.organizador_nome || `#${eventoSelecionado.usuario_id}`}</p>

    <button
      type="button"
      onClick={() => setEventoSelecionado(null)}
    >
      Fechar
    </button>
  </div>
</div>
)}
    </div>
  </section>
) : secao === 'usuarios' ? (
  <> 
  <section className="adminGestaoUsuarios">
    <h2>Gestão de Usuários</h2>
    <p>Consulte os usuários cadastrados no TrocaTicket.</p>

    <div className="adminBuscaEventos">
  <input
    type="search"
    placeholder="Pesquisar por nome ou e-mail..."
    aria-label="Pesquisar usuários"
    value={buscaUsuarios}
    onChange={(e) => setBuscaUsuarios(e.target.value)}
  />
</div>

<div className="adminFiltroStatus">
  <label htmlFor="filtroPerfilUsuarios">
    Filtrar por perfil:
  </label>

  <select
    id="filtroPerfilUsuarios"
    value={filtroPerfil}
    onChange={(e) => setFiltroPerfil(e.target.value)}
  >
    <option value="todos">Todos os perfis</option>
    <option value="admin">Administrador</option>
    <option value="organizador">Organizador</option>
    <option value="fornecedor">Fornecedor</option>
    <option value="participante">Participante</option>
  </select>
</div>

    {carregandoUsuarios ? (
      <p>Carregando usuários...</p>
    ) : erroUsuarios ? (
      <p role="alert">{erroUsuarios}</p>
    ) : usuariosAdmin.length === 0 ? (
      <p>Nenhum usuário cadastrado.</p>
    ) : (
      <div className="adminTabelaEventos">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Ações</th>
            </tr>
          </thead>

          <tbody>
          {usuariosAdmin
  .filter((usuario) => {
    const busca = buscaUsuarios.toLowerCase().trim()

    const correspondeBusca =
      usuario.nome.toLowerCase().includes(busca) ||
      usuario.email.toLowerCase().includes(busca)

    const correspondePerfil =
      filtroPerfil === 'todos' ||
      usuario.perfil === filtroPerfil

    return correspondeBusca && correspondePerfil
  })
  .map((usuario) => (
              <tr key={usuario.id}>
                <td>#{usuario.id}</td>
                <td>{usuario.nome}</td>
                <td>{usuario.email}</td>
                <td>{usuario.perfil? usuario.perfil.charAt(0).toUpperCase() + usuario.perfil.slice(1): 'Não definido'}</td>
                <td><button
                    type="button"
                    className="adminBotaoVisualizar"
                    onClick={() => setUsuarioSelecionado(usuario)}>Visualizar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>

{usuarioSelecionado && (
  <div
    className="adminModalOverlay"
    onClick={() => setUsuarioSelecionado(null)}
  >
    <div
      className="adminModal"
      role="dialog"
      aria-modal="true"
      aria-label="Detalhes do usuário"
      onClick={(e) => e.stopPropagation()}
    >
      <h2>Detalhes do Usuário</h2>

      <p><strong>ID:</strong> #{usuarioSelecionado.id}</p>

      <p><strong>Nome:</strong> {usuarioSelecionado.nome}</p>

      <p><strong>E-mail:</strong> {usuarioSelecionado.email}</p>

      <p>
        <strong>Perfil:</strong>{' '}
        {usuarioSelecionado.perfil
          ? usuarioSelecionado.perfil.charAt(0).toUpperCase() +
            usuarioSelecionado.perfil.slice(1)
          : 'Não definido'}
      </p>

      <button
        type="button"
        onClick={() => setUsuarioSelecionado(null)}
      >
        Fechar
      </button>
    </div>
  </div>
)}
</>
  
) : secao === 'cotacoes' ? (
  <>
    <section className="adminGestaoCotacoes">
    <h2>Gestão de Cotações</h2>

    <p>Consulte e acompanhe as cotações cadastradas no TrocaTicket.</p>

    <div className="adminTabelaEventos">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Evento</th>
            <th>Modalidade</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>

        <tbody>
  {carregandoCotacoes ? (
    <tr>
      <td colSpan="5">Carregando cotações...</td>
    </tr>
  ) : erroCotacoes ? (
    <tr>
      <td colSpan="5">{erroCotacoes}</td>
    </tr>
  ) : cotacoesAdmin.length === 0 ? (
    <tr>
      <td colSpan="5">Nenhuma cotação cadastrada.</td>
    </tr>
  ) : (
    cotacoesAdmin.map((cotacao) => (
      <tr key={cotacao.id}>
        <td>#{cotacao.id}</td>
        <td>{cotacao.evento_nome}</td>
        <td>{cotacao.modalidade || 'Não informada'}</td>
        <td>{cotacao.status || 'Não definido'}</td>
        <td>
  <button
    type="button"
    className="adminBotaoVisualizar"
    onClick={() => setCotacaoSelecionada(cotacao)}
  >
    Visualizar
  </button>
</td>
      </tr>
    ))
  )}
</tbody>
      </table>
    </div>
  </section>
  {cotacaoSelecionada && (
  <div
    className="adminModalOverlay"
    onClick={() => setCotacaoSelecionada(null)}
  >
    <div
      className="adminModal"
      role="dialog"
      aria-modal="true"
      aria-label="Detalhes da cotação"
      onClick={(e) => e.stopPropagation()}
    >
      <h2>Detalhes da Cotação</h2>

      <p><strong>ID:</strong> #{cotacaoSelecionada.id}</p>

      <p>
        <strong>Evento:</strong> {cotacaoSelecionada.evento_nome}
      </p>

      <p>
        <strong>Modalidade:</strong> {cotacaoSelecionada.modalidade || 'Não informada'}
      </p>

      <p>
        <strong>Status:</strong> {cotacaoSelecionada.status || 'Não definido'}
      </p>

      <p>
        <strong>Prazo:</strong>{' '}
        {cotacaoSelecionada.prazo
          ? new Date(cotacaoSelecionada.prazo).toLocaleDateString('pt-BR', {
              timeZone: 'UTC'
            })
          : 'Não informado'}
      </p>

      <p>
        <strong>Observações:</strong>{' '}
        {cotacaoSelecionada.observacoes || 'Nenhuma observação'}
      </p>

      <button
        type="button"
        onClick={() => setCotacaoSelecionada(null)}
      >
        Fechar
      </button>
    </div>
  </div>
)}
</>
) : secao === 'propostas' ? (
  <>
    <section className="adminGestaoPropostas">
    <h2>Gestão de Propostas</h2>

    <p>
      Consulte e acompanhe as propostas enviadas pelos fornecedores.
    </p>

    <div className="adminTabelaEventos">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Evento</th>
            <th>Fornecedor</th>
            <th>Valor</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>

        <tbody>
  {carregandoPropostas ? (
    <tr>
      <td colSpan="6">Carregando propostas...</td>
    </tr>
  ) : erroPropostas ? (
    <tr>
      <td colSpan="6" role="alert">{erroPropostas}</td>
    </tr>
  ) : propostasAdmin.length === 0 ? (
    <tr>
      <td colSpan="6">Nenhuma proposta cadastrada.</td>
    </tr>
  ) : (
    propostasAdmin.map((proposta) => (
      <tr key={proposta.id}>
        <td>#{proposta.id}</td>
        <td>{proposta.evento_nome}</td>
        <td>{proposta.fornecedor_nome}</td>
        <td>
          {Number(proposta.valor).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
          })}
        </td>
        <td>{proposta.status || 'Não definido'}</td>
        <td>
  <button
    type="button"
    className="adminBotaoVisualizar"
    onClick={() => setPropostaSelecionada(proposta)}
  >
    Visualizar
  </button>
</td>
      </tr>
    ))
  )}
</tbody>
      </table>
    </div>
  </section>
  {propostaSelecionada && (
  <div
    className="adminModalOverlay"
    onClick={() => setPropostaSelecionada(null)}
  >
    <div
      className="adminModal"
      role="dialog"
      aria-modal="true"
      aria-label="Detalhes da proposta"
      onClick={(e) => e.stopPropagation()}
    >
      <h2>Detalhes da Proposta</h2>

      <p><strong>ID:</strong> #{propostaSelecionada.id}</p>

      <p><strong>Evento:</strong> {propostaSelecionada.evento_nome}</p>

      <p><strong>Fornecedor:</strong> {propostaSelecionada.fornecedor_nome}</p>

      <p>
        <strong>Valor:</strong>{' '}
        {Number(propostaSelecionada.valor).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        })}
      </p>

      <p><strong>Status:</strong> {propostaSelecionada.status || 'Não definido'}</p>

      <p>
        <strong>Condições de pagamento:</strong>{' '}
        {propostaSelecionada.condicoes_pagamento || 'Não informadas'}
      </p>

      <p>
        <strong>Detalhes técnicos:</strong>{' '}
        {propostaSelecionada.detalhes_tecnicos || 'Não informados'}
      </p>

      <button
        type="button"
        onClick={() => setPropostaSelecionada(null)}
      >
        Fechar
      </button>
    </div>
  </div>
)}
</>

) : (
  <>
          
          <div className="adminTrilha">
  TrocaTicket Admin &nbsp;›&nbsp; Administração &nbsp;›&nbsp;
  <b>Fornecedores & Contas</b>
</div>
          <section >
  <div className="concluida">
    <b>1</b>
    <span>
      <small>ETAPA 1 · SOLICITAÇÃO</small>
      <strong>Solicitação de Acesso</strong>
    </span>
  </div>

  <div >
    <b>2</b>
    <span>
      <small>ETAPA 2 · ANÁLISE</small>
      <strong>Análise do Administrador</strong>
    </span>
  </div>

  <div>
    <b>3</b>
    <span>
      <small>ETAPA 3 · DECISÃO</small>
      <strong>Aprovação ou Rejeição</strong>
    </span>
  </div>
</section>
          <section className="adminHero">
  <div>
    <div className="adminRotulo">
      GESTÃO DE SOLICITAÇÕES DE ACESSO
    </div>

    <h1>{totalPendentes} SOLICITAÇÕES PENDENTES</h1>

    <p>
      Analise as solicitações de usuários que desejam se tornar
      organizadores de eventos ou fornecedores no TrocaTicket.
    </p>

    <strong className="adminCriterio">
      ✓ Aprovações e rejeições registradas no banco de dados
    </strong>
  </div>

  <div className="adminStatusFila">
    <div>
      <span>
        <small>AGUARDANDO ANÁLISE</small>
        <b>{totalPendentes} solicitações</b>
      </span>

      <span>
        <small>TIPOS DE ACESSO</small>
        <b>Organizador e Fornecedor</b>
      </span>
    </div>

    <p>
      Selecione uma solicitação na tabela abaixo para
      aprovar ou rejeitar o pedido de acesso.
    </p>
  </div>
</section>
          <section className="adminMetricas">
  <CartaoMetrica
    titulo="ORGANIZADORES PENDENTES"
    valor={totalOrganizadores}
    texto="Solicitações aguardando aprovação"
  />

  <CartaoMetrica
    titulo="FORNECEDORES PENDENTES"
    valor={totalFornecedores}
    texto="Solicitações aguardando aprovação"
    tom="laranja"
  />

  <CartaoMetrica
    titulo="TOTAL DE SOLICITAÇÕES"
    valor={totalPendentes}
    texto="Solicitações pendentes de análise"
    tom="verde"
  />
</section>
          <section className="adminFila">
            <div className="adminFilaCabecalho"><div><h2>Solicitações de Acesso Pendentes</h2><p>
  Consulte os pedidos de acesso e aprove ou rejeite
  as solicitações de organizadores e fornecedores.
</p></div><div className="adminAbas">
            <button  className={aba === 'todos' ? 'ativo' : ''} onClick={() => setAba('todos')}>
            Todos ({totalPendentes})</button>

            <button className={aba === 'organizadores' ? 'ativo' : ''} onClick={() => setAba('organizadores')}>
            Organizadores ({totalOrganizadores})
            </button>

            <button className={aba === 'fornecedores' ? 'ativo' : ''} onClick={() => setAba('fornecedores')}>
            Fornecedores ({totalFornecedores})
            </button></div></div>
            <div className="adminProgresso"><b>{percentualOrganizadores}% Organizadores
            ({totalOrganizadores} solicitações)</b><span><i style={{ width: `${percentualOrganizadores}%` }} /></span><b>{percentualFornecedores}% Fornecedores({totalFornecedores} solicitações)</b></div>
            <div className="adminOrdenacao">Ordenar por: <select value={ordem} onChange={(e) => setOrdem(e.target.value)}><option>Risco</option><option>Prioridade</option><option>Mais recentes</option></select></div>
            {mensagem && <div className="adminMensagem" role="status">✓ {mensagem}<button onClick={() => setMensagem('')}>×</button></div>}
            <div className="adminTabelaWrap"><table className="adminTabela"><thead><tr><th><input type="checkbox" aria-label="Selecionar todos" checked={filtradas.length > 0 && filtradas.every((item) => selecionados.includes(item.id))} onChange={(e) => setSelecionados(e.target.checked ? filtradas.map((item) => item.id) : [])} /></th><th>PROTOCOLO / DATA</th><th>SOLICITANTE</th><th>ATUAÇÃO</th><th>RESPONSÁVEL</th><th>JUSTIFICATIVA</th><th>AÇÕES</th></tr></thead>
              <tbody>{filtradas.map((item) => <tr key={item.id} className={item.urgente ? 'urgente' : ''}><td><input type="checkbox" aria-label={`Selecionar ${item.nome}`} checked={selecionados.includes(item.id)} onChange={() => alternar(item.id)} /></td><td><strong>#HOM-{item.id}</strong><small className={item.urgente ? 'atraso' : ''}>{item.hora}</small></td><td><strong>{item.nome}</strong><small>{item.documento}</small></td><td><strong>{item.atuacao}</strong><small>{item.detalhe}</small></td><td><strong>{item.responsavel}</strong><small>{item.cargo}</small></td><td>
  <span>{item.detalhe || 'Não informada'}</span>
</td><td><div className="adminAcoesLinha"><button className="aprovar" onClick={() => atualizar(item.id, 'homologado')}>Aprovar</button><button className="recusar" onClick={() => atualizar(item.id, 'recusado')}>Recusar</button></div></td></tr>)}</tbody></table></div>
            <div className="adminPaginacao">
  <span>
    Exibindo {filtradas.length} de {totalPendentes} solicitações pendentes
  </span>
</div>
          </section>
            </>
          )}
        </main>
      </div>
      <footer className="adminBarraLote"><div><b>{selecionados.length}</b><span><strong>{selecionados.length} cadastros selecionados para ação em lote</strong><small>Organizadores e fornecedores de estrutura técnica</small></span></div><div><button type="button"className="recusar" disabled title="Funcionalidade em desenvolvimento">⊘ Reprovar em lote (em breve)</button><button type="button"className="aprovarLote"disabledtitle="Funcionalidade em desenvolvimento">✥ Aprovar em lote (em breve)</button></div></footer></div>
  )
}
