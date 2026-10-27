import { useState, useMemo, useEffect } from 'react'
import './App.css'

const formatarMoeda = (valor) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor)
}



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
        <button
          className={pagina === 'perfil' ? 'ativo' : ''}
          onClick={() => setPagina('perfil')}
        >
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

function Cadastro({ setPagina }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [cadastrando, setCadastrando] = useState(false)

  const cadastrar = async (evento) => {
    evento.preventDefault()

    if (senha !== confirmarSenha) {
      alert('As senhas não coincidem.')
      return
    }

    setCadastrando(true)

    try {
      const resposta = await fetch('http://localhost:3001/usuarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nome,
          email,
          senha,
          perfil: 'participante'
        })
      })

      const dados = await resposta.json()

      if (!resposta.ok) {
        alert(dados.erro || 'Erro ao criar conta.')
        return
      }

      alert('Conta criada com sucesso! Faça login para continuar.')
      setPagina('login')
    } catch (erro) {
      console.error('Erro ao cadastrar:', erro)
      alert('Não foi possível conectar ao servidor.')
    } finally {
      setCadastrando(false)
    }
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
        <h1>Criar conta</h1>
        <p>
          Cadastre-se gratuitamente como participante.
          Depois, você poderá solicitar acesso como organizador ou fornecedor.
        </p>

        <form onSubmit={cadastrar}>
          <label>Nome completo</label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Seu nome completo"
            required
          />

          <label>E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seuemail@exemplo.com"
            required
          />

          <label>Senha</label>
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Crie uma senha"
            required
          />

          <label>Confirmar senha</label>
          <input
            type="password"
            value={confirmarSenha}
            onChange={(e) => setConfirmarSenha(e.target.value)}
            placeholder="Digite a senha novamente"
            required
          />

          <button
            type="submit"
            className="principal"
            disabled={cadastrando}
          >
            {cadastrando ? 'Criando conta...' : 'CRIAR CONTA →'}
          </button>
        </form>

        <p className="cadastro">
          Já tem uma conta?{' '}
          <button
            type="button"
            onClick={() => setPagina('login')}
          >
            Entrar
          </button>
        </p>
      </main>
    </div>
  )
}

function Login({ setPagina }) {
  const [perfil, setPerfil] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  
const aoAutenticar = async (eventoDisparado) => {
  eventoDisparado.preventDefault()

  try {
    const resposta = await fetch('http://localhost:3001/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        senha
      })
    })

    const dados = await resposta.json()

    if (!resposta.ok) {
      alert(dados.erro || 'Erro ao fazer login.')
      return
    }

    sessionStorage.setItem('token', dados.token)

const perfilUsuario = dados.usuario.perfil

sessionStorage.setItem('perfil', perfilUsuario)

if (perfilUsuario === 'admin') {
  setPagina('admin')
} else if (perfilUsuario === 'fornecedor') {
  setPagina('fornecedor-mural')
} else if (perfilUsuario === 'organizador') {
  setPagina('eventos')
} else if (perfilUsuario === 'participante') {
  setPagina('participante')
} else {
  alert('Perfil de usuário não reconhecido.')
}
  } catch (erro) {
    console.error(erro)
    alert('Não foi possível conectar ao servidor.')
  }
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
        <div className="escolhaPerfil"><button type="button" className={perfil === 'organizador' ? 'selecionado' : ''} onClick={() => setPerfil('organizador')}>▦ Organizador</button><button type="button" className={perfil === 'fornecedor' ? 'selecionado' : ''} onClick={() => setPerfil('fornecedor')}>▣ Fornecedor</button></div>
        <button
          type="button"
          className={`acessoAdmin ${perfil === 'admin' ? 'selecionado' : ''}`}
          onClick={() => setPerfil('admin')}
        >
          Acesso administrativo
        </button>
        <h1>Boas-vindas de volta!</h1>
        <p>{perfil === 'fornecedor' ? 'Encontre oportunidades e envie propostas para eventos.' : 'Acesse seu painel de gestão e cotações de eventos corporativos.'}</p>
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
        <p className="cadastro">Ainda não tem uma conta?{' '}
          <button type="button"onClick={() => setPagina('cadastro')}>Criar conta</button>
        </p>
      </main>
    </div>
  )
}

