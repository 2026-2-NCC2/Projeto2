import { useFocoModal } from '../../hooks/useFocoModal.js'
import { EstadoEventoAdmin } from './PainelEventoAdmin.jsx'
import { nomesPerfis } from '../../services/admin.js'

export function BadgeAdmin({ valor, perfil = false }) {
  const tons = { pendente: 'alerta', aprovado: 'sucesso', rejeitado: 'erro', Aberta: 'sucesso', 'Em avaliação': 'alerta', Aprovada: 'sucesso', Rejeitada: 'erro', Aceita: 'sucesso', Recusada: 'erro' }
  return <span className={`admBadge admBadge--${perfil ? 'perfil' : tons[valor] || 'neutro'}`}>{perfil ? nomesPerfis[valor] || valor || 'Perfil não informado' : valor || 'Não informado'}</span>
}
export function EstadoAdmin({ estado }) { return <EstadoEventoAdmin estado={estado} /> }
export function SkeletonAdmin({ rotulo = 'Carregando dados' }) {
  return <div className="admSkeleton" role="status" aria-label={rotulo} aria-busy="true"><span className="admSrOnly">{rotulo}…</span><div className="admSkeletonCard" />{[1, 2, 3, 4].map(n => <div key={n} />)}</div>
}
export function ErroAdmin({ erro, aoAtualizar, aoSair }) {
  return <div className="admMensagem admMensagem--erro" role="alert"><p>{erro.message}</p>{erro.status === 401 ? <button onClick={aoSair}>Entrar novamente</button> : <button onClick={aoAtualizar}>Atualizar consulta</button>}</div>
}
export function ModalAdmin({ titulo, aoFechar, children }) {
  const ref = useFocoModal(true, aoFechar)
  return <div className="adminModalOverlay" onClick={aoFechar}><section className="admModal" role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1} ref={ref} onClick={e => e.stopPropagation()}><header><h2>{titulo}</h2><button type="button" onClick={aoFechar} aria-label={`Fechar ${titulo.toLowerCase()}`}>Fechar</button></header>{children}</section></div>
}
export function FiltroAdmin({ titulo, valor, aoAlterar, opcoes, todos = 'Todos' }) {
  return <label>{titulo}<select value={valor} onChange={e => aoAlterar(e.target.value)}><option value="">{todos}</option>{opcoes.map(o => <option value={o.valor} key={o.valor}>{o.nome}</option>)}</select></label>
}
