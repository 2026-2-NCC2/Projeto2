import { useCallback, useEffect, useRef, useState } from 'react'
import { useConsultaAdmin } from '../../hooks/useConsultaAdmin.js'
import { alterarPerfilAdmin, perfisAdministraveis, validarMudancaPerfil } from '../../services/adminPerfis.js'
import { nomesPerfis } from '../../services/admin.js'
import { ErroAdmin, ModalAdmin, SkeletonAdmin } from './AdminUI.jsx'

export function AdminGestaoPerfis({ usuario, aoFechar, aoSalvar, aoSair }) {
  const capacidade = useConsultaAdmin('/admin/usuarios/perfis/capacidades', false)
  const [novo, setNovo] = useState(usuario.perfil)
  const [motivo, setMotivo] = useState('')
  const [confirmado, setConfirmado] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)
  const [sucesso, setSucesso] = useState(false)
  const [incerto, setIncerto] = useState(false)
  const tentativa = useRef(null)
  const ocupado = useRef(false)
  const controle = useRef(null)
  const montado = useRef(true)
  const fecharRef = useRef(aoFechar)
  useEffect(() => { fecharRef.current = aoFechar }, [aoFechar])
  useEffect(() => {
    montado.current = true
    return () => { montado.current = false; controle.current?.abort() }
  }, [])
  const disponivel = capacidade.dados?.alterar === true && capacidade.dados?.modelo === 'unico' && !capacidade.erro && !capacidade.carregando
  const valido = validarMudancaPerfil(usuario.perfil, novo, motivo, confirmado)
  // A identidade estável evita reiniciar o foco do modal a cada edição.
  const fechar = useCallback(() => { if (!ocupado.current) fecharRef.current() }, [])
  async function salvar(e) {
    e.preventDefault()
    if (ocupado.current || salvando || !disponivel || (!tentativa.current && !valido)) return
    const token = sessionStorage.getItem('token')
    if (!tentativa.current) tentativa.current = { chave: crypto.randomUUID(), body: {
      perfil_anterior: usuario.perfil, perfil_novo: novo, motivo: motivo.trim(), confirmado: true,
    } }
    controle.current = new AbortController()
    const timeout = setTimeout(() => controle.current.abort(), 15000)
    ocupado.current = true
    setSalvando(true); setErro(null)
    try {
      await alterarPerfilAdmin(usuario.id, tentativa.current.body, tentativa.current.chave, controle.current.signal)
      if (!montado.current || sessionStorage.getItem('token') !== token) return
      setSucesso(true); setIncerto(false); aoSalvar()
    } catch (falha) {
      if (!montado.current || sessionStorage.getItem('token') !== token) return
      setErro(falha)
      if (falha.incerto || incerto) setIncerto(true)
      else tentativa.current = null
    } finally { clearTimeout(timeout); ocupado.current = false; if (montado.current && sessionStorage.getItem('token') === token) setSalvando(false) }
  }
  return <ModalAdmin titulo="Gerenciar perfis" aoFechar={fechar}>
    <div className="admGestaoPerfis">
      <h3>{usuario.nome}</h3>
      <p>Perfil atual: <strong>{nomesPerfis[sucesso ? novo : usuario.perfil]}</strong></p>
      <p>Esta conta possui um único perfil. A alteração substitui o acesso atual; eventos, inscrições e propostas anteriores são preservados.</p>
      {capacidade.carregando ? <SkeletonAdmin rotulo="Verificando gerenciamento de perfis" /> : capacidade.erro
        ? <ErroAdmin erro={capacidade.erro} aoAtualizar={capacidade.recarregar} aoSair={aoSair} />
        : !disponivel ? <p role="status">O gerenciamento de perfis ainda não está disponível neste ambiente.</p>
          : sucesso ? <p role="status">Perfil alterado com sucesso. A lista está sendo atualizada.</p> : <form onSubmit={salvar} aria-busy={salvando}>
            <label>Novo perfil<select value={novo} onChange={e => { setNovo(e.target.value); setConfirmado(false) }} disabled={salvando || incerto}>
              {perfisAdministraveis.map(p => <option key={p} value={p}>{nomesPerfis[p]}</option>)}
            </select></label>
            {novo !== usuario.perfil && <div className="admNota" role="status">
              <p>Remover acesso: <strong>{nomesPerfis[usuario.perfil]}</strong>.</p>
              <p>Conceder acesso: <strong>{nomesPerfis[novo]}</strong>.</p>
              {(novo === 'admin' || usuario.perfil === 'admin') && <p>Esta alteração afeta poderes administrativos. Revise o usuário e o motivo.</p>}
            </div>}
            <label>Motivo da alteração<textarea value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={1000} required disabled={salvando || incerto} /></label>
            <p className="admNota">Informe de 10 a 1000 caracteres, sem incluir senhas ou dados pessoais desnecessários. O motivo será registrado na auditoria.</p>
            <label className="admConfirmacaoPerfil"><input type="checkbox" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} disabled={salvando || incerto} />Confirmo a remoção do acesso atual e a concessão do novo perfil.</label>
            {erro && <div role="alert"><p>{erro.message}</p>{erro.status === 401 && <button type="button" onClick={aoSair}>Entrar novamente</button>}</div>}
            {incerto && <p role="status">Não inicie outra alteração até reconciliar este resultado. Confirmar novamente reutiliza a mesma operação.</p>}
            <p className="admNota">Não é permitido remover seu próprio acesso nem o último administrador autorizado.</p>
            <button className="admAcao" disabled={salvando || !valido || erro?.status === 401 || erro?.status === 403} type="submit">
              {salvando ? 'Salvando alteração…' : incerto ? 'Confirmar resultado da mesma alteração' : 'Confirmar alteração de perfil'}
            </button>
          </form>}
    </div>
  </ModalAdmin>
}
