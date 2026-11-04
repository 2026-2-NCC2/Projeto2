import { useEffect, useRef, useState } from 'react'
import { acessarImagem, validarArquivoImagem } from '../../services/imagensPerfil.js'
import { Icone } from '../ui/Icone.jsx'
import { useFocoModal } from '../../hooks/useFocoModal.js'

export function ImagemPerfil({ token, id, tipo, habilitado = false, integrado = false }) {
  const [imagem, setImagem] = useState(null)
  const [arquivo, setArquivo] = useState(null)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [carregando, setCarregando] = useState(habilitado)
  const [consulta, setConsulta] = useState(0)
  const [incerto, setIncerto] = useState(false)
  const [disponivel, setDisponivel] = useState(false)
  const [previa, setPrevia] = useState(null)
  const modalRef = useFocoModal(arquivo, setArquivo)
  const requisicao = useRef(null)
  const entrada = useRef(null)
  const titulo = tipo === 'foto' ? 'Foto de perfil' : 'Imagem de capa'
  useEffect(() => {
    if (!habilitado) return
    const controller = new AbortController()
    let timer
    async function carregar() {
      setCarregando(true)
      try {
        const atual = await acessarImagem({ token, id, tipo, signal: controller.signal })
        if (!controller.signal.aborted) {
          setImagem(atual); setErro(''); setIncerto(false); setDisponivel(true)
          // URL assinada somente em memória, renovada por leitura autenticada.
          if (atual) timer = setTimeout(carregar, 110000)
        }
      } catch (falha) {
        if (!controller.signal.aborted) { setImagem(null); setErro(falha.message); setDisponivel(false) }
      } finally { if (!controller.signal.aborted) setCarregando(false) }
    }
    carregar()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [token, id, tipo, habilitado, consulta])
  useEffect(() => () => requisicao.current?.abort(), [])
  useEffect(() => {
    if (!arquivo) { if (entrada.current) entrada.current.value = ''; return }
    return () => { if (previa) URL.revokeObjectURL(previa) }
  }, [arquivo, previa])
  function selecionar(evento) {
    if (!habilitado || !disponivel || ocupado || carregando || incerto) return
    const escolhido = evento.target.files?.[0]
    setErro(''); setMensagem(''); setArquivo(null); setPrevia(null)
    if (!escolhido) return
    try { validarArquivoImagem(tipo, escolhido); setPrevia(URL.createObjectURL(escolhido)); setArquivo(escolhido) }
    catch (falha) { setErro(falha.message); evento.target.value = '' }
  }
  async function alterar(metodo) {
    if (!habilitado || !disponivel || requisicao.current || incerto || carregando) return
    if (metodo === 'PUT' && !arquivo) return
    if (metodo === 'DELETE' && !window.confirm(`Remover ${titulo.toLowerCase()}?`)) return
    const controller = new AbortController()
    requisicao.current = controller; setOcupado(true); setErro(''); setMensagem('')
    try {
      await acessarImagem({ token, id, tipo, metodo, arquivo, signal: controller.signal })
      if (!controller.signal.aborted) {
        setArquivo(null); if (entrada.current) entrada.current.value = ''
        setImagem(null); setConsulta(n => n + 1)
        setMensagem(metodo === 'DELETE' ? 'Imagem removida.' : 'Imagem atualizada.')
      }
    } catch (falha) {
      if (!controller.signal.aborted) { setErro(falha.message); setIncerto(true) }
    } finally {
      if (!controller.signal.aborted) setOcupado(false)
      requisicao.current = null
    }
  }
  if (integrado) {
    const bloqueado = !habilitado || !disponivel || ocupado || carregando || incerto
    const acao = `${imagem ? 'Alterar' : 'Adicionar'} ${tipo === 'foto' ? 'foto' : 'capa'}`
    const consultar = () => { setConsulta(n => n + 1); setImagem(null); setArquivo(null); setMensagem('') }
    return <div className={`${tipo === 'foto' ? 'perfilFotoVisual' : 'perfilCapaVisual'} perfilMidiaControle`} aria-busy={ocupado || carregando}>
      {imagem ? <img className="perfilMidiaAtual" src={imagem.url} alt={titulo} referrerPolicy="no-referrer" onError={() => {setImagem(null);setErro('Não foi possível carregar a imagem. Consulte novamente.')}} /> : tipo === 'foto' && <Icone nome="perfil" tamanho={44} />}
      <button type="button" className="perfilMidiaEscolher" aria-label={acao} disabled={bloqueado}
        title={!habilitado ? 'Personalização de imagens indisponível' : acao} onClick={() => entrada.current?.click()}>
        <Icone nome="camera" tamanho={20} /><span>{acao}</span>
      </button>
      <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Selecionar ${titulo.toLowerCase()}`} hidden disabled={bloqueado} onChange={selecionar} />
      {habilitado && imagem && <button type="button" className="perfilMidiaRemover" disabled={bloqueado} onClick={() => alterar('DELETE')}>{`Remover ${tipo === 'foto' ? 'foto' : 'capa'}`}</button>}
      {erro && !arquivo && <div className="perfilMidiaFeedback"><p role="alert">{erro}</p><button type="button" className="secundario" disabled={!habilitado || ocupado || carregando} onClick={consultar}>Consultar novamente</button></div>}
      {mensagem && <p className="perfilMidiaFeedback" role="status">{mensagem}</p>}
      {arquivo && <div className="perfilMidiaFundo"><section className="perfilMidiaEditor" ref={modalRef} role="dialog" aria-modal="true" aria-label={`Prévia de ${titulo.toLowerCase()}`} tabIndex={-1} aria-busy={ocupado}>
        <h2>Prévia de {titulo.toLowerCase()}</h2>
        {previa && <img className={`perfilMidiaPrevia perfilMidiaPrevia-${tipo}`} src={previa} alt={`Prévia de ${titulo.toLowerCase()}`} />}
        <p>A imagem será enviada somente ao salvar. JPEG, PNG ou WebP, até {tipo === 'foto' ? '5' : '10'} MiB.</p>
        {erro && <p role="alert">{erro}</p>}
        <div className="perfilAcoes"><button type="button" className="secundario" disabled={ocupado} onClick={() => setArquivo(null)}>Cancelar</button>
          <button type="button" className="principal" disabled={bloqueado || !previa} onClick={() => alterar('PUT')}>{ocupado ? 'Salvando...' : 'Salvar imagem'}</button></div>
      </section></div>}
    </div>
  }
  return <section className={`perfilCartao perfilImagem perfilImagem-${tipo}`} aria-busy={ocupado || carregando}>
    <h2>{titulo}</h2>
    {imagem ? <img src={imagem.url} alt={titulo} referrerPolicy="no-referrer" onError={() => { setImagem(null); setErro('A imagem expirou ou não pôde ser carregada. Consulte novamente.') }} /> :
      <div className="perfilImagemVazia"><Icone nome="perfil" tamanho={32} /><span>Sem imagem disponível</span></div>}
    {!habilitado && <p role="status">A personalização de imagens ainda não está disponível.</p>}
    <p>JPEG, PNG ou WebP. Máximo {tipo === 'foto' ? '5' : '10'} MiB. Sem animações.</p>
    <label>Selecionar {titulo.toLowerCase()}<input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" disabled={!habilitado || !disponivel || ocupado || carregando || incerto} onChange={selecionar} /></label>
    {erro && <p role="alert">{erro}</p>}
    {mensagem && <p role="status">{mensagem}</p>}
    <div className="perfilAcoes">
      <button type="button" className="principal" disabled={!habilitado || !disponivel || ocupado || carregando || incerto || !arquivo} onClick={() => alterar('PUT')}>{imagem ? 'Substituir imagem' : 'Enviar imagem'}</button>
      <button type="button" className="secundario" disabled={!habilitado || !disponivel || ocupado || carregando || incerto || !imagem} onClick={() => alterar('DELETE')}>Remover imagem</button>
      <button type="button" className="secundario" disabled={!habilitado || ocupado || carregando} onClick={() => { setConsulta(n => n + 1); setImagem(null); setArquivo(null); setMensagem(''); if (entrada.current) entrada.current.value = '' }}>Consultar imagens</button>
    </div>
  </section>
}

export function ImagensPerfil({ perfil, indicadores, habilitado = false }) {
  // Ativação explícita apenas após validar o destino e autorizar as rotas.
  const token = sessionStorage.getItem('token')
  const papeis = { participante: 'Participante', organizador: 'Organizador', fornecedor: 'Fornecedor', admin: 'Administrador' }
  return <section className="perfilApresentacao" aria-label="Apresentação do perfil">
    <ImagemPerfil key={`${token}:${perfil?.id}:capa`} token={token} id={perfil?.id} tipo="capa" habilitado={habilitado} integrado />
    <div className="perfilApresentacaoCorpo">
      <ImagemPerfil key={`${token}:${perfil?.id}:foto`} token={token} id={perfil?.id} tipo="foto" habilitado={habilitado} integrado />
      <div className="perfilApresentacaoIdentidade">
        <span className="perfilPapel">{papeis[perfil?.perfil] || 'Minha conta'}</span>
        <h2>{perfil?.nome}</h2><p>{perfil?.email}</p>
      </div>
      {!habilitado && <p className="perfilMidiaAviso">A personalização de foto e capa ainda não está disponível.</p>}
      {indicadores && <div className="perfilApresentacaoIndicadores">{indicadores}</div>}
    </div>
  </section>
}
