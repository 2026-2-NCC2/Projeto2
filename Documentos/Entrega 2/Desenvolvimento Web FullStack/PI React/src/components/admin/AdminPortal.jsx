import { PerfilPessoal } from '../perfil/PerfilPessoal.jsx'
import { Icone } from '../ui/Icone.jsx'
import { IdentidadeConta } from '../layout/IdentidadeConta.jsx'
import { MidiaEvento } from '../eventos/MidiaEvento.jsx'
import { apiUrl } from '../../services/api.js'
import { useEffect, useState } from 'react';
import { NavegacaoRecolhivel } from '../layout/NavegacaoRecolhivel.jsx'
import { useFocoModal } from '../../hooks/useFocoModal.js'

export function AdminTopo({ aoSair }) {
  return (
    <header className="adminTopo">
      <div className="adminMarca"><span>TT</span><strong>TrocaTicket</strong><small>Gestão Corporativa</small></div>
      <div className="adminSeguro">Administração</div>
      <label className="adminBusca"><Icone nome="busca" tamanho={16} /><input aria-label="Busca geral indisponível" placeholder="Busca geral indisponível" disabled /></label>
      <button className="adminIcone" aria-label="Notificações indisponíveis" title="Notificações indisponíveis" disabled>●</button>
      <button className="adminUsuario" aria-label="Sair da conta de administrador" onClick={aoSair}><Icone nome="perfil" /><IdentidadeConta /></button>
    </header>
  )
}

export function AdminMenu({ secao, setSecao, aoSair }) {
  const itens = [
    ['painel', 'custos', 'Painel de evento', true],
    ['eventos', 'eventos', 'Eventos'],
    ['usuarios', 'perfil', 'Usuários'],
    ['cotacoes', 'documento', 'Cotações'],
    ['propostas', 'ticket', 'Propostas'],
    ['contas', 'acesso', 'Solicitações de acesso'],
    ['relatorios', 'documento', 'Relatórios', true],
  ]
  return (
    <aside className="adminMenu" aria-label="Navegação administrativa">
      <button className="adminNovo" disabled title="Funcionalidade indisponível">⊕ &nbsp; + Novo evento (indisponível)</button>
      <nav aria-label="Seções administrativas">{itens.map(([id, icone, texto, indisponivel]) => <button key={id} disabled={indisponivel} title={indisponivel ? 'Funcionalidade em desenvolvimento' : undefined} aria-current={!indisponivel && secao === id ? 'page' : undefined} className={!indisponivel && secao === id ? 'ativo' : ''} onClick={indisponivel ? undefined : () => setSecao(id)}><Icone nome={icone} />{texto}{indisponivel && <small className="adminEmDesenvolvimento">Em desenvolvimento</small>}</button>)}</nav>
      <div className="adminAuditoria"><strong>ADMINISTRAÇÃO</strong><p>Consulte eventos, usuários, cotações e propostas. Analise solicitações de acesso.</p></div>
      <div className="adminMenuRodape"><button type="button" aria-current={secao === 'perfil' ? 'page' : undefined} className={secao === 'perfil' ? 'ativo' : ''} onClick={() => setSecao('perfil')}><Icone nome="perfil" />Meu perfil</button><button className="sair" onClick={aoSair}><Icone nome="sair" /> Sair</button></div>
    </aside>
  )
}

export function CartaoMetrica({ titulo, valor, texto, tom = 'roxo' }) {
  return <article className={`adminMetrica ${tom}`}><div><small>{titulo}</small><Icone nome="custos" /></div><strong>{valor}</strong><p>{texto}</p></article>
}

