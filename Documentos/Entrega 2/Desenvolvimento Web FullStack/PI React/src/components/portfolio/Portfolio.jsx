import { Skeleton, Botao, Campo, Badge, Alerta, EstadoVazio } from '../ui/Primitivas.jsx'
import '../perfil/Perfis.css'
import { useEffect, useRef, useState } from 'react'
import { usePerfil } from '../../hooks/usePerfil.js'
import { consultarPortfolio, salvarItemPortfolio, removerItemPortfolio, listarFornecedoresPortfolio } from '../../services/portfolio.js'

const vazio = () => ({titulo:'',descricao:'',categoria:''})
export function Portfolio({ donoId, editar = false }) {
  const token = sessionStorage.getItem('token')
  const [lista,setLista] = useState(null)
  const [pagina,setPagina] = useState(1)
  const [tentativa,setTentativa] = useState(0)
  const [carregando,setCarregando] = useState(true)
  const [erro,setErro] = useState('')
  const [mensagem,setMensagem] = useState('')
  const [dados,setDados] = useState(vazio)
  const [item,setItem] = useState(null)
  const [salvando,setSalvando] = useState(false)
  const [incerto,setIncerto] = useState(false)
  const requisicao = useRef(null)
  useEffect(() => {
    const controller = new AbortController()
    async function carregar() {
      setCarregando(true); setErro('')
      try {
        const resposta = await consultarPortfolio({token,donoId,publico:!editar,pagina,signal:controller.signal})
        if (!controller.signal.aborted) {setLista(resposta);setIncerto(false)}
      } catch (falha) {if(!controller.signal.aborted){setLista(null);setErro(falha.message)}}
      finally {if(!controller.signal.aborted)setCarregando(false)}
    }
    carregar();return () => controller.abort()
  },[token,donoId,editar,pagina,tentativa])
  useEffect(() => () => requisicao.current?.abort(),[])
  function limpar() {setItem(null);setDados(vazio())}
  async function executar(acao) {
    if(requisicao.current || !editar || carregando || !lista || incerto)return
    const c = new AbortController();requisicao.current=c;setSalvando(true);setErro('');setMensagem('')
    try {
      await acao(c.signal)
      if(!c.signal.aborted){limpar();setMensagem('Operação confirmada.');setPagina(1);setTentativa(n=>n+1)}
    } catch(falha){if(!c.signal.aborted){setErro(falha.message);setIncerto(falha.incerto===true)}}
    finally {if(!c.signal.aborted)setSalvando(false);requisicao.current=null}
  }
  const bloqueado = salvando || carregando || !lista || incerto
  return <section className="perfilCartao portfolioPagina" aria-busy={salvando || carregando}>
    <h2>{editar ? 'Meu portfólio profissional' : `Portfólio${lista?.fornecedor ? ' — '+lista.fornecedor.nome : ''}`}</h2>
    <p>{editar ? 'Cadastre trabalhos ou serviços reais. Os itens serão visíveis aos usuários autenticados.' : 'Trabalhos e serviços publicados pelo fornecedor.'}</p>
    {erro && <Alerta variante="erro">{erro}</Alerta>}{mensagem && <Alerta variante="sucesso">{mensagem}</Alerta>}
    <Botao variante="secundario" type="button" className="secundario" disabled={salvando || carregando} onClick={()=>{limpar();setTentativa(n=>n+1)}}>Recarregar dados e descartar rascunho</Botao>
    {carregando && <Skeleton tipo="card" rotulo="Carregando portfólio..." />}
    {editar && <form onSubmit={e=>{e.preventDefault();executar(signal=>salvarItemPortfolio({token,donoId,item,dados,signal}))}}>
      <h3>{item ? 'Editar item' : 'Novo trabalho ou serviço'}</h3>
      <div className="perfilCampos">
        <Campo label="Título" obrigatorio maxLength={120} value={dados.titulo} disabled={bloqueado} onChange={e=>setDados(d=>({...d,titulo:e.target.value}))} />
        <Campo label="Categoria" obrigatorio maxLength={80} value={dados.categoria} disabled={bloqueado} onChange={e=>setDados(d=>({...d,categoria:e.target.value}))} />
        <Campo label="Descrição" className="perfilCampoInteiro" como="textarea" obrigatorio maxLength={2000} rows={4} value={dados.descricao} disabled={bloqueado} onChange={e=>setDados(d=>({...d,descricao:e.target.value}))} />
      </div>
      <label>Imagem do trabalho ou serviço<input type="file" accept="image/jpeg,image/png,image/webp" disabled /></label>
      <Alerta variante="informacao">Imagens indisponíveis até a ativação segura do Storage. O cadastro textual é independente.</Alerta>
      <div className="perfilAcoes"><Botao variante="primario" type="submit" className="principal" disabled={bloqueado} ocupado={salvando}>{salvando ? 'Salvando...' : item ? 'Salvar alterações' : 'Cadastrar item'}</Botao>
        {item && <Botao variante="secundario" type="button" className="secundario" disabled={salvando} onClick={limpar}>Cancelar edição</Botao>}</div>
    </form>}
    {!carregando && lista && <>
      {lista.itens.length===0 ? <EstadoVazio titulo="Nenhum trabalho ou serviço cadastrado nesta página." /> : <div className="portfolioGrade">{lista.itens.map(i=><article className="portfolioItem" key={i.id}>
        <Badge variante="informacao">{i.categoria}</Badge><h3>{i.titulo}</h3><p className="portfolioDescricao">{i.descricao}</p>
        {editar && <div className="perfilAcoes"><Botao variante="secundario" type="button" className="secundario" disabled={bloqueado} onClick={()=>{setItem(i);setDados({titulo:i.titulo,descricao:i.descricao,categoria:i.categoria});setMensagem('')}}>Editar</Botao>
          <Botao variante="destrutivo" type="button" className="secundario" disabled={bloqueado} onClick={()=>{if(window.confirm('Remover este item do portfólio?'))executar(signal=>removerItemPortfolio({token,item:i,signal}))}}>Remover</Botao></div>}
      </article>)}</div>}
      <div className="portfolioPaginacao"><Botao variante="secundario" type="button" className="secundario" disabled={pagina<=1 || salvando} onClick={()=>setPagina(p=>p-1)}>Anterior</Botao>
        <span>Página {lista.pagina} de {lista.totalPaginas} — {lista.total} itens</span><Botao variante="secundario" type="button" className="secundario" disabled={pagina>=lista.totalPaginas || salvando} onClick={()=>setPagina(p=>p+1)}>Próxima</Botao></div>
    </>}
  </section>
}
export function PortfolioFornecedor() {
  const {perfil,erro,recarregar}=usePerfil()
  return perfil ? <Portfolio key={perfil.id} donoId={perfil.id} editar /> : <section className="perfilCartao">{erro ? <Alerta variante="erro">{erro}</Alerta> : <Skeleton tipo="card" rotulo="Carregando sua conta..." />}{erro && <Botao variante="secundario" type="button" onClick={recarregar}>Tentar novamente</Botao>}</section>
}
function DiretorioPortfolio() {
  const token=sessionStorage.getItem('token')
  const [lista,setLista]=useState(null),[erro,setErro]=useState(''),[pagina,setPagina]=useState(1),[tentativa,setTentativa]=useState(0),[id,setId]=useState(null)
  useEffect(()=>{
    const c=new AbortController()
    async function carregar(){
      setLista(null);setErro('')
      try{const d=await listarFornecedoresPortfolio({token,pagina,signal:c.signal});if(!c.signal.aborted)setLista(d)}
      catch(e){if(!c.signal.aborted)setErro(e.message)}
    }
    carregar();return()=>c.abort()
  },[token,pagina,tentativa])
  return <div>{erro ? <Alerta variante="erro"><p>{erro}</p><Botao variante="secundario" type="button" className="secundario" onClick={()=>setTentativa(n=>n+1)}>Tentar novamente</Botao></Alerta> : !lista ? <Skeleton tipo="card" rotulo="Carregando fornecedores..." /> : <>
    {lista.itens.length===0 && <EstadoVazio titulo="Nenhum fornecedor encontrado." />}
    <div className="portfolioGrade">{lista.itens.map(u=><Botao variante="secundario" type="button" className="secundario" key={u.id} onClick={()=>setId(u.id)}>{u.nome} — Ver portfólio</Botao>)}</div>
    <div className="portfolioPaginacao"><Botao variante="secundario" type="button" className="secundario" disabled={pagina===1} onClick={()=>setPagina(p=>p-1)}>Anterior</Botao><span>Página {lista.pagina} de {lista.totalPaginas}</span><Botao variante="secundario" type="button" className="secundario" disabled={pagina>=lista.totalPaginas} onClick={()=>setPagina(p=>p+1)}>Próxima</Botao></div>
  </>}{id && <Portfolio key={`${token}:${id}`} donoId={id} />}</div>
}
export function ConsultaPortfolios({ fornecedorId }) {
  const [aberto,setAberto]=useState(false)
  return <section className="portfolioConsulta"><Botao variante="secundario" type="button" className="secundario" aria-expanded={aberto} onClick={()=>setAberto(v=>!v)}>{aberto?'Fechar portfólio':'Consultar portfólio de fornecedores'}</Botao>
    {aberto && (fornecedorId ? <Portfolio key={fornecedorId} donoId={fornecedorId} /> : <DiretorioPortfolio />)}</section>
}
