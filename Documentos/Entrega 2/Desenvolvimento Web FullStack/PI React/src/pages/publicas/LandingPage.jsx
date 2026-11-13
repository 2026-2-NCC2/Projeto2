import { Marca } from '../../components/ui/Marca.jsx'
import { Icone } from '../../components/ui/Icone.jsx'
import { Botao } from '../../components/ui/Primitivas.jsx'
import { LinksTransparencia } from './Transparencia.jsx'
import './LandingPage.css'

const perfis = [
  { nome: 'Participante', icone: 'ticket', resumo: 'Encontre seu próximo encontro.',
    texto: 'Explore eventos, consulte os detalhes e faça sua inscrição quando disponível. Acompanhe suas próprias inscrições no portal.' },
  { nome: 'Organizador', icone: 'eventos', resumo: 'Dê espaço às suas ideias.',
    texto: 'Organize os dados dos eventos, planeje custos e acompanhe cotações e propostas em um portal dedicado.' },
  { nome: 'Fornecedor', icone: 'documento', resumo: 'Conecte serviços a eventos.',
    texto: 'Consulte as cotações disponíveis, veja os itens solicitados e acompanhe as propostas enviadas pelo seu perfil.' },
]

// O acesso é fornecido pela entrada; não cria URLs ou mecanismos de autenticação.
export function LandingPage({ aoAcessar }) {
  return <div className="lpPagina">
    <a className="lpPular" href="#lp-conteudo">Ir para o conteúdo</a>
    <header className="lpCabecalho">
      <div className="lpCabecalhoInterno">
        <a className="lpMarca" href="#lp-inicio" aria-label="TrocaTicket — início da apresentação"><Marca /></a>
        <nav className="lpNavegacao" aria-label="Seções da apresentação">
          <a href="#lp-como-funciona">Como funciona</a>
          <a href="#lp-beneficios">Benefícios</a>
          <a href="#lp-projeto">Sobre o TrocaTicket</a>
        </nav>
        {aoAcessar ? <Botao className="lpAcessar" data-acesso-sistema onClick={aoAcessar}>Acessar sistema</Botao> :
          <p className="lpAcessoFuturo">Acessar sistema<span>Integração futura</span></p>}
      </div>
    </header>

    <main id="lp-conteudo" tabIndex={-1}>
      <section className="lpHero lpLimite" id="lp-inicio" tabIndex={-1} aria-labelledby="lp-titulo">
        <div className="lpHeroTexto">
          <p className="lpSobretitulo">TROCATICKET · CONEXÕES PARA EVENTOS</p>
          <h1 id="lp-titulo">Boas conexões.<br /><span>Grandes encontros.</span></h1>
          <p className="lpIntroducao">Explore eventos, dê forma ao seu planejamento e encontre oportunidades. Participantes, organizadores e fornecedores conectados em um só lugar.</p>
          <div className="lpHeroAcoes">
            {aoAcessar ? <Botao className="lpHeroAcessar" onClick={aoAcessar}>Entrar no TrocaTicket <Icone nome="sair" tamanho={18} /></Botao> :
              <a className="lpLinkDestaque" href="#lp-como-funciona">Conheça os três perfis <Icone nome="adicionar" tamanho={18} /></a>}
            <a className="lpLinkSecundario" href="#lp-como-funciona">Descubra como funciona</a>
          </div>
          <ul className="lpHeroRecursos" aria-label="Recursos da plataforma">
            <li><Icone nome="eventos" tamanho={18} /> Eventos e inscrições</li>
            <li><Icone nome="custos" tamanho={18} /> Planejamento de custos</li>
            <li><Icone nome="documento" tamanho={18} /> Cotações e propostas</li>
          </ul>
          <p className="lpNota">O cadastro permanece bloqueado enquanto os Termos de Uso estão em minuta.</p>
        </div>
        <div className="lpComposicao" aria-hidden="true">
          <div className="lpOrbita" />
          <div className="lpPoster">
            <span className="lpPosterRotulo">DO PLANEJAMENTO AO ENCONTRO</span>
            <Icone nome="ticket" tamanho={88} />
            <strong>Mais clareza.<br />Mais conexões.</strong>
            <div className="lpEtapasVisuais"><span>Explore eventos</span><span>Organize ideias</span><span>Conecte serviços</span></div>
            <span className="lpPosterRodape">TrocaTicket <span>Feito para organizar</span></span>
          </div>
          <div className="lpSelo"><Icone nome="eventos" tamanho={24} /><span>Do planejamento<br /><strong>ao encontro.</strong></span></div>
        </div>
      </section>

      <section className="lpSecao lpComo" id="lp-como-funciona" tabIndex={-1} aria-labelledby="lp-como-titulo">
        <div className="lpLimite">
          <div className="lpTituloSecao"><p className="lpSobretitulo">COMO FUNCIONA</p><h2 id="lp-como-titulo">Três perfis. Um mesmo encontro.</h2>
            <p>Cada perfil tem seu espaço, com informações e ações próprias.</p></div>
          <div className="lpPerfis">{perfis.map(perfil => <article className="lpCard" key={perfil.nome}>
            <span className="lpIcone"><Icone nome={perfil.icone} tamanho={28} /></span>
            <h3>{perfil.nome}</h3><p className="lpCardResumo">{perfil.resumo}</p><p>{perfil.texto}</p>
          </article>)}</div>
        </div>
      </section>

      <section className="lpSecao lpLimite lpBeneficios" id="lp-beneficios" tabIndex={-1} aria-labelledby="lp-beneficios-titulo">
        <div className="lpTituloSecao"><p className="lpSobretitulo">MENOS DISPERSÃO, MAIS CLAREZA</p><h2 id="lp-beneficios-titulo">As informações certas, em cada etapa.</h2>
          <p>Da descoberta ao planejamento, acompanhe o que importa para o seu perfil.</p></div>
        <div className="lpBeneficiosGrade">
          <article className="lpBeneficio"><span className="lpIcone"><Icone nome="busca" tamanho={26} /></span><div><h3>Explore com contexto</h3><p>Consulte data, local e disponibilidade dos eventos antes de se inscrever.</p></div></article>
          <article className="lpBeneficio"><span className="lpIcone"><Icone nome="ticket" tamanho={26} /></span><div><h3>Acompanhe suas inscrições</h3><p>Veja os eventos em que se inscreveu e o estado das suas inscrições.</p></div></article>
          <article className="lpBeneficio"><span className="lpIcone"><Icone nome="custos" tamanho={26} /></span><div><h3>Organize o planejamento</h3><p>Reúna informações dos eventos, estimativas de custos, cotações e propostas.</p></div></article>
          <article className="lpBeneficio"><span className="lpIcone"><Icone nome="perfil" tamanho={26} /></span><div><h3>Cada perfil, seu espaço</h3><p>Participantes, organizadores e fornecedores acessam os fluxos correspondentes às suas permissões.</p></div></article>
        </div>
      </section>

      <section className="lpSecao lpProjeto" id="lp-projeto" tabIndex={-1} aria-labelledby="lp-projeto-titulo">
        <div className="lpLimite lpProjetoInterno">
          <div><p className="lpSobretitulo">UMA PLATAFORMA, DIFERENTES CONEXÕES</p><h2 id="lp-projeto-titulo">Sobre o TrocaTicket</h2></div>
          <div><p>O TrocaTicket é uma plataforma de eventos que reúne participantes, organizadores e fornecedores.</p>
            <p>Consulte eventos e inscrições, organize informações e estimativas de custos e acompanhe cotações e propostas nos portais correspondentes.</p>
            <p className="lpNota">A preparação para uso real ainda depende de decisões jurídicas e operacionais. Consulte as páginas de transparência e os avisos de revisão dos documentos.</p></div>
        </div>
      </section>
    </main>

    <footer className="lpRodape">
      <div className="lpLimite">
        <div className="lpRodapeTopo"><div><Marca compacto /><p>Plataforma de eventos</p></div>
          <nav className="lpNavegacao" aria-label="Navegação do rodapé"><a href="#lp-inicio">Início</a><a href="#lp-como-funciona">Como funciona</a><a href="#lp-projeto">Sobre o TrocaTicket</a></nav>
        </div>
        <div className="lpTransparencia"><p>Privacidade e transparência</p><LinksTransparencia /></div>
        <p className="lpNota">Política de Privacidade e Termos de Uso em revisão. Esta apresentação não declara conformidade com a LGPD.</p>
      </div>
    </footer>
  </div>
}