function Eventos({eventos, setPagina, aoSelecionarEvento, aoCriarNovoEvento, aoExcluirEvento, aoPublicarEvento}) {
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
              type="button"
              onClick={() => aoExcluirEvento(evento)}
              style={{
              backgroundColor: '#dc3545',
              color: 'white',
             border: 'none',
             borderRadius: '6px',
              padding: '8px 12px',
              cursor: 'pointer'
              }}
            >
            Excluir
            </button>
              {evento.status === 'Em planejamento' && (
              <button
    type="button"
    onClick={() => aoPublicarEvento(evento)}
    style={{
      backgroundColor: '#198754',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      padding: '8px 12px',
      cursor: 'pointer'
    }}
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
  const aoEnviarFormulario = async (eventoDisparado) => {
  eventoDisparado.preventDefault()
  await aoAvancarParaCustos()
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
  const [prazo, setPrazo] = useState('')
  const [publicando, setPublicando] = useState(false)
  const [propostasRecebidas, setPropostasRecebidas] = useState([])
  const [carregandoPropostas, setCarregandoPropostas] = useState(true)
  const [erroPropostas, setErroPropostas] = useState('')
  useEffect(() => {
  const buscarPropostasRecebidas = async () => {
    try {
      setCarregandoPropostas(true)
      setErroPropostas('')

      const token = sessionStorage.getItem('token')

      const resposta = await fetch(
        'http://localhost:3001/organizador/propostas',
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      const dados = await resposta.json()

      if (!resposta.ok) {
        throw new Error(dados.erro || 'Erro ao buscar propostas.')
      }

      const propostasDoEvento = dados.filter(
        (proposta) => Number(proposta.evento_id) === Number(evento.id)
      )

      setPropostasRecebidas(propostasDoEvento)

    } catch (erro) {
      console.error('Erro ao buscar propostas recebidas:', erro)
      setErroPropostas(erro.message)

    } finally {
      setCarregandoPropostas(false)
    }
  }

  if (evento?.id) {
    buscarPropostasRecebidas()
  } else {
    setPropostasRecebidas([])
    setCarregandoPropostas(false)
  }
}, [evento?.id])
  const [avaliandoPropostaId, setAvaliandoPropostaId] = useState(null)
  const avaliarProposta = async (propostaId, novoStatus) => {
  if (avaliandoPropostaId !== null) return

  const acao = novoStatus === 'Aprovada' ? 'aprovar' : 'recusar'

  const confirmou = window.confirm(
    `Tem certeza que deseja ${acao} esta proposta?`
  )

  if (!confirmou) return

  try {
    setAvaliandoPropostaId(propostaId)

    const token = sessionStorage.getItem('token')

    const resposta = await fetch(
      `http://localhost:3001/organizador/propostas/${propostaId}/status`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          status: novoStatus
        })
      }
    )

    const dados = await resposta.json()

    if (!resposta.ok) {
      throw new Error(dados.erro || 'Erro ao avaliar proposta.')
    }

    setPropostasRecebidas((atual) =>
      atual.map((proposta) =>
        proposta.id === propostaId
          ? { ...proposta, status: novoStatus }
          : proposta
      )
    )

    alert(dados.mensagem)

  } catch (erro) {
    console.error('Erro ao avaliar proposta:', erro)
    alert(erro.message)

  } finally {
    setAvaliandoPropostaId(null)
  }
}
  const [observacoes, setObservacoes] = useState(
    'Apresentar proposta comercial completa, incluindo impostos e condições de pagamento.'
  )
  const totalEstimado = useMemo(() => {
    return custos.reduce((acumulador, itemCusto) => acumulador + itemCusto.valor, 0)
  }, [custos])
  
const aoPublicarCotacao = async () => {
  if (publicando) return

  if (!prazo) {
    alert('Selecione um prazo para o envio das propostas.')
    return
  }

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  const [ano, mes, dia] = prazo.split('-').map(Number)
  const dataPrazo = new Date(ano, mes - 1, dia)

  if (
    dataPrazo.getFullYear() !== ano ||
    dataPrazo.getMonth() !== mes - 1 ||
    dataPrazo.getDate() !== dia ||
    dataPrazo < hoje
  ) {
    alert('Selecione um prazo válido que não esteja no passado.')
    return
  }

  if (!evento.id) {
    alert('O evento precisa estar salvo antes de publicar a cotação.')
    return
  }

  if (!custos.length) {
    alert('Adicione pelo menos um item de custo.')
    return
  }

  const token = sessionStorage.getItem('token')

  if (!token) {
    alert('Sua sessão expirou. Faça login novamente.')
    setPagina('login')
    return
  }

  setPublicando(true)

  try {
    const resposta = await fetch('http://localhost:3001/cotacoes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        evento_id: evento.id,
        prazo,
        observacoes,
        itens: custos.map((item) => ({
          categoria: item.categoria,
          descricao: item.descricao,
          valor_estimado: Number(item.valor)
        }))
      })
    })

    const dados = await resposta.json()

    if (!resposta.ok) {
      alert(dados.erro || 'Erro ao publicar cotação.')
      return
    }

    alert('Cotação publicada com sucesso!')
    setPagina('ticket')
  } catch (erro) {
    console.error('Erro ao publicar cotação:', erro)
    alert('Não foi possível conectar ao servidor.')
  } finally {
    setPublicando(false)
  }
}
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
  onClick={aoPublicarCotacao}
  disabled={publicando}
>
  {publicando
    ? 'Publicando cotação...'
    : 'Publicar Cotação & Simular Ticket →'}
          </button>
        </div>
      </div>
            <section className="cartaoFormulario" style={{ marginTop: '24px' }}>
        <h2>📩 Propostas recebidas</h2>
        <p>Propostas enviadas pelos fornecedores para este evento.</p>

        {carregandoPropostas && (
          <p>Carregando propostas...</p>
        )}

        {erroPropostas && (
          <p style={{ color: 'red' }}>{erroPropostas}</p>
        )}

        {!carregandoPropostas &&
          !erroPropostas &&
          propostasRecebidas.length === 0 && (
            <p>Nenhuma proposta recebida para este evento.</p>
          )}

        {!carregandoPropostas &&
          !erroPropostas &&
          propostasRecebidas.map((proposta) => (
            <div
              key={proposta.id}
              className="cartaoFormulario"
              style={{ marginTop: '16px' }}
            >
              <h3>{proposta.fornecedor_nome}</h3>

              <p>
                <strong>Evento:</strong> {proposta.evento_nome}
              </p>

              <p>
                <strong>Valor:</strong> {formatarMoeda(Number(proposta.valor))}
              </p>

              <p>
                <strong>Condições de pagamento:</strong>{' '}
                {proposta.condicoes_pagamento}
              </p>

              <p>
                <strong>Detalhes técnicos:</strong>{' '}
                {proposta.detalhes_tecnicos}
              </p>

              <p>
                <strong>Status:</strong> {proposta.status}
              </p>
              {proposta.status === 'Em avaliação' && (
              <div
                style={{
                display: 'flex',
                gap: '12px',
                marginTop: '16px'
              }}
              >
              <button
                type="button"
                className="principal"
                onClick={() => avaliarProposta(proposta.id, 'Aprovada')}
                disabled={avaliandoPropostaId !== null}
                >
                  {avaliandoPropostaId === proposta.id
                  ? 'Processando...'
                  : '✓ Aprovar proposta'}
              </button>
              <button
                type="button"
                onClick={() => avaliarProposta(proposta.id, 'Recusada')}
                disabled={avaliandoPropostaId !== null}
              >
                {avaliandoPropostaId === proposta.id
                ? 'Processando...'
                : '✕ Recusar proposta'}
              </button>
              </div>
              )}
            </div>
          ))}
      </section>
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

