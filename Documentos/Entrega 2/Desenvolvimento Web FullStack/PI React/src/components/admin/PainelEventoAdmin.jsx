import { useEffect, useState } from 'react'
import { consultarPainelEvento, moedaPainel, dataPainel } from '../../services/painelEventoAdmin.js'
import './PainelEventoAdmin.css'

const tons = { 'Em planejamento': 'planejamento', Ativo: 'ativo', Cancelado: 'cancelado', Encerrado: 'encerrado' }
export function EstadoEventoAdmin({ estado }) {
  return <span className={`peaEstado peaEstado--${tons[estado] || 'neutro'}`}>{estado || 'Estado não informado'}</span>
}
export function SkeletonPainel() {
  return <div className="peaSkeleton" role="status" aria-label="Carregando painel do evento"><span className="peaSrOnly">Carregando painel do evento…</span><div /><div className="peaSkeletonGrid">{[1, 2, 3, 4].map(n => <div key={n} />)}</div><div /><div /></div>
}
export function ResumoEventoAdmin({ evento }) {
  const capacidadeDisponivel = Number.isInteger(evento.inscritos_confirmados)
  return <section id="pea-resumo" className="peaSecao" aria-labelledby="pea-resumo-titulo">
    <h3 id="pea-resumo-titulo">Resumo do evento</h3>
    <dl className="peaDados"><div><dt>Organizador</dt><dd>{evento.organizador_nome || 'Não informado'}</dd></div><div><dt>Data e horário</dt><dd>{dataPainel(evento.data)} · {evento.horario?.slice(0, 5) || 'Não informado'}</dd></div><div><dt>Local</dt><dd>{evento.local}</dd></div><div><dt>Público estimado</dt><dd>{evento.publico?.toLocaleString('pt-BR') ?? 'Não informado'}</dd></div></dl>
    <div className="peaMetricas">
      <article><span>Capacidade máxima</span><strong>{!capacidadeDisponivel ? 'Indisponível' : evento.capacidade_maxima === null ? 'Sem limite configurado' : evento.capacidade_maxima}</strong></article>
      <article><span>Inscrições confirmadas</span><strong>{capacidadeDisponivel ? evento.inscritos_confirmados : 'Indisponível'}</strong></article>
      <article><span>Vagas disponíveis</span><strong>{!capacidadeDisponivel ? 'Indisponível' : evento.vagas_restantes === null ? 'Sem limite configurado' : evento.vagas_restantes}</strong></article>
      <article className={evento.lotado ? 'peaAlerta' : ''}><span>Ocupação</span><strong>{!capacidadeDisponivel ? 'Indisponível' : evento.lotado ? 'Lotado' : evento.capacidade_maxima === null ? 'Sem limite configurado' : 'Há vagas'}</strong></article>
    </div>
    <p className="peaNota">A ocupação não altera o estado do evento. Eventos cancelados, encerrados ou já iniciados não aceitam novas inscrições, mesmo com vagas.</p>
    <p>{evento.descricao || 'Sem descrição cadastrada.'}</p>
  </section>
}
export function ConteudoPainelEvento({ dados }) {
  const { evento, custos, cotacoes, propostas, resumo } = dados
  return <>
    <header className="peaHero"><div><span>VISÃO ADMINISTRATIVA · SOMENTE LEITURA</span><h2>{evento.nome}</h2><p>{evento.categoria || 'Categoria não informada'}</p></div><EstadoEventoAdmin estado={evento.status} /></header>
    <nav className="peaNav" aria-label="Seções do painel"><a href="#pea-resumo">Resumo</a><a href="#pea-custos">Custos ({resumo.custos})</a><a href="#pea-cotacoes">Cotações ({resumo.cotacoes})</a><a href="#pea-propostas">Propostas ({resumo.propostas})</a></nav>
    <ResumoEventoAdmin evento={evento} />
    <section id="pea-custos" className="peaSecao" aria-labelledby="pea-custos-titulo"><div className="peaSecaoTopo"><h3 id="pea-custos-titulo">Custos estimados</h3><strong>{moedaPainel(resumo.total_custos_estimados)}</strong></div><p className="peaNota">Previsão orçamentária cadastrada. Não representa despesa paga.</p>
      {!custos.length ? <p className="peaVazio">Nenhum custo estimado cadastrado para este evento.</p> : <div className="peaTabela" role="region" aria-label="Custos estimados" tabIndex={0}><table><thead><tr><th>Categoria</th><th>Descrição</th><th>Valor estimado</th></tr></thead><tbody>{custos.map(c => <tr key={c.id}><td>{c.categoria}</td><td>{c.descricao}</td><td>{moedaPainel(c.valor_estimado)}</td></tr>)}</tbody></table></div>}
    </section>
    <section id="pea-cotacoes" className="peaSecao" aria-labelledby="pea-cotacoes-titulo"><h3 id="pea-cotacoes-titulo">Cotações e itens</h3><p className="peaNota">{resumo.cotacoes} cotações · {resumo.itens} itens. Os valores dos itens não são somados aos custos do evento.</p>
      {!cotacoes.length ? <p className="peaVazio">Nenhuma cotação vinculada a este evento.</p> : <div className="peaCards">{cotacoes.map(q => <article className="peaCotacao" id={`pea-cotacao-${q.id}`} key={q.id}><h4>Cotação #{q.id} · {q.modalidade || 'Modalidade não informada'}</h4><p><strong>{q.status}</strong> · Prazo: {dataPainel(q.prazo)}</p><p>{q.observacoes || 'Sem observações.'}</p>{!q.itens.length ? <p className="peaVazio">Nenhum item cadastrado.</p> : <ul className="peaItens">{q.itens.map(i => <li key={i.id}><div><strong>{i.categoria}</strong><p>{i.descricao}</p></div><span>{moedaPainel(i.valor_estimado)}</span></li>)}</ul>}<a href="#pea-propostas">Consultar propostas deste evento</a></article>)}</div>}
    </section>
    <section id="pea-propostas" className="peaSecao" aria-labelledby="pea-propostas-titulo"><h3 id="pea-propostas-titulo">Propostas comerciais</h3><p className="peaNota">Ofertas dos fornecedores; não representam contratação ou pagamento realizado. Propostas alternativas não compõem o orçamento total.</p>
      {!propostas.length ? <p className="peaVazio">Nenhuma proposta vinculada às cotações deste evento.</p> : <div className="peaCards">{propostas.map(p => <article className="peaCotacao" key={p.id}><div className="peaSecaoTopo"><h4>Proposta #{p.id}</h4><strong>{moedaPainel(p.valor)}</strong></div><p>{p.fornecedor_nome} · <strong>{p.status}</strong></p><a href={`#pea-cotacao-${p.cotacao_id}`}>Ver cotação #{p.cotacao_id}</a><dl className="peaPropostaDados"><div><dt>Condições de pagamento propostas</dt><dd>{p.condicoes_pagamento || 'Não informadas'}</dd></div><div><dt>Detalhes técnicos</dt><dd>{p.detalhes_tecnicos || 'Não informados'}</dd></div></dl></article>)}</div>}
    </section>
    <p className="peaNota">Consultado em {new Date(dados.consultado_em).toLocaleString('pt-BR')}. {dados.aviso}</p>
  </>
}
function ConsultaPainel({ eventoId, aoSair }) {
  const [recurso, setRecurso] = useState({ carregando: true })
  const [tentativa, setTentativa] = useState(0)
  useEffect(() => {
    const controle = new AbortController()
    consultarPainelEvento(eventoId, { token: sessionStorage.getItem('token'), signal: controle.signal })
      .then(dados => { if (!controle.signal.aborted) setRecurso({ dados }) })
      .catch(erro => { if (!controle.signal.aborted) setRecurso({ erro }) })
    return () => controle.abort()
  }, [eventoId, tentativa])
  if (recurso.carregando) return <SkeletonPainel />
  if (recurso.erro) return <div className="peaErro" role="alert"><h2>Não foi possível abrir o painel</h2><p>{recurso.erro.message}</p>{recurso.erro.status === 401 ? <button onClick={aoSair}>Entrar novamente</button> : <button onClick={() => { setRecurso({ carregando: true }); setTentativa(n => n + 1) }}>Tentar novamente</button>}</div>
  return <ConteudoPainelEvento dados={recurso.dados} />
}
export function PainelEventoAdmin({ eventos, carregando, erro, eventoId, aoSelecionar, aoSair }) {
  return <div className="peaPainel"><div className="peaCabecalho"><div><h1>Painel de evento</h1><p>Capacidade, planejamento e ofertas em um só lugar.</p></div><label>Selecionar evento<select value={eventoId || ''} onChange={e => aoSelecionar(Number(e.target.value) || null)} disabled={carregando || Boolean(erro)}><option value="">Selecione um evento</option>{eventos.map(e => <option value={e.id} key={e.id}>{e.nome} · {e.status}</option>)}</select></label></div>
    {carregando ? <SkeletonPainel /> : erro ? <div className="peaErro" role="alert"><p>{erro}</p>{erro.includes('Sessão expirada') && <button onClick={aoSair}>Entrar novamente</button>}</div> : !eventos.length ? <p className="peaVazio">Nenhum evento cadastrado.</p> : !eventoId ? <p className="peaVazio">Selecione um evento para consultar o resumo e suas informações relacionadas.</p> : <ConsultaPainel key={eventoId} eventoId={eventoId} aoSair={aoSair} />}
  </div>
}
