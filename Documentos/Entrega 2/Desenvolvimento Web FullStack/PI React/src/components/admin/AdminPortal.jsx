import { Marca } from '../ui/Marca.jsx'
import { useConsultaAdmin } from '../../hooks/useConsultaAdmin.js'
import { AdminCatalogo } from './AdminCatalogos.jsx'
import { AdminSolicitacoes } from './AdminSolicitacoes.jsx'
import './AdminPaginas.css'
import './AdminLayout.css'
import { PerfilPessoal } from '../perfil/PerfilPessoal.jsx'
import { Icone } from '../ui/Icone.jsx'
import { IdentidadeConta } from '../layout/IdentidadeConta.jsx'
import { useEffect, useRef, useState } from 'react'
import { NavegacaoRecolhivel } from '../layout/NavegacaoRecolhivel.jsx'
import { PainelEventoAdmin } from './PainelEventoAdmin.jsx'
import { AdminVisaoGeral } from './AdminVisaoGeral.jsx'
import { AdminNovoEvento } from './AdminNovoEvento.jsx'
import { capacidadesAdminEventos } from '../../services/adminEventos.js'
import { AdminRelatorios } from './AdminRelatorios.jsx'

const titulosSecoes = {
  inicio: 'Visão geral',
  relatorios: 'Relatórios',
  'novo-evento': 'Novo evento',
  painel: 'Painel de evento', eventos: 'Eventos', usuarios: 'Usuários',
  cotacoes: 'Cotações', propostas: 'Propostas', contas: 'Solicitações de acesso', perfil: 'Meu perfil',
}

export function AdminTopo({ secao, aoAbrirPerfil }) {
  return (
    <header className="adminTopo">
      <div className="adminContexto">
        <p className="adminSobretitulo">Portal do administrador</p>
        <p className="adminTituloSecao" id="admin-titulo-secao">{titulosSecoes[secao] || 'Administração'}</p>
      </div>
      <button type="button" className="adminUsuario" aria-label="Abrir meu perfil de administrador" onClick={aoAbrirPerfil}>
        <Icone nome="perfil" /><IdentidadeConta />
      </button>
    </header>
  )
}

