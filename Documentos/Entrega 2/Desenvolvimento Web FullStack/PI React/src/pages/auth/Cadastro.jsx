import { useState } from 'react'
import { apiUrl } from '../../services/api.js'

export function Cadastro({ setPagina }) {
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
      const resposta = await fetch(apiUrl('/usuarios'), {
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

