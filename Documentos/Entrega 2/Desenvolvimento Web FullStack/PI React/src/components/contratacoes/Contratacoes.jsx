import { useRef, useState } from 'react'
import { useContratacoes } from '../../hooks/useContratacoes.js'
import { formalizarContratacao, alterarContratacao } from '../../services/contratacoes.js'
import { Botao, Campo, Badge, Alerta, Skeleton, EstadoVazio } from '../ui/Primitivas.jsx'
import { useFocoModal } from '../../hooks/useFocoModal.js'
import { formatarMoeda } from '../../utils/formatarMoeda.js'
import './Contratacoes.css'

const rotulos = { ativo: 'Ativo', concluido: 'Concluído', cancelado: 'Cancelado' }
const tom = { ativo: 'sucesso', concluido: 'neutro', cancelado: 'erro' }
export function Contratacoes({ eventoId, propostas = [], organizador = false, aoSair }) {
  const consulta = useContratacoes(eventoId)
  const [busca, buscar] = useState(''), [estado, filtrar] = useState('ativo')
  const [acao, selecionar] = useState(null), [mensagem, informar] = useState('')
  const candidatos = propostas.filter(p => p.status === 'Aprovada' && !consulta.dados.some(c => c.proposta_id === p.id))
  const lista = consulta.dados.filter(c => (!estado || c.estado === estado) && [c.evento_nome, c.servico, c.fornecedor_nome, c.id].join(' ').toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR')))
  if (consulta.carregando) return <Skeleton tipo="tabela" rotulo="Consultando contratações..." />
  if (consulta.erro) return <Alerta variante="erro" titulo={consulta.erro.status === 403 ? 'Acesso negado' : 'Contratações não consultadas'}>
    <p>{consulta.erro.message}</p><Botao onClick={consulta.erro.status === 401 && aoSair ? aoSair : consulta.recarregar}>{consulta.erro.status === 401 && aoSair ? 'Entrar novamente' : 'Tentar novamente'}</Botao>
  </Alerta>
  if (!consulta.disponivel) return <EstadoVazio tipo="indisponivel" titulo="Contratos ativos indisponíveis."><p>O registro de contratações aguarda preparação e autorização do ambiente. Propostas aprovadas não são convertidas automaticamente em contratos.</p></EstadoVazio>
  return <section className="ctPagina" aria-label="Contratações comerciais">
    <h2>Contratações do {organizador ? 'evento' : 'fornecedor'}</h2>
    <p>Registro comercial confirmado pelo Organizador. Não representa assinatura digital, pagamento ou documento juridicamente assinado.</p>
    {mensagem && <Alerta variante="sucesso">{mensagem}</Alerta>}
    <Botao variante="secundario" onClick={consulta.recarregar}>Atualizar contratações</Botao>
    <dl className="ctIndicadores">{Object.entries(rotulos).map(([k, v]) => <div key={k}><dt>{v}</dt><dd>{consulta.dados.filter(c => c.estado === k).length}</dd></div>)}</dl>
    {organizador && candidatos.length > 0 && <section aria-label="Propostas aprovadas para formalização"><h3>Propostas aprovadas</h3><p>A confirmação preserva o valor e as condições atuais da proposta.</p>{candidatos.map(p => <article className="ctCartao" key={p.id}><h4>{p.fornecedor_nome || 'Fornecedor'} · proposta #{p.id}</h4><p>{p.evento_nome}</p><p>{p.detalhes_tecnicos}</p><strong>{formatarMoeda(Number(p.valor))}</strong><p>{p.condicoes_pagamento}</p><Botao onClick={() => selecionar({ tipo: 'formalizar', registro: p })}>Formalizar contratação da proposta #{p.id}</Botao></article>)}</section>}
    <div className="ctFiltros" role="search" aria-label="Filtrar contratações">
      <Campo label="Buscar evento, serviço ou fornecedor" value={busca} onChange={e => buscar(e.target.value)} />
      <Campo label="Situação" como="select" value={estado} onChange={e => filtrar(e.target.value)}><option value="">Todas</option>{Object.entries(rotulos).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</Campo>
      <Botao variante="secundario" onClick={() => { buscar(''); filtrar('') }}>Limpar filtros</Botao>
    </div>
    <p role="status">Exibindo {lista.length} de {consulta.dados.length} contratações consultadas</p>
    {!lista.length ? <EstadoVazio tipo={consulta.dados.length ? 'sem-resultados' : 'sem-dados'} titulo={consulta.dados.length ? 'Nenhuma contratação para estes filtros.' : 'Nenhuma contratação formalizada.'} /> :
      <div className="ctTabela" role="region" aria-label="Lista de contratações" tabIndex={0}><table><thead><tr>{['Evento / serviço','Valor acordado','Formalização','Situação','Ações'].map(t => <th key={t} scope="col">{t}</th>)}</tr></thead><tbody>{lista.map(c => <tr key={c.id}>
        <td><strong>{c.evento_nome}</strong><p>{c.servico}</p><small>{c.fornecedor_nome}</small></td><td>{formatarMoeda(Number(c.valor_acordado))}</td><td>{new Date(c.formalizado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td><td><Badge variante={tom[c.estado]}>{rotulos[c.estado]}</Badge></td>
        <td><Botao variante="secundario" aria-label={`Detalhes da contratação #${c.id}`} onClick={() => selecionar({ tipo: 'detalhes', registro: c })}>Detalhes</Botao>
          {organizador && c.estado === 'ativo' && <><Botao variante="secundario" onClick={() => selecionar({ tipo: 'concluido', registro: c })}>Concluir #{c.id}</Botao><Botao variante="destrutivo" onClick={() => selecionar({ tipo: 'cancelado', registro: c })}>Cancelar #{c.id}</Botao></>}</td>
      </tr>)}</tbody></table></div>}
    {acao && <DialogoContratacao key={acao.tipo + acao.registro.id} acao={acao} aoFechar={() => selecionar(null)} aoSalvar={async motivo => {
      if (acao.tipo === 'formalizar') await formalizarContratacao(acao.registro.id)
      else await alterarContratacao(acao.registro, acao.tipo, motivo)
      selecionar(null); informar('Operação confirmada. Atualizando a consulta.'); consulta.recarregar()
    }} />}
  </section>
}

function DialogoContratacao({ acao, aoFechar, aoSalvar }) {
  const [motivo, justificar] = useState(''), [erro, falhar] = useState(''), [ocupado, ocupar] = useState(false), [incerto, marcarIncerto] = useState(false)
  const envio = useRef(false)
  const modal = useFocoModal(true, ocupado ? () => {} : aoFechar)
  const c = acao.registro, detalhes = acao.tipo === 'detalhes', criar = acao.tipo === 'formalizar'
  return <div className="ctOverlay"><section className="ctDialogo" role="dialog" aria-modal="true" aria-label={detalhes ? 'Detalhes da contratação' : criar ? 'Confirmar contratação' : 'Confirmar alteração da contratação'} ref={modal} tabIndex={-1}>
    <h2>{detalhes ? `Contratação #${c.id}` : criar ? `Formalizar proposta #${c.id}?` : `${rotulos[acao.tipo]}: contratação #${c.id}`}</h2>
    <p>{c.evento_nome} · {c.fornecedor_nome}</p><p>{criar ? c.detalhes_tecnicos : c.servico}</p><strong>{formatarMoeda(Number(criar ? c.valor : c.valor_acordado))}</strong><p>{c.condicoes_pagamento}</p>
    {detalhes && <><p>Situação: {rotulos[c.estado]}</p><p>Formalizado por Organizador #{c.formalizado_por} · {new Date(c.formalizado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>{c.motivo_encerramento && <p>Justificativa: {c.motivo_encerramento}</p>}</>}
    {!detalhes && <p>Confirmação explícita de registro comercial; não é assinatura digital nem pagamento.</p>}
    {!criar && !detalhes && <Campo label="Justificativa obrigatória" como="textarea" value={motivo} minLength={3} maxLength={1000} obrigatorio disabled={ocupado || incerto} onChange={e => justificar(e.target.value)} />}
    {erro && <Alerta variante="erro">{erro}</Alerta>}
    <div className="ctAcoes"><Botao variante="secundario" disabled={ocupado} onClick={aoFechar}>{detalhes || incerto ? 'Fechar e consultar a lista' : 'Voltar sem confirmar'}</Botao>
    {!detalhes && <Botao variante={acao.tipo === 'cancelado' ? 'destrutivo' : 'primario'} ocupado={ocupado} disabled={incerto} onClick={async () => {
      if (envio.current || incerto) return
      if (!criar && motivo.trim().length < 3) { falhar('Informe justificativa de 3 a 1000 caracteres.'); return }
      envio.current = true; ocupar(true); falhar('')
      try { await aoSalvar(motivo.trim()) } catch (e) { marcarIncerto(e.resultadoIncerto === true); falhar(e.message) } finally { envio.current = false; ocupar(false) }
    }}>Confirmar</Botao>}</div>
  </section></div>
}