export function AdminMenu({ secao, setSecao, aoSair, criacaoDisponivel = false }) {
  const itens = [
    ['inicio', 'eventos', 'Visão geral'],
    ['painel', 'custos', 'Painel de evento'],
    ['eventos', 'eventos', 'Eventos'],
    ['usuarios', 'perfil', 'Usuários'],
    ['cotacoes', 'documento', 'Cotações'],
    ['propostas', 'ticket', 'Propostas'],
    ['contas', 'acesso', 'Solicitações de acesso'],
    ['relatorios', 'documento', 'Relatórios'],
  ]
  return (
    <aside className="adminMenu" aria-label="Navegação administrativa">
      <button className="adminNovo" disabled={!criacaoDisponivel} title={criacaoDisponivel ? 'Criar evento para um organizador' : 'Funcionalidade indisponível'}
        aria-current={criacaoDisponivel && secao === 'novo-evento' ? 'page' : undefined}
        onClick={criacaoDisponivel ? () => setSecao('novo-evento') : undefined}>
        <Icone nome="adicionar" />{criacaoDisponivel ? 'Novo evento' : 'Novo evento (indisponível)'}
      </button>
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
  return <PainelEventoAdmin eventos={consulta.dados} carregando={consulta.carregando} erro={consulta.erro} aoAtualizar={consulta.recarregar} eventoId={eventoId} aoSelecionar={aoSelecionar} aoSair={aoSair} />
}

function DisponibilidadeCriacaoAdmin({ aoAlterar }) {
  useEffect(() => {
    let ativo = true
    capacidadesAdminEventos().then(c => { if (ativo) aoAlterar(c.criar) }).catch(() => { if (ativo) aoAlterar(false) })
    return () => { ativo = false }
  }, [aoAlterar])
  return null
}

export function AdminPortal({ aoSair, navegacao }) {
  const [secaoLocal, setSecao] = useState('inicio')
  const [eventoLocal, setEventoLocal] = useState(null)
  const [cotacaoLocal, setCotacaoId] = useState(null)
  const [criacaoDisponivel, setCriacaoDisponivel] = useState(false)
  const [criado, setCriado] = useState(null)
  const secao = navegacao ? navegacao.estado.secao : secaoLocal
  const eventoId = navegacao ? navegacao.estado.eventoId : eventoLocal
  const cotacaoId = navegacao ? navegacao.estado.cotacaoId : cotacaoLocal
  const conteudoRef = useRef(null)
  const secaoAnteriorRef = useRef(secao)
  const fechamentoCotacaoRef = useRef(false)
  useEffect(() => {
    // Consultas e montagem inicial não devem deslocar o foco do usuário.
    if (secaoAnteriorRef.current === secao) return
    secaoAnteriorRef.current = secao
    conteudoRef.current?.focus()
  }, [secao])
  useEffect(() => {
    if (fechamentoCotacaoRef.current && cotacaoId === null) {
      fechamentoCotacaoRef.current = false
      conteudoRef.current?.focus()
    }
  }, [cotacaoId])
  function setEventoId(id) {
    setEventoLocal(id)
    if (navegacao) navegacao.mudar({ secao: 'painel', eventoId: id, cotacaoId: null })
  }
  function navegar(destino) {
    if (navegacao) navegacao.mudar({ secao: destino, eventoId: destino === 'painel' ? eventoLocal : null, cotacaoId: null })
    else { setCotacaoId(null); setSecao(destino) }
  }
  function abrirPainel(id) { setEventoId(id); if (!navegacao) setSecao('painel') }
  function abrirCotacao(id) {
    if (navegacao) navegacao.mudar({ secao: 'cotacoes', eventoId: null, cotacaoId: id })
    else { setCotacaoId(id); setSecao('cotacoes') }
  }
  function fecharCotacao() {
    if (!cotacaoId) return
    fechamentoCotacaoRef.current = true
    setCotacaoId(null)
    if (navegacao) navegacao.mudar({ secao: 'cotacoes', eventoId: null, cotacaoId: null }, true)
  }
  let conteudo
  if (secao === 'inicio') conteudo = <AdminVisaoGeral aoNavegar={navegar} aoSair={aoSair} />
  else if (secao === 'relatorios') conteudo = <AdminRelatorios aoSair={aoSair} />
  else if (secao === 'novo-evento') conteudo = <AdminNovoEvento aoCancelar={() => navegar('eventos')} aoSair={aoSair} aoCriar={id => { setCriado(id); abrirPainel(id) }} />
  else if (secao === 'painel') conteudo = <PaginaPainelAdmin eventoId={eventoId} aoSelecionar={setEventoId} aoSair={aoSair} />
  else if (secao === 'perfil') conteudo = <PerfilPessoal contexto="Administração" aoSair={aoSair} />
  else if (secao === 'contas') conteudo = <AdminSolicitacoes aoSair={aoSair} />
  else if (['eventos', 'usuarios', 'cotacoes', 'propostas'].includes(secao)) conteudo = <AdminCatalogo key={secao + '-' + (cotacaoId || 'lista')} tipo={secao} cotacaoInicial={cotacaoId} aoFecharCotacao={fecharCotacao} aoAbrirPainel={abrirPainel} aoAbrirCotacao={abrirCotacao} aoSair={aoSair} />
  else conteudo = <p role="status">Funcionalidade em desenvolvimento.</p>
  return <div className={`adminApp adminLayout${secao === 'inicio' ? ' adminLayout--inicio' : ''}`}>
    <DisponibilidadeCriacaoAdmin aoAlterar={setCriacaoDisponivel} />
    <a className="adminPular" href="#admin-conteudo" onClick={evento => {
      evento.preventDefault()
      conteudoRef.current?.focus()
    }}>Ir para o conteúdo</a>
    <div className="adminSidebar">
      <div className="adminMarcaLateral"><Marca /><small>PORTAL DO ADMINISTRADOR</small></div>
      <NavegacaoRecolhivel id="menu-administrador" rotulo="Menu do administrador" className="adminNavegacao">
        <AdminMenu secao={secao} setSecao={navegar} aoSair={aoSair} criacaoDisponivel={criacaoDisponivel} />
      </NavegacaoRecolhivel>
    </div>
    <AdminTopo secao={secao} aoAbrirPerfil={() => navegar('perfil')} />
    <main className="adminConteudo" id="admin-conteudo" ref={conteudoRef} tabIndex={-1} aria-labelledby="admin-titulo-secao">
      {secao === 'painel' && criado === eventoId && <p role="status">Evento #{criado} criado para o organizador responsável.</p>}
      {conteudo}
    </main>
  </div>
}
