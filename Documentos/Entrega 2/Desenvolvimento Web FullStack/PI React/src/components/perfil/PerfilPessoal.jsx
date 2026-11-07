import { Skeleton, Botao, Campo, Alerta } from '../ui/Primitivas.jsx'
import '../perfil/Perfis.css'
import { useEffect, useRef, useState } from 'react'
import { usePerfil } from '../../hooks/usePerfil.js'
import { salvarPerfil } from '../../services/perfil.js'
import { PerfilProfissional } from './PerfilProfissional.jsx'
import { ImagensPerfil } from './ImagensPerfil.jsx'
import { ConsultaPortfolios } from '../portfolio/Portfolio.jsx'

const editarCampos = perfil => ({ nome: perfil.nome, telefone: perfil.telefone || '', biografia: perfil.biografia || '' })

export function FormularioPerfil({ perfil, token }) {
  const [dados, setDados] = useState(() => editarCampos(perfil))
  const [editando, setEditando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [erro, setErro] = useState('')
  const requisicao = useRef(null)
  useEffect(() => () => requisicao.current?.abort(), [])
  function cancelar() {
    setDados(editarCampos(perfil)); setEditando(false); setErro(''); setSucesso(false)
  }
  function alterar(campo, valor) {
    setDados(atual => ({ ...atual, [campo]: valor })); setErro(''); setSucesso(false)
  }
  async function salvar(evento) {
    evento.preventDefault()
    if (requisicao.current || !editando || !perfil.edicao_disponivel) return
    const controller = new AbortController()
    requisicao.current = controller
    setSalvando(true); setErro(''); setSucesso(false)
    try {
      const atualizado = await salvarPerfil(token, dados, controller.signal)
      if (!controller.signal.aborted) {
        setDados(editarCampos(atualizado)); setEditando(false); setSucesso(true)
      }
    } catch (falha) {
      if (!controller.signal.aborted) setErro(falha.message || 'Não foi possível confirmar o salvamento. Recarregue o perfil.')
    } finally {
      if (!controller.signal.aborted) setSalvando(false)
      requisicao.current = null
    }
  }
  const exibidos = editando ? dados : editarCampos(perfil)
  return <form className="perfilCartao perfilDados" onSubmit={salvar} aria-busy={salvando}>
    <div className="perfilTituloCartao"><div><h2>Informações pessoais</h2><p>Mantenha seus dados atualizados.</p></div>
      {!editando && perfil.edicao_disponivel && <Botao variante="secundario" type="button" className="perfilEditar" onClick={() => { setDados(editarCampos(perfil)); setEditando(true); setSucesso(false) }}>Editar dados</Botao>}
    </div>
    {sucesso && <Alerta variante="sucesso">Perfil atualizado.</Alerta>}
    {erro && <Alerta variante="erro">{erro}</Alerta>}
    {!perfil.edicao_disponivel && <Alerta variante="informacao">A edição do perfil ainda não está disponível. Seus dados continuam disponíveis para consulta.</Alerta>}
    <div className="perfilCampos">
      <Campo label="Nome completo" obrigatorio maxLength={100} autoComplete="name" disabled={!editando || salvando} value={exibidos.nome} onChange={e => alterar('nome', e.target.value)} />
      <Campo label="E-mail" type="email" autoComplete="email" value={perfil.email} readOnly />
      <Campo label="Telefone" type="tel" maxLength={30} autoComplete="tel" disabled={!editando || salvando} value={exibidos.telefone} onChange={e => alterar('telefone', e.target.value)} />
      <Campo label="Biografia" className="perfilCampoInteiro" como="textarea" rows={4} maxLength={1000} disabled={!editando || salvando} value={exibidos.biografia} onChange={e => alterar('biografia', e.target.value)} />
    </div>
    {editando && <div className="perfilAcoes"><Botao variante="secundario" className="secundario" type="button" disabled={salvando} onClick={cancelar}>Cancelar</Botao><Botao variante="primario" className="principal" type="submit" disabled={salvando} ocupado={salvando}>{salvando ? 'Salvando...' : 'Salvar alterações'}</Botao></div>}
  </form>
}

export function PerfilPessoal({ contexto = 'Minha conta', children, indicadores }) {
  const { perfil, erro, recarregar } = usePerfil()
  const token = sessionStorage.getItem('token')
  return <div className="perfilPagina">
    <div className="perfilCabecalho"><div><p className="trilhaNavegacao">TrocaTicket › {contexto} › Meu perfil</p><h1>Meu perfil</h1><p>Consulte e atualize suas informações pessoais.</p></div></div>
    {erro && <Alerta variante="erro"><p>{erro}</p><Botao variante="secundario" type="button" className="secundario" onClick={recarregar}>Tentar novamente</Botao></Alerta>}
    {!perfil && !erro && <Skeleton tipo="card" rotulo="Carregando perfil..." />}
    {perfil && <>
      <ImagensPerfil key={`imagens:${token}:${perfil.id}`} perfil={perfil} indicadores={indicadores} habilitado={perfil.imagens_disponiveis === true} />
      <div className="perfilGrade perfilGradePessoal"><FormularioPerfil key={`${token}:${perfil.id}`} perfil={perfil} token={token} /><PerfilProfissional key={`profissional:${token}:${perfil.id}`} token={token} id={perfil.id} /></div>
      <ConsultaPortfolios key={`portfolios:${token}:${perfil.id}`} />
    </>}
    {children}
  </div>
}