const OPORTUNIDADES = [
 {id:9041,nome:'Summit Corporativo Tech 2026',organizador:'Vanguard Corp Eventos',categoria:'Áudio & Som',local:'São Paulo, SP',publico:650,prazo:'2026-10-25',descricao:'Sistema de PA, microfones e suporte técnico para conferência.'},
 {id:8820,nome:'InterFacul Fest SP 2026',organizador:'Liga Universitária Paulista',categoria:'Estrutura & Palco',local:'São Paulo, SP',publico:1500,prazo:'2026-11-10',descricao:'Palco e infraestrutura para festival universitário.'},
 {id:7633,nome:'Festival Sons do Brasil',organizador:'ArteViva Entretenimento',categoria:'Iluminação & Vídeo',local:'Campinas, SP',publico:2000,prazo:'2026-11-15',descricao:'Iluminação cênica, vídeo e operação técnica.'},
 {id:6102,nome:'Congresso Nacional Médico',organizador:'Sociedade Paulista de Medicina',categoria:'Áudio & Som',local:'São Paulo, SP',publico:900,prazo:'2026-11-22',descricao:'Microfonia sem fio, sonorização e operação.'},
]

function PerfilFornecedor({ perfil, setPerfil, propostas }) {
  const [editando, setEditando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [preferencias, setPreferencias] = useState({ oportunidades: true, propostas: true, contratos: true, marketing: false })
  const alterar = (campo, valor) => { setPerfil((atual) => ({ ...atual, [campo]: valor })); setSalvo(false) }
  const salvar = (evento) => { evento.preventDefault(); setEditando(false); setSalvo(true) }
  const homologadas = propostas.filter((item) => item.status === 'Homologada').length
  const volume = propostas.reduce((soma, item) => soma + item.valor, 0)
  return <div className="perfilPagina perfilFornecedorPagina">
    <div className="perfilCabecalho"><div><p className="fornTrilha">TrocaTicket Fornecedor › Minha conta › Perfil</p><h1>Perfil do fornecedor</h1><p>Gerencie os dados comerciais, catálogo de serviços e segurança da empresa.</p></div><span className="perfilContaAtiva">● Empresa homologada</span></div>
    {salvo && <div className="perfilSucesso" role="status">✓ Perfil da empresa atualizado com sucesso.</div>}
    <section className="perfilResumo perfilResumoFornecedor"><div className="perfilAvatar">SS</div><div className="perfilIdentidade"><h2>{perfil.empresa}</h2><p>Fornecedor homologado · São Paulo, SP</p><div><span>Áudio & Sonorização</span><span>Compliance aprovado</span></div></div><div className="perfilResumoNumeros"><div><strong>{propostas.length}</strong><small>Propostas enviadas</small></div><div><strong>{homologadas}</strong><small>Homologadas</small></div><div><strong>{formatarMoeda(volume)}</strong><small>Volume proposto</small></div></div></section>
    <div className="perfilGrade">
      <form className="perfilCartao perfilDados" onSubmit={salvar}><div className="perfilTituloCartao"><div><h2>Dados da empresa</h2><p>Informações exibidas aos organizadores nas suas propostas.</p></div><button type="button" className="perfilEditar" onClick={() => { setEditando((valor) => !valor); setSalvo(false) }}>{editando ? 'Cancelar' : '✎ Editar dados'}</button></div>
        <div className="perfilCampos"><label>Nome da empresa<input disabled={!editando} value={perfil.empresa} onChange={(e) => alterar('empresa', e.target.value)} /></label><label>E-mail comercial<input type="email" disabled={!editando} value={perfil.email} onChange={(e) => alterar('email', e.target.value)} /></label><label>Telefone<input disabled={!editando} value={perfil.telefone} onChange={(e) => alterar('telefone', e.target.value)} /></label><label>Cidade<input disabled={!editando} value={perfil.cidade} onChange={(e) => alterar('cidade', e.target.value)} /></label><label className="perfilCampoInteiro">Serviços oferecidos<textarea rows="3" disabled={!editando} value={perfil.servicos} onChange={(e) => alterar('servicos', e.target.value)} /></label></div>
        {editando && <div className="perfilAcoes"><button type="button" className="secundario" onClick={() => setEditando(false)}>Cancelar</button><button className="principal" type="submit">Salvar alterações</button></div>}
      </form>
      <aside className="perfilColuna"><section className="perfilCartao"><div className="perfilTituloCartao"><div><h2>Segurança</h2><p>Proteção e acesso ao portal.</p></div></div><div className="perfilSegurancaItem"><span>◈</span><div><strong>Senha</strong><small>Atualizada há 21 dias</small></div><button onClick={() => alert('Link de redefinição enviado ao e-mail comercial.')}>Alterar</button></div><div className="perfilSegurancaItem"><span>✓</span><div><strong>Autenticação em duas etapas</strong><small>Ativada por aplicativo</small></div><b>Ativa</b></div><div className="perfilSegurancaItem"><span>⌁</span><div><strong>Sessões ativas</strong><small>1 dispositivo conectado</small></div><button onClick={() => alert('Todas as outras sessões foram encerradas.')}>Gerenciar</button></div></section>
        <section className="perfilCartao"><div className="perfilTituloCartao"><div><h2>Preferências</h2><p>Escolha quais avisos deseja receber.</p></div></div>{[['oportunidades','Novas oportunidades','Cotações compatíveis com seu catálogo'],['propostas','Atualizações de propostas','Mudanças de status e solicitações'],['contratos','Contratos e pagamentos','Prazos, assinaturas e repasses'],['marketing','Novidades da plataforma','Recursos, eventos e conteúdos']].map(([id,titulo,texto]) => <label className="perfilPreferencia" key={id}><span><strong>{titulo}</strong><small>{texto}</small></span><input type="checkbox" checked={preferencias[id]} onChange={(e) => setPreferencias((atual) => ({...atual,[id]:e.target.checked}))} /></label>)}</section></aside>
      <section className="perfilCartao perfilEmpresa"><div className="perfilTituloCartao"><div><h2>Homologação e documentação</h2><p>Situação cadastral para participação nas cotações.</p></div><span className="perfilHomologada">✓ Documentação válida</span></div><div className="perfilEmpresaDados"><div><small>STATUS</small><strong>Fornecedor homologado</strong></div><div><small>CNPJ</small><strong>88.214.558/0001-31</strong></div><div><small>VALIDADE CADASTRAL</small><strong>12/2026</strong></div><div><small>CATEGORIA PRINCIPAL</small><strong>Áudio & Sonorização</strong></div></div></section>
    </div>
  </div>
}

function PortalFornecedor({pagina,setPagina}) {
 const [busca,setBusca]=useState('')
 const [oportunidades, setOportunidades] = useState([])
  const [carregandoOportunidades, setCarregandoOportunidades] = useState(true)
  const [erroOportunidades, setErroOportunidades] = useState('')
  useEffect(() => {
  const buscarOportunidades = async () => {
    try {
      setCarregandoOportunidades(true)
      setErroOportunidades('')

      const token = sessionStorage.getItem('token')

      const resposta = await fetch(
        'http://localhost:3001/fornecedor/cotacoes',
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      const dados = await resposta.json()

      if (!resposta.ok) {
        throw new Error(dados.erro || 'Erro ao buscar cotações.')
      }

      const lista = Array.isArray(dados) ? dados : []

     const oportunidadesFormatadas = lista.map((cotacao) => ({
       id: cotacao.id,
       nome: cotacao.evento_nome,
       categoria: cotacao.itens
          .map((item) => item.categoria)
         .join(', '),
        organizador: 'Organizador do evento',
       local: cotacao.evento_local,
       publico: 'Não informado',
        prazo: cotacao.prazo.slice(0, 10),
       descricao: cotacao.observacoes || 'Sem observações.',
        itens: cotacao.itens,
        status: cotacao.status
    }))

setOportunidades(oportunidadesFormatadas)

    } catch (erro) {
      console.error('Erro ao buscar oportunidades:', erro)
      setErroOportunidades(erro.message)
    } finally {
      setCarregandoOportunidades(false)
    }
  }

  buscarOportunidades()
}, [])
 const [selecionada, setSelecionada] = useState(null)
 const [propostas, setPropostas] = useState([])
 const [carregandoPropostas, setCarregandoPropostas] = useState(true)
 const [erroPropostas, setErroPropostas] = useState('')
 useEffect(() => {
  const buscarPropostas = async () => {
    try {
      setCarregandoPropostas(true)
      setErroPropostas('')

      const token = sessionStorage.getItem('token')

      const resposta = await fetch(
        'http://localhost:3001/fornecedor/propostas',
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      const dados = await resposta.json()

      if (!resposta.ok) {
        throw new Error(dados.erro || 'Erro ao buscar propostas.')
      }

      const propostasFormatadas = dados.map((proposta) => ({
        id: proposta.id,
        evento: proposta.evento_nome,
        valor: Number(proposta.valor),
        status: proposta.status,
        categoria: proposta.categoria || 'Não informada'
      }))

      setPropostas(propostasFormatadas)

    } catch (erro) {
      console.error('Erro ao buscar propostas:', erro)
      setErroPropostas(erro.message)

    } finally {
      setCarregandoPropostas(false)
    }
  }

  buscarPropostas()
}, [])
 const [valor,setValor]=useState('8900')
 const [condicoes,setCondicoes]=useState('50% na assinatura e 50% após desmontagem')
 const [detalhes,setDetalhes]=useState('Sistema de PA, equipe de operação e montagem inclusos.')
 const [perfil,setPerfil]=useState({empresa:'Sonora Stage & Audio Ltda',email:'contato@sonorastage.com.br',telefone:'(11) 99999-9999',cidade:'São Paulo',servicos:'Áudio, sonorização e equipamentos para eventos'})
 const [filtro,setFiltro]=useState('Todas')
 const navegar=(destino)=>setPagina('fornecedor-'+destino)
 const titulo={mural:'Mural de oportunidades',cotacoes:'Minhas cotações',proposta:'Elaborar proposta comercial',enviadas:'Propostas enviadas',contratos:'Contratos ativos',catalogo:'Catálogo e rider',desempenho:'Desempenho',perfil:'Perfil do fornecedor'}[pagina.replace('fornecedor-','')] || 'Portal do Fornecedor'
 const enviar = async (e) => {
  e.preventDefault()

  if (!selecionada) {
    alert('Selecione uma cotação antes de enviar a proposta.')
    return
  }

  try {
    const token = sessionStorage.getItem('token')

    const resposta = await fetch(
      'http://localhost:3001/fornecedor/propostas',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          cotacao_id: selecionada.id,
          valor: Number(valor),
          condicoes_pagamento: condicoes,
          detalhes_tecnicos: detalhes
        })
      }
    )

    const dados = await resposta.json()

    if (!resposta.ok) {
      throw new Error(dados.erro || 'Erro ao enviar proposta.')
    }

    alert('Proposta enviada com sucesso!')

    setPropostas((atual) => [
      {
        id: dados.proposta_id,
        evento: selecionada.nome,
        valor: Number(valor),
        status: 'Em avaliação',
        categoria: selecionada.categoria
      },
      ...atual
    ])

    navegar('enviadas')

  } catch (erro) {
    console.error('Erro ao enviar proposta:', erro)
    alert(erro.message)
  }
}
 const abertas = oportunidades.filter((o) =>
  (o.nome + ' ' + o.categoria + ' ' + o.local)
    .toLowerCase()
    .includes(busca.toLowerCase())
)
 const menu=[['mural','◈ Mural de oportunidades'],['cotacoes','▣ Minhas cotações'],['enviadas','➤ Propostas enviadas'],['contratos','◇ Contratos ativos'],['catalogo','▤ Catálogo e rider'],['desempenho','▥ Desempenho'],['perfil','◉ Perfil fornecedor']]
 return <div className="portalFornecedor">
  <div className="fornTopo"><div className="logo">▣ <span>TrocaTicket</span><small>PORTAL FORNECEDOR</small></div><span className="fornSelo">● Ambiente seguro · Demonstração</span><span className="fornEmpresa">{perfil.empresa}</span></div>
  <div className="fornCorpo"><aside className="fornMenu"><button className="novo" onClick={()=>navegar('mural')}>⌕ Buscar cotações</button><nav>{menu.map(([id,label])=><button key={id} className={pagina==='fornecedor-'+id?'ativo':''} onClick={()=>navegar(id)}>{label}</button>)}</nav><button className="fornSair" onClick={()=>setPagina('login')}>↪ Sair</button></aside>
  <main className="fornConteudo"><div className="fornTrilha">TrocaTicket Fornecedor › {titulo}</div><div className="fornTitulo"><div><h1>{titulo}</h1><p>Gestão comercial e oportunidades para fornecedores de eventos.</p></div><span className="fornSelo">Fornecedor homologado</span></div>
  {pagina==='fornecedor-mural' && <><div className="fornHero"><div><h2>{oportunidades.length} EVENTOS AGUARDANDO SUA PROPOSTA</h2><p>Encontre demandas compatíveis com seus serviços e envie sua oferta comercial.</p></div><span className="fornSelo">● Oportunidades disponíveis</span></div><div className="fornIndicadores"><div><small>OPORTUNIDADES COMPATÍVEIS</small><strong>{oportunidades.length}</strong><span>Demandas abertas</span></div><div><small>PROPOSTAS EM ANÁLISE</small><strong>{propostas.filter(p=>p.status==='Em avaliação').length}</strong><span>Enviadas</span></div><div><small>CONTRATOS FECHADOS</small><strong>{propostas.filter(p=>p.status==='Homologada').length}</strong><span>Homologados</span></div></div><input aria-label="Buscar oportunidades" placeholder="⌕ Buscar eventos, serviços ou cidades..." value={busca} onChange={e=>setBusca(e.target.value)}/><div className="fornLista">
    {carregandoOportunidades && (
  <p>Carregando oportunidades...</p>
)}

{erroOportunidades && (
  <p style={{ color: 'red' }}>
    {erroOportunidades}
  </p>
)}

{!carregandoOportunidades &&
  !erroOportunidades &&
  abertas.length === 0 && (
    <p>Nenhuma cotação disponível no momento.</p>
  )}{abertas.map(o=><article className="fornCartao" key={o.id}><div className="fornLinha"><span className="tag">#{o.id} · {o.categoria}</span><small>Prazo: {o.prazo.split('-').reverse().join('/')}</small></div><h3>{o.nome}</h3><p>Organizador: {o.organizador}</p><p>⌖ {o.local} · {o.publico} participantes</p><p>{o.descricao}</p><button className="principal" onClick={()=>{setSelecionada(o);setValor('');navegar('proposta')}}>Elaborar proposta →</button></article>)}</div></>}
  {pagina==='fornecedor-proposta' && <><button className="voltar" onClick={()=>navegar('mural')}>← Voltar para oportunidades</button><div className="fornHero"><h2>{selecionada.nome}</h2><p>{selecionada.categoria} · {selecionada.organizador} · {selecionada.publico} participantes</p></div><form className="fornCartao fornForm" onSubmit={enviar}><h2>Parâmetros financeiros e condições</h2><label>Valor global da proposta (R$) *</label><input type="number" min="0.01" step="0.01" value={valor} onChange={e=>setValor(e.target.value)} required/><label>Condições de pagamento *</label><input value={condicoes} onChange={e=>setCondicoes(e.target.value)} required/><label>Detalhamento técnico e rider *</label><textarea rows="5" value={detalhes} onChange={e=>setDetalhes(e.target.value)} required/><label className="fornCheck"><input type="checkbox" required/> Confirmo a disponibilidade e aceito os requisitos da cotação.</label><div className="acoes"><button className="secundario" type="button" onClick={()=>navegar('mural')}>Cancelar</button><button className="principal" type="submit">Enviar proposta ao organizador →</button></div></form></>}
  {(pagina==='fornecedor-enviadas'||pagina==='fornecedor-cotacoes') && <><div className="fornIndicadores"><div><small>PROPOSTAS ENVIADAS</small><strong>{propostas.length}</strong></div><div><small>EM AVALIAÇÃO</small><strong>{propostas.filter(p=>p.status==='Em avaliação').length}</strong></div><div><small>VOLUME PROPOSTO</small><strong>{formatarMoeda(propostas.reduce((s,p)=>s+p.valor,0))}</strong></div></div><div className="fornFiltros">{['Todas','Em avaliação','Homologada'].map(f=><button key={f} className={filtro===f?'selecionado':''} onClick={()=>setFiltro(f)}>{f}</button>)}</div><div className="fornCartao"><h2>Histórico de propostas</h2><div className="fornTabela"><div className="fornTabelaCab"><span>Evento</span><span>Categoria</span><span>Valor</span><span>Status</span></div>{propostas.filter(p=>filtro==='Todas'||p.status===filtro).map(p=><div className="fornTabelaLinha" key={p.id}><strong>{p.evento}</strong><span>{p.categoria}</span><strong>{formatarMoeda(p.valor)}</strong><span className="tag">{p.status}</span></div>)}</div></div></>}
  {pagina==='fornecedor-contratos' && <div className="fornCartao"><h2>Contratos ativos</h2><p>Os contratos homologados aparecerão aqui. Ainda não há contratos confirmados nos dados de demonstração.</p></div>}
  {pagina==='fornecedor-catalogo' && <div className="fornCartao"><h2>Catálogo e rider técnico</h2><p>Serviços oferecidos: {perfil.servicos}</p><p>Cadastre ou atualize os serviços em Perfil fornecedor.</p><button className="principal" onClick={()=>navegar('perfil')}>Editar perfil e serviços →</button></div>}
  {pagina==='fornecedor-desempenho' && <div className="fornIndicadores"><div><small>PROPOSTAS ENVIADAS</small><strong>{propostas.length}</strong></div><div><small>HOMOLOGADAS</small><strong>{propostas.filter(p=>p.status==='Homologada').length}</strong></div><div><small>VOLUME PROPOSTO</small><strong>{formatarMoeda(propostas.reduce((s,p)=>s+p.valor,0))}</strong></div></div>}
  {pagina==='fornecedor-perfil' && <PerfilFornecedor perfil={perfil} setPerfil={setPerfil} propostas={propostas} />}
  </main></div></div>
}

const SOLICITACOES_ADMIN = [
  { id: 9402, hora: '16/10 · 14:20', nome: 'Vanguard Eventos Corp. S.A.', tipo: 'Org', documento: 'CNPJ 14.892.401/0001-92', atuacao: 'Eventos Corporativos', detalhe: 'Porte: Grande Empresa', responsavel: 'Henrique Dias Moreira', cargo: 'Diretor de Operações', score: 98, risco: 'CND Válida', docs: 3, urgente: false },
  { id: 9398, hora: '16/10 · 11:05', nome: 'Sonora Stage & Audio Ltda', tipo: 'Forn', documento: 'CNPJ 88.214.558/0001-31', atuacao: 'Áudio & Sonorização', detalhe: 'Equipamentos Técnicos', responsavel: 'Carla Vasconcelos Ramos', cargo: 'Sócia Administradora', score: 95, risco: 'Bombeiros OK', docs: 3, urgente: false },
  { id: 9391, hora: '15/10 · 17:40', nome: 'Estruturas Alpha Box ME', tipo: 'Forn', documento: 'CNPJ 22.901.733/0001-14', atuacao: 'Estrutura Metálica', detalhe: 'Engenharia Mecânica', responsavel: 'Gilberto Nogueira Neto', cargo: 'CREA-SP: 182.540-X', score: 91, risco: 'CREA Regular', docs: 3, urgente: false },
  { id: 9388, hora: '14/10 · 09:15', nome: 'Lúmen Cenografia & Design', tipo: 'Forn', documento: 'CNPJ 31.554.889/0001-88', atuacao: 'Iluminação & Efeitos', detalhe: 'Projeções / Laser', responsavel: 'Marcelo Pires Silveira', cargo: 'Procurador Legal', score: 74, risco: 'Divergência Cadastral', docs: 2, urgente: true },
  { id: 9385, hora: '14/10 · 08:30', nome: 'Summit Tech Congressos', tipo: 'Org', documento: 'CNPJ 19.344.118/0001-56', atuacao: 'Feiras & Convenções', detalhe: 'Bilhetagem Enterprise', responsavel: 'Tatiana Fontes Albuquerque', cargo: 'Diretora Executiva', score: 90, risco: 'Regularidade 100%', docs: 3, urgente: false },
]

function AdminTopo({ aoSair }) {
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

function AdminMenu({ secao, setSecao, aoSair }) {
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

function CartaoMetrica({ titulo, valor, texto, tom = 'roxo' }) {
  return <article className={`adminMetrica ${tom}`}><div><small>{titulo}</small><span>▣</span></div><strong>{valor}</strong><p>{texto}</p></article>
}

function AdminPortal({ setPagina }) {
  const [secao, setSecao] = useState('contas')
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
        </main>
      </div>
      <footer className="adminBarraLote"><div><b>{selecionados.length}</b><span><strong>{selecionados.length} cadastros selecionados para ação em lote</strong><small>Organizadores e fornecedores de estrutura técnica</small></span></div><div><button type="button"className="recusar" disabled title="Funcionalidade em desenvolvimento">⊘ Reprovar em lote (em breve)</button><button type="button"className="aprovarLote"disabledtitle="Funcionalidade em desenvolvimento">✥ Aprovar em lote (em breve)</button></div></footer></div>
  )
}

function PerfilOrganizador() {
  const [perfil, setPerfil] = useState({ nome: 'Roberto Albuquerque', cargo: 'Organizador Sênior', email: 'roberto@empresa.com', telefone: '(11) 98765-4321', empresa: 'Albuquerque Eventos Corporativos', cnpj: '12.345.678/0001-90', bio: 'Especialista em eventos corporativos, conferências e experiências de marca.' })
  const [preferencias, setPreferencias] = useState({ cotacoes: true, propostas: true, relatorios: false, seguranca: true })
  const [editando, setEditando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const alterar = (campo, valor) => { setPerfil((atual) => ({ ...atual, [campo]: valor })); setSalvo(false) }
  const salvar = (evento) => { evento.preventDefault(); setEditando(false); setSalvo(true) }
  return <div className="perfilPagina">
    <div className="perfilCabecalho"><div><p className="trilhaNavegacao">TrocaTicket › Gestão Corporativa › Meu Perfil</p><h1>Meu perfil</h1><p>Gerencie seus dados, sua empresa e as preferências da conta.</p></div><span className="perfilContaAtiva">● Conta verificada</span></div>
    {salvo && <div className="perfilSucesso" role="status">✓ Alterações salvas com sucesso.</div>}
    <section className="perfilResumo"><div className="perfilAvatar">RA</div><div className="perfilIdentidade"><h2>{perfil.nome}</h2><p>{perfil.cargo} · {perfil.empresa}</p><div><span>Organizador</span><span>Conta corporativa</span></div></div><div className="perfilResumoNumeros"><div><strong>4</strong><small>Eventos ativos</small></div><div><strong>18</strong><small>Cotações publicadas</small></div><div><strong>98,4%</strong><small>Precisão de auditoria</small></div></div></section>
    <div className="perfilGrade">
      <form className="perfilCartao perfilDados" onSubmit={salvar}>
        <div className="perfilTituloCartao"><div><h2>Informações pessoais</h2><p>Dados utilizados na identificação e comunicação da conta.</p></div><button type="button" className="perfilEditar" onClick={() => { setEditando((valor) => !valor); setSalvo(false) }}>{editando ? 'Cancelar' : '✎ Editar dados'}</button></div>
        <div className="perfilCampos"><label>Nome completo<input disabled={!editando} value={perfil.nome} onChange={(e) => alterar('nome', e.target.value)} /></label><label>Cargo<input disabled={!editando} value={perfil.cargo} onChange={(e) => alterar('cargo', e.target.value)} /></label><label>E-mail corporativo<input type="email" disabled={!editando} value={perfil.email} onChange={(e) => alterar('email', e.target.value)} /></label><label>Telefone<input disabled={!editando} value={perfil.telefone} onChange={(e) => alterar('telefone', e.target.value)} /></label><label className="perfilCampoInteiro">Sobre você<textarea rows="3" disabled={!editando} value={perfil.bio} onChange={(e) => alterar('bio', e.target.value)} /></label></div>
        {editando && <div className="perfilAcoes"><button type="button" className="secundario" onClick={() => setEditando(false)}>Cancelar</button><button className="principal" type="submit">Salvar alterações</button></div>}
      </form>
      <aside className="perfilColuna">
        <section className="perfilCartao"><div className="perfilTituloCartao"><div><h2>Segurança</h2><p>Proteção e acesso da conta.</p></div></div><div className="perfilSegurancaItem"><span>◈</span><div><strong>Senha</strong><small>Atualizada há 34 dias</small></div><button onClick={() => alert('Um link de redefinição foi enviado para o e-mail cadastrado.')}>Alterar</button></div><div className="perfilSegurancaItem"><span>✓</span><div><strong>Autenticação em duas etapas</strong><small>Ativada por aplicativo</small></div><b>Ativa</b></div><div className="perfilSegurancaItem"><span>⌁</span><div><strong>Sessões ativas</strong><small>2 dispositivos conectados</small></div><button onClick={() => alert('As outras sessões foram encerradas.')}>Gerenciar</button></div></section>
        <section className="perfilCartao"><div className="perfilTituloCartao"><div><h2>Preferências</h2><p>Escolha quais avisos deseja receber.</p></div></div>{[['cotacoes','Atualizações de cotações','Prazos, respostas e encerramentos'],['propostas','Novas propostas','Avisos de fornecedores'],['relatorios','Relatórios semanais','Resumo por e-mail'],['seguranca','Alertas de segurança','Novos acessos e alterações']].map(([id,titulo,texto]) => <label className="perfilPreferencia" key={id}><span><strong>{titulo}</strong><small>{texto}</small></span><input type="checkbox" checked={preferencias[id]} onChange={(e) => setPreferencias((atual) => ({...atual,[id]:e.target.checked}))} /></label>)}</section>
      </aside>
      <section className="perfilCartao perfilEmpresa"><div className="perfilTituloCartao"><div><h2>Empresa vinculada</h2><p>Informações fiscais e operacionais da organização.</p></div><span className="perfilHomologada">✓ Homologada</span></div><div className="perfilEmpresaDados"><div><small>RAZÃO SOCIAL</small><strong>{perfil.empresa}</strong></div><div><small>CNPJ</small><strong>{perfil.cnpj}</strong></div><div><small>LOCALIZAÇÃO</small><strong>São Paulo — SP</strong></div><div><small>PERFIL DE CONTRATAÇÃO</small><strong>Eventos corporativos</strong></div></div></section>
    </div>
  </div>
}

function SolicitarAcesso({ setPagina }) {
  const [perfilSolicitado, setPerfilSolicitado] = useState('organizador')
  const [justificativa, setJustificativa] = useState('')
  const [enviando, setEnviando] = useState(false)

  const enviarSolicitacao = async (evento) => {
    evento.preventDefault()
    setEnviando(true)

    try {
      const token = sessionStorage.getItem('token')

      if (!token) {
        alert('Faça login novamente.')
        setPagina('login')
        return
      }

      const resposta = await fetch(
        'http://localhost:3001/solicitacoes-acesso',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            perfil_solicitado: perfilSolicitado,
            justificativa
          })
        }
      )

      const dados = await resposta.json()

      if (!resposta.ok) {
        alert(dados.erro || 'Erro ao enviar solicitação.')
        return
      }

      alert('Solicitação enviada! Aguarde a análise do administrador.')
      setPagina('participante')

    } catch (erro) {
      console.error(erro)
      alert('Não foi possível conectar ao servidor.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="paginaLogin">
      <div className="cabecalhoLogin">
        <div className="logo">
          ▣ <span>TrocaTicket</span>
        </div>
      </div>

      <main className="caixaLogin">
        <h1>Solicitar acesso</h1>

        <p>
          Escolha o perfil desejado e explique por que
          deseja utilizá-lo.
        </p>

        <form onSubmit={enviarSolicitacao}>
          <label>Perfil solicitado</label>

          <select
            value={perfilSolicitado}
            onChange={(e) => setPerfilSolicitado(e.target.value)}
            required
          >
            <option value="organizador">Organizador</option>
            <option value="fornecedor">Fornecedor</option>
          </select>

          <label>Justificativa</label>

          <textarea
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            placeholder="Explique por que deseja esse acesso..."
            rows={5}
            required
          />

          <button
            type="submit"
            className="principal"
            disabled={enviando}
          >
            {enviando ? 'Enviando...' : 'Enviar solicitação →'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setPagina('participante')}
        >
          ← Voltar
        </button>
      </main>
    </div>
  )
}


function PortalParticipante({ setPagina }) {
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
        'http://localhost:3001/participante/inscricoes',
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
          'http://localhost:3001/participante/eventos',
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

  const sair = () => {
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('perfil')
    sessionStorage.removeItem('paginaAtual')
    setPagina('login')
  }

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
      'http://localhost:3001/participante/inscricoes',
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
            onClick={sair}
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

function App() {
  const [pagina, setPagina] = useState(() => {
  const token = sessionStorage.getItem('token')
  const paginaSalva = sessionStorage.getItem('paginaAtual')

  return token && paginaSalva ? paginaSalva : 'login'
})
  const [eventos, setEventos] = useState([])
  useEffect(() => {
  if (pagina !== 'login') {
    sessionStorage.setItem('paginaAtual', pagina)
  }
  }, [pagina])
  
  useEffect(() => {
  if (pagina !== 'eventos') return

  const buscarEventos = async () => {
    try {
      const token = sessionStorage.getItem('token')

      if (!token) return

      const resposta = await fetch('http://localhost:3001/eventos', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!resposta.ok) {
        throw new Error('Erro ao buscar eventos')
      }

      const dados = await resposta.json()

      setEventos(dados)
    } catch (erro) {
      console.error('Erro ao carregar eventos:', erro)
    }
  }

  buscarEventos()
}, [pagina])

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
  const dataOriginal = eventoClicado.data || ''

  const dataFormatada = dataOriginal.includes('/')
    ? dataOriginal.split('/').reverse().join('-')
    : dataOriginal.substring(0, 10)

  setEventoEmEdicao({
    id: eventoClicado.id,
    nome: eventoClicado.nome,
    data: dataFormatada,
    horario: eventoClicado.horario?.substring(0, 5) || '09:00',
    local: eventoClicado.local || 'São Paulo - SP',
    categoria: eventoClicado.categoria || 'Corporativo',
    publico: eventoClicado.publico || 500,
    descricao: eventoClicado.descricao || '',
  })
}
  
const aoPublicarEvento = async (evento) => {
  const confirmado = window.confirm(
    `Deseja publicar o evento "${evento.nome}"?`
  )

  if (!confirmado) return

  try {
    const token = sessionStorage.getItem('token')

    if (!token) {
      alert('Sua sessão expirou. Faça login novamente.')
      setPagina('login')
      return
    }

    const resposta = await fetch(
      `http://localhost:3001/eventos/${evento.id}/publicar`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    const dados = await resposta.json()

    if (!resposta.ok) {
      alert(dados.erro || 'Erro ao publicar evento.')
      return
    }

    setEventos((anteriores) =>
      anteriores.map((item) =>
        item.id === evento.id
          ? { ...item, status: 'Ativo' }
          : item
      )
    )

    alert('Evento publicado com sucesso!')
  } catch (erro) {
    console.error('Erro ao publicar evento:', erro)
    alert('Não foi possível conectar ao servidor.')
  }
}
const aoExcluirEvento = async (evento) => {
  const confirmado = window.confirm(
    `Tem certeza que deseja excluir o evento "${evento.nome}"?`
  )

  if (!confirmado) return

  try {
    const token = sessionStorage.getItem('token')

    if (!token) {
      alert('Sua sessão expirou. Faça login novamente.')
      setPagina('login')
      return
    }

    const resposta = await fetch(
      `http://localhost:3001/eventos/${evento.id}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    )

    if (!resposta.ok) {
      const dados = await resposta.json()
      alert(dados.erro || 'Erro ao excluir evento.')
      return
    }

    setEventos((anteriores) =>
      anteriores.filter((item) => item.id !== evento.id)
    )

    alert('Evento excluído com sucesso!')
  } catch (erro) {
    console.error('Erro ao excluir evento:', erro)
    alert('Não foi possível conectar ao servidor.')
  }
}

  const aoFinalizarESalvar = async (ticketSugerido) => {
  try {
    const token = sessionStorage.getItem('token')

    if (!token) {
      alert('Sua sessão expirou. Faça login novamente.')
      setPagina('login')
      return
    }

    
const editando = Boolean(eventoEmEdicao.id)

const url = editando
  ? `http://localhost:3001/eventos/${eventoEmEdicao.id}`
  : 'http://localhost:3001/eventos'

const resposta = await fetch(url, {
  method: editando ? 'PUT' : 'POST',

      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        nome: eventoEmEdicao.nome || 'Novo Evento Corporativo',
        data: eventoEmEdicao.data,
        horario: eventoEmEdicao.horario,
        local: eventoEmEdicao.local,
        categoria: eventoEmEdicao.categoria,
        publico: Number(eventoEmEdicao.publico),
        descricao: eventoEmEdicao.descricao || ''
      })
    })

    const dados = await resposta.json()

    if (!resposta.ok) {
      alert(dados.erro || 'Erro ao cadastrar evento.')
      return
    }

    
const eventoSalvo = {
  ...eventoEmEdicao,
  ...(dados.evento || {}),
  id: eventoEmEdicao.id || dados.evento?.id || dados.id,
  data: eventoEmEdicao.data.split('-').reverse().join('/'),
  horario: eventoEmEdicao.horario,
  cotacao: '5/5',
  ticket: formatarMoeda(ticketSugerido)
}

if (editando) {
  setEventos((anteriores) =>
    anteriores.map((evento) =>
      Number(evento.id) === Number(eventoEmEdicao.id)
        ? eventoSalvo
        : evento
    )
  )
} else {
  setEventos((anteriores) => [eventoSalvo, ...anteriores])
}

setPagina('eventos')

alert(
  editando
    ? 'Evento atualizado com sucesso!'
    : 'Evento cadastrado com sucesso!'
)

  } catch (erro) {
    console.error('Erro ao salvar evento:', erro)
    alert('Não foi possível conectar ao servidor.')
  }
}

  if (pagina === 'admin') {
    return <AdminPortal setPagina={setPagina} />
  }
  if (pagina.startsWith('fornecedor-')) {
    return <PortalFornecedor pagina={pagina} setPagina={setPagina} />
  }
  if (pagina === 'login') {
    return <Login setPagina={setPagina} />
  }
  if (pagina === 'cadastro') {
  return <Cadastro setPagina={setPagina} />
  }
  if (pagina === 'participante') {
  return <PortalParticipante setPagina={setPagina} />
  }
  if (pagina === 'solicitar-acesso') {
  return <SolicitarAcesso setPagina={setPagina} />
  }
  return (
    <Layout
      pagina={pagina}
      setPagina={setPagina}
      aoCriarNovoEvento={aoCriarNovoEvento}
    >
      {pagina === 'perfil' && <PerfilOrganizador />}
      {pagina === 'eventos' && (
        <Eventos
          eventos={eventos}
          setPagina={setPagina}
          aoSelecionarEvento={aoSelecionarEvento}
          aoCriarNovoEvento={aoCriarNovoEvento}
          aoExcluirEvento={aoExcluirEvento}
          aoPublicarEvento={aoPublicarEvento}
        />
      )}
      {pagina === 'criar' && (
        <CriarEvento
          evento={eventoEmEdicao}
          setEvento={setEventoEmEdicao}
          setPagina={setPagina}
          
aoAvancarParaCustos={async () => {
  try {
    const token = sessionStorage.getItem('token')

    if (!token) {
      alert('Sua sessão expirou. Faça login novamente.')
      setPagina('login')
      return
    }

    const eventoExistente = Boolean(eventoEmEdicao.id)

    const resposta = await fetch(
      eventoExistente
        ? `http://localhost:3001/eventos/${eventoEmEdicao.id}`
        : 'http://localhost:3001/eventos',
      {
        method: eventoExistente ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(eventoEmEdicao)
      }
    )

    const dados = await resposta.json()

    if (!resposta.ok) {
      alert(dados.erro || 'Erro ao salvar evento.')
      return
    }

    if (!eventoExistente) {
      const idCriado = dados.evento?.id ?? dados.id

      if (!idCriado) {
        alert('Evento salvo, mas a API não retornou o ID.')
        return
      }

      setEventoEmEdicao((anterior) => ({
        ...anterior,
        id: idCriado
      }))
    }

    setPagina('custos')
  } catch (erro) {
    console.error('Erro ao salvar evento:', erro)
    alert('Não foi possível conectar ao servidor.')
  }
}}

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