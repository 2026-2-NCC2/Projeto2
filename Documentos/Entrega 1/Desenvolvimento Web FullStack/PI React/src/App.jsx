import { useState, useMemo } from 'react'
import './App.css'

const formatarMoeda = (valor) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor)
}

const EVENTOS_INICIAIS = [
  {
    id: 1,
    nome: 'Festa Universitária',
    status: 'Ativo',
    data: '23/08/2026',
    horario: '22:00',
    local: 'Espaço Universitário - São Paulo - SP',
    categoria: 'Social',
    publico: 800,
    cotacao: '100%',
    ticket: 'R$ 45,00',
  },
  {
    id: 2,
    nome: 'Show Rock Night',
    status: 'Em planejamento',
    data: '30/09/2026',
    horario: '20:00',
    local: 'Arena Music Hall - São Paulo - SP',
    categoria: 'Show',
    publico: 1200,
    cotacao: '4/6',
    ticket: 'R$ 85,00',
  },
  {
    id: 3,
    nome: 'Conferência Anual de Inovação & Tecnologia 2026',
    status: 'Em planejamento',
    data: '18/11/2026',
    horario: '09:00',
    local: 'Centro de Convenções Rebouças - São Paulo - SP',
    categoria: 'Corporativo',
    publico: 600,
    cotacao: '100%',
    ticket: 'R$ 75,00',
  },
  {
    id: 4,
    nome: 'Summit Corporativo Nexus',
    status: 'Rascunho',
    data: '10/12/2026',
    horario: '14:00',
    local: 'Auditório WTC - São Paulo - SP',
    categoria: 'Corporativo',
    publico: 350,
    cotacao: '2/6',
    ticket: 'A calcular',
  },
]

const CUSTOS_PADRAO = [
  { id: 1, categoria: 'Áudio & Som', descricao: 'Som / PA Principal', valor: 8000 },
  { id: 2, categoria: 'Iluminação & Vídeo', descricao: 'Painel de LED e Iluminação Cênica', valor: 12000 },
  { id: 3, categoria: 'Estrutura & Palco', descricao: 'Montagem de Palco & Cenografia', valor: 4500 },
  { id: 4, categoria: 'Segurança & Brigada', descricao: 'Equipe de Segurança e Credenciamento', valor: 3500 },
  { id: 5, categoria: 'Limpeza & Facilities', descricao: 'Equipe de Limpeza & Conservação', valor: 2000 },
]

function Cabecalho() {
  return (
    <header>
      <div className="logo">
        ▣ <span>TrocaTicket</span>
      </div>
      <div className="empresa">Gestão Corporativa</div>
      <div className="usuario">
        <strong>Roberto Albuquerque</strong>
        <small>Organizador</small>
      </div>
    </header>
  )
}

function Menu({ pagina, setPagina, aoCriarNovoEvento }) {
  return (
    <aside className="menu">
      <div className="logo">
        ▣ <span>TrocaTicket</span>
      </div>

      <button
        className="novo"
        onClick={() => {
          aoCriarNovoEvento()
          setPagina('criar')
        }}
      >
        + Novo evento
      </button>

      <nav>
        <button
          className={pagina === 'eventos' ? 'ativo' : ''}
          onClick={() => setPagina('eventos')}
        >
          ▦ Meus Eventos
        </button>
        <button
          className={pagina === 'criar' ? 'ativo' : ''}
          onClick={() => setPagina('criar')}
        >
          ➕ Criar Evento
        </button>
        <button
          className={pagina === 'custos' ? 'ativo' : ''}
          onClick={() => setPagina('custos')}
        >
          📊 Custos
        </button>
        <button
          className={pagina === 'cotacao' ? 'ativo' : ''}
          onClick={() => setPagina('cotacao')}
        >
          ▣ Cotações & Concorrência
        </button>
        <button
          className={pagina === 'ticket' ? 'ativo' : ''}
          onClick={() => setPagina('ticket')}
        >
          ◇ Propostas & Ticket
        </button>
      </nav>

      <div className="menuRodape">
        <button onClick={() => alert('Módulo de perfil em desenvolvimento')}>
          ◉ Perfil
        </button>
        <button onClick={() => setPagina('login')}>↪ Sair</button>
      </div>
    </aside>
  )
}