export function AdminPortal({ aoSair }) {
  const [propostaSelecionada, setPropostaSelecionada] = useState(null)
  const propostaModalRef = useFocoModal(propostaSelecionada, setPropostaSelecionada)
  const [propostasAdmin, setPropostasAdmin] = useState([])
  const [carregandoPropostas, setCarregandoPropostas] = useState(false)
  const [erroPropostas, setErroPropostas] = useState('')
  const [cotacaoSelecionada, setCotacaoSelecionada] = useState(null)
  const cotacaoModalRef = useFocoModal(cotacaoSelecionada, setCotacaoSelecionada)
  const [cotacoesAdmin, setCotacoesAdmin] = useState([])
  const [carregandoCotacoes, setCarregandoCotacoes] = useState(false)
  const [erroCotacoes, setErroCotacoes] = useState('')
  const [usuarioSelecionado, setUsuarioSelecionado] = useState(null)
  const usuarioModalRef = useFocoModal(usuarioSelecionado, setUsuarioSelecionado)
  const [filtroPerfil, setFiltroPerfil] = useState('todos')
  const [eventoSelecionado, setEventoSelecionado] = useState(null)
  const eventoModalRef = useFocoModal(eventoSelecionado, setEventoSelecionado)
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
  const [ordem, setOrdem] = useState('recentes')
  const [solicitacoes, setSolicitacoes] = useState([])
  const [mensagem, setMensagem] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erroSolicitacoes, setErroSolicitacoes] = useState('')
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
            criadaEm: item.criada_em,
            hora: item.criada_em && Number.isFinite(Date.parse(item.criada_em))
              ? new Date(item.criada_em).toLocaleString('pt-BR')
              : 'Data não informada',
            documento: item.email,
            atuacao: item.perfil_solicitado === 'organizador'
              ? 'Organizador de eventos'
              : 'Fornecedor',
            detalhe: item.justificativa,
            status: item.status
          }))
      )
    } catch (erro) {
      console.error('Erro ao carregar solicitações:', erro)
      setErroSolicitacoes(erro.message)
    } finally {
      setCarregando(false)
    }
  }

  buscarSolicitacoes()
  }, [])
  const filtradas = solicitacoes
    .filter((item) => aba === 'todos' || (aba === 'organizadores' ? item.tipo === 'Org' : item.tipo === 'Forn'))
    .sort((a, b) => {
      const desempate = String(a.id).localeCompare(String(b.id), 'pt-BR', { numeric: true })
      if (ordem === 'nome') return (a.nome || '').localeCompare(b.nome || '', 'pt-BR') || desempate
      const dataA = Date.parse(a.criadaEm), dataB = Date.parse(b.criadaEm)
      // Datas ausentes ficam ao final em ambas as direções.
      if (!Number.isFinite(dataA)) return Number.isFinite(dataB) ? 1 : desempate
      if (!Number.isFinite(dataB)) return -1
      return (ordem === 'antigas' ? dataA - dataB : dataB - dataA) || desempate
    })
  const indicador = (valor) => carregando || erroSolicitacoes ? '—' : valor
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
  const atualizar = async (id, acao) => {
  const status = acao === 'homologado'
    ? 'aprovado'
    : 'rejeitado'

  const confirmado = window.confirm(
    `Deseja realmente ${status === 'aprovado' ? 'aprovar' : 'rejeitar'} a solicitação #${id}?`
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

    setMensagem(`Solicitação #${id} ${status} com sucesso!`)

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
        <NavegacaoRecolhivel id="menu-administrador" rotulo="Menu do administrador" className="adminNavegacao">
          <AdminMenu secao={secao} setSecao={setSecao} aoSair={aoSair} />
        </NavegacaoRecolhivel>
        <main className="adminConteudo">
          {secao === 'perfil' ? <PerfilPessoal contexto="Administração" /> : secao === 'eventos' ? (
  <section className="adminHero">
    <div>
      <h1>Gestão de Eventos</h1>
      <div className="adminResumoEventos">
  <p>
    Total de eventos: <strong>{carregandoEventos || erroEventos ? '—' : eventosAdmin.length}</strong>
  </p>

  <p>
    Eventos ativos:{' '}
    <strong>
      {carregandoEventos || erroEventos ? '—' : eventosAdmin.filter(
        (evento) => evento.status === 'Ativo'
      ).length}
    </strong>
  </p>

  <p>
    Em planejamento:{' '}
    <strong>
      {carregandoEventos || erroEventos ? '—' : eventosAdmin.filter(
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
  <div className="adminTabelaEventos" role="region" aria-label="Eventos cadastrados" tabIndex={0}>
  <table>
    <thead>
      <tr>
        <th>Evento</th>
        <th>Local</th>
        <th>Status</th>
        <th>Organizador</th>
        <th>Ações</th>
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
        onClick={(e) => {
          e.currentTarget.focus()
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
      ref={eventoModalRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Detalhes do evento"
      onClick={(e) => e.stopPropagation()}
    >
    <h3>Detalhes do Evento</h3>

    <p><strong>Nome:</strong> {eventoSelecionado.nome}</p>
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
      <div className="adminTabelaEventos" role="region" aria-label="Usuários cadastrados" tabIndex={0}>
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
                    onClick={(e) => { e.currentTarget.focus(); setUsuarioSelecionado(usuario) }}>Visualizar</button>
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
      ref={usuarioModalRef}
      tabIndex={-1}
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

    <div className="adminTabelaEventos" role="region" aria-label="Cotações cadastradas" tabIndex={0}>
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
    onClick={(e) => { e.currentTarget.focus(); setCotacaoSelecionada(cotacao) }}
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
      ref={cotacaoModalRef}
      tabIndex={-1}
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

    <div className="adminTabelaEventos" role="region" aria-label="Propostas cadastradas" tabIndex={0}>
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
    onClick={(e) => { e.currentTarget.focus(); setPropostaSelecionada(proposta) }}
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
      ref={propostaModalRef}
      tabIndex={-1}
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

) : secao === 'contas' ? (
  <>
          
          <div className="adminTrilha">
  TrocaTicket Admin &nbsp;›&nbsp; Administração &nbsp;›&nbsp;
  <b>Solicitações de acesso</b>
</div>
          <section className="adminEtapas" aria-label="Etapas da solicitação">
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

    <h1>{indicador(totalPendentes)} SOLICITAÇÕES PENDENTES</h1>

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
        <b>{indicador(totalPendentes)} solicitações</b>
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
    valor={indicador(totalOrganizadores)}
    texto="Solicitações aguardando aprovação"
  />

  <CartaoMetrica
    titulo="FORNECEDORES PENDENTES"
    valor={indicador(totalFornecedores)}
    texto="Solicitações aguardando aprovação"
    tom="laranja"
  />

  <CartaoMetrica
    titulo="TOTAL DE SOLICITAÇÕES"
    valor={indicador(totalPendentes)}
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
            Todos ({indicador(totalPendentes)})</button>

            <button className={aba === 'organizadores' ? 'ativo' : ''} onClick={() => setAba('organizadores')}>
            Organizadores ({indicador(totalOrganizadores)})
            </button>

            <button className={aba === 'fornecedores' ? 'ativo' : ''} onClick={() => setAba('fornecedores')}>
            Fornecedores ({indicador(totalFornecedores)})
            </button></div></div>
            {!carregando && !erroSolicitacoes && <div className="adminProgresso"><b>{percentualOrganizadores}% Organizadores
            ({totalOrganizadores} solicitações)</b><span><i style={{ width: `${percentualOrganizadores}%` }} /></span><b>{percentualFornecedores}% Fornecedores({totalFornecedores} solicitações)</b></div>}
            <div className="adminOrdenacao"><label htmlFor="ordemSolicitacoes">Ordenar por:</label> <select id="ordemSolicitacoes" value={ordem} onChange={(e) => setOrdem(e.target.value)}><option value="recentes">Mais recentes</option><option value="antigas">Mais antigas</option><option value="nome">Nome do solicitante</option></select></div>
            {mensagem && <div className="adminMensagem" role="status">✓ {mensagem}<button onClick={() => setMensagem('')}>×</button></div>}
            <div className="adminTabelaWrap" role="region" aria-label="Solicitações de acesso" tabIndex={0}><table className="adminTabela"><thead><tr><th><input type="checkbox" aria-label="Seleção em lote indisponível" disabled title="Ações em lote indisponíveis" /></th><th>PROTOCOLO / DATA</th><th>SOLICITANTE</th><th>ATUAÇÃO</th><th>STATUS</th><th>JUSTIFICATIVA</th><th>AÇÕES</th></tr></thead>
              <tbody>{carregando ? <tr><td colSpan="7" role="status">Carregando solicitações...</td></tr> : erroSolicitacoes ? <tr><td colSpan="7" role="alert">{erroSolicitacoes}</td></tr> : filtradas.length === 0 ? <tr><td colSpan="7">Nenhuma solicitação pendente neste filtro.</td></tr> : filtradas.map((item) => <tr key={item.id}><td><input type="checkbox" aria-label="Seleção em lote indisponível" disabled /></td><td><strong>#{item.id}</strong><small>{item.hora}</small></td><td><strong>{item.nome}</strong><small>{item.documento}</small></td><td><strong>{item.atuacao}</strong></td><td><span>{item.status}</span></td><td>
  <span>{item.detalhe || 'Não informada'}</span>
</td><td><div className="adminAcoesLinha"><button className="aprovar" onClick={() => atualizar(item.id, 'homologado')}>Aprovar</button><button className="recusar" onClick={() => atualizar(item.id, 'recusado')}>Recusar</button></div></td></tr>)}</tbody></table></div>
            <div className="adminPaginacao">
  <span>
    Exibindo {indicador(filtradas.length)} de {indicador(totalPendentes)} solicitações pendentes
  </span>
</div>
          </section>
            </>
          ) : (
            <p role="status">Funcionalidade em desenvolvimento.</p>
          )}
        </main>
      </div>
      {secao === 'contas' && <footer className="adminBarraLote"><div><span><strong>Ações em lote indisponíveis</strong><small>Utilize Aprovar ou Recusar em cada solicitação.</small></span></div><div><button type="button" className="recusar" disabled title="Funcionalidade em desenvolvimento">Reprovar em lote (indisponível)</button><button type="button" className="aprovarLote" disabled title="Funcionalidade em desenvolvimento">Aprovar em lote (indisponível)</button></div></footer>}</div>
  )
}
