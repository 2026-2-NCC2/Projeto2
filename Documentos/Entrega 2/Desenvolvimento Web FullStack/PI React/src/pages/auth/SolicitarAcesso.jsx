import { useState } from 'react'
import { apiUrl } from '../../services/api.js'

export function SolicitarAcesso({ setPagina }) {
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
        apiUrl('/solicitacoes-acesso'),
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


