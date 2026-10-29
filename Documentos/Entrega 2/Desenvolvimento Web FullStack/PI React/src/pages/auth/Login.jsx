import { useState } from 'react'
import { apiUrl } from '../../services/api.js'

export function Login({ setPagina }) {
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

