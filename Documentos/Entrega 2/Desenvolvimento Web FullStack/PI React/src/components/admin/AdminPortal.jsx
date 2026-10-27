import { useState, useMemo, useEffect } from 'react'

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
    ['painel', '▦', 'Painel de evento'], ['eventos', '□', 'Eventos'], ['cotacoes', '▣', 'Cotações'],
    ['propostas', '◇', 'Propostas'], ['contas', '▥', 'Fornecedores & Contas'], ['relatorios', '▤', 'Relatórios'],
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

export function AdminPortal({ setPagina }) {
  const [secao, setSecao] = useState('contas')
  const [eventosAdmin, setEventosAdmin] = useState([])
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
        'http://localhost:3001/admin/eventos',
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
  const [carregando, setCarregando] = useState(true)
  useEffect(() => {
  const buscarSolicitacoes = async () => {
    try {
      const token = sessionStorage.getItem('token')

      const resposta = await fetch(
        'http://localhost:3001/solicitacoes-acesso',
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
  const [mensagem, setMensagem] = useState('')
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
      `http://localhost:3001/solicitacoes-acesso/${id}`,
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
  const agirEmLote = (acao) => {
    if (!selecionados.length) return
    setSolicitacoes((atuais) => atuais.filter((item) => !selecionados.includes(item.id)))
    setMensagem(`${selecionados.length} cadastros ${acao} em lote.`)
    setSelecionados([])
  }
  return (
    <div className="adminApp">
      <AdminTopo aoSair={() => setPagina('login')} />
      <div className="adminEstrutura">
        <AdminMenu secao={secao} setSecao={setSecao} aoSair={() => setPagina('login')} />
        <main className="adminConteudo">
          {secao === 'eventos' ? (
  <section className="adminHero">
    <div>
      <h1>Gestão de Eventos</h1>
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
          <td>#{evento.usuario_id}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
)}
    </div>
  </section>
) : (
  <>
          
          <div className="adminTrilha">TrocaTicket Admin &nbsp;›&nbsp; Governança &nbsp;›&nbsp; Gestão de Contas &nbsp;›&nbsp; <b>Fila de Homologação</b><span>#AUD-2026-0812 &nbsp; 16 Out 2026, 14:45 BRT</span></div>
          <section className="adminEtapas">
            <div className="concluida"><b>✓</b><span><small>ETAPA 1 · CONCLUÍDO</small><strong>Recebimento de Documentos</strong></span></div>
            <div className="atual"><b>2</b><span><small>ETAPA 2 · EM FOCO (AUDITORIA)</small><strong>Validação Fiscal & CNPJ</strong></span></div>
            <div><b>3</b><span><small>ETAPA 3 · PRÓXIMO</small><strong>Liberação de Permissões</strong></span></div>
          </section>
          <section className="adminHero">
            <div><div className="adminRotulo">FILA OPERACIONAL ATIVA <span>◷ Tempo Médio de Análise: 4.2h</span></div><h1>{totalPendentes} SOLICITAÇÕES PENDENTES</h1><p>Auditoria de idoneidade jurídica, cruzamento automatizado com a Receita Federal e verificação de alvarás para emissão de ingressos e fornecimento de infraestrutura técnica.</p><strong className="adminCriterio">▣ Critério de Homologação: Regularidade RFB + CNAE Compatível + Histórico de Litígio Zerado</strong></div>
            <div className="adminStatusFila"><div><span><small>STATUS DA FILA</small><b>● Atenção Operacional (8+)</b></span><span><small>CONFIABILIDADE DOC.</small><b className="verde">92% &nbsp; Ótimo</b></span></div><button onClick={() => agirEmLote('enviados para auditoria')}>⚡ Auditar Documentos em Lote</button><a href="#diretrizes">Diretrizes de Compliance ↗</a></div>
          </section>
          <section className="adminMetricas">
            <CartaoMetrica titulo="TOTAL ORGANIZADORES PENDENTES"valor={totalOrganizadores}texto="Solicitações aguardando aprovação"/>
            <CartaoMetrica titulo="FORNECEDORES EM HOMOLOGAÇÃO"valor={totalFornecedores}texto="Solicitações aguardando aprovação"tom="laranja"/>
            <CartaoMetrica titulo="SOLICITAÇÕES AGUARDANDO ANÁLISE" valor={totalPendentes} texto="Total de solicitações pendentes" tom="verde" />
          </section>
          <section className="adminFila">
            <div className="adminFilaCabecalho"><div><h2>Fila de Homologação Cadastral</h2><p>Auditoria rigorosa de contratos sociais, CNDs e certidões tributárias vigentes.</p></div><div className="adminAbas">
            <button  className={aba === 'todos' ? 'ativo' : ''} onClick={() => setAba('todos')}>
            Todos ({totalPendentes})</button>

            <button className={aba === 'organizadores' ? 'ativo' : ''} onClick={() => setAba('organizadores')}>
            Organizadores ({totalOrganizadores})
            </button>

            <button className={aba === 'fornecedores' ? 'ativo' : ''} onClick={() => setAba('fornecedores')}>
            Fornecedores ({totalFornecedores})
            </button><button className="urgente">Urgentes &gt; 48h (6)</button></div></div>
            <div className="adminProgresso"><b>{percentualOrganizadores}% Organizadores
            ({totalOrganizadores} solicitações)</b><span><i style={{ width: `${percentualOrganizadores}%` }} /></span><b>{percentualFornecedores}% Fornecedores({totalFornecedores} solicitações)</b></div>
            <div className="adminOrdenacao">Ordenar por: <select value={ordem} onChange={(e) => setOrdem(e.target.value)}><option>Risco</option><option>Prioridade</option><option>Mais recentes</option></select></div>
            {mensagem && <div className="adminMensagem" role="status">✓ {mensagem}<button onClick={() => setMensagem('')}>×</button></div>}
            <div className="adminTabelaWrap"><table className="adminTabela"><thead><tr><th><input type="checkbox" aria-label="Selecionar todos" checked={filtradas.length > 0 && filtradas.every((item) => selecionados.includes(item.id))} onChange={(e) => setSelecionados(e.target.checked ? filtradas.map((item) => item.id) : [])} /></th><th>PROTOCOLO / DATA</th><th>SOLICITANTE</th><th>ATUAÇÃO</th><th>RESPONSÁVEL</th><th>RISCO & RFB</th><th>DOCUMENTOS</th><th>AÇÕES</th></tr></thead>
              <tbody>{filtradas.map((item) => <tr key={item.id} className={item.urgente ? 'urgente' : ''}><td><input type="checkbox" aria-label={`Selecionar ${item.nome}`} checked={selecionados.includes(item.id)} onChange={() => alternar(item.id)} /></td><td><strong>#HOM-{item.id}</strong><small className={item.urgente ? 'atraso' : ''}>{item.hora}</small></td><td><strong>{item.nome}</strong><small>{item.documento}</small></td><td><strong>{item.atuacao}</strong><small>{item.detalhe}</small></td><td><strong>{item.responsavel}</strong><small>{item.cargo}</small></td><td><span className={`adminScore ${item.score < 80 ? 'alerta' : ''}`}>Score {item.score}</span><small className={item.score < 80 ? 'atraso' : 'ok'}>{item.risco}</small></td><td><div className="adminDocs">{Array.from({ length: item.docs }, (_, i) => <span key={i}>▤</span>)}</div></td><td><div className="adminAcoesLinha"><button className="aprovar" onClick={() => atualizar(item.id, 'homologado')}>Aprovar</button><button className="recusar" onClick={() => atualizar(item.id, 'recusado')}>Recusar</button></div></td></tr>)}</tbody></table></div>
            <div className="adminPaginacao"><span>Exibindo {filtradas.length} de {totalPendentes} solicitações pendentes</span><div><button disabled>Anterior</button><button className="ativo">1</button><button>2</button><button>3</button><span>…</span><button>10</button><button>Próxima</button></div></div>
          </section>
            </>
          )}
        </main>
      </div>
      <footer className="adminBarraLote"><div><b>{selecionados.length}</b><span><strong>{selecionados.length} cadastros selecionados para ação em lote</strong><small>Organizadores e fornecedores de estrutura técnica</small></span></div><div><button type="button"className="recusar" disabled title="Funcionalidade em desenvolvimento">⊘ Reprovar em lote (em breve)</button><button type="button"className="aprovarLote"disabledtitle="Funcionalidade em desenvolvimento">✥ Aprovar em lote (em breve)</button></div></footer></div>
  )
}