import { consultarTermosCadastro } from '../../services/termosCadastro.js'
import '../publicas/Transparencia.css'
import { Marca } from '../../components/ui/Marca.jsx'
import { Icone } from '../../components/ui/Icone.jsx'
import { useEffect, useRef, useState } from 'react'
import { Alerta, Botao, Campo } from '../../components/ui/Primitivas.jsx'
import { guardarAvisoCadastro } from './avisoCadastro.js'
import './Autenticacao.css'
import { apiUrl } from '../../services/api.js'

export function Cadastro({ setPagina }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [cadastrando, setCadastrando] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [erroConfirmacao, setErroConfirmacao] = useState('')
  const [aceitouTermos, setAceitouTermos] = useState(false)
  const [termos, setTermos] = useState(null)
  const [erroTermos, setErroTermos] = useState('')
  useEffect(() => {
    const c = new AbortController()
    consultarTermosCadastro(c.signal).then(d => { if (!c.signal.aborted) setTermos(d) })
      .catch(() => { if (!c.signal.aborted) setErroTermos('Cadastro indisponível: os Termos de Uso ainda são minutas ou a publicação não pôde ser confirmada.') })
    return () => c.abort()
  }, [])
  const envio = useRef(false)
  const mensagemRef = useRef(null)
  useEffect(() => { if (feedback) mensagemRef.current?.focus() }, [feedback])

  const cadastrar = async (evento) => {
    evento.preventDefault()
    if (envio.current) return
    setErroConfirmacao('')

    if (senha !== confirmarSenha) {
      setErroConfirmacao('As senhas não coincidem.')
      setFeedback({ tipo: 'erro', mensagem: 'As senhas não coincidem.' })
      return
    }

    if (!aceitouTermos) {
      setFeedback({ tipo: 'erro', mensagem: 'É necessário ler e aceitar os Termos de Uso para cadastrar a conta.' })
      return
    }
    if (!termos || erroTermos) {
      setFeedback({ tipo: 'erro', mensagem: erroTermos || 'Aguarde a consulta da versão dos Termos de Uso.' })
      return
    }
    envio.current = true
    setCadastrando(true)
    setFeedback(null)

    try {
      const resposta = await fetch(apiUrl('/usuarios'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nome,
          email,
          senha,
          perfil: 'participante',
          aceite_termos: { aceito: true, ...termos }
        })
      })

      const dados = await resposta.json()

      if (!resposta.ok) {
        setFeedback({ tipo: 'erro', mensagem: dados.erro || 'Erro ao criar conta.' })
        return
      }

      guardarAvisoCadastro('Conta criada com sucesso! Faça login para continuar.')
      setPagina('login')
    } catch (erro) {
      console.error('Erro ao cadastrar:', erro)
      setFeedback({ tipo: 'erro', mensagem: 'Não foi possível conectar ao servidor. O cadastro pode ter sido recebido. Tente entrar para conferir antes de reenviar.' })
    } finally {
      envio.current = false
      setCadastrando(false)
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
        <h1>Criar conta</h1>
        <p>
          Cadastre-se gratuitamente como participante.
          Depois, você poderá solicitar acesso como organizador ou fornecedor.
        </p>

        {feedback && <Alerta variante={feedback.tipo} tabIndex={-1} ref={mensagemRef}>{feedback.mensagem}</Alerta>}
        <form onSubmit={cadastrar} aria-busy={cadastrando}>
          <Campo id="cadastro-nome" label="Nome completo" type="text" autoComplete="name"
            value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome completo" obrigatorio ocupado={cadastrando} />
          <Campo id="cadastro-email" label="E-mail" type="email" autoComplete="email"
            value={email} onChange={e => setEmail(e.target.value)} placeholder="seuemail@exemplo.com" obrigatorio ocupado={cadastrando} />
          <Campo id="cadastro-senha" label="Senha" type="password" autoComplete="new-password"
            value={senha} onChange={e => setSenha(e.target.value)} placeholder="Crie uma senha" obrigatorio ocupado={cadastrando} />
          <Campo id="cadastro-confirmar" label="Confirmar senha" type="password" autoComplete="new-password"
            value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} placeholder="Digite a senha novamente"
            erro={erroConfirmacao} obrigatorio ocupado={cadastrando} />
          {erroTermos ? <Alerta variante="aviso">{erroTermos}</Alerta> : !termos && <p role="status">Consultando a publicação dos Termos de Uso...</p>}
          <div className="cadastroAceite">
            <label htmlFor="cadastro-aceite"><input id="cadastro-aceite" type="checkbox" required checked={aceitouTermos}
              disabled={cadastrando || !termos || Boolean(erroTermos)} onChange={e => setAceitouTermos(e.target.checked)}
              aria-describedby="cadastro-aceite-dica" /> Li e aceito os Termos de Uso do TrocaTicket.</label>
            <p id="cadastro-aceite-dica"><a href="/termos" target="_blank" rel="noopener noreferrer">Ler Termos de Uso (nova aba)</a>. Consulte também a <a href="/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade (nova aba)</a>. O aceite contratual não é consentimento geral para tratamento de dados ou marketing.</p>
          </div>
          <Botao type="submit" disabled={!termos || Boolean(erroTermos)} ocupado={cadastrando}>{cadastrando ? 'Criando conta...' : 'Criar conta'}</Botao>
        </form>

        <p className="cadastro">
          Já tem uma conta?{' '}
          <Botao variante="discreto" disabled={cadastrando} onClick={() => setPagina('login')}>Entrar</Botao>
        </p>
        <nav className="transparenciaLinks" aria-label="Privacidade e transparência">
          <a href="/privacidade">Política de Privacidade</a>
          <a href="/termos">Termos de Uso</a>
          <a href="/contato-privacidade">Contato de Privacidade</a>
        </nav>
      </main>
    </div>
  )
}