function Layout({ children: filhos, pagina, setPagina, aoCriarNovoEvento }) {
  return (
    <>
      <Cabecalho />
      <div className="layout">
        <Menu
          pagina={pagina}
          setPagina={setPagina}
          aoCriarNovoEvento={aoCriarNovoEvento}
        />
        <main className="conteudo">{filhos}</main>
      </div>
    </>
  )
}

function Login({ setPagina }) {
  const [email, setEmail] = useState('roberto@empresa.com')
  const [senha, setSenha] = useState('123456')

  const aoAutenticar = (eventoDisparado) => {
    eventoDisparado.preventDefault()
    setPagina('eventos')
  }

  return (
    <div className="paginaLogin">
      <div className="cabecalhoLogin">
        <div className="logo">
          ▣ <span>TrocaTicket</span>
        </div>
        <span>🔒 Ambiente Seguro</span>
      </div>

      <main className="caixaLogin">
        <span className="tag">● Acesso do Organizador</span>
        <h1>Boas-vindas de volta!</h1>
        <p>Acesse seu painel de gestão e cotações de eventos corporativos.</p>

        <form onSubmit={aoAutenticar}>
          <label>E-mail corporativo / Geral</label>
          <input
            type="email"
            value={email}
            onChange={(eventoDisparado) => setEmail(eventoDisparado.target.value)}
            placeholder="seuemail@empresa.com"
            required
          />

          <div className="rotuloSenha">
            <label>Senha</label>
            <a href="#recuperar" onClick={(eventoDisparado) => eventoDisparado.preventDefault()}>
              Esqueci minha senha
            </a>
          </div>
          <input
            type="password"
            value={senha}
            onChange={(eventoDisparado) => setSenha(eventoDisparado.target.value)}
            placeholder="••••••••"
            required
          />

          <label className="lembrar">
            <input type="checkbox" defaultChecked /> Lembrar deste dispositivo
          </label>

          <button type="submit" className="principal">
            ENTRAR →
          </button>
        </form>

        <div className="divisor">ou continue com</div>
        <button
          type="button"
          className="botaoGoogle"
          onClick={() => setPagina('eventos')}
        >
          🌐 Google Workspace / SSO
        </button>

        <p className="cadastro">
          Ainda não tem uma conta de organizador? <b>Solicitar acesso</b>
        </p>
      </main>
    </div>
  )
}

