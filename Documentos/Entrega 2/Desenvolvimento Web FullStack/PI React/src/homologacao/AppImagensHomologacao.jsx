import { useEffect, useState } from 'react'
import { apiUrl } from '../services/api.js'
import { ImagensPerfil } from '../components/perfil/ImagensPerfil.jsx'

export function HomologacaoImagens() {
  const [perfil, setPerfil] = useState(null)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [destino, setDestino] = useState('')
  useEffect(() => {
    // Origem diferente do React principal; nunca reaproveita suas sessões.
    sessionStorage.removeItem('token')
    const controller = new AbortController()
    async function conferir() {
      try {
        const resposta = await fetch(apiUrl('/__homologacao'), { signal: controller.signal })
        const dados = await resposta.json()
        if (!resposta.ok || dados.ambiente !== 'imagens-homologacao' || dados.imagensHabilitadas !== false ||
            !/^[a-z]{20}$/.test(dados.projectRef) || dados.projectRef === 'gnwybroqfvwosiqzsfla') throw new Error('Backend isolado não confirmado.')
        if (!controller.signal.aborted) setDestino(dados.projectRef)
      } catch { if (!controller.signal.aborted) setErro('Backend isolado não confirmado. Não envie credenciais; confira o inicializador e recarregue.') }
    }
    conferir()
    return () => controller.abort()
  }, [])
  async function login(evento) {
    evento.preventDefault()
    if (ocupado || !destino) return
    setOcupado(true); setErro('')
    try {
      const resposta = await fetch(apiUrl('/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }) })
      if (!resposta.ok) throw new Error('Login de homologação recusado. Confira o inicializador e a conta autorizada.')
      const dados = await resposta.json()
      sessionStorage.setItem('token', dados.token); setPerfil(dados.usuario); setSenha('')
    } catch (falha) { setErro(falha.message) } finally { setOcupado(false) }
  }
  return <main className="perfilPagina" style={{ maxWidth: 1100, margin: '24px auto', padding: 16 }}>
    <h1>TrocaTicket — homologação de imagens</h1>
    <p role="status">Ambiente isolado. Uploads e remoções continuam bloqueados.</p>
    {destino && <p>Projeto de homologação: {destino}</p>}
    {erro && <p role="alert">{erro}</p>}
    {!perfil ? <form className="perfilCartao" onSubmit={login}>
      <label>E-mail da conta autorizada<input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Senha<input type="password" required autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} /></label>
      <button type="submit" className="principal" disabled={ocupado || !destino}>{ocupado ? 'Validando...' : 'Entrar na homologação'}</button>
    </form> : <>
      <section className="perfilCartao"><h2>{perfil.nome}</h2><p>{perfil.email} — {perfil.perfil}</p>
        <button type="button" className="secundario" onClick={() => { sessionStorage.removeItem('token'); setPerfil(null); setSenha('') }}>Sair</button></section>
      <ImagensPerfil key={perfil.id} perfil={perfil} />
    </>}
  </main>
}

