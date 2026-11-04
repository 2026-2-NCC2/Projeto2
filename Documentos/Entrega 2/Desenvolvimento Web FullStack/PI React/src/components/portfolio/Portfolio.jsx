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
    {erro && <p role="alert">{erro}</p>}{mensagem && <p role="status">{mensagem}</p>}
    <button type="button" className="secundario" disabled={salvando || carregando} onClick={()=>{limpar();setTentativa(n=>n+1)}}>Recarregar dados e descartar rascunho</button>
    {carregando && <p role="status">Carregando portfólio...</p>}
    {editar && <form onSubmit={e=>{e.preventDefault();executar(signal=>salvarItemPortfolio({token,donoId,item,dados,signal}))}}>
      <h3>{item ? 'Editar item' : 'Novo trabalho ou serviço'}</h3>
      <div className="perfilCampos">
        <label>Título<input required maxLength={120} value={dados.titulo} disabled={bloqueado} onChange={e=>setDados(d=>({...d,titulo:e.target.value}))} /></label>
        <label>Categoria<input required maxLength={80} value={dados.categoria} disabled={bloqueado} onChange={e=>setDados(d=>({...d,categoria:e.target.value}))} /></label>
        <label className="perfilCampoInteiro">Descrição<textarea required maxLength={2000} rows={4} value={dados.descricao} disabled={bloqueado} onChange={e=>setDados(d=>({...d,descricao:e.target.value}))} /></label>
      </div>
      <label>Imagem do trabalho ou serviço<input type="file" accept="image/jpeg,image/png,image/webp" disabled /></label>
      <p>Imagens indisponíveis até a ativação segura do Storage. O cadastro textual é independente.</p>
      <div className="perfilAcoes"><button type="submit" className="principal" disabled={bloqueado}>{salvando ? 'Salvando...' : item ? 'Salvar alterações' : 'Cadastrar item'}</button>
        {item && <button type="button" className="secundario" disabled={salvando} onClick={limpar}>Cancelar edição</button>}</div>
    </form>}
    {!carregando && lista && <>
      {lista.itens.length===0 ? <p>Nenhum trabalho ou serviço cadastrado nesta página.</p> : <div className="portfolioGrade">{lista.itens.map(i=><article className="portfolioItem" key={i.id}>
        <span className="tag">{i.categoria}</span><h3>{i.titulo}</h3><p className="portfolioDescricao">{i.descricao}</p>
        {editar && <div className="perfilAcoes"><button type="button" className="secundario" disabled={bloqueado} onClick={()=>{setItem(i);setDados({titulo:i.titulo,descricao:i.descricao,categoria:i.categoria});setMensagem('')}}>Editar</button>
          <button type="button" className="secundario" disabled={bloqueado} onClick={()=>{if(window.confirm('Remover este item do portfólio?'))executar(signal=>removerItemPortfolio({token,item:i,signal}))}}>Remover</button></div>}
      </article>)}</div>}
      <div className="portfolioPaginacao"><button type="button" className="secundario" disabled={pagina<=1 || salvando} onClick={()=>setPagina(p=>p-1)}>Anterior</button>
        <span>Página {lista.pagina} de {lista.totalPaginas} — {lista.total} itens</span><button type="button" className="secundario" disabled={pagina>=lista.totalPaginas || salvando} onClick={()=>setPagina(p=>p+1)}>Próxima</button></div>
    </>}
  </section>
}
export function PortfolioFornecedor() {
  const {perfil,erro,recarregar}=usePerfil()
  return perfil ? <Portfolio key={perfil.id} donoId={perfil.id} editar /> : <section className="perfilCartao"><p role={erro?'alert':'status'}>{erro || 'Carregando sua conta...'}</p>{erro && <button type="button" onClick={recarregar}>Tentar novamente</button>}</section>
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
  return <div>{erro ? <div role="alert"><p>{erro}</p><button type="button" className="secundario" onClick={()=>setTentativa(n=>n+1)}>Tentar novamente</button></div> : !lista ? <p role="status">Carregando fornecedores...</p> : <>
    {lista.itens.length===0 && <p>Nenhum fornecedor encontrado.</p>}
    <div className="portfolioGrade">{lista.itens.map(u=><button type="button" className="secundario" key={u.id} onClick={()=>setId(u.id)}>{u.nome} — Ver portfólio</button>)}</div>
    <div className="portfolioPaginacao"><button type="button" className="secundario" disabled={pagina===1} onClick={()=>setPagina(p=>p-1)}>Anterior</button><span>Página {lista.pagina} de {lista.totalPaginas}</span><button type="button" className="secundario" disabled={pagina>=lista.totalPaginas} onClick={()=>setPagina(p=>p+1)}>Próxima</button></div>
  </>}{id && <Portfolio key={`${token}:${id}`} donoId={id} />}</div>
}
export function ConsultaPortfolios({ fornecedorId }) {
  const [aberto,setAberto]=useState(false)
  return <section className="portfolioConsulta"><button type="button" className="secundario" aria-expanded={aberto} onClick={()=>setAberto(v=>!v)}>{aberto?'Fechar portfólio':'Consultar portfólio de fornecedores'}</button>
    {aberto && (fornecedorId ? <Portfolio key={fornecedorId} donoId={fornecedorId} /> : <DiretorioPortfolio />)}</section>
}