function Eventos({
  eventos,
  setPagina,
  aoSelecionarEvento,
  aoCriarNovoEvento,
}) {
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

function CriarEvento({
  evento,
  setEvento,
  setPagina,
  aoAvancarParaCustos,
}) {
  const categorias = ['Corporativo', 'Confraternização', 'Workshop', 'Social']

  const aoAlterarCampo = (campo, valor) => {
    setEvento((estadoAnterior) => ({ ...estadoAnterior, [campo]: valor }))
  }

  const aoEnviarFormulario = (eventoDisparado) => {
    eventoDisparado.preventDefault()
    aoAvancarParaCustos()
    setPagina('custos')
  }

  return (
    <div>
      <button className="voltar" onClick={() => setPagina('eventos')}>
        ← Voltar para Meus Eventos
      </button>

      <h1>CRIAR EVENTO</h1>
      <p>Comece pelos dados básicos para planejar o evento e as cotações.</p>

      <div className="etapas">
        <b>1 &nbsp; Dados Básicos</b>
        <span>2 &nbsp; Custos e Cotações</span>
        <span>3 &nbsp; Ticket e Viabilidade</span>
      </div>

      <form onSubmit={aoEnviarFormulario} className="cartaoFormulario">
        <label>Nome do evento *</label>
        <input
          value={evento.nome}
          onChange={(eventoDisparado) => aoAlterarCampo('nome', eventoDisparado.target.value)}
          placeholder="Ex: Summit Corporativo de Inovação & Tecnologia 2026"
          required
        />

        <div className="duasColunas">
          <div>
            <label>Data do evento *</label>
            <input
              type="date"
              value={evento.data}
              onChange={(eventoDisparado) => aoAlterarCampo('data', eventoDisparado.target.value)}
              required
            />
          </div>
          <div>
            <label>Horário de início *</label>
            <input
              type="time"
              value={evento.horario}
              onChange={(eventoDisparado) => aoAlterarCampo('horario', eventoDisparado.target.value)}
              required
            />
          </div>
        </div>

        <div className="duasColunas">
          <div>
            <label>Local do evento *</label>
            <input
              value={evento.local}
              onChange={(eventoDisparado) => aoAlterarCampo('local', eventoDisparado.target.value)}
              placeholder="Ex: Centro de Convenções Rebouças - SP"
              required
            />
          </div>
          <div>
            <label>Público previsto (participantes) *</label>
            <input
              type="number"
              min="1"
              value={evento.publico}
              onChange={(eventoDisparado) => aoAlterarCampo('publico', Number(eventoDisparado.target.value))}
              required
            />
          </div>
        </div>

        <label>Categoria do evento</label>
        <div className="categorias">
          {categorias.map((itemCategoria) => (
            <button
              type="button"
              key={itemCategoria}
              className={evento.categoria === itemCategoria ? 'selecionado' : ''}
              onClick={() => aoAlterarCampo('categoria', itemCategoria)}
            >
              {itemCategoria}
            </button>
          ))}
        </div>

        <label>Descrição do evento e escopo previsto</label>
        <textarea
          rows="4"
          value={evento.descricao}
          onChange={(eventoDisparado) => aoAlterarCampo('descricao', eventoDisparado.target.value)}
          placeholder="Descreva os objetivos, perfil do público e necessidades gerais..."
        />

        <div className="acoes">
          <button
            type="button"
            className="secundario"
            onClick={() => setPagina('eventos')}
          >
            Cancelar
          </button>
          <button type="submit" className="principal">
            Salvar para Custos & Cotações →
          </button>
        </div>
      </form>
    </div>
  )
}

function Custos({
  evento,
  custos,
  setPagina,
}) {
  const totalEstimado = useMemo(() => {
    return custos.reduce((acumulador, itemCusto) => acumulador + itemCusto.valor, 0)
  }, [custos])

  return (
    <div>
      <button className="voltar" onClick={() => setPagina('criar')}>
        ← Voltar para Dados Básicos
      </button>

      <div className="tituloLinha">
        <div>
          <h1>ITENS DE CUSTO</h1>
          <p>
            Defina os itens necessários para <strong>{evento.nome}</strong>.
          </p>
        </div>
        <div className="tag">Etapa 2 de 3</div>
      </div>

      <div className="resumoCategorias">
        {custos.map((itemCusto) => (
          <div key={itemCusto.id}>
            {itemCusto.categoria}
            <br />
            <b>{formatarMoeda(itemCusto.valor)}</b>
          </div>
        ))}
      </div>

      <div className="tabela">
        <div className="tabelaCabecalho">
          <span>Categoria</span>
          <span>Descrição</span>
          <span>Custo estimado</span>
        </div>

        {custos.map((itemCusto) => (
          <div className="tabelaLinha" key={itemCusto.id}>
            <span>{itemCusto.categoria}</span>
            <span>{itemCusto.descricao}</span>
            <strong>{formatarMoeda(itemCusto.valor)}</strong>
          </div>
        ))}
      </div>

      <div className="total">
        <span>Total estimado</span>
        <strong>{formatarMoeda(totalEstimado)}</strong>
      </div>

      <div className="acoes">
        <button
          type="button"
          className="secundario"
          onClick={() => setPagina('criar')}
        >
          Voltar
        </button>
        <button
          type="button"
          className="principal"
          onClick={() => setPagina('cotacao')}
        >
          Revisar e avançar para Cotação →
        </button>
      </div>
    </div>
  )
}

function Cotacao({
  evento,
  custos,
  setPagina,
}) {
  const [prazo, setPrazo] = useState('2026-10-18')
  const [observacoes, setObservacoes] = useState(
    'Apresentar proposta comercial completa, incluindo impostos e condições de pagamento.'
  )

  const totalEstimado = useMemo(() => {
    return custos.reduce((acumulador, itemCusto) => acumulador + itemCusto.valor, 0)
  }, [custos])

  return (
    <div>
      <button className="voltar" onClick={() => setPagina('custos')}>
        ← Voltar para Itens de Custo
      </button>

      <h1>PUBLICAR COTAÇÃO</h1>
      <p>Revise o resumo dos itens e configure o prazo para fornecedores.</p>

      <div className="gradeCotacao">
        <div className="cartaoFormulario">
          <h2>▣ Resumo da Cotação & Evento</h2>
          <h3>{evento.nome}</h3>
          <p>
            📅 {evento.data} às {evento.horario} • {evento.local}
          </p>

          <div style={{ marginTop: '20px' }}>
            {custos.map((itemCusto) => (
              <div className="itemResumo" key={itemCusto.id}>
                <span>{itemCusto.categoria}</span>
                <b>{formatarMoeda(itemCusto.valor)}</b>
              </div>
            ))}
          </div>

          <div className="total">
            <span>Total estimado</span>
            <strong>{formatarMoeda(totalEstimado)}</strong>
          </div>
        </div>

        <div className="cartaoFormulario">
          <h2>Parâmetros & Prazo da Concorrência</h2>

          <label>Prazo para envio de propostas</label>
          <input
            type="date"
            value={prazo}
            onChange={(eventoDisparado) => setPrazo(eventoDisparado.target.value)}
          />

          <label>Modalidade da cotação</label>
          <div className="opcaoSelecionada">
            ◉ Cotação Fechada
            <small>Melhor preço e condições comerciais com sigilo até abertura.</small>
          </div>

          <label>Observações para os fornecedores</label>
          <textarea
            rows="5"
            value={observacoes}
            onChange={(eventoDisparado) => setObservacoes(eventoDisparado.target.value)}
          />

          <button
            type="button"
            className="principal"
            style={{ width: '100%', marginTop: '20px' }}
            onClick={() => setPagina('ticket')}
          >
            Publicar Cotação & Simular Ticket →
          </button>
        </div>
      </div>
    </div>
  )
}

function Ticket({
  evento,
  custos,
  setPagina,
  aoFinalizarESalvar,
}) {
  const [margemPercentual, setMargemPercentual] = useState(30)

  const custoTotal = useMemo(() => {
    return custos.reduce((acumulador, itemCusto) => acumulador + itemCusto.valor, 0)
  }, [custos])

  const publico = evento.publico > 0 ? evento.publico : 600

  const ticketEquilibrio = custoTotal / publico
  const margemOperacional = custoTotal * (margemPercentual / 100)
  const ticketSugerido = (custoTotal + margemOperacional) / publico

  return (
    <div>
      <button className="voltar" onClick={() => setPagina('cotacao')}>
        ← Voltar às Cotações
      </button>

      <div className="tituloLinha">
        <div>
          <h1>TICKET ESTIMADO & VIABILIDADE</h1>
          <p>
            Simulação de sustentabilidade financeira para <strong>{evento.nome}</strong>.
          </p>
        </div>
        <span className="status">● Cotações suficientes recebidas</span>
      </div>

      <div className="gradeTicket">
        <div className="cartaoTicket">
          <span className="tag">TICKET SUGERIDO POR PARTICIPANTE</span>
          <div className="preco">
            R$ <strong>{ticketSugerido.toFixed(2).replace('.', ',')}</strong>
          </div>
          <p>
            Preço recomendado por ingresso para cobrir custos e atingir{' '}
            {margemPercentual}% de margem operacional.
          </p>

          <hr style={{ margin: '20px 0', border: '0', borderTop: '1px solid #e2e4eb' }} />

          <div className="itemResumo">
            <span>Custo total estimado</span>
            <b>{formatarMoeda(custoTotal)}</b>
          </div>
          <div className="itemResumo">
            <span>Quantidade de participantes</span>
            <b>{publico} pessoas</b>
          </div>
          <div className="itemResumo">
            <span>Ticket de Equilíbrio (Custo unitário)</span>
            <b>{formatarMoeda(ticketEquilibrio)}</b>
          </div>
          <div className="itemResumo">
            <span>Margem operacional ({margemPercentual}%)</span>
            <b>{formatarMoeda(margemOperacional)}</b>
          </div>
        </div>

        <div className="cartaoTicket">
          <h2>Simulação e Detalhamento</h2>

          <label style={{ display: 'block', margin: '15px 0 5px', fontWeight: 600 }}>
            Ajustar margem de lucro operacional: {margemPercentual}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={margemPercentual}
            onChange={(eventoDisparado) => setMargemPercentual(Number(eventoDisparado.target.value))}
            style={{ width: '100%', accentColor: '#3427b8' }}
          />

          <h3 style={{ marginTop: '25px', fontSize: '15px' }}>Composição dos custos</h3>
          <div className="barraCusto">
            <span></span>
            <span></span>
            <span></span>
          </div>

          <div style={{ marginTop: '15px' }}>
            {custos.slice(0, 3).map((custo) => (
              <div className="itemResumo" key={custo.id}>
                <span>{custo.categoria}</span>
                <b>{formatarMoeda(custo.valor)}</b>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="principal"
            style={{ width: '100%', marginTop: '30px' }}
            onClick={() => {
              aoFinalizarESalvar(ticketSugerido)
              setPagina('eventos')
            }}
          >
            Finalizar planejamento e salvar evento →
          </button>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [pagina, setPagina] = useState('login')
  const [eventos, setEventos] = useState(EVENTOS_INICIAIS)
  const [custos, setCustos] = useState(CUSTOS_PADRAO)

  const [eventoEmEdicao, setEventoEmEdicao] = useState({
    nome: 'Summit Corporativo de Inovação & Tecnologia 2026',
    data: '2026-11-18',
    horario: '09:00',
    local: 'Centro de Convenções Rebouças - São Paulo - SP',
    categoria: 'Corporativo',
    publico: 600,
    descricao: 'Evento corporativo focado em inovação, tecnologia e integração entre equipes.',
  })

  const aoCriarNovoEvento = () => {
    setEventoEmEdicao({
      nome: '',
      data: '2026-11-20',
      horario: '10:00',
      local: '',
      categoria: 'Corporativo',
      publico: 500,
      descricao: '',
    })
    setCustos(CUSTOS_PADRAO)
  }

  const aoSelecionarEvento = (eventoClicado) => {
    setEventoEmEdicao({
      nome: eventoClicado.nome,
      data: eventoClicado.data.split('/').reverse().join('-'),
      horario: eventoClicado.horario || '09:00',
      local: eventoClicado.local || 'São Paulo - SP',
      categoria: eventoClicado.categoria || 'Corporativo',
      publico: eventoClicado.publico || 500,
      descricao: 'Planejamento e cotações ativas.',
    })
  }

  const aoFinalizarESalvar = (ticketSugerido) => {
    const valorTicketFormatado = formatarMoeda(ticketSugerido)
    const novoEventoCompleto = {
      id: Date.now(),
      nome: eventoEmEdicao.nome || 'Novo Evento Corporativo',
      status: 'Em planejamento',
      data: eventoEmEdicao.data.split('-').reverse().join('/'),
      horario: eventoEmEdicao.horario,
      local: eventoEmEdicao.local,
      categoria: eventoEmEdicao.categoria,
      publico: eventoEmEdicao.publico,
      cotacao: '5/5',
      ticket: valorTicketFormatado,
    }

    setEventos((eventosAnteriores) => [novoEventoCompleto, ...eventosAnteriores])
  }

  if (pagina === 'login') {
    return <Login setPagina={setPagina} />
  }

  return (
    <Layout
      pagina={pagina}
      setPagina={setPagina}
      aoCriarNovoEvento={aoCriarNovoEvento}
    >
      {pagina === 'eventos' && (
        <Eventos
          eventos={eventos}
          setPagina={setPagina}
          aoSelecionarEvento={aoSelecionarEvento}
          aoCriarNovoEvento={aoCriarNovoEvento}
        />
      )}

      {pagina === 'criar' && (
        <CriarEvento
          evento={eventoEmEdicao}
          setEvento={setEventoEmEdicao}
          setPagina={setPagina}
          aoAvancarParaCustos={() => {}}
        />
      )}

      {pagina === 'custos' && (
        <Custos
          evento={eventoEmEdicao}
          custos={custos}
          setPagina={setPagina}
        />
      )}

      {pagina === 'cotacao' && (
        <Cotacao
          evento={eventoEmEdicao}
          custos={custos}
          setPagina={setPagina}
        />
      )}

      {pagina === 'ticket' && (
        <Ticket
          evento={eventoEmEdicao}
          custos={custos}
          setPagina={setPagina}
          aoFinalizarESalvar={aoFinalizarESalvar}
        />
      )}
    </Layout>
  )
}

export default App