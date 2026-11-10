import { useRef, useState } from 'react'
import { useConsultaAdmin } from '../../hooks/useConsultaAdmin.js'
import { criarDecisorAcesso, filtrarSolicitacoes, nomesPerfis } from '../../services/admin.js'
import { BadgeAdmin, SkeletonAdmin, ErroAdmin, FiltroAdmin } from './AdminUI.jsx'

const filtrosIniciais = { estado: 'pendente', tipo: '', inicio: '', fim: '', ordem: 'recentes' }
export function AdminSolicitacoes({ aoSair }) {
  const consulta = useConsultaAdmin('/solicitacoes-acesso')
  const [filtros, setFiltros] = useState(filtrosIniciais)
  const [processando, setProcessando] = useState(new Set())
  const [incertas, setIncertas] = useState(new Set())
  const [mensagem, setMensagem] = useState(null)
  const ativos = useRef(new Set())
  const bloqueadas = useRef(new Set())
  const decidir = useRef(null)
  if (decidir.current == null) decidir.current = criarDecisorAcesso()
  const filtrar = (campo, valor) => setFiltros(f => ({ ...f, [campo]: valor }))
  const lista = filtrarSolicitacoes(consulta.dados, filtros)
  const intervaloInvalido = filtros.inicio && filtros.fim && filtros.inicio > filtros.fim
  function atualizar() { bloqueadas.current.clear(); setIncertas(new Set()); setMensagem(null); consulta.recarregar() }
  async function tomarDecisao(item, status) {
    if (ativos.current.has(item.id) || bloqueadas.current.has(item.id) || item.status !== 'pendente') return
    if (!window.confirm(`Deseja ${status === 'aprovado' ? 'aprovar' : 'rejeitar'} a solicitação #${item.id}?`)) return
    ativos.current.add(item.id)
    setProcessando(new Set(ativos.current)); setMensagem(null)
    try {
      const resultado = await decidir.current(item.id, status)
      if (resultado.ignorado) return
      bloqueadas.current.add(item.id)
      consulta.atualizar(dados => dados.map(s => s.id === item.id ? { ...s, status } : s))
      setMensagem({ tom: 'sucesso', texto: `Solicitação #${item.id} ${status === 'aprovado' ? 'aprovada' : 'rejeitada'} com sucesso.` })
    } catch (erro) {
      bloqueadas.current.add(item.id)
      setMensagem({ tom: erro.status === 409 ? 'alerta' : 'erro', texto: erro.message, status: erro.status })
      // Não repetir decisões incertas/conflitantes sem uma nova consulta.
      setIncertas(anteriores => new Set([...anteriores, item.id]))
    } finally {
      ativos.current.delete(item.id); setProcessando(new Set(ativos.current))
    }
  }
  const pendentes = consulta.dados.filter(s => s.status === 'pendente')
  return <section className="admPagina" aria-labelledby="adm-solicitacoes-titulo">
    <header className="admPaginaTopo">
      <div>
        <p className="admSobretitulo">ADMINISTRAÇÃO · ACESSO</p>
        <h1 id="adm-solicitacoes-titulo">Solicitações de acesso</h1>
        <p>Analise os pedidos pendentes e consulte o histórico de decisões.</p>
      </div>
      <button
        className="admAcao"
        disabled={consulta.carregando || processando.size > 0}
        onClick={atualizar}>Atualizar lista</button>
    </header>
    {consulta.carregando ? <SkeletonAdmin rotulo="Carregando solicitações e indicadores" /> : consulta.erro ? <ErroAdmin erro={consulta.erro} aoAtualizar={atualizar} aoSair={aoSair} /> : <>
      <div className="admMetricas">
        {[['Pendentes', pendentes.length], ['Organizadores pendentes', pendentes.filter(s => s.perfil_solicitado === 'organizador').length], ['Fornecedores pendentes', pendentes.filter(s => s.perfil_solicitado === 'fornecedor').length]].map(([nome, valor]) => <article key={nome}>
          <span>
            {nome}
          </span>
          <strong>
            {valor}
          </strong>
        </article>)}
      </div>
      <div className="admFiltros">
        <FiltroAdmin
          titulo="Estado"
          valor={filtros.estado}
          aoAlterar={v => filtrar('estado', v)}
          todos="Todos os estados"
          opcoes={[['pendente', 'Pendentes'], ['aprovado', 'Aprovadas'], ['rejeitado', 'Rejeitadas']].map(([valor, nome]) => ({ valor, nome }))} />
        <FiltroAdmin
          titulo="Tipo de acesso"
          valor={filtros.tipo}
          aoAlterar={v => filtrar('tipo', v)}
          todos="Todos os tipos"
          opcoes={[{ valor: 'organizador', nome: 'Organizador' }, { valor: 'fornecedor', nome: 'Fornecedor' }]} />
        <label>Solicitada a partir de<input
            type="date"
            value={filtros.inicio}
            onChange={e => filtrar('inicio', e.target.value)}
            aria-invalid={Boolean(intervaloInvalido)} />
        </label>
        <label>Solicitada até<input
            type="date"
            value={filtros.fim}
            onChange={e => filtrar('fim', e.target.value)}
            aria-invalid={Boolean(intervaloInvalido)} />
        </label>
        <label>Ordenar por<select value={filtros.ordem} onChange={e => filtrar('ordem', e.target.value)}>
            <option value="recentes">Mais recentes</option>
            <option value="antigas">Mais antigas</option>
            <option value="nome">Nome do solicitante</option>
          </select>
        </label>
        <button className="admAcao admAcao--secundaria" onClick={() => setFiltros(filtrosIniciais)}>Limpar filtros</button>
      </div>
      <p className="admNota">O período considera a data da solicitação no horário de São Paulo. A data e o responsável pela decisão não estão disponíveis nos dados atuais.</p>
      {intervaloInvalido && <p className="admMensagem admMensagem--alerta" role="alert">A data inicial deve ser anterior ou igual à data final.</p>}
      {mensagem && <div
        className={`admMensagem admMensagem--${mensagem.tom}`}
        role={mensagem.tom === 'sucesso' ? 'status' : 'alert'}>
        <p>
          {mensagem.texto}
        </p>
        {mensagem.status === 401 ? <button onClick={aoSair}>Entrar novamente</button> : mensagem.tom !== 'sucesso' && <button onClick={atualizar} disabled={processando.size > 0}>Atualizar lista</button>}
      </div>}
      <p className="admContagem" role="status">Exibindo {lista.length} de {consulta.dados.length} solicitações</p>
      {!lista.length ? <div className="admVazio">
        <h2>Nenhuma solicitação neste filtro</h2>
        <p>Selecione outro estado, tipo ou período para consultar o histórico.</p>
      </div> : <div className="admTabela" role="region" aria-label="Solicitações de acesso" tabIndex={0}>
        <table>
          <thead>
            <tr>
              {['Protocolo / solicitação', 'Solicitante', 'Acesso solicitado', 'Estado', 'Justificativa', 'Ações'].map(t => <th scope="col" key={t}>
                {t}
              </th>)}
            </tr>
          </thead>
          <tbody>
            {lista.map(item => <tr key={item.id} aria-busy={processando.has(item.id)}>
              <td>
                <strong>#{item.id}
                </strong>
                <small>
                  {item.criada_em && Number.isFinite(Date.parse(item.criada_em)) ? new Date(item.criada_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Data não informada'}
                </small>
              </td>
              <td>
                <strong>
                  {item.nome}
                </strong>
                <small>
                  {item.email}
                </small>
              </td>
              <td>
                {nomesPerfis[item.perfil_solicitado] || item.perfil_solicitado}
              </td>
              <td>
                <BadgeAdmin valor={item.status} />
              </td>
              <td className="admTextoLongo">
                {item.justificativa || 'Não informada'}
              </td>
              <td>
                {item.status === 'pendente' ? <div className="admAcoes">
                  <button
                    className="admAcao admAcao--sucesso"
                    disabled={processando.has(item.id) || incertas.has(item.id)}
                    onClick={() => tomarDecisao(item, 'aprovado')}>
                    {processando.has(item.id) ? 'Processando…' : 'Aprovar'}
                  </button>
                  <button
                    className="admAcao admAcao--erro"
                    disabled={processando.has(item.id) || incertas.has(item.id)}
                    onClick={() => tomarDecisao(item, 'rejeitado')}>Recusar</button>
                  {incertas.has(item.id) && <small>Atualize a lista antes de decidir novamente.</small>}
                </div> : <span className="admNota">Decisão registrada</span>}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </>}
    <div className="admLote">
      <span>Ações em lote indisponíveis. Analise cada solicitação individualmente.</span>
      <button disabled title="Funcionalidade em desenvolvimento">Aprovar em lote</button>
      <button disabled title="Funcionalidade em desenvolvimento">Reprovar em lote</button>
    </div>
  </section>
}
