import { useContext, useEffect, useRef, useState } from 'react'
import { Icone } from '../ui/Icone.jsx'
import { acessarImagensEvento, conferirImagensEvento } from '../../services/imagensEvento.js'
import { validarArquivoImagem } from '../../services/imagensPerfil.js'
import { ContextoImagensEvento, useImagensEvento } from '../../hooks/useImagensEvento.js'

export function CapaEvento({eventoId}) {
  const acesso=useContext(ContextoImagensEvento)
  return <Capa key={`${acesso.token}:${eventoId}`} eventoId={eventoId}/>
}
function ImagemEvento({url,alt,className,loading}) {
  const [falhou,setFalhou]=useState(false)
  return falhou?<span className="eventoImagemFalha" role="status">Imagem indisponível. Consulte as imagens novamente.</span>:
    <img src={url} alt={alt} className={className} loading={loading} referrerPolicy="no-referrer" onError={()=>setFalhou(true)}/>
}
function Capa({eventoId}) {
  const {imagens,carregando,erro}=useImagensEvento(eventoId)
  const capa=imagens.find(i=>i.posicao===0)
  return capa?<ImagemEvento key={capa.url} className="eventoCapaLista" url={capa.url} alt="Capa do evento" loading="lazy"/>:
    <div className="eventoIdentidade" role="img" aria-label={carregando?'Carregando capa do evento':erro?'Capa indisponível':'Evento sem capa'}><Icone nome="eventos" tamanho={26}/></div>
}
export function MidiaEvento(props) {
  const acesso=useContext(ContextoImagensEvento)
  return <EditorMidia key={`${acesso.token}:${props.eventoId||'novo'}`} {...props}/>
}
function EditorMidia({eventoId,editar=false,estado,imagens:fornecidas}) {
  const acesso=useImagensEvento(eventoId)
  const [arquivo,setArquivo]=useState(null),[posicao,setPosicao]=useState(0),[preview,setPreview]=useState('')
  const [ocupado,setOcupado]=useState(false),[mensagem,setMensagem]=useState(''),[incerto,setIncerto]=useState(false),[remocao,setRemocao]=useState(null)
  const trava=useRef(false),montado=useRef(false),envio=useRef(null)
  const terminal=['Cancelado','Encerrado'].includes(estado)
  const podeAlterar=editar&&!terminal&&acesso.alterar&&Number.isSafeInteger(eventoId)&&eventoId>0
  let validas=[],erro=acesso.erro
  try{validas=conferirImagensEvento(eventoId,fornecidas||acesso.imagens)}catch{if(fornecidas?.length)erro='Imagens indisponíveis.'}
  useEffect(()=>{montado.current=true;return()=>{montado.current=false;envio.current?.abort()}},[])
  useEffect(()=>{
    if(!arquivo)return
    const url=URL.createObjectURL(arquivo)
    queueMicrotask(()=>{if(montado.current)setPreview(url)})
    return()=>URL.revokeObjectURL(url)
  },[arquivo])
  function selecionar(e) {
    const f=e.target.files?.[0];e.target.value=''
    if(!f)return
    setArquivo(null);setPreview('');setRemocao(null)
    try{validarArquivoImagem('capa',f);setPreview('');setArquivo(f);setMensagem('');setRemocao(null)}catch(falha){setMensagem(falha.message)}
  }
  async function alterar(metodo,slot) {
    if(!podeAlterar||acesso.carregando||trava.current||incerto||metodo==='PUT'&&!arquivo)return
    trava.current=true;setOcupado(true);setMensagem('')
    const controller=new AbortController();envio.current=controller
    try{
      await acessarImagensEvento({token:acesso.token,eventoId,metodo,posicao:slot,arquivo,signal:controller.signal,habilitado:true})
      if(!montado.current)return
      setArquivo(null);setPreview('');setRemocao(null)
      setMensagem(metodo==='DELETE'?'Imagem removida do evento.':'Imagem salva no evento.')
      acesso.invalidarEvento?.(eventoId)
      await acesso.recarregar()
    }catch(e){if(montado.current){setIncerto(true);setMensagem(e.message)}}
    finally{trava.current=false;if(montado.current)setOcupado(false)}
  }
  async function consultar(){if(await acesso.recarregar()){setIncerto(false);setMensagem('Consulta atualizada. Envios anteriores não foram repetidos.')}}
  const capa=validas.find(i=>i.posicao===0),galeria=validas.filter(i=>i.posicao>0).sort((a,b)=>a.posicao-b.posicao)
  return <details className="eventoMidia" open={editar||undefined}>
    <summary>Capa e galeria do evento</summary>
    <div className="eventoMidiaCorpo" aria-busy={ocupado||acesso.carregando||false}>
      {acesso.carregando&&<p role="status">Carregando imagens...</p>}
      {ocupado&&<p role="status">Salvando alteração da imagem...</p>}
      {erro&&<p role="alert">{erro}</p>}
      {capa?<ImagemEvento key={capa.url} className="eventoCapa" url={capa.url} alt="Capa do evento"/>:
        <div className="eventoCapaVazia"><Icone nome="eventos"/><span>Sem capa disponível</span></div>}
      {galeria.length?<div className="eventoGaleria">{galeria.map(i=><figure key={i.posicao}>
        <ImagemEvento key={i.url} url={i.url} alt={`Imagem ${i.posicao} da galeria do evento`} loading="lazy"/>
        <figcaption>Imagem {i.posicao}</figcaption>
      </figure>)}</div>:<p>Nenhuma imagem disponível na galeria.</p>}
      {editar&&<>
        {!acesso.alterar&&<p role="status">Uploads permanecem bloqueados até a liberação das imagens de eventos. Você pode conferir a prévia local.</p>}
        {!eventoId&&<p>Salve o evento antes de enviar suas imagens.</p>}
        {terminal&&<p>Evento cancelado ou encerrado: imagens somente para consulta.</p>}
        <p>Uma capa e até oito imagens. JPEG, PNG ou WebP, até 10 MiB por arquivo.</p>
        <fieldset disabled={ocupado||terminal} className="eventoMidiaEditor">
          <legend>Selecionar imagem</legend>
          <label>Posição<select value={posicao} onChange={e=>{setPosicao(Number(e.target.value));setArquivo(null);setPreview('');setRemocao(null)}}>
            <option value={0}>Capa</option>{Array.from({length:8},(_,i)=><option key={i+1} value={i+1}>Galeria — imagem {i+1}</option>)}
          </select></label>
          <label>Arquivo para prévia<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selecionar}/></label>
          {arquivo&&preview&&<figure className="eventoPrevia"><img src={preview} alt="Prévia local da imagem selecionada"/>
            <figcaption>Confira antes de confirmar{validas.some(i=>i.posicao===posicao)?': a imagem desta posição será substituída.':'.'}</figcaption></figure>}
          <div className="acoes">
            <button type="button" className="principal" disabled={!podeAlterar||acesso.carregando||!arquivo||!preview||incerto} onClick={()=>alterar('PUT',posicao)}>Confirmar envio</button>
            {arquivo&&<button type="button" className="secundario" onClick={()=>{setArquivo(null);setPreview('')}}>Descartar prévia</button>}
            <button type="button" className="secundario" disabled={!podeAlterar||acesso.carregando||incerto||!validas.some(i=>i.posicao===posicao)} onClick={()=>setRemocao(posicao)}>Remover imagem desta posição</button>
          </div>
          {remocao!==null&&<div role="group" aria-label="Confirmar remoção"><p>Remover {remocao===0?'a capa':`a imagem ${remocao}`} do evento?</p>
            <button type="button" disabled={!podeAlterar||acesso.carregando||incerto} onClick={()=>alterar('DELETE',remocao)}>Confirmar remoção</button>
            <button type="button" onClick={()=>setRemocao(null)}>Manter imagem</button>
          </div>}
        </fieldset>
      </>}
      {mensagem&&<p role="status">{mensagem}</p>}
      {acesso.consultar&&<button type="button" className="secundario" disabled={ocupado||acesso.carregando} onClick={consultar}>Consultar imagens novamente</button>}
    </div>
  </details>
}
