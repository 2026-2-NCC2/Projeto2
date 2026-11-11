import { useState } from 'react'
import { useConsultaAdmin } from '../../hooks/useConsultaAdmin.js'
import { relatoriosAdmin, filtrosRelatorio, validarDadosRelatorio, filtrarRelatorio, agruparRelatorio, diaEventoRelatorio } from '../../services/relatoriosAdmin.js'
import { nomesPerfis, diaSolicitacao } from '../../services/admin.js'
import { moedaPainel } from '../../services/painelEventoAdmin.js'
import { BadgeAdmin, EstadoAdmin, FiltroAdmin, SkeletonAdmin, ErroAdmin } from './AdminUI.jsx'
import './AdminRelatorios.css'

function DataRelatorio({ dia }) { return <>{dia.split('-').reverse().join('/')}</> }
function GrupoRelatorio({ dados, campo, titulo, tipo }) {
  return <section className="admRelatorioGrupo" aria-label={`Distribuição por ${titulo.toLowerCase()}`}>
    <h3>{titulo}</h3>
    {!dados.length ? <p>Nenhum registro para agrupar.</p> : <dl>{agruparRelatorio(dados, campo).map(g => <div key={g.valor}>
      <dt>{campo === 'perfil' || campo === 'perfil_solicitado' ? <BadgeAdmin valor={g.valor} perfil /> : campo === 'status' ?
        tipo === 'eventos' ? <EstadoAdmin estado={g.valor} /> : <BadgeAdmin valor={g.valor} /> : g.valor}</dt>
      <dd>{g.quantidade.toLocaleString('pt-BR')}</dd>
    </div>)}</dl>}
  </section>
}
export function DadosRelatorioAdmin({ tipo, aoSair }) {
  const config = relatoriosAdmin[tipo]
  const consulta = useConsultaAdmin(config.rota, true, true)
  const [filtros, setFiltros] = useState(filtrosRelatorio)
  const alterar = (campo, valor) => setFiltros(f => ({ ...f, [campo]: valor }))
  let dados = consulta.dados, erro = consulta.erro
  if (!consulta.carregando && !erro) {
    try { dados = validarDadosRelatorio(tipo, dados) }
    catch (falha) { erro = falha }
  }
  if (erro) dados = []
  const lista = filtrarRelatorio(tipo, dados, filtros)
  const invalido = tipo !== 'usuarios' && filtros.inicio && filtros.fim && filtros.inicio > filtros.fim
  const opcoes = campo => agruparRelatorio(dados, campo).map(g => ({ valor: g.valor, nome: g.valor }))
  const organizadores = [...new Map(dados.map(e => [String(e.usuario_id), { valor: String(e.usuario_id), nome: `${e.organizador_nome} · #${e.usuario_id}` }])).values()]
  const relacionados = (campo, nome) => [...new Map(dados.map(item => [String(item[campo]), {
    valor: String(item[campo]), nome: `${item[nome]} · #${item[campo]}`,
  }])).values()]
  const periodo = tipo === 'eventos' ? 'Período de realização do evento, não de cadastro.' :
    tipo === 'cotacoes' ? (filtros.dataReferencia === 'prazo' ? 'Período do prazo da cotação, em data de calendário.' : 'Período de criação da cotação. Horário de São Paulo.') :
      tipo === 'propostas' ? 'Período de criação da proposta, não de aprovação ou recusa. Horário de São Paulo.' :
        'Período do pedido, não da aprovação ou recusa. Horário de São Paulo.'
  const colunas = tipo === 'eventos' ? ['ID', 'Evento', 'Realização', 'Categoria', 'Organizador', 'Estado'] :
    tipo === 'usuarios' ? ['ID', 'Nome', 'E-mail', 'Perfil'] :
      tipo === 'cotacoes' ? ['ID', 'Evento', 'Modalidade', 'Estado', 'Prazo', 'Data de criação'] :
        tipo === 'propostas' ? ['ID', 'Evento', 'Fornecedor', 'Valor proposto', 'Estado', 'Data de criação'] :
          ['ID', 'Solicitante', 'Perfil solicitado', 'Data do pedido', 'Estado']
  return <div className="admRelatorioDados">
    <div className="admRelatorioTopo"><h2>{config.titulo}</h2><button type="button" className="admAcao" aria-disabled={consulta.carregando} onClick={() => { if (!consulta.carregando) consulta.recarregar() }}>Atualizar relatório</button></div>
    <p className="admNota" role="status" aria-live="polite">{consulta.carregando ? 'Carregando relatório…' : erro ? 'Não foi possível concluir a consulta.' : 'Consulta do relatório concluída.'}</p>
    {config.periodo && <p className="admNota" id="adm-relatorio-periodo">{periodo}</p>}
    {tipo === 'propostas' && <p className="admMensagem admMensagem--alerta">Os valores são propostas comerciais, não representam pagamentos realizados, faturamento ou receita.</p>}
    <div className="admFiltros" role="group" aria-label={`Filtros do relatório de ${config.titulo.toLowerCase()}`}>
      {tipo === 'usuarios' ? <>
        <label>Pesquisar por nome ou e-mail<input type="search" value={filtros.busca} onChange={e => alterar('busca', e.target.value)} /></label>
        <FiltroAdmin titulo="Perfil" valor={filtros.perfil} aoAlterar={v => alterar('perfil', v)} opcoes={opcoes('perfil').map(o => ({ ...o, nome: nomesPerfis[o.valor] || o.nome }))} />
      </> : <>
        <FiltroAdmin titulo="Estado" valor={filtros.estado} aoAlterar={v => alterar('estado', v)} opcoes={opcoes('status')} />
        {tipo === 'eventos' ? <>
          <FiltroAdmin titulo="Categoria" valor={filtros.categoria} aoAlterar={v => alterar('categoria', v)} opcoes={opcoes('categoria')} />
          <FiltroAdmin titulo="Organizador" valor={filtros.organizador} aoAlterar={v => alterar('organizador', v)} opcoes={organizadores} />
        </> : tipo === 'solicitacoes' ? <FiltroAdmin titulo="Perfil solicitado" valor={filtros.perfil} aoAlterar={v => alterar('perfil', v)} opcoes={opcoes('perfil_solicitado').map(o => ({ ...o, nome: nomesPerfis[o.valor] || o.nome }))} /> : <>
          {tipo === 'cotacoes' && <FiltroAdmin titulo="Modalidade" valor={filtros.modalidade} aoAlterar={v => alterar('modalidade', v)} opcoes={opcoes('modalidade')} />}
          <FiltroAdmin titulo="Evento" valor={filtros.evento} aoAlterar={v => alterar('evento', v)} opcoes={relacionados('evento_id', 'evento_nome')} />
          {tipo === 'propostas' && <FiltroAdmin titulo="Fornecedor" valor={filtros.fornecedor} aoAlterar={v => alterar('fornecedor', v)} opcoes={relacionados('fornecedor_id', 'fornecedor_nome')} />}
          {tipo === 'cotacoes' && <label>Data de referência<select value={filtros.dataReferencia} onChange={e => alterar('dataReferencia', e.target.value)} aria-describedby="adm-relatorio-periodo">
            <option value="criacao">Data de criação</option><option value="prazo">Prazo da cotação</option>
          </select></label>}
        </>}
        {['inicio', 'fim'].map((campo, i) => <label key={campo}>{i === 0 ? 'Data inicial' : 'Data final'}<input type="date" value={filtros[campo]}
          onChange={e => alterar(campo, e.target.value)} aria-invalid={Boolean(invalido)} aria-describedby={invalido ? 'adm-relatorio-periodo-erro' : 'adm-relatorio-periodo'} /></label>)}
      </>}
      <button type="button" className="admAcao admAcao--secundaria" onClick={() => setFiltros(filtrosRelatorio)}>Limpar filtros</button>
    </div>
    <div aria-busy={consulta.carregando}>
    {consulta.carregando ? <SkeletonAdmin rotulo={`Carregando relatório de ${config.titulo.toLowerCase()}`} /> : erro ? <ErroAdmin erro={erro} aoAtualizar={consulta.recarregar} aoSair={aoSair} /> : invalido ? <p id="adm-relatorio-periodo-erro" role="alert" className="admMensagem admMensagem--alerta">A data inicial deve ser anterior ou igual à data final.</p> : <>
      <div className="admRelatorioTotais" role="status">
        <article><span>Total consultado</span><strong>{dados.length.toLocaleString('pt-BR')}</strong></article>
        <article><span>Após os filtros</span><strong>{lista.length.toLocaleString('pt-BR')}</strong></article>
      </div>
      <p className="admNota">Distribuições calculadas sobre os registros após os filtros. A consulta não é um snapshot transacional nem histórico de alterações.</p>
      <div className="admRelatorioGrupos">{config.grupos.map(([campo, titulo]) => <GrupoRelatorio key={campo} dados={lista} campo={campo} titulo={titulo} tipo={tipo} />)}</div>
      {!lista.length ? <div className="admVazio"><h3>{dados.length ? 'Nenhum resultado para estes filtros' : 'Nenhum registro cadastrado'}</h3><p>{dados.length ? 'Ajuste ou limpe os filtros.' : 'Os registros aparecerão quando estiverem disponíveis.'}</p></div> :
        <div className="admTabela" role="region" aria-label={`Resultados do relatório de ${config.titulo.toLowerCase()}`} tabIndex={0}>
          <table><thead><tr>{colunas.map(c => <th scope="col" key={c}>{c}</th>)}</tr></thead>
            <tbody>{lista.map(item => <tr key={item.id}><td>#{item.id}</td>
              {tipo === 'eventos' ? <><td><strong>{item.nome}</strong><small>{item.local}</small></td><td><DataRelatorio dia={diaEventoRelatorio(item.data)} /><small>{item.horario.slice(0, 5)}</small></td><td>{item.categoria || 'Não informada'}</td><td>{item.organizador_nome}</td><td><EstadoAdmin estado={item.status} /></td></> :
                tipo === 'usuarios' ? <><td>{item.nome}</td><td>{item.email}</td><td><BadgeAdmin valor={item.perfil} perfil /></td></> :
                  tipo === 'cotacoes' ? <>
                    <td>{item.evento_nome}</td><td>{item.modalidade}</td><td><BadgeAdmin valor={item.status} /></td>
                    <td><DataRelatorio dia={diaEventoRelatorio(item.prazo)} /></td><td><DataRelatorio dia={diaSolicitacao(item.criada_em)} /></td>
                  </> : tipo === 'propostas' ? <>
                    <td>{item.evento_nome}</td><td>{item.fornecedor_nome}</td><td>{moedaPainel(item.valor)}</td>
                    <td><BadgeAdmin valor={item.status} /></td><td><DataRelatorio dia={diaSolicitacao(item.criada_em)} /></td>
                  </> :
                  <><td>{item.nome}</td><td><BadgeAdmin valor={item.perfil_solicitado} perfil /></td><td><DataRelatorio dia={diaSolicitacao(item.criada_em)} /></td><td><BadgeAdmin valor={item.status} /></td></>}
            </tr>)}</tbody></table>
        </div>}
    </>}
    </div>
  </div>
}
export function AdminRelatorios({ aoSair }) {
  const [tipo, setTipo] = useState('eventos')
  return <section className="admPagina admRelatorios" aria-labelledby="adm-relatorios-titulo">
    <h1 className="admSrOnly" id="adm-relatorios-titulo">Relatórios</h1>
    <p>Consulte a distribuição dos registros atuais. Selecione um relatório para carregar seus dados.</p>
    <label className="admRelatorioSeletor">Tipo de relatório<select value={tipo} onChange={e => setTipo(e.target.value)}>
      {Object.entries(relatoriosAdmin).map(([valor, c]) => <option key={valor} value={valor}>{c.titulo}</option>)}
    </select></label>
    <DadosRelatorioAdmin key={tipo} tipo={tipo} aoSair={aoSair} />
  </section>
}
