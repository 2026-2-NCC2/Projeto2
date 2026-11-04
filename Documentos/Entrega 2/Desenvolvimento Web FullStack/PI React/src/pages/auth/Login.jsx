import { Icone } from '../../components/ui/Icone.jsx'
import { useState } from 'react'
import { apiUrl } from '../../services/api.js'

export function Login({ setPagina, aoAutenticarSessao, erroSessao }) {
  const [perfil, setPerfil] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  
const aoAutenticar = async (eventoDisparado) => {
  eventoDisparado.preventDefault()

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
      alert(dados.erro || 'Erro ao fazer login.')
      return
    }

    await aoAutenticarSessao(dados.token, dados.usuario?.perfil)
  } catch (erro) {
    console.error(erro)
    alert('Não foi possível conectar ao servidor.')
  }
}

  return (
    <div className="paginaLogin">
      <div className="cabecalhoLogin">
        <div className="logo">
          <Icone nome="ticket" /> <span>TrocaTicket</span>
        </div>
        <span className="acessoSeguro"><Icone nome="acesso" tamanho={16} /> Acesso à conta</span>
      </div>
      <main className="caixaLogin">
        {erroSessao && <p role="alert">{erroSessao}</p>}
        <div className="escolhaPerfil"><button type="button" className={perfil === 'organizador' ? 'selecionado' : ''} onClick={() => setPerfil('organizador')}>Organizador</button><button type="button" className={perfil === 'fornecedor' ? 'selecionado' : ''} onClick={() => setPerfil('fornecedor')}>Fornecedor</button></div>
        <button
          type="button"
          className={`acessoAdmin ${perfil === 'admin' ? 'selecionado' : ''}`}
          onClick={() => setPerfil('admin')}
        >
          Acesso administrativo
        </button>
        <h1>Acessar sua conta</h1>
        <p>{perfil === 'fornecedor' ? 'Encontre oportunidades e envie propostas para eventos.' : 'Acesse seu painel de gestão e cotações de eventos corporativos.'}</p>
        <form onSubmit={aoAutenticar}>
          <label>E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(eventoDisparado) => setEmail(eventoDisparado.target.value)}
            placeholder="seuemail@empresa.com"
            required
          />
          <div className="rotuloSenha">
            <label>Senha</label>
            <button type="button" disabled title="Funcionalidade indisponível">
              Esqueci minha senha
            </button>
          </div>
          <input
            type="password"
            value={senha}
            onChange={(eventoDisparado) => setSenha(eventoDisparado.target.value)}
            placeholder="••••••••"
            required
          />
          <label className="lembrar">
            <input type="checkbox" disabled /> Lembrar deste dispositivo
          </label>
          <button type="submit" className="principal">
            Entrar
          </button>
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
          <button type="button"onClick={() => setPagina('cadastro')}>Criar conta</button>
        </p>
      </main>
    </div>
  )
}

