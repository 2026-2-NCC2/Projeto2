import { useConsultaAdmin } from '../../hooks/useConsultaAdmin.js'
import { SkeletonAdmin, ErroAdmin } from './AdminUI.jsx'
import { Icone } from '../ui/Icone.jsx'
import './AdminVisaoGeral.css'

export function AdminVisaoGeral({ aoNavegar, aoSair }) {
  const solicitacoes = useConsultaAdmin('/solicitacoes-acesso')
  const eventos = useConsultaAdmin('/admin/eventos')
  const usuarios = useConsultaAdmin('/usuarios')
  const recursos = [solicitacoes, eventos, usuarios]
  const acesso = recursos.find(r => r.erro?.status === 401 || r.erro?.status === 403)
  const carregando = recursos.some(r => r.carregando)
  function atualizar() { recursos.forEach(r => r.recarregar()) }
  const indicadores = [
    { titulo: 'Solicitações pendentes', icone: 'acesso', consulta: solicitacoes,
      valor: solicitacoes.dados.filter(s => s.status === 'pendente').length,
      descricao: 'Pedidos de acesso que aguardam análise.', destino: 'contas' },
    { titulo: 'Eventos cadastrados', icone: 'eventos', consulta: eventos,
      valor: eventos.dados.length, descricao: 'Todos os estados de evento.', destino: 'eventos' },
    { titulo: 'Usuários cadastrados', icone: 'perfil', consulta: usuarios,
      valor: usuarios.dados.length, descricao: 'Contas de todos os perfis.', destino: 'usuarios' },
  ]
  return <section className="admPagina admVisaoGeral" aria-labelledby="adm-inicio-titulo">
    <h1 className="admSrOnly" id="adm-inicio-titulo">Visão geral</h1>
    <div className="admResumoApresentacao">
      <div>
        <p>Acompanhe os cadastros e os pedidos de acesso do TrocaTicket.</p></div>
      <button type="button" className="admAcao" onClick={atualizar} disabled={carregando}>Atualizar resumo</button>
    </div>
    {acesso ? <ErroAdmin erro={acesso.erro} aoAtualizar={atualizar} aoSair={aoSair} /> : <>
      <div className="admResumoGrade">
        {indicadores.map(({ titulo, icone, consulta, valor, descricao, destino }) => <article className="admResumoCartao" key={destino} aria-label={titulo}>
          <div className="admResumoTitulo"><h2>{titulo}</h2><Icone nome={icone} /></div>
          {consulta.carregando ? <SkeletonAdmin rotulo={`Carregando ${titulo.toLowerCase()}`} /> : consulta.erro ?
            <ErroAdmin erro={consulta.erro} aoAtualizar={consulta.recarregar} aoSair={aoSair} /> : <>
              <p className="admResumoValor">{valor.toLocaleString('pt-BR')}</p>
              <p>{descricao}</p>
              {consulta.dados.length === 0 && <p className="admNota">Nenhum registro cadastrado.</p>}
              {destino === 'contas' && consulta.dados.length > 0 && valor === 0 && <p className="admNota">Nenhuma solicitação pendente.</p>}
              <button type="button" className="admAcao admAcao--secundaria admResumoConsultar" onClick={() => aoNavegar(destino)}>Consultar {destino === 'contas' ? 'solicitações' : destino}</button>
            </>}
        </article>)}
      </div>
      <section className="admResumoAcompanhamento" aria-labelledby="adm-acompanhamento-titulo">
        <div><h2 id="adm-acompanhamento-titulo">Cotações e propostas</h2>
          <p>Acompanhe as demandas dos eventos e as ofertas dos fornecedores.</p></div>
        <nav className="admResumoAtalhos" aria-label="Atalhos administrativos">
          {[
            ['cotacoes', 'Cotações', 'documento'], ['propostas', 'Propostas', 'ticket'],
          ].map(([destino, rotulo, icone]) => <button type="button" className="admAcao admAcao--secundaria" key={destino} onClick={() => aoNavegar(destino)}><Icone nome={icone} />{rotulo}</button>)}
        </nav>
      </section>
      <p className="admNota admResumoNota">Contagens das listas consultadas, sem filtro de período. As consultas são independentes; atualize o resumo após alterações.</p>
    </>}
  </section>
}
