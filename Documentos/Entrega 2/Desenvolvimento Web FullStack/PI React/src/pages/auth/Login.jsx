import '../publicas/Transparencia.css'
import { Marca } from '../../components/ui/Marca.jsx'
import { Icone } from '../../components/ui/Icone.jsx'
import { useEffect, useRef, useState } from 'react'
import { Alerta, Botao, Campo } from '../../components/ui/Primitivas.jsx'
import { lerAvisoCadastro, limparAvisoCadastro } from './avisoCadastro.js'
import './Autenticacao.css'
import { apiUrl } from '../../services/api.js'

export function Login({ setPagina, aoAutenticarSessao, erroSessao }) {
  const [perfil, setPerfil] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [entrando, setEntrando] = useState(false)
  const [feedback, setFeedback] = useState(() => lerAvisoCadastro() ? { tipo: 'sucesso', mensagem: lerAvisoCadastro() } : null)
  const envio = useRef(false)
  const mensagemRef = useRef(null)
  useEffect(() => { limparAvisoCadastro() }, [])
  useEffect(() => { if (feedback?.tipo === 'erro') mensagemRef.current?.focus() }, [feedback])
  
const aoAutenticar = async (eventoDisparado) => {
  eventoDisparado.preventDefault()
  if (envio.current) return
  envio.current = true
  setEntrando(true)
  setFeedback(null)

  try {
    const resposta = await fetch(apiUrl('/login'), {
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
      setFeedback({ tipo: 'erro', mensagem: dados.erro || 'Erro ao fazer login.' })
      return
    }

    await aoAutenticarSessao(dados.token, dados.usuario?.perfil)
  } catch (erro) {
    console.error(erro)
    setFeedback({ tipo: 'erro', mensagem: 'Não foi possível conectar ao servidor. Não foi possível confirmar o acesso.' })
  } finally {
    envio.current = false
    setEntrando(false)
  }
}

  return (
    <div className="paginaLogin autenticacaoPagina loginPagina">
      <div className="cabecalhoLogin">
        <div className="logo">
          <Marca />
        </div>
        <span className="acessoSeguro"><Icone nome="acesso" tamanho={16} /> Acesso à conta</span>
      </div>
      <div className="loginEstrutura">
      <main className="caixaLogin" aria-labelledby="login-titulo">
        <p className="loginSobretitulo">BEM-VINDO AO TROCATICKET</p>
        <h1 id="login-titulo">Acessar sua conta</h1>
        <p className="loginIntroducao">{perfil === 'fornecedor' ? 'Encontre oportunidades e envie propostas para eventos.' : perfil === 'participante' ? 'Explore eventos e acompanhe suas inscrições.' : perfil === 'admin' ? 'Consulte as informações disponíveis para a administração.' : 'Seus eventos, suas conexões e seu planejamento em um só lugar.'}</p>
        {erroSessao && <Alerta id="login-sessao" variante="erro" titulo="Confira sua sessão">{erroSessao}</Alerta>}
        {feedback && <Alerta id="login-feedback" variante={feedback.tipo} titulo={feedback.tipo === 'erro' ? 'Não foi possível entrar' : undefined} tabIndex={-1} ref={mensagemRef}>{feedback.mensagem}</Alerta>}
        <div className="loginPerfis" role="group" aria-label="Apresentação dos portais" aria-describedby="login-perfis-ajuda">
        <div className="escolhaPerfil">
          <button type="button" disabled={entrando} aria-pressed={perfil === 'participante'}
            className={perfil === 'participante' ? 'selecionado' : ''} onClick={() => setPerfil('participante')}>Participante</button>
          <button type="button" disabled={entrando} aria-pressed={perfil === 'organizador'}
            className={perfil === 'organizador' ? 'selecionado' : ''} onClick={() => setPerfil('organizador')}>Organizador</button>
          <button type="button" disabled={entrando} aria-pressed={perfil === 'fornecedor'}
            className={perfil === 'fornecedor' ? 'selecionado' : ''} onClick={() => setPerfil('fornecedor')}>Fornecedor</button>
        </div>
        <button
          type="button"
          disabled={entrando}
          className={`acessoAdmin ${perfil === 'admin' ? 'selecionado' : ''}`}
          aria-pressed={perfil === 'admin'}
          onClick={() => setPerfil('admin')}
        >
          Acesso administrativo
        </button>
        </div>
        <p className="loginAjuda" id="login-perfis-ajuda">A seleção apresenta cada portal. Seu acesso é definido pela conta autenticada.</p>
        <form onSubmit={aoAutenticar} aria-busy={entrando} aria-describedby={[erroSessao && 'login-sessao', feedback && 'login-feedback'].filter(Boolean).join(' ') || undefined}>
          <Campo id="login-email" label="E-mail" type="email" autoComplete="username"
            autoCapitalize="none" spellCheck={false}
            value={email} onChange={e => setEmail(e.target.value)} placeholder="seuemail@empresa.com" obrigatorio ocupado={entrando} />
          <Campo id="login-senha" label="Senha" type={mostrarSenha ? 'text' : 'password'} autoComplete="current-password"
            value={senha} onChange={e => setSenha(e.target.value)} placeholder="••••••••" obrigatorio ocupado={entrando} />
          <Botao className="loginMostrarSenha" variante="discreto" disabled={entrando} aria-controls="login-senha" aria-pressed={mostrarSenha} onClick={() => setMostrarSenha(atual => !atual)}>{mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}</Botao>
          <Botao type="submit" ocupado={entrando}>{entrando ? 'Entrando...' : 'Entrar'}</Botao>
        </form>
        <details className="loginIndisponiveis">
        <summary>Recursos ainda indisponíveis</summary>
        <p className="loginAjuda">Estas opções não estão habilitadas nesta versão.</p>
        <div className="rotuloSenha">
          <button type="button" disabled title="Funcionalidade indisponível">Esqueci minha senha</button>
        </div>
        <label className="lembrar"><input type="checkbox" disabled /> Lembrar deste dispositivo</label>
        <button
          type="button"
          className="botaoGoogle"
          disabled
          title="Funcionalidade indisponível"
        >
          Google Workspace / SSO
        </button>
        </details>
        <p className="cadastro">Ainda não tem uma conta?{' '}
          <Botao variante="discreto" disabled={entrando} onClick={() => setPagina('cadastro')}>Criar conta</Botao>
        </p>
        <nav className="transparenciaLinks" aria-label="Privacidade e transparência">
          <a href="/privacidade">Política de Privacidade</a>
          <a href="/termos">Termos de Uso</a>
          <a href="/contato-privacidade">Contato de Privacidade</a>
        </nav>
      </main>
      <aside className="loginApresentacao" aria-labelledby="login-apresentacao-titulo">
        <span className="loginSimbolo" aria-hidden="true"><Icone nome="ticket" tamanho={64} /></span>
        <p className="loginSobretitulo">CONEXÕES PARA EVENTOS</p>
        <h2 id="login-apresentacao-titulo">Seu próximo encontro começa com uma conexão.</h2>
        <p>Continue no espaço da sua conta para explorar, planejar ou acompanhar oportunidades.</p>
        <ul><li><Icone nome="eventos" /> Eventos e inscrições</li><li><Icone nome="custos" /> Custos e simulação de ticket</li><li><Icone nome="documento" /> Cotações e propostas comerciais</li></ul>
        <p className="loginAjuda">Cada perfil acessa somente as informações e ações autorizadas para sua conta.</p>
      </aside>
      </div>
    </div>
  )
}

