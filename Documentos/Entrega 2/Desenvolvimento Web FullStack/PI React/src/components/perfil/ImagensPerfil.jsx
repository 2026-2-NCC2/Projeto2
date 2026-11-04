import { useEffect, useRef, useState } from 'react'
import { acessarImagem, validarArquivoImagem } from '../../services/imagensPerfil.js'
import { Icone } from '../ui/Icone.jsx'

export function ImagemPerfil({ token, id, tipo, habilitado = false }) {
  const [imagem, setImagem] = useState(null)
  const [arquivo, setArquivo] = useState(null)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [carregando, setCarregando] = useState(habilitado)
  const [consulta, setConsulta] = useState(0)
  const [incerto, setIncerto] = useState(false)
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
          setImagem(atual); setErro(''); setIncerto(false)
          // URL assinada somente em memória, renovada por leitura autenticada.
          if (atual) timer = setTimeout(carregar, 110000)
        }
      } catch (falha) {
        if (!controller.signal.aborted) { setImagem(null); setErro(falha.message) }
      } finally { if (!controller.signal.aborted) setCarregando(false) }
    }
    carregar()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [token, id, tipo, habilitado, consulta])
  useEffect(() => () => requisicao.current?.abort(), [])
  function selecionar(evento) {
    const escolhido = evento.target.files?.[0]
    setErro(''); setMensagem(''); setArquivo(null)
    if (!escolhido) return
    try { validarArquivoImagem(tipo, escolhido); setArquivo(escolhido) }
    catch (falha) { setErro(falha.message); evento.target.value = '' }
  }
  async function alterar(metodo) {
    if (!habilitado || requisicao.current || incerto || carregando) return
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
  return <section className={`perfilCartao perfilImagem perfilImagem-${tipo}`} aria-busy={ocupado || carregando}>
    <h2>{titulo}</h2>
    {imagem ? <img src={imagem.url} alt={titulo} referrerPolicy="no-referrer" onError={() => { setImagem(null); setErro('A imagem expirou ou não pôde ser carregada. Consulte novamente.') }} /> :
      <div className="perfilImagemVazia"><Icone nome="perfil" tamanho={32} /><span>Sem imagem disponível</span></div>}
    {!habilitado && <p role="status">A personalização de imagens ainda não está disponível.</p>}
    <p>JPEG, PNG ou WebP. Máximo {tipo === 'foto' ? '5' : '10'} MiB. Sem animações.</p>
    <label>Selecionar {titulo.toLowerCase()}<input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" disabled={!habilitado || ocupado || carregando || incerto} onChange={selecionar} /></label>
    {erro && <p role="alert">{erro}</p>}
    {mensagem && <p role="status">{mensagem}</p>}
    <div className="perfilAcoes">
      <button type="button" className="principal" disabled={!habilitado || ocupado || carregando || incerto || !arquivo} onClick={() => alterar('PUT')}>{imagem ? 'Substituir imagem' : 'Enviar imagem'}</button>
      <button type="button" className="secundario" disabled={!habilitado || ocupado || carregando || incerto || !imagem} onClick={() => alterar('DELETE')}>Remover imagem</button>
      <button type="button" className="secundario" disabled={!habilitado || ocupado || carregando} onClick={() => { setConsulta(n => n + 1); setImagem(null); setArquivo(null); setMensagem(''); if (entrada.current) entrada.current.value = '' }}>Consultar imagens</button>
    </div>
  </section>
}

export function ImagensPerfil({ perfil, indicadores }) {
  // Cabeçalho somente visual: nenhuma consulta, URL ou upload enquanto a API
  // permanecer bloqueada. ImagemPerfil preserva a integração candidata existente.
  const papeis = { participante: 'Participante', organizador: 'Organizador', fornecedor: 'Fornecedor', admin: 'Administrador' }
  return <section className="perfilApresentacao" aria-label="Apresentação do perfil">
    <div className="perfilCapaVisual" aria-hidden="true" />
    <div className="perfilApresentacaoCorpo">
      <div className="perfilFotoVisual" aria-hidden="true"><Icone nome="perfil" tamanho={44} /></div>
      <div className="perfilApresentacaoIdentidade">
        <span className="perfilPapel">{papeis[perfil?.perfil] || 'Minha conta'}</span>
        <h2>{perfil?.nome}</h2><p>{perfil?.email}</p>
      </div>
      <p className="perfilMidiaAviso">A personalização de foto e capa ainda não está disponível.</p>
      {indicadores && <div className="perfilApresentacaoIndicadores">{indicadores}</div>}
    </div>
  </section>
}
