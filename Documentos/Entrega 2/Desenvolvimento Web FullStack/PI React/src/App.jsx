import { PerfilPessoal } from './components/perfil/PerfilPessoal.jsx'
import { useSessao } from './hooks/useSessao.js'
import { useAutenticacao } from './hooks/useAutenticacao.js'
import { paginaAutorizada, paginasPorPerfil } from './services/autenticacao.js'
import { useNavegacao } from './hooks/useNavegacao.js'
import { PortalParticipante } from './pages/participante/PortalParticipante.jsx'
import { PortalFornecedor } from './pages/fornecedor/PortalFornecedor.jsx'
import { SolicitarAcesso } from './pages/auth/SolicitarAcesso.jsx'
import { Login } from './pages/auth/Login.jsx'
import { Cadastro } from './pages/auth/Cadastro.jsx'
import { Cotacao } from './pages/organizador/Cotacao.jsx'
import { Ticket } from './pages/organizador/Ticket.jsx'
import { listarEventos, publicarEvento, excluirEvento, salvarEvento } from './services/eventos.js'
import { Custos } from './pages/organizador/Custos.jsx'
import { PerfilOrganizador } from './pages/organizador/Perfil.jsx'
import { CriarEvento } from './pages/organizador/CriarEvento.jsx'
import { Eventos } from './pages/organizador/Eventos.jsx'
import { Layout } from './components/layout/Layout.jsx'
import { useState, useEffect, useRef } from 'react'
import { formatarMoeda } from './utils/formatarMoeda.js'
import { useRascunhosCustos } from './hooks/useRascunhosCustos.js'
import { criarRascunhoCustos, rascunhoCustosTemAlteracoes, usarBasePersistida } from './utils/rascunhosCustos.js'
import { useCustosPersistidos } from './hooks/useCustosPersistidos.js'
import { usePublicacaoCotacao } from './hooks/usePublicacaoCotacao.js'
import './App.css'
import { AdminPortal } from './components/admin/AdminPortal'













function PerfilFornecedor({ propostas = [] }) {
  const aprovadas = propostas.filter(item => item.status === 'Aprovada').length
  const volume = propostas.reduce((soma, item) => soma + item.valor, 0)
  const indicadores = <div className="perfilResumoNumeros"><div><strong>{propostas.length}</strong><small>Propostas enviadas</small></div><div><strong>{aprovadas}</strong><small>Aprovadas</small></div><div><strong>{formatarMoeda(volume)}</strong><small>Volume proposto</small></div></div>
  return <PerfilPessoal contexto="Fornecedor" indicadores={indicadores} />
}

