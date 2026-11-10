import { useCallback, useState } from 'react'
import { useConsultaAdmin } from '../../hooks/useConsultaAdmin.js'
import { filtrarCatalogo, nomesPerfis } from '../../services/admin.js'
import { dataPainel, moedaPainel } from '../../services/painelEventoAdmin.js'
import { CapaEvento, MidiaEvento } from '../eventos/MidiaEvento.jsx'
import { ResumoEventoAdmin } from './PainelEventoAdmin.jsx'
import { BadgeAdmin, EstadoAdmin, SkeletonAdmin, ErroAdmin, ModalAdmin, FiltroAdmin } from './AdminUI.jsx'

const paginas = {
  eventos: { titulo: 'Eventos', descricao: 'Consulte estados, ocupação e planejamento dos eventos.', rota: '/admin/eventos', colunas: ['Evento', 'Local', 'Estado', 'Organizador', 'Ações'] },
  usuarios: { titulo: 'Usuários', descricao: 'Consulte os dados cadastrais e os perfis de acesso.', rota: '/usuarios', colunas: ['ID', 'Nome', 'E-mail', 'Perfil', 'Ações'] },
  cotacoes: { titulo: 'Cotações', descricao: 'Acompanhe demandas, itens estimados e seus eventos.', rota: '/admin/cotacoes', colunas: ['Cotação', 'Evento', 'Modalidade', 'Estado', 'Ações'] },
  propostas: { titulo: 'Propostas', descricao: 'Ofertas comerciais de fornecedores. Os valores não representam pagamentos realizados.', rota: '/admin/propostas', colunas: ['Proposta', 'Evento', 'Fornecedor', 'Valor proposto', 'Estado', 'Ações'] },
}
const filtrosVazios = { busca: '', estado: '', perfil: '', evento: '', fornecedor: '' }
function opcoes(dados, chave, nome = chave) {
  return [...new Map(dados.filter(x => x[chave] !== null && x[chave] !== undefined && x[chave] !== '').map(x => [String(x[chave]), { valor: String(x[chave]), nome: x[nome] || `#${x[chave]}` }])).values()].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
}
export function DetalhesCotacaoAdmin({ id, aoAbrirPainel, aoSair }) {
  const consulta = useConsultaAdmin(`/admin/cotacoes/${id}`, false)
  if (consulta.carregando) return <SkeletonAdmin rotulo="Carregando cotação e itens" />
  if (consulta.erro) return <ErroAdmin erro={consulta.erro} aoAtualizar={consulta.recarregar} aoSair={aoSair} />
  const q = consulta.dados
  if (!q || q.id !== id || !Number.isSafeInteger(q.evento_id) || !Array.isArray(q.itens) || q.itens.some(i => !i || !Number.isSafeInteger(i.id))) {
    return <ErroAdmin
    erro={new Error('Detalhes da cotação incompletos. Atualize a consulta.')}
    aoAtualizar={consulta.recarregar}
    aoSair={aoSair} />
  }
  return <>
    <div className="admDetalhesTopo">
      <BadgeAdmin valor={q.status} />
      <button className="admAcao" onClick={() => aoAbrirPainel(q.evento_id)}>Ver painel do evento</button>
    </div>
    <dl className="admDados">
      <div>
        <dt>Evento</dt>
        <dd>
          {q.evento_nome}
        </dd>
      </div>
      <div>
        <dt>Modalidade</dt>
        <dd>
          {q.modalidade || 'Não informada'}
        </dd>
      </div>
      <div>
        <dt>Prazo</dt>
        <dd>
          {dataPainel(q.prazo)}
        </dd>
      </div>
      <div>
        <dt>Observações</dt>
        <dd>
          {q.observacoes || 'Sem observações.'}
        </dd>
      </div>
    </dl>
    <h3>Itens da cotação</h3>
    <p className="admNota">Valores estimados; não representam despesas pagas.</p>
    {!q.itens?.length ? <p className="admVazio">Nenhum item cadastrado para esta cotação.</p> : <div className="admTabela" role="region" aria-label="Itens da cotação" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th>Categoria</th>
            <th>Descrição</th>
            <th>Valor estimado</th>
          </tr>
        </thead>
        <tbody>
          {q.itens.map(i => <tr key={i.id}>
            <td>
              {i.categoria}
            </td>
            <td>
              {i.descricao}
            </td>
            <td className="admValor">
              {moedaPainel(i.valor_estimado)}
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>}
  </>
}
export function AdminCatalogo({ tipo, aoAbrirPainel, aoAbrirCotacao, aoSair, cotacaoInicial }) {
  const config = paginas[tipo]
  const consulta = useConsultaAdmin(config.rota)
  const [filtros, setFiltros] = useState(filtrosVazios)
  const [selecionado, setSelecionado] = useState(cotacaoInicial ? { id: cotacaoInicial } : null)
  const fecharModal = useCallback(() => setSelecionado(null), [])
  const filtrar = (campo, valor) => setFiltros(f => ({ ...f, [campo]: valor }))
  const lista = filtrarCatalogo(tipo, consulta.dados, filtros)
  const estados = tipo === 'eventos' ? ['Ativo', 'Em planejamento', 'Cancelado', 'Encerrado'].map(nome => ({ valor: nome, nome })) : opcoes(consulta.dados, 'status')
  function visualizar(e, item) { e.currentTarget.focus(); setSelecionado(item) }
  return <section className="admPagina" aria-labelledby={`adm-titulo-${tipo}`}>
    <header className="admPaginaTopo">
      <div>
        <p className="admSobretitulo">ADMINISTRAÇÃO · CONSULTA</p>
        <h1 id={`adm-titulo-${tipo}`}>
          {config.titulo}
        </h1>
        <p>
          {config.descricao}
        </p>
      </div>
      <button className="admAcao" onClick={consulta.recarregar} disabled={consulta.carregando}>Atualizar lista</button>
    </header>
    <div className="admFiltros">
      {(tipo === 'eventos' || tipo === 'usuarios') && <label>Pesquisar {tipo === 'eventos' ? 'por nome' : 'por nome ou e-mail'}
        <input
          type="search"
          value={filtros.busca}
          onChange={e => filtrar('busca', e.target.value)}
          placeholder={tipo === 'eventos' ? 'Nome do evento' : 'Nome ou e-mail'} />
      </label>}
      {tipo !== 'usuarios' && <FiltroAdmin
        titulo="Estado"
        valor={filtros.estado}
        aoAlterar={v => filtrar('estado', v)}
        opcoes={estados}
        todos="Todos os estados" />}
      {tipo === 'usuarios' && <FiltroAdmin
        titulo="Perfil"
        valor={filtros.perfil}
        aoAlterar={v => filtrar('perfil', v)}
        opcoes={Object.entries(nomesPerfis).map(([valor, nome]) => ({ valor, nome }))}
        todos="Todos os perfis" />}
      {(tipo === 'cotacoes' || tipo === 'propostas') && <FiltroAdmin
        titulo="Evento"
        valor={filtros.evento}
        aoAlterar={v => filtrar('evento', v)}
        opcoes={opcoes(consulta.dados, 'evento_id', 'evento_nome')}
        todos="Todos os eventos" />}
      {tipo === 'propostas' && <FiltroAdmin
        titulo="Fornecedor"
        valor={filtros.fornecedor}
        aoAlterar={v => filtrar('fornecedor', v)}
        opcoes={opcoes(consulta.dados, 'fornecedor_id', 'fornecedor_nome')}
        todos="Todos os fornecedores" />}
      <button className="admAcao admAcao--secundaria" onClick={() => setFiltros(filtrosVazios)}>Limpar filtros</button>
    </div>
    {consulta.carregando ? <SkeletonAdmin rotulo={`Carregando ${config.titulo.toLowerCase()}`} /> : consulta.erro ? <ErroAdmin erro={consulta.erro} aoAtualizar={consulta.recarregar} aoSair={aoSair} /> : <>
      <p className="admContagem" role="status">Exibindo {lista.length} de {consulta.dados.length} registros</p>
      {!lista.length ? <div className="admVazio">
        <h2>
          {consulta.dados.length ? 'Nenhum resultado para estes filtros' : 'Nenhum registro cadastrado'}
        </h2>
        <p>
          {consulta.dados.length ? 'Ajuste a busca ou limpe os filtros para consultar outros registros.' : 'Os dados serão apresentados quando estiverem disponíveis.'}
        </p>
      </div> :
        <div
        className="admTabela"
        role="region"
        aria-label={`Lista de ${config.titulo.toLowerCase()}`}
        tabIndex={0}>
        <table>
          <thead>
            <tr>
              {config.colunas.map(c => <th key={c} scope="col">
                {c}
              </th>)}
            </tr>
          </thead>
          <tbody>
            {lista.map(item => <tr key={item.id}>
              {tipo === 'eventos' ? <>
                <td>
                  <div className="admEventoNome">
                    <CapaEvento eventoId={item.id} />
                    <strong>
                      {item.nome}
                    </strong>
                  </div>
                </td>
                <td>
                  {item.local}
                </td>
                <td>
                  <EstadoAdmin estado={item.status} />
                </td>
                <td>
                  {item.organizador_nome || `#${item.usuario_id}`}
                </td>
              </> : tipo === 'usuarios' ? <>
                <td>#{item.id}
                </td>
                <td>
                  <strong>
                    {item.nome}
                  </strong>
                </td>
                <td>
                  {item.email}
                </td>
                <td>
                  <BadgeAdmin valor={item.perfil} perfil />
                </td>
              </> : tipo === 'cotacoes' ? <>
                <td>
                  <strong>#{item.id}
                  </strong>
                </td>
                <td>
                  {item.evento_nome}
                </td>
                <td>
                  {item.modalidade || 'Não informada'}
                </td>
                <td>
                  <BadgeAdmin valor={item.status} />
                </td>
              </> : <>
                <td>
                  <strong>#{item.id}
                  </strong>
                </td>
                <td>
                  {item.evento_nome}
                </td>
                <td>
                  {item.fornecedor_nome}
                </td>
                <td className="admValor">
                  {moedaPainel(item.valor)}
                </td>
                <td>
                  <BadgeAdmin valor={item.status} />
                </td>
              </>}
              <td>
                <div className="admAcoes">
                  <button className="admAcao" onClick={e => visualizar(e, item)}>Visualizar</button>
                  {tipo === 'eventos' && <button className="admAcao admAcao--secundaria" onClick={() => aoAbrirPainel(item.id)}>Abrir painel</button>}
                </div>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    </>}
    {selecionado && <ModalAdmin
      titulo={tipo === 'eventos' ? 'Detalhes do evento' : tipo === 'usuarios' ? 'Detalhes do usuário' : tipo === 'cotacoes' ? 'Detalhes da cotação' : 'Detalhes da proposta'}
      aoFechar={fecharModal}>
      {tipo === 'eventos' ? <div className="peaPainel">
        <h3>
          {selecionado.nome}
        </h3>
        <EstadoAdmin estado={selecionado.status} />
        <MidiaEvento eventoId={selecionado.id} />
        <ResumoEventoAdmin evento={selecionado} />
        <button className="admAcao" onClick={() => aoAbrirPainel(selecionado.id)}>Abrir painel do evento</button>
      </div> : tipo === 'usuarios' ? <>
        <div className="admAvatar" aria-hidden="true">
          {selecionado.nome?.slice(0, 1).toLocaleUpperCase('pt-BR')}
        </div>
        <h3>
          {selecionado.nome}
        </h3>
        <BadgeAdmin valor={selecionado.perfil} perfil />
        <dl className="admDados">
          <div>
            <dt>Identificador</dt>
            <dd>#{selecionado.id}
            </dd>
          </div>
          <div>
            <dt>E-mail</dt>
            <dd>
              {selecionado.email}
            </dd>
          </div>
        </dl>
        <p className="admNota">Consulta de dados cadastrais. Alterações de usuários não estão disponíveis nesta seção.</p>
      </> : tipo === 'cotacoes' ? <DetalhesCotacaoAdmin
        key={selecionado.id}
        id={selecionado.id}
        aoAbrirPainel={aoAbrirPainel}
        aoSair={aoSair} /> : <>
        <div className="admDetalhesTopo">
          <BadgeAdmin valor={selecionado.status} />
          <strong className="admPropostaValor">
            {moedaPainel(selecionado.valor)}
          </strong>
        </div>
        <p className="admNota">Valor proposto, não representa pagamento realizado.</p>
        <dl className="admDados">
          <div>
            <dt>Evento</dt>
            <dd>
              {selecionado.evento_nome}
            </dd>
          </div>
          <div>
            <dt>Fornecedor</dt>
            <dd>
              {selecionado.fornecedor_nome}
            </dd>
          </div>
          <div>
            <dt>Condições de pagamento propostas</dt>
            <dd>
              {selecionado.condicoes_pagamento || 'Não informadas'}
            </dd>
          </div>
          <div>
            <dt>Detalhes técnicos</dt>
            <dd>
              {selecionado.detalhes_tecnicos || 'Não informados'}
            </dd>
          </div>
        </dl>
        <div className="admAcoes">
          <button className="admAcao" onClick={() => aoAbrirCotacao(selecionado.cotacao_id)}>Ver cotação #{selecionado.cotacao_id}
          </button>
          <button
            className="admAcao admAcao--secundaria"
            onClick={() => aoAbrirPainel(selecionado.evento_id)}>Ver painel do evento</button>
        </div>
      </>}
    </ModalAdmin>}
  </section>
}
