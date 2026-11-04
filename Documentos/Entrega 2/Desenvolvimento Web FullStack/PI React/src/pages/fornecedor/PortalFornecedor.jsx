import { Icone } from '../../components/ui/Icone.jsx'
import { IdentidadeConta } from '../../components/layout/IdentidadeConta.jsx'
import { useState, useEffect } from 'react'
import { apiUrl } from '../../services/api.js'
import { formatarMoeda } from '../../utils/formatarMoeda.js'

export function PortalFornecedor({pagina,setPagina,aoSair,PerfilFornecedor}) {
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
 const [selecionada, setSelecionada] = useState(null)
 useEffect(() => {
  if (pagina === 'fornecedor-proposta' && !selecionada) setPagina('fornecedor-mural')
 }, [pagina, selecionada, setPagina])
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
 const [filtro,setFiltro]=useState('Todas')
 const navegar=(destino)=>setPagina('fornecedor-'+destino)
 const titulo={mural:'Mural de oportunidades',cotacoes:'Propostas enviadas',proposta:'Elaborar proposta comercial',enviadas:'Propostas enviadas',contratos:'Contratos ativos',catalogo:'Catálogo e rider',desempenho:'Desempenho',perfil:'Perfil do fornecedor'}[pagina.replace('fornecedor-','')] || 'Portal do Fornecedor'
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
 const menu=[['mural','Mural de oportunidades'],['enviadas','Propostas enviadas'],['contratos','Contratos ativos',true],['catalogo','Catálogo e rider',true],['desempenho','Desempenho'],['perfil','Perfil fornecedor']]
 return <div className="portalFornecedor">
  <div className="fornTopo"><div className="logo"><Icone nome="ticket" /> <span>TrocaTicket</span><small>PORTAL FORNECEDOR</small></div><span className="fornSelo">Portal do fornecedor</span><span className="fornEmpresa"><IdentidadeConta /></span></div>
  <div className="fornCorpo"><aside className="fornMenu"><button className="novo" onClick={()=>navegar('mural')}><Icone nome="busca" /> Buscar cotações</button><nav>{menu.map(([id,label,indisponivel])=><button key={id} disabled={indisponivel} title={indisponivel ? 'Funcionalidade indisponível' : undefined} className={(pagina==='fornecedor-'+id || (id==='enviadas' && pagina==='fornecedor-cotacoes'))?'ativo':''} onClick={indisponivel ? undefined : ()=>navegar(id)}><Icone nome={({ mural: 'eventos', enviadas: 'documento', contratos: 'documento', catalogo: 'documento', desempenho: 'custos', perfil: 'perfil' })[id]} />{label}{indisponivel && <small> (indisponível)</small>}</button>)}</nav><button className="fornSair" onClick={aoSair}><Icone nome="sair" /> Sair</button></aside>
  <main className="fornConteudo"><div className="fornTrilha">TrocaTicket Fornecedor › {titulo}</div><div className="fornTitulo"><div><h1>{titulo}</h1><p>Gestão comercial e oportunidades para fornecedores de eventos.</p></div><span className="fornSelo">Conta de fornecedor</span></div>
  {carregandoPropostas && <p role="status">Carregando propostas...</p>}
  {erroPropostas && <div role="alert"><p>{erroPropostas}</p><button type="button" disabled={carregandoPropostas} onClick={()=>setTentativaPropostas(n=>n+1)}>Tentar novamente</button></div>}
  {pagina==='fornecedor-mural' && <><div className="fornHero"><div><h2>{oportunidades.length} EVENTOS AGUARDANDO SUA PROPOSTA</h2><p>Encontre demandas compatíveis com seus serviços e envie sua oferta comercial.</p></div><span className="fornSelo">Oportunidades disponíveis</span></div><div className="fornIndicadores"><div><small>OPORTUNIDADES COMPATÍVEIS</small><strong>{oportunidades.length}</strong><span>Demandas abertas</span></div><div><small>PROPOSTAS EM ANÁLISE</small><strong>{carregandoPropostas || erroPropostas ? '—' : propostas.filter(p=>p.status==='Em avaliação').length}</strong><span>Enviadas</span></div><div><small>PROPOSTAS APROVADAS</small><strong>{carregandoPropostas || erroPropostas ? '—' : propostas.filter(p=>p.status==='Aprovada').length}</strong><span>Aprovadas</span></div></div><input aria-label="Buscar oportunidades" placeholder="Buscar eventos, serviços ou cidades..." value={busca} onChange={e=>setBusca(e.target.value)}/><div className="fornLista">
    {carregandoOportunidades && (
  <p>Carregando oportunidades...</p>
)}

{erroOportunidades && (
  <p style={{ color: 'red' }}>
    {erroOportunidades}
  </p>
)}

{!carregandoOportunidades &&
  !erroOportunidades &&
  abertas.length === 0 && (
    <p>Nenhuma cotação disponível no momento.</p>
  )}{abertas.map(o=><article className="fornCartao" key={o.id}><div className="fornLinha"><span className="tag">#{o.id} · {o.categoria}</span><small>Prazo: {o.prazo.split('-').reverse().join('/')}</small></div><h3>{o.nome}</h3><p>Organizador: {o.organizador}</p><p>Local: {o.local} · {o.publico} participantes</p><p>{o.descricao}</p><button className="principal" onClick={()=>{setSelecionada(o);setValor('');setCondicoes('');setDetalhes('');navegar('proposta')}}>Elaborar proposta →</button></article>)}</div></>}
  {pagina==='fornecedor-proposta' && selecionada && <><button className="voltar" onClick={()=>navegar('mural')}>← Voltar para oportunidades</button><div className="fornHero"><h2>{selecionada.nome}</h2><p>{selecionada.categoria} · {selecionada.organizador} · {selecionada.publico} participantes</p></div><form className="fornCartao fornForm" onSubmit={enviar}><h2>Parâmetros financeiros e condições</h2><label>Valor global da proposta (R$) *</label><input type="number" min="0.01" step="0.01" value={valor} onChange={e=>setValor(e.target.value)} required/><label>Condições de pagamento *</label><input placeholder="Ex.: 50% na assinatura e 50% após desmontagem" value={condicoes} onChange={e=>setCondicoes(e.target.value)} required/><label>Detalhamento técnico e rider *</label><textarea rows="5" placeholder="Ex.: Sistema de PA, equipe de operação e montagem inclusos." value={detalhes} onChange={e=>setDetalhes(e.target.value)} required/><label className="fornCheck"><input type="checkbox" required/> Confirmo a disponibilidade e aceito os requisitos da cotação.</label><div className="acoes"><button className="secundario" type="button" onClick={()=>navegar('mural')}>Cancelar</button><button className="principal" type="submit">Enviar proposta ao organizador →</button></div></form></>}
  {(pagina==='fornecedor-enviadas'||pagina==='fornecedor-cotacoes') && <><div className="fornIndicadores"><div><small>PROPOSTAS ENVIADAS</small><strong>{carregandoPropostas || erroPropostas ? '—' : propostas.length}</strong></div><div><small>EM AVALIAÇÃO</small><strong>{carregandoPropostas || erroPropostas ? '—' : propostas.filter(p=>p.status==='Em avaliação').length}</strong></div><div><small>VOLUME PROPOSTO</small><strong>{carregandoPropostas || erroPropostas ? '—' : formatarMoeda(propostas.reduce((s,p)=>s+p.valor,0))}</strong></div></div><div className="fornFiltros">{['Todas','Em avaliação','Aprovada','Recusada'].map(f=><button key={f} className={filtro===f?'selecionado':''} onClick={()=>setFiltro(f)}>{f}</button>)}</div><div className="fornCartao"><h2>Histórico de propostas</h2><div className="fornTabela" role="region" aria-label="Histórico de propostas" tabIndex={0}><div className="fornTabelaCab"><span>Evento</span><span>Categoria</span><span>Valor</span><span>Status</span></div>{!carregandoPropostas && !erroPropostas && propostas.filter(p=>filtro==='Todas'||p.status===filtro).map(p=><div className="fornTabelaLinha" key={p.id}><strong>{p.evento}</strong><span>{p.categoria}</span><strong>{formatarMoeda(p.valor)}</strong><span className="tag">{p.status}</span></div>)}</div></div></>}
  {['fornecedor-contratos','fornecedor-catalogo'].includes(pagina) && <div className="fornCartao"><p role="status">Funcionalidade indisponível.</p></div>}
  {pagina==='fornecedor-desempenho' && <div className="fornIndicadores"><div><small>PROPOSTAS ENVIADAS</small><strong>{carregandoPropostas || erroPropostas ? '—' : propostas.length}</strong></div><div><small>APROVADAS</small><strong>{carregandoPropostas || erroPropostas ? '—' : propostas.filter(p=>p.status==='Aprovada').length}</strong></div><div><small>VOLUME PROPOSTO</small><strong>{carregandoPropostas || erroPropostas ? '—' : formatarMoeda(propostas.reduce((s,p)=>s+p.valor,0))}</strong></div></div>}
  {pagina==='fornecedor-perfil' && <PerfilFornecedor propostas={propostas} />}
  </main></div></div>
}











