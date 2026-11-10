import { Marca } from '../../components/ui/Marca.jsx'
import { Skeleton, Botao, Campo, Badge, Alerta, EstadoVazio } from '../../components/ui/Primitivas.jsx'
import './Fornecedor.css'
import './FornecedorLayout.css'
import { NavegacaoRecolhivel } from '../../components/layout/NavegacaoRecolhivel.jsx'
import { Icone } from '../../components/ui/Icone.jsx'
import { IdentidadeConta } from '../../components/layout/IdentidadeConta.jsx'
import { MidiaEvento, CapaEvento } from '../../components/eventos/MidiaEvento.jsx'
import { PortfolioFornecedor } from '../../components/portfolio/Portfolio.jsx'
import { useState, useEffect, useRef } from 'react'
import { apiUrl } from '../../services/api.js'
import { formatarMoeda } from '../../utils/formatarMoeda.js'

export function PortalFornecedor({pagina,setPagina,aoSair,PerfilFornecedor,navegacao}) {
 const [busca,setBusca]=useState('')
 const [oportunidades, setOportunidades] = useState([])
  const [carregandoOportunidades, setCarregandoOportunidades] = useState(true)
  const [erroOportunidades, setErroOportunidades] = useState('')
  useEffect(() => {
  const buscarOportunidades = async () => {
    try {
      setCarregandoOportunidades(true)
      setErroOportunidades('')

      const token = sessionStorage.getItem('token')

      const resposta = await fetch(
        apiUrl('/fornecedor/cotacoes'),
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      const dados = await resposta.json()

      if (!resposta.ok) {
        throw new Error(dados.erro || 'Erro ao buscar cotações.')
      }

      const lista = Array.isArray(dados) ? dados : []

     const oportunidadesFormatadas = lista.map((cotacao) => ({
       id: cotacao.id,
       eventoId: cotacao.evento_id,
       nome: cotacao.evento_nome,
       categoria: cotacao.itens
          .map((item) => item.categoria)
         .join(', '),
        organizador: 'Organizador do evento',
       local: cotacao.evento_local,
       publico: 'Não informado',
        prazo: cotacao.prazo.slice(0, 10),
       descricao: cotacao.observacoes || 'Sem observações.',
        itens: cotacao.itens,
        status: cotacao.status
    }))

setOportunidades(oportunidadesFormatadas)

    } catch (erro) {
      console.error('Erro ao buscar oportunidades:', erro)
      setErroOportunidades(erro.message)
    } finally {
      setCarregandoOportunidades(false)
    }
  }

  buscarOportunidades()
}, [])
 const [selecionadaLocal, setSelecionadaLocal] = useState(null)
 const selecionada = navegacao ? oportunidades.find(item => item.id === navegacao.estado.cotacaoId) || null : selecionadaLocal
 function setSelecionada(item) {
  setSelecionadaLocal(item)
  if (navegacao) navegacao.mudar({ cotacaoId: item?.id ?? null })
 }
 useEffect(() => {
  if (pagina === 'fornecedor-proposta' && !selecionada && !carregandoOportunidades) {
   if (navegacao) navegacao.mudar({ cotacaoId: null }, true)
   setPagina('fornecedor-mural')
  }
 }, [pagina, selecionada, carregandoOportunidades, setPagina, navegacao])
 const [propostas, setPropostas] = useState([])
 const [carregandoPropostas, setCarregandoPropostas] = useState(true)
 const [erroPropostas, setErroPropostas] = useState('')
 const [tentativaPropostas, setTentativaPropostas] = useState(0)
 useEffect(() => {
  let ativo = true
  const controller = new AbortController()
  const buscarPropostas = async () => {
    try {
      setCarregandoPropostas(true)
      setErroPropostas('')

      const token = sessionStorage.getItem('token')

      const resposta = await fetch(
        apiUrl('/fornecedor/propostas'),
        {
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      const dados = await resposta.json()

      if (!resposta.ok) {
        throw new Error(dados.erro || 'Erro ao buscar propostas.')
      }

      const propostasFormatadas = dados.map((proposta) => ({
        id: proposta.id,
        evento: proposta.evento_nome,
        valor: Number(proposta.valor),
        status: proposta.status,
        categoria: proposta.categoria || 'Não informada'
      }))

      if (ativo) setPropostas(propostasFormatadas)

    } catch (erro) {
      console.error('Erro ao buscar propostas:', erro)
      if (ativo) setErroPropostas(erro.message)

    } finally {
      if (ativo) setCarregandoPropostas(false)
    }
  }

  buscarPropostas()
  return () => { ativo = false; controller.abort() }
}, [tentativaPropostas])
 const [valor,setValor]=useState('')
 const [condicoes,setCondicoes]=useState('')
 const [detalhes,setDetalhes]=useState('')
 const [cotacaoDoFormulario, setCotacaoDoFormulario] = useState(navegacao?.estado.cotacaoId)
 if (navegacao && cotacaoDoFormulario !== navegacao.estado.cotacaoId) {
  setCotacaoDoFormulario(navegacao.estado.cotacaoId)
  setValor(''); setCondicoes(''); setDetalhes('')
 }
 const [filtro,setFiltro]=useState('Todas')
 const navegar=(destino)=>setPagina('fornecedor-'+destino)
 const titulo={mural:'Mural de oportunidades',cotacoes:'Propostas enviadas',proposta:'Elaborar proposta comercial',enviadas:'Propostas enviadas',contratos:'Contratos ativos',catalogo:'Portfólio profissional',desempenho:'Desempenho',perfil:'Perfil do fornecedor'}[pagina.replace('fornecedor-','')] || 'Portal do Fornecedor'
 const enviar = async (e) => {
  e.preventDefault()

  if (!selecionada) {
    alert('Selecione uma cotação antes de enviar a proposta.')
    return
  }

  try {
    const token = sessionStorage.getItem('token')

    const resposta = await fetch(
      apiUrl('/fornecedor/propostas'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          cotacao_id: selecionada.id,
          valor: Number(valor),
          condicoes_pagamento: condicoes,
          detalhes_tecnicos: detalhes
        })
      }
    )

    const dados = await resposta.json()

    if (!resposta.ok) {
      throw new Error(dados.erro || 'Erro ao enviar proposta.')
    }

    alert('Proposta enviada com sucesso!')

    setPropostas((atual) => [
      {
        id: dados.proposta_id,
        evento: selecionada.nome,
        valor: Number(valor),
        status: 'Em avaliação',
        categoria: selecionada.categoria
      },
      ...atual
    ])

    navegar('enviadas')

  } catch (erro) {
    console.error('Erro ao enviar proposta:', erro)
    alert(erro.message)
  }
}
 const abertas = oportunidades.filter((o) =>
  (o.nome + ' ' + o.categoria + ' ' + o.local)
    .toLowerCase()
    .includes(busca.toLowerCase())
)
 const menu=[['mural','Mural de oportunidades'],['enviadas','Propostas enviadas'],['contratos','Contratos ativos',true],['catalogo','Portfólio profissional'],['desempenho','Desempenho'],['perfil','Perfil fornecedor']]
 const conteudoRef = useRef(null)
 return <div className="portalFornecedor fornecedorPagina fornEstrutura">
    <a
      className="fornPular"
      href="#fornecedor-conteudo"
      onClick={e=>{e.preventDefault();conteudoRef.current?.focus()}}>Ir para o conteúdo</a>
    <aside className="fornSidebar">
      <div className="fornMarca">
        <Marca />
        <small>PORTAL DO FORNECEDOR</small>
      </div>
      <NavegacaoRecolhivel id="menu-fornecedor" rotulo="Menu do fornecedor" className="fornNavegacao">
        <div className="fornMenu">
          <Botao className="novo" onClick={()=>navegar('mural')}>
            <Icone nome="busca" /> Buscar cotações</Botao>
          <nav aria-label="Seções do fornecedor">
            {menu.map(([id,label,indisponivel])=><Botao
              key={id}
              variante="discreto"
              aria-current={(pagina==='fornecedor-'+id || (id==='enviadas' && pagina==='fornecedor-cotacoes')) ? 'page' : undefined}
              disabled={indisponivel}
              title={indisponivel ? 'Funcionalidade indisponível' : undefined}
              className={(pagina==='fornecedor-'+id || (id==='enviadas' && pagina==='fornecedor-cotacoes'))?'ativo':''}
              onClick={indisponivel ? undefined : ()=>navegar(id)}>
              <Icone nome={({ mural: 'eventos', enviadas: 'documento', contratos: 'documento', catalogo: 'documento', desempenho: 'custos', perfil: 'perfil' })[id]} />
              {label}
              {indisponivel && <small> (indisponível)</small>}
            </Botao>)}
          </nav>
          <Botao variante="discreto" className="fornSair" onClick={aoSair}>
            <Icone nome="sair" /> Sair</Botao>
        </div>
      </NavegacaoRecolhivel>
    </aside>
    <header className="fornTopo">
      <div className="fornContexto">
        <p>Portal do fornecedor</p>
        <p id="fornecedor-titulo-secao">
          {titulo}
        </p>
      </div>
      <div className="fornEmpresa">
        <IdentidadeConta />
      </div>
    </header>
    <main
      className="fornConteudo"
      id="fornecedor-conteudo"
      ref={conteudoRef}
      tabIndex={-1}
      aria-labelledby="fornecedor-titulo-secao">
      <div className="fornTrilha">TrocaTicket Fornecedor › {titulo}
      </div>
      <div className="fornTitulo">
        <div>
          <h1>
            {titulo}
          </h1>
          <p>Gestão comercial e oportunidades para fornecedores de eventos.</p>
        </div>
        <span className="fornSelo">Conta de fornecedor</span>
      </div>
      {carregandoPropostas && <Skeleton
        tipo={pagina==='fornecedor-enviadas'||pagina==='fornecedor-cotacoes' ? 'tabela' : 'texto'}
        rotulo="Carregando propostas..." />}
      {pagina==='fornecedor-proposta' && carregandoOportunidades && <Skeleton tipo="card" rotulo="Restaurando cotação..." />}
      {erroPropostas && <Alerta variante="erro" titulo="Erro de consulta de propostas">
        <p>
          {erroPropostas}
        </p>
        <Botao type="button" disabled={carregandoPropostas} onClick={()=>setTentativaPropostas(n=>n+1)}>Tentar novamente</Botao>
      </Alerta>}
      {pagina==='fornecedor-mural' && <>
        <div className="fornHero">
          <div>
            {carregandoOportunidades ? <Skeleton tipo="texto" linhas={1} rotulo="Consultando oportunidades" /> : <h2>
              {erroOportunidades ? '—' : oportunidades.length} EVENTOS AGUARDANDO SUA PROPOSTA</h2>}
            <p>Encontre demandas compatíveis com seus serviços e envie sua oferta comercial.</p>
          </div>
          <span className="fornSelo">Oportunidades disponíveis</span>
        </div>
        <div className="fornIndicadores">
          <div>
            <small>OPORTUNIDADES COMPATÍVEIS</small>
            {carregandoOportunidades ? <Skeleton tipo="texto" linhas={1} rotulo="Consultando quantidade de oportunidades" /> : <strong>
              {erroOportunidades ? '—' : oportunidades.length}
            </strong>}
            <span>Demandas abertas</span>
          </div>
          <div>
            <small>PROPOSTAS EM ANÁLISE</small>
            {carregandoPropostas ? <Skeleton tipo="texto" linhas={1} rotulo="Consultando indicador de propostas" /> : <strong>
              {erroPropostas ? '—' : propostas.filter(p=>p.status==='Em avaliação').length}
            </strong>}
            <span>Enviadas</span>
          </div>
          <div>
            <small>PROPOSTAS APROVADAS</small>
            {carregandoPropostas ? <Skeleton tipo="texto" linhas={1} rotulo="Consultando indicador de propostas" /> : <strong>
              {erroPropostas ? '—' : propostas.filter(p=>p.status==='Aprovada').length}
            </strong>}
            <span>Aprovadas</span>
          </div>
        </div>
        <Campo
          id="fornecedor-busca"
          label="Buscar oportunidades"
          aria-label="Buscar oportunidades"
          placeholder="Buscar eventos, serviços ou cidades..."
          value={busca}
          onChange={e=>setBusca(e.target.value)}
        />
        <div className="fornLista">
          {carregandoOportunidades && (
  <Skeleton tipo="card" rotulo="Carregando oportunidades..." />
)}
          {erroOportunidades && (
  <Alerta variante="erro" titulo="Erro de consulta de cotações">
            {erroOportunidades}
          </Alerta>
)}
          {!carregandoOportunidades &&
  !erroOportunidades &&
  abertas.length === 0 && (
    <EstadoVazio
            tipo={oportunidades.length === 0 ? 'sem-dados' : 'sem-resultados'}
            titulo={oportunidades.length === 0 ? 'Nenhuma cotação disponível no momento.' : 'Nenhum resultado encontrado pelos filtros.'} />
  )}
          {abertas.map(o=><article className="fornCartao" key={o.id}>
            <CapaEvento eventoId={o.eventoId}/>
            <div className="fornLinha">
              <Badge variante="informacao">#{o.id} · {o.categoria}
              </Badge>
              <small>Prazo: {o.prazo.split('-').reverse().join('/')}
              </small>
            </div>
            <h3>
              {o.nome}
            </h3>
            <p>Organizador: {o.organizador}
            </p>
            <p>Local: {o.local} · {o.publico} participantes</p>
            <p>
              {o.descricao}
            </p>
            <MidiaEvento eventoId={o.eventoId} />
            <Botao
              className="principal"
              onClick={()=>{setSelecionada(o);setValor('');setCondicoes('');setDetalhes('');navegar('proposta')}}>Elaborar proposta →</Botao>
          </article>)}
        </div>
      </>}
      {pagina==='fornecedor-proposta' && selecionada && <>
        <Botao variante="discreto" className="voltar" onClick={()=>navegar('mural')}>← Voltar para oportunidades</Botao>
        <div className="fornHero">
          <h2>
            {selecionada.nome}
          </h2>
          <p>
            {selecionada.categoria} · {selecionada.organizador} · {selecionada.publico} participantes</p>
        </div>
        <form className="fornCartao fornForm" onSubmit={enviar}>
          <h2>Parâmetros financeiros e condições</h2>
          <Campo
            id="fornecedor-proposta-1"
            label="Valor global da proposta (R$)"
            type="number"
            min="0.01"
            step="0.01"
            value={valor}
            onChange={e=>setValor(e.target.value)}
            obrigatorio />
          <Campo
            id="fornecedor-proposta-2"
            label="Condições de pagamento"
            placeholder="Ex.: 50% na assinatura e 50% após desmontagem"
            value={condicoes}
            onChange={e=>setCondicoes(e.target.value)}
            obrigatorio />
          <Campo
            id="fornecedor-proposta-3"
            label="Detalhamento técnico e rider"
            como="textarea"
            rows="5"
            placeholder="Ex.: Sistema de PA, equipe de operação e montagem inclusos."
            value={detalhes}
            onChange={e=>setDetalhes(e.target.value)}
            obrigatorio />
          <label className="fornCheck">
            <input type="checkbox" required/> Confirmo a disponibilidade e aceito os requisitos da cotação.</label>
          <div className="acoes">
            <Botao variante="secundario" className="secundario" type="button" onClick={()=>navegar('mural')}>Cancelar</Botao>
            <Botao className="principal" type="submit">Enviar proposta ao organizador →</Botao>
          </div>
        </form>
      </>}
      {(pagina==='fornecedor-enviadas'||pagina==='fornecedor-cotacoes') && <>
        <div className="fornIndicadores">
          <div>
            <small>PROPOSTAS ENVIADAS</small>
            {carregandoPropostas ? <Skeleton tipo="texto" linhas={1} rotulo="Consultando indicador de propostas" /> : <strong>
              {erroPropostas ? '—' : propostas.length}
            </strong>}
          </div>
          <div>
            <small>EM AVALIAÇÃO</small>
            {carregandoPropostas ? <Skeleton tipo="texto" linhas={1} rotulo="Consultando indicador de propostas" /> : <strong>
              {erroPropostas ? '—' : propostas.filter(p=>p.status==='Em avaliação').length}
            </strong>}
          </div>
          <div>
            <small>VOLUME PROPOSTO</small>
            {carregandoPropostas ? <Skeleton tipo="texto" linhas={1} rotulo="Consultando indicador de propostas" /> : <strong>
              {erroPropostas ? '—' : formatarMoeda(propostas.reduce((s,p)=>s+p.valor,0))}
            </strong>}
          </div>
        </div>
        <div className="fornFiltros">
          {['Todas','Em avaliação','Aprovada','Recusada'].map(f=><Botao
            key={f}
            variante="secundario"
            aria-pressed={filtro===f}
            className={filtro===f?'selecionado':''}
            onClick={()=>setFiltro(f)}>
            {f}
          </Botao>)}
        </div>
        <div className="fornCartao">
          <h2>Histórico de propostas</h2>
          {!carregandoPropostas && !erroPropostas && propostas.filter(p=>filtro==='Todas'||p.status===filtro).length===0 &&
    <EstadoVazio
            tipo={propostas.length===0 ? 'sem-dados' : 'sem-resultados'}
            titulo={propostas.length===0 ? 'Nenhuma proposta enviada.' : 'Nenhum resultado encontrado pelos filtros.'} />}
          <div className="fornTabela" role="region" aria-label="Histórico de propostas" tabIndex={0}>
            <div role="table" aria-label="Histórico de propostas enviadas">
              <div className="fornTabelaCab" role="row">
                <span role="columnheader">Evento</span>
                <span role="columnheader">Categoria</span>
                <span role="columnheader">Valor</span>
                <span role="columnheader">Status</span>
              </div>
              {!carregandoPropostas && !erroPropostas && propostas.filter(p=>filtro==='Todas'||p.status===filtro).map(p=><div className="fornTabelaLinha" role="row" key={p.id}>
                <strong role="cell">
                  {p.evento}
                </strong>
                <span role="cell">
                  {p.categoria}
                </span>
                <strong role="cell">
                  {formatarMoeda(p.valor)}
                </strong>
                <Badge
                  role="cell"
                  variante={p.status==='Aprovada' ? 'sucesso' : p.status==='Recusada' ? 'erro' : p.status==='Em avaliação' ? 'alerta' : 'neutro'}>
                  {p.status}
                </Badge>
              </div>)}
            </div>
          </div>
        </div>
      </>}
      {pagina==='fornecedor-contratos' && <div className="fornCartao">
        <EstadoVazio tipo="indisponivel" titulo="Funcionalidade indisponível." />
      </div>}
      {pagina==='fornecedor-desempenho' && <div className="fornIndicadores">
        <div>
          <small>PROPOSTAS ENVIADAS</small>
          {carregandoPropostas ? <Skeleton tipo="texto" linhas={1} rotulo="Consultando indicador de propostas" /> : <strong>
            {erroPropostas ? '—' : propostas.length}
          </strong>}
        </div>
        <div>
          <small>APROVADAS</small>
          {carregandoPropostas ? <Skeleton tipo="texto" linhas={1} rotulo="Consultando indicador de propostas" /> : <strong>
            {erroPropostas ? '—' : propostas.filter(p=>p.status==='Aprovada').length}
          </strong>}
        </div>
        <div>
          <small>VOLUME PROPOSTO</small>
          {carregandoPropostas ? <Skeleton tipo="texto" linhas={1} rotulo="Consultando indicador de propostas" /> : <strong>
            {erroPropostas ? '—' : formatarMoeda(propostas.reduce((s,p)=>s+p.valor,0))}
          </strong>}
        </div>
      </div>}
      {pagina==='fornecedor-catalogo' && <PortfolioFornecedor />}
      {pagina==='fornecedor-perfil' && <PerfilFornecedor propostas={propostas} />}
    </main>
  </div>
}











