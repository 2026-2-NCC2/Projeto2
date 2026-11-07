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
    <div className="paginaLogin autenticacaoPagina">
      <div className="cabecalhoLogin">
        <div className="logo">
          <Marca />
        </div>
        <span className="acessoSeguro"><Icone nome="acesso" tamanho={16} /> Acesso à conta</span>
      </div>
      <main className="caixaLogin">
        {erroSessao && <Alerta variante="erro">{erroSessao}</Alerta>}
        {feedback && <Alerta variante={feedback.tipo} tabIndex={-1} ref={mensagemRef}>{feedback.mensagem}</Alerta>}
        <div className="escolhaPerfil"><button type="button" aria-pressed={perfil === 'organizador'} className={perfil === 'organizador' ? 'selecionado' : ''} onClick={() => setPerfil('organizador')}>Organizador</button><button type="button" aria-pressed={perfil === 'fornecedor'} className={perfil === 'fornecedor' ? 'selecionado' : ''} onClick={() => setPerfil('fornecedor')}>Fornecedor</button></div>
        <button
          type="button"
          className={`acessoAdmin ${perfil === 'admin' ? 'selecionado' : ''}`}
          aria-pressed={perfil === 'admin'}
          onClick={() => setPerfil('admin')}
        >
          Acesso administrativo
        </button>
        <h1>Acessar sua conta</h1>
        <p>{perfil === 'fornecedor' ? 'Encontre oportunidades e envie propostas para eventos.' : 'Acesse seu painel de gestão e cotações de eventos corporativos.'}</p>
        <form onSubmit={aoAutenticar} aria-busy={entrando}>
          <Campo id="login-email" label="E-mail" type="email" autoComplete="username"
            value={email} onChange={e => setEmail(e.target.value)} placeholder="seuemail@empresa.com" obrigatorio ocupado={entrando} />
          <Campo id="login-senha" label="Senha" type="password" autoComplete="current-password"
            value={senha} onChange={e => setSenha(e.target.value)} placeholder="••••••••" obrigatorio ocupado={entrando} />
          <div className="rotuloSenha">
            <button type="button" disabled title="Funcionalidade indisponível">Esqueci minha senha</button>
          </div>
          <label className="lembrar">
            <input type="checkbox" disabled /> Lembrar deste dispositivo
          </label>
          <Botao type="submit" ocupado={entrando}>{entrando ? 'Entrando...' : 'Entrar'}</Botao>
        </form>
        <div className="divisor">ou continue com</div>
        <button
          type="button"
          className="botaoGoogle"
          disabled
          title="Funcionalidade indisponível"
        >
          Google Workspace / SSO
        </button>
        <p className="cadastro">Ainda não tem uma conta?{' '}
          <Botao variante="discreto" disabled={entrando} onClick={() => setPagina('cadastro')}>Criar conta</Botao>
        </p>
      </main>
    </div>
  )
}

