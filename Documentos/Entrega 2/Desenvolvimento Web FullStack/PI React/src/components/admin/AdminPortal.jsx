import { Marca } from '../ui/Marca.jsx'
import { useConsultaAdmin } from '../../hooks/useConsultaAdmin.js'
import { AdminCatalogo } from './AdminCatalogos.jsx'
import { AdminSolicitacoes } from './AdminSolicitacoes.jsx'
import './AdminPaginas.css'
import { PerfilPessoal } from '../perfil/PerfilPessoal.jsx'
import { Icone } from '../ui/Icone.jsx'
import { IdentidadeConta } from '../layout/IdentidadeConta.jsx'
import { useState } from 'react'
import { NavegacaoRecolhivel } from '../layout/NavegacaoRecolhivel.jsx'
import { PainelEventoAdmin } from './PainelEventoAdmin.jsx'

export function AdminTopo({ aoSair }) {
  return (
    <header className="adminTopo">
      <div className="adminMarca marcaAdmin"><Marca compacto /><small>Gestão Corporativa</small></div>
      <div className="adminSeguro">Administração</div>
      <label className="adminBusca"><Icone nome="busca" tamanho={16} /><input aria-label="Busca geral indisponível" placeholder="Busca geral indisponível" disabled /></label>
      <button className="adminIcone" aria-label="Notificações indisponíveis" title="Notificações indisponíveis" disabled>●</button>
      <button className="adminUsuario" aria-label="Sair da conta de administrador" onClick={aoSair}><Icone nome="perfil" /><IdentidadeConta /></button>
    </header>
  )
}

export function AdminMenu({ secao, setSecao, aoSair }) {
  const itens = [
    ['painel', 'custos', 'Painel de evento'],
    ['eventos', 'eventos', 'Eventos'],
    ['usuarios', 'perfil', 'Usuários'],
    ['cotacoes', 'documento', 'Cotações'],
    ['propostas', 'ticket', 'Propostas'],
    ['contas', 'acesso', 'Solicitações de acesso'],
    ['relatorios', 'documento', 'Relatórios', true],
  ]
  return (
    <aside className="adminMenu" aria-label="Navegação administrativa">
      <button className="adminNovo" disabled title="Funcionalidade indisponível">⊕ &nbsp; + Novo evento (indisponível)</button>
      <nav aria-label="Seções administrativas">{itens.map(([id, icone, texto, indisponivel]) => <button key={id} disabled={indisponivel} title={indisponivel ? 'Funcionalidade em desenvolvimento' : undefined} aria-current={!indisponivel && secao === id ? 'page' : undefined} className={!indisponivel && secao === id ? 'ativo' : ''} onClick={indisponivel ? undefined : () => setSecao(id)}><Icone nome={icone} />{texto}{indisponivel && <small className="adminEmDesenvolvimento">Em desenvolvimento</small>}</button>)}</nav>
      <div className="adminAuditoria"><strong>ADMINISTRAÇÃO</strong><p>Consulte eventos, usuários, cotações e propostas. Analise solicitações de acesso.</p></div>
      <div className="adminMenuRodape"><button type="button" aria-current={secao === 'perfil' ? 'page' : undefined} className={secao === 'perfil' ? 'ativo' : ''} onClick={() => setSecao('perfil')}><Icone nome="perfil" />Meu perfil</button><button className="sair" onClick={aoSair}><Icone nome="sair" /> Sair</button></div>
    </aside>
  )
}

export function CartaoMetrica({ titulo, valor, texto, tom = 'roxo' }) {
  return <article className={`adminMetrica ${tom}`}><div><small>{titulo}</small><Icone nome="custos" /></div><strong>{valor}</strong><p>{texto}</p></article>
}

function PaginaPainelAdmin({ eventoId, aoSelecionar, aoSair }) {
  const consulta = useConsultaAdmin('/admin/eventos')
  return <PainelEventoAdmin eventos={consulta.dados} carregando={consulta.carregando} erro={consulta.erro?.message || ''} eventoId={eventoId} aoSelecionar={aoSelecionar} aoSair={aoSair} />
}

export function AdminPortal({ aoSair }) {
  const [secao, setSecao] = useState('contas')
  const [eventoId, setEventoId] = useState(null)
  const [cotacaoId, setCotacaoId] = useState(null)
  function navegar(destino) { setCotacaoId(null); setSecao(destino) }
  function abrirPainel(id) { setEventoId(id); setSecao('painel') }
  function abrirCotacao(id) { setCotacaoId(id); setSecao('cotacoes') }
  let conteudo
  if (secao === 'painel') conteudo = <PaginaPainelAdmin eventoId={eventoId} aoSelecionar={setEventoId} aoSair={aoSair} />
  else if (secao === 'perfil') conteudo = <PerfilPessoal contexto="Administração" />
  else if (secao === 'contas') conteudo = <AdminSolicitacoes aoSair={aoSair} />
  else if (['eventos', 'usuarios', 'cotacoes', 'propostas'].includes(secao)) conteudo = <AdminCatalogo key={secao + '-' + (cotacaoId || 'lista')} tipo={secao} cotacaoInicial={cotacaoId} aoAbrirPainel={abrirPainel} aoAbrirCotacao={abrirCotacao} aoSair={aoSair} />
  else conteudo = <p role="status">Funcionalidade em desenvolvimento.</p>
  return <div className="adminApp"><AdminTopo aoSair={aoSair} /><div className="adminEstrutura"><NavegacaoRecolhivel id="menu-administrador" rotulo="Menu do administrador" className="adminNavegacao"><AdminMenu secao={secao} setSecao={navegar} aoSair={aoSair} /></NavegacaoRecolhivel><main className="adminConteudo">{conteudo}</main></div></div>
}