function App() {
  const [paginaSolicitada, definirPagina] = useState(() => {
  const token = sessionStorage.getItem('token')
  const paginaSalva = sessionStorage.getItem('paginaAtual')

  return token && paginaSalva ? paginaSalva : 'login'
})
  const autenticacao = useAutenticacao(paginaSolicitada)
  const pagina = paginaAutorizada(paginaSolicitada, autenticacao.sessao?.perfil)
  const [eventos, setEventos] = useState([])
  const [carregandoEventos, setCarregandoEventos] = useState(true)
  const [erroEventos, setErroEventos] = useState('')
  const [tentativaEventos, setTentativaEventos] = useState(0)
  useNavegacao(pagina)
  
  useEffect(() => {
  if (pagina !== 'eventos') return

  let consultaAtiva = true

  const buscarEventos = async () => {
    setCarregandoEventos(true)
    setErroEventos('')
    setEventos([])
    try {
      const token = sessionStorage.getItem('token')

      if (!token) throw new Error('Sessão indisponível')

      const resposta = await listarEventos(token)

      if (!resposta.ok) {
        throw new Error('Erro ao buscar eventos')
      }

      const dados = await resposta.json()
      if (!Array.isArray(dados)) throw new Error('Resposta de eventos inválida')

      if (consultaAtiva) setEventos(dados)
    } catch (erro) {
      console.error('Erro ao carregar eventos:', erro)
      if (consultaAtiva) {
        setEventos([])
        setErroEventos('Não foi possível carregar os eventos. Tente novamente.')
      }
    } finally {
      if (consultaAtiva) setCarregandoEventos(false)
    }
  }

  buscarEventos()

  return () => {
    consultaAtiva = false
    setCarregandoEventos(true)
    setEventos([])
  }
}, [pagina, tentativaEventos])

  const [geracaoSessaoCustos, setGeracaoSessaoCustos] = useState(0)
  const geracaoSessaoCustosRef = useRef(0)
  const { rascunhos: rascunhosCustos, setRascunhos: setRascunhosCustos,
    garantirRascunho, removerRascunho, atualizarCustos,
    formularioCustosPendente, formularioCustosPendenteRef, setFormularioCustosPendente,
    contextoFormularioCustos, setContextoFormularioCustos, temRascunhos,
  } = useRascunhosCustos({ geracaoSessaoRef: geracaoSessaoCustosRef })
  const [chaveEvento, setChaveEvento] = useState('novo:0')
  const selecaoEventoRef = useRef({ chave: 'novo:0', versao: 0 })
  const contadorNovoEventoRef = useRef(0)
  const trocaEventoPendenteRef = useRef(null)
  const paginaAtualRef = useRef(pagina)
  const custos = rascunhosCustos[chaveEvento]?.itens || []
  const rascunhoCustosAtual = rascunhosCustos[chaveEvento]
  const [eventoEmEdicao, setEventoEmEdicao] = useState(dadosNovoEvento)
  const persistenciaCustos = useCustosPersistidos({
    pagina, chaveEvento, rascunhos: rascunhosCustos, setRascunhos: setRascunhosCustos,
    geracaoSessao: geracaoSessaoCustos, geracaoSessaoRef: geracaoSessaoCustosRef,
    formularioPendenteRef: formularioCustosPendenteRef, selecaoEventoRef,
  })

  const publicacaoCotacao = usePublicacaoCotacao({
    eventoId: Number(eventoEmEdicao.id), chaveEvento, geracaoSessao: geracaoSessaoCustos,
    rascunho: rascunhoCustosAtual, formularioPendente: formularioCustosPendente,
    formularioPendenteRef: formularioCustosPendenteRef, geracaoSessaoRef: geracaoSessaoCustosRef,
    selecaoEventoRef, paginaAtualRef, setRascunhos: setRascunhosCustos,
  })

  function usarCustosDoServidor() {
    if (!rascunhoCustosAtual || rascunhoCustosAtual.basePersistida === null ||
        rascunhoCustosAtual.get.estado !== 'carregado' ||
        ['salvando', 'resultadoIncerto'].includes(rascunhoCustosAtual.put.estado)) return
    if (!window.confirm('Substituir o rascunho pela última lista consultada do servidor? Os campos ainda não aplicados também serão descartados.')) return
    setRascunhosCustos(atuais => ({ ...atuais, [chaveEvento]: usarBasePersistida(atuais[chaveEvento]) }))
    setFormularioCustosPendente(false)
    setContextoFormularioCustos(atual => atual + 1)
  }
  function dadosNovoEvento() {
    return {
      nome: '',
      data: '',
      horario: '',
      local: '',
      categoria: 'Corporativo',
      publico: '',
      descricao: '',
    }
  }

  function atualizarSelecao(evento, chave) {
    garantirRascunho(chave)

    if (selecaoEventoRef.current.chave !== chave) {
      setContextoFormularioCustos((atual) => atual + 1)
    }

    selecaoEventoRef.current = {
      chave,
      versao: selecaoEventoRef.current.versao + 1,
    }
    setChaveEvento(chave)
    setEventoEmEdicao(evento)
  }

  function setCustos(proximosCustos) {
    atualizarCustos(chaveEvento, geracaoSessaoCustos, proximosCustos)
  }

  function limparRascunhosDaSessao() {
    geracaoSessaoCustosRef.current += 1
    setGeracaoSessaoCustos(geracaoSessaoCustosRef.current)
    setRascunhosCustos({})
    setFormularioCustosPendente(false)
    setEventos([])
    trocaEventoPendenteRef.current = null
    contadorNovoEventoRef.current += 1
    atualizarSelecao(dadosNovoEvento(), `novo:${contadorNovoEventoRef.current}`)
  }

  function confirmarDescarteDaSessao() {
    return (!temRascunhos && !formularioCustosPendente && !publicacaoCotacao.temPendencias) || window.confirm(
      'Há alterações locais ou operações ainda não confirmadas, incluindo publicações. Sair descartará os rascunhos locais e não cancela operações já enviadas ao servidor. Deseja continuar?'
    )
  }

  function setPagina(destino) {
    const proximaPagina = typeof destino === 'function'
      ? destino(paginaAtualRef.current)
      : destino
    const troca = trocaEventoPendenteRef.current
    trocaEventoPendenteRef.current = null
    const trocaDeEvento = troca && troca.tipo !== 'invalido' && (
      troca.tipo === 'novo' || `evento:${troca.evento.id}` !== selecaoEventoRef.current.chave
    )
    const abandonarFormulario = formularioCustosPendente && paginaAtualRef.current === 'custos' && (
      proximaPagina !== 'custos' || trocaDeEvento
    )

    if (abandonarFormulario && !trocaDeEvento && proximaPagina !== 'login') {
      if (!window.confirm('Há campos de custo ainda não aplicados à lista. Sair desta página descartará esses campos, mas manterá os itens já adicionados ao rascunho. Deseja continuar?')) {
        return false
      }
    }

    if (troca) {
      if (troca.tipo === 'invalido') return false

      const origem = selecaoEventoRef.current.chave
      const chaveDestino = troca.tipo === 'novo'
        ? `novo:${contadorNovoEventoRef.current + 1}`
        : `evento:${troca.evento.id}`

      if (origem !== chaveDestino && (rascunhoCustosTemAlteracoes(rascunhosCustos[origem]) || abandonarFormulario)) {
        const mensagem = origem.startsWith('novo:')
          ? 'Este evento ainda não tem ID salvo. Trocar ou criar outro evento descartará seu rascunho local de custos, que não está no banco. Deseja continuar?'
          : 'Este evento possui custos não salvos no banco. O rascunho será mantido apenas nesta sessão e poderá ser retomado ao abrir o mesmo evento. Deseja continuar?'

        const avisoFormulario = abandonarFormulario
          ? '\nOs campos do formulário ainda não aplicados à lista serão descartados.'
          : ''

        if (!window.confirm(mensagem + avisoFormulario)) return false
      }

      if (origem !== chaveDestino && origem.startsWith('novo:')) {
        removerRascunho(origem)
      }

      if (troca.tipo === 'novo') contadorNovoEventoRef.current += 1
      atualizarSelecao(troca.tipo === 'novo' ? dadosNovoEvento() : troca.evento, chaveDestino)
    }

    if (proximaPagina === 'login') {
      if (!confirmarDescarteDaSessao()) return false
      limparRascunhosDaSessao()
    }

    if (abandonarFormulario) setFormularioCustosPendente(false)
    paginaAtualRef.current = proximaPagina
    definirPagina(proximaPagina)
    return true
  }

  const aoCriarNovoEvento = () => {
    // Menu e Eventos chamam este callback antes de setPagina('criar').
    // A troca só é aplicada junto com a navegação, após a confirmação.
    trocaEventoPendenteRef.current = { tipo: 'novo' }
  }

  function vincularRascunhoAoEvento(id, versaoEsperada) {
    const eventoId = Number(id)

    if (
      selecaoEventoRef.current.versao !== versaoEsperada ||
      !Number.isSafeInteger(eventoId) || eventoId <= 0
    ) return false

    const origem = selecaoEventoRef.current.chave
    const destino = `evento:${eventoId}`
    const geracaoAtual = geracaoSessaoCustosRef.current

    if (origem !== destino) {
      setRascunhosCustos((atuais) => {
        const rascunho = atuais[origem]
        if (!rascunho || rascunho.geracaoSessao !== geracaoAtual) return atuais

        // A identidade mudou: futuras respostas da chave antiga ficam inválidas.
        const inicial = criarRascunhoCustos(geracaoAtual)
        const proximos = {
          ...atuais,
          [destino]: { ...rascunho, get: inicial.get, put: inicial.put },
        }
        delete proximos[origem]
        return proximos
      })
    }

    selecaoEventoRef.current = { chave: destino, versao: versaoEsperada + 1 }
    setChaveEvento(destino)
    setEventoEmEdicao((anterior) => ({ ...anterior, id: eventoId }))
    return true
  }

const { aoSair } = useSessao({
  confirmarDescarteDaSessao, limparRascunhosDaSessao, paginaAtualRef, definirPagina,
  invalidarAutenticacao: autenticacao.invalidar,
})

async function aoAutenticar(token, perfil) {
  const confirmado = await autenticacao.iniciarSessao(token, perfil)
  if (confirmado) setPagina(paginasPorPerfil[confirmado][0])
}

const aoSelecionarEvento = (eventoClicado) => {
  const id = Number(eventoClicado.id)

  if (!Number.isSafeInteger(id) || id <= 0) {
    trocaEventoPendenteRef.current = { tipo: 'invalido' }
    alert('Selecione um evento com ID válido para abrir seus custos.')
    return
  }

  const dataOriginal = eventoClicado.data || ''

  const dataFormatada = dataOriginal.includes('/')
    ? dataOriginal.split('/').reverse().join('-')
    : dataOriginal.substring(0, 10)

  trocaEventoPendenteRef.current = { tipo: 'selecionar', evento: {
    id,
    nome: eventoClicado.nome,
    data: dataFormatada,
    horario: eventoClicado.horario?.substring(0, 5) || '',
    local: eventoClicado.local || '',
    categoria: eventoClicado.categoria || '',
    publico: eventoClicado.publico ?? '',
    descricao: eventoClicado.descricao || '',
  } }
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

    const resposta = await publicarEvento(evento.id, token)

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
  const chaveExcluida = `evento:${evento.id}`
  const avisoRascunho = rascunhoCustosTemAlteracoes(rascunhosCustos[chaveExcluida])
    ? '\nOs custos em memória deste evento também serão descartados.'
    : ''
  const confirmado = window.confirm(
    `Tem certeza que deseja excluir o evento "${evento.nome}"?${avisoRascunho}`
  )

  if (!confirmado) return

  try {
    const token = sessionStorage.getItem('token')

    if (!token) {
      alert('Sua sessão expirou. Faça login novamente.')
      setPagina('login')
      return
    }

    const resposta = await excluirEvento(evento.id, token)

    if (resposta.status === 409) {
      alert('Este evento possui inscrições ou propostas vinculadas e não pode ser excluído.')
      return
    }

    if (!resposta.ok) {
      const dados = await resposta.json()
      alert(dados.erro || 'Erro ao excluir evento.')
      return
    }

    setEventos((anteriores) =>
      anteriores.filter((item) => item.id !== evento.id)
    )

    removerRascunho(chaveExcluida)

    if (selecaoEventoRef.current.chave === chaveExcluida) {
      contadorNovoEventoRef.current += 1
      atualizarSelecao(dadosNovoEvento(), `novo:${contadorNovoEventoRef.current}`)
    }

    alert('Evento excluído com sucesso!')
  } catch (erro) {
    console.error('Erro ao excluir evento:', erro)
    alert('Não foi possível conectar ao servidor.')
  }
}

  const aoFinalizarESalvar = async () => {
  if (!custos.length) {
    alert('Cadastre os custos do evento antes de finalizar o planejamento financeiro.')
    return
  }

  const versaoAoSalvar = selecaoEventoRef.current.versao
  const paginaAoSalvar = paginaAtualRef.current

  try {
    const token = sessionStorage.getItem('token')

    if (!token) {
      alert('Sua sessão expirou. Faça login novamente.')
      setPagina('login')
      return
    }

    
const editando = Boolean(eventoEmEdicao.id)

const resposta = await salvarEvento(eventoEmEdicao.id, {
        nome: eventoEmEdicao.nome,
        data: eventoEmEdicao.data,
        horario: eventoEmEdicao.horario,
        local: eventoEmEdicao.local,
        categoria: eventoEmEdicao.categoria,
        publico: Number(eventoEmEdicao.publico),
        descricao: eventoEmEdicao.descricao || ''
      }, token)

    const dados = await resposta.json()

    if (selecaoEventoRef.current.versao !== versaoAoSalvar) return

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

}

if (!editando && !vincularRascunhoAoEvento(eventoSalvo.id, versaoAoSalvar)) {
  alert('Evento salvo, mas a API não retornou um ID válido para associar o rascunho de custos.')
  return
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

if (paginaAtualRef.current === paginaAoSalvar) setPagina('eventos')

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

  if (autenticacao.verificando) return <p role="status">Validando sessão...</p>
  if (pagina === 'admin') {
    return <AdminPortal aoSair={aoSair} />
  }
  if (pagina.startsWith('fornecedor-')) {
    return <PortalFornecedor pagina={pagina} setPagina={setPagina} aoSair={aoSair} PerfilFornecedor={PerfilFornecedor} />
  }
  if (pagina === 'login') {
    return <Login setPagina={setPagina} aoAutenticarSessao={aoAutenticar} erroSessao={autenticacao.erro} />
  }
  if (pagina === 'cadastro') {
  return <Cadastro setPagina={setPagina} />
  }
  if (pagina === 'participante') {
  return <PortalParticipante setPagina={setPagina} aoSair={aoSair} />
  }
  if (pagina === 'solicitar-acesso') {
  return <SolicitarAcesso setPagina={setPagina} />
  }
  return (
    <Layout
      pagina={pagina}
      setPagina={setPagina}
      aoCriarNovoEvento={aoCriarNovoEvento}
      aoSair={aoSair}
    >
      {['custos', 'cotacao', 'ticket'].includes(pagina) && (
        <p role="status">
          {!rascunhoCustosAtual || rascunhoCustosAtual.basePersistida === null
            ? 'A lista persistida ainda não foi confirmada. Os itens locais são rascunhos por evento. '
            : rascunhoCustosTemAlteracoes(rascunhoCustosAtual)
              ? 'Há alterações locais ou salvamento ainda não confirmado. '
              : 'A lista corresponde à última confirmação do servidor. '}
          Alterações locais não salvas serão perdidas ao recarregar ou sair.
          {publicacaoCotacao.disponivel
            ? 'A publicação exige custos salvos, confirmados e sem alterações pendentes.'
            : 'Publicação bloqueada: destino da API não permitido.'}
        </p>
      )}
      {pagina === 'perfil' && <PerfilOrganizador />}
      {pagina === 'eventos' && (
        <Eventos
          eventos={eventos}
          carregando={carregandoEventos}
          erro={erroEventos}
          aoTentarNovamente={() => setTentativaEventos((valor) => valor + 1)}
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
  const versaoAoSalvar = selecaoEventoRef.current.versao
  const paginaAoSalvar = paginaAtualRef.current

  try {
    const token = sessionStorage.getItem('token')

    if (!token) {
      alert('Sua sessão expirou. Faça login novamente.')
      setPagina('login')
      return
    }

    const eventoExistente = Boolean(eventoEmEdicao.id)

    const resposta = await salvarEvento(eventoEmEdicao.id, eventoEmEdicao, token)

    const dados = await resposta.json()

    if (selecaoEventoRef.current.versao !== versaoAoSalvar) return

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

      if (!vincularRascunhoAoEvento(idCriado, versaoAoSalvar)) {
        alert('Evento salvo, mas a API não retornou um ID válido para associar o rascunho de custos.')
        return
      }
    }

    if (paginaAtualRef.current === paginaAoSalvar) setPagina('custos')
  } catch (erro) {
    console.error('Erro ao salvar evento:', erro)
    alert('Não foi possível conectar ao servidor.')
  }
}}

        />
      )}
      {pagina === 'custos' && (
        <Custos
          key={contextoFormularioCustos}
          evento={eventoEmEdicao}
          custos={custos}
          setCustos={setCustos}
          aoAlterarFormularioPendente={setFormularioCustosPendente}
          setPagina={setPagina}
          rascunho={rascunhoCustosAtual}
          persistencia={persistenciaCustos}
          aoUsarServidor={usarCustosDoServidor}
        />
      )}
      {pagina === 'cotacao' && (
        <Cotacao
          publicacao={publicacaoCotacao}
          evento={eventoEmEdicao}
          custos={custos}
          setPagina={setPagina}
        />
      )}
      {pagina === 'ticket' && (custos.length === 0 ? (
        <section className="cartaoFormulario">
          <h1>Planejamento financeiro indisponível</h1>
          <p>Este evento não possui custos cadastrados. Nenhum resultado financeiro será apresentado enquanto a lista estiver vazia.</p>
          <button className="principal" onClick={() => setPagina('custos')}>
            Voltar para Itens de Custo
          </button>
        </section>
      ) : (
        <Ticket
          evento={eventoEmEdicao}
          custos={custos}
          setPagina={setPagina}
          aoFinalizarESalvar={aoFinalizarESalvar}
        />
      ))}
    </Layout>
  )
}

export default App
