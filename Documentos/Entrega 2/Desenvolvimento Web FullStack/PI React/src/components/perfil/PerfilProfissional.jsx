import { Skeleton, Botao, Campo, Alerta, EstadoVazio } from '../ui/Primitivas.jsx'
import '../perfil/Perfis.css'
import { useEffect, useRef, useState } from 'react'
import { acessarProfissional, urlProfissionalSegura } from '../../services/perfilProfissional.js'

const redes = [
  ['instagram', 'Instagram'], ['linkedin', 'LinkedIn'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['site_pessoal', 'Site pessoal'],
]
const comerciais = [
  ['nome_comercial', 'Nome comercial', 'text', 150], ['descricao', 'Descrição', 'textarea', 2000],
  ['telefone_comercial', 'Telefone comercial', 'tel', 30], ['email_comercial', 'E-mail profissional', 'email', 150],
  ['cidade', 'Cidade', 'text', 120], ['site_oficial', 'Site oficial', 'url', 2048],
]
const rascunho = secao => Object.fromEntries(Object.entries(secao || {}).map(([k, v]) => [k, Array.isArray(v) ? v.join('\n') : v]))

export function SecaoProfissional({ titulo, campos, secao, aoSalvar }) {
  const [dados, setDados] = useState(() => rascunho(secao))
  const [editando, setEditando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)
  const requisicao = useRef(null)
  useEffect(() => () => requisicao.current?.abort(), [])
  async function salvar(evento, remover = false) {
    evento.preventDefault()
    if (requisicao.current) return
    const controller = new AbortController()
    requisicao.current = controller
    setSalvando(true); setErro(''); setSucesso(false)
    try {
      const valores = remover ? null : Object.fromEntries(campos.map(([k]) => [k, k === 'categorias_servicos' ? (dados[k] || '').split('\n').map(v => v.trim()).filter(Boolean) : dados[k] || '']))
      const atualizado = await aoSalvar(valores, controller.signal)
      if (!controller.signal.aborted) { setDados(rascunho(atualizado)); setEditando(false); setSucesso(true) }
    } catch (falha) {
      if (!controller.signal.aborted) setErro(falha.message || 'Não foi possível confirmar o salvamento. Recarregue o perfil.')
    } finally {
      if (!controller.signal.aborted) setSalvando(false)
      requisicao.current = null
    }
  }
  const preenchidos = campos.filter(([k]) => Array.isArray(secao?.[k]) ? secao[k].length > 0 : !!secao?.[k]?.trim())
  return <form className="perfilCartao perfilDados" aria-busy={salvando} onSubmit={salvar}>
    <div className="perfilTituloCartao"><div><h2>{titulo}</h2><p>Informe apenas os dados que deseja compartilhar.</p></div>
      {!editando && <Botao variante="secundario" className="perfilEditar" type="button" onClick={() => { setDados(rascunho(secao)); setEditando(true); setSucesso(false); setErro('') }}>Editar</Botao>}
    </div>
    {erro && <Alerta variante="erro">{erro}</Alerta>}
    {sucesso && <Alerta variante="sucesso">Informações atualizadas.</Alerta>}
    {editando ? <>
      <p>Os campos são opcionais. Apague um valor para removê-lo. Use HTTPS nos links.</p>
      <div className="perfilCampos">{campos.map(([k, label, tipo = 'url', limite = 2048]) => {
        const props = { value: dados[k] || '', disabled: salvando, maxLength: limite, onChange: e => { setDados(atual => ({ ...atual, [k]: e.target.value })); setErro(''); setSucesso(false) } }
        return <Campo key={k} label={label} className={tipo === 'textarea' ? 'perfilCampoInteiro' : undefined} {...props} como={tipo === 'textarea' ? 'textarea' : 'input'} {...(tipo === 'textarea' ? { rows: 4 } : { type: tipo })} />
      })}</div>
      <div className="perfilAcoes"><Botao variante="secundario" type="button" className="secundario" disabled={salvando} onClick={() => { setEditando(false); setErro(''); setSucesso(false) }}>Cancelar</Botao>
        {preenchidos.length > 0 && <Botao variante="destrutivo" type="button" className="secundario" disabled={salvando} onClick={e => salvar(e, true)}>Remover informações</Botao>}
        <Botao variante="primario" className="principal" type="submit" disabled={salvando} ocupado={salvando}>{salvando ? 'Salvando...' : 'Salvar alterações'}</Botao></div>
    </> : preenchidos.length ? <dl className="perfilProfissionalDados">{preenchidos.map(([k, label]) => <div key={k}><dt>{label}</dt><dd>{Array.isArray(secao[k]) ? secao[k].join(', ') :
      (k === 'site_oficial' || redes.some(([campo]) => campo === k)) ? (urlProfissionalSegura(secao[k]) && <a href={secao[k]} target="_blank" rel="noopener noreferrer">{secao[k]}</a>) : secao[k]}</dd></div>)}</dl> : <EstadoVazio titulo="Nenhuma informação cadastrada." />}
  </form>
}

export function PerfilProfissional({ token, id }) {
  const [perfil, setPerfil] = useState(null)
  const [erro, setErro] = useState('')
  const [indisponivel, setIndisponivel] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    acessarProfissional(token, id, undefined, controller.signal).then(dados => {
      if (!controller.signal.aborted) { setPerfil(dados); setErro('') }
    }).catch(falha => { if (!controller.signal.aborted) { setErro(falha.message); setIndisponivel(falha.indisponivel === true) } })
    return () => controller.abort()
  }, [token, id, tentativa])
  async function salvar(campo, valores, signal) {
    const atualizado = await acessarProfissional(token, id, { [campo]: valores }, signal)
    setPerfil(atual => ({ ...atual, perfil: atualizado.perfil, [campo]: atualizado[campo] }))
    return atualizado[campo]
  }
  if (!perfil) return <section className="perfilCartao perfilDados"><h2>Informações profissionais e redes sociais</h2>
    {erro ? <Alerta variante={indisponivel ? 'informacao' : 'erro'} titulo={indisponivel ? 'Consulta indisponível' : 'Falha na consulta'}>{erro}</Alerta> : <Skeleton tipo="card" rotulo="Carregando informações..." />}
    {erro && <Botao variante="secundario" type="button" className="secundario" onClick={() => { setErro(''); setIndisponivel(false); setTentativa(v => v + 1) }}>Tentar novamente</Botao>}</section>
  const profissional = ['fornecedor', 'organizador'].includes(perfil.perfil)
  const campos = comerciais.map(c => c[0] === 'nome_comercial' && perfil.perfil === 'organizador' ? [c[0], 'Nome da organização', c[2], c[3]] : c)
  if (perfil.perfil === 'fornecedor') campos.push(['categorias_servicos', 'Categorias de serviços, uma por linha', 'textarea', 1619])
  return <>
    <SecaoProfissional titulo="Redes sociais" campos={redes} secao={perfil.redes_sociais} aoSalvar={(v, s) => salvar('redes_sociais', v, s)} />
    {profissional && <SecaoProfissional titulo={perfil.perfil === 'fornecedor' ? 'Informações comerciais' : 'Informações da organização'} campos={campos} secao={perfil.dados_comerciais} aoSalvar={(v, s) => salvar('dados_comerciais', v, s)} />}
  </>
}
