import { Marca } from '../../components/ui/Marca.jsx'
import { Alerta } from '../../components/ui/Primitivas.jsx'
import { contatoPrivacidade } from '../../config/privacidade.js'
import { documentosTransparencia, documentoDaRota } from './documentosTransparencia.js'
import { tecnologiasNecessarias } from './inventarioPrivacidade.js'
import './Transparencia.css'

export function LinksTransparencia() {
  return <nav className="transparenciaLinks" aria-label="Privacidade e transparência">
    <a href="/privacidade">Política de Privacidade</a>
    <a href="/termos">Termos de Uso</a>
    <a href="/contato-privacidade">Contato de Privacidade</a>
    <a href="/preferencias-privacidade">Preferências de privacidade</a>
  </nav>
}

export function PaginaTransparencia({ documento }) {
  const conteudo = Object.hasOwn(documentosTransparencia, documento) ? documentosTransparencia[documento] : null
  const email = contatoPrivacidade()
  if (!conteudo) return null
  const minuta = documento !== 'termos' || conteudo.estado !== 'aprovado' || !conteudo.aprovacao
  return <div className="transparenciaPagina">
    <a className="transparenciaPular" href="#transparencia-conteudo">Ir para o conteúdo</a>
    <header className="transparenciaCabecalho">
      <a href="/" aria-label="TrocaTicket — página inicial"><Marca compacto /></a>
      <a href="/">Voltar à página inicial</a>
    </header>
    <main id="transparencia-conteudo" tabIndex={-1}>
      <p className="transparenciaSobretitulo">TRANSPARÊNCIA · {minuta ? 'MINUTA A.1' : `VERSÃO ${conteudo.versao}`}</p>
      <h1>{conteudo.titulo}</h1>
      <p className="transparenciaIntroducao">{conteudo.descricao}</p>
      {minuta ? <Alerta variante="aviso" titulo="Minuta pendente de aprovação">
        <p>Este conteúdo está em elaboração e não é um documento definitivo aprovado. Controlador, canal real de privacidade, bases legais e prazos de retenção ainda precisam de definição e revisão.</p>
        <p>Não há declaração de conformidade com a LGPD nem registro de aceite por esta página.</p>
      </Alerta> : <Alerta variante="informacao" titulo={`Termos de Uso — versão ${conteudo.versao}`}>
        <p>Versão identificada no documento desta aplicação. O cadastro confere a publicação e a integridade no backend antes de registrar o aceite contratual.</p>
      </Alerta>}
      <nav className="transparenciaSumario" aria-label="Nesta página">
        <h2>Nesta página</h2>
        <ul>{conteudo.secoes.map(s => <li key={s.id}><a href={`#${s.id}`}>{s.titulo}</a></li>)}</ul>
      </nav>
      <article aria-label={`Conteúdo ${minuta ? 'da minuta' : 'do documento'}: ${conteudo.titulo}`}>
        {conteudo.secoes.map(s => <section key={s.id} id={s.id} aria-labelledby={`${s.id}-titulo`}>
          <h2 id={`${s.id}-titulo`}>{s.titulo}</h2>
          {s.textos.map((texto, i) => <p key={i}>{texto}</p>)}
        </section>)}
      </article>
      {documento === 'contato-privacidade' && <section aria-labelledby="canal-titulo">
        <h2 id="canal-titulo">Canal de atendimento</h2>
        {email ? <p>Endereço configurado para contato: <a href={`mailto:${encodeURIComponent(email)}`}>{email}</a>. A definição dos responsáveis e o procedimento de atendimento ainda precisam de validação.</p> :
          <Alerta variante="informacao" titulo="Canal ainda não operacional">O e-mail institucional ainda não foi configurado. Não há endereço ou formulário para envio de solicitações nesta versão.</Alerta>}
      </section>}
    </main>
    <footer className="transparenciaRodape">
      <p>Consulte também as informações de privacidade e a situação de revisão de cada documento:</p><LinksTransparencia />
      <a href="/">Voltar à página inicial</a>
    </footer>
  </div>
}

export function PaginaPreferenciasPrivacidade() {
  return <div className="transparenciaPagina">
    <a className="transparenciaPular" href="#preferencias-conteudo">Ir para o conteúdo</a>
    <header className="transparenciaCabecalho">
      <a href="/" aria-label="TrocaTicket — página inicial"><Marca compacto /></a>
      <a href="/">Voltar à página inicial</a>
    </header>
    <main id="preferencias-conteudo" tabIndex={-1}>
      <p className="transparenciaSobretitulo">PRIVACIDADE · TECNOLOGIAS DA APLICAÇÃO</p>
      <h1>Preferências de privacidade</h1>
      <p className="transparenciaIntroducao">Conheça o armazenamento e os recursos utilizados nesta versão do TrocaTicket.</p>
      <Alerta variante="informacao" titulo="Não há tecnologias opcionais para escolher nesta versão">
        Não foram identificados cookies definidos pela aplicação, localStorage, analytics, pixels ou integrações de marketing no código auditado. Por isso, não há banner nem botões de aceite ou recusa sem efeito real.
      </Alerta>
      <section aria-labelledby="necessarias-titulo">
        <h2 id="necessarias-titulo">Necessárias ao funcionamento</h2>
        <p>Os recursos abaixo sustentam a sessão, a navegação e as funcionalidades solicitadas. Não são apresentados como uma escolha de consentimento. Esta página pública pode ser consultada sem login e não grava preferências.</p>
        <dl className="transparenciaInventario">
          {tecnologiasNecessarias.map(item => <div key={item.nome}>
            <dt>{item.nome}</dt>
            <dd><strong>Tecnologia:</strong> {item.tecnologia}</dd>
            <dd><strong>Finalidade:</strong> {item.finalidade}</dd>
            <dd><strong>Duração e remoção:</strong> {item.duracao}</dd>
          </div>)}
        </dl>
      </section>
      <section aria-labelledby="opcionais-titulo">
        <h2 id="opcionais-titulo">Estatísticas e marketing</h2>
        <p>Não há serviços dessas categorias integrados no código auditado. Não coletamos uma autorização fictícia, não salvamos um registro de consentimento e não há consentimento opcional a revogar nesta versão. O aceite dos Termos de Uso é separado de qualquer autorização para marketing.</p>
      </section>
      <section aria-labelledby="controle-titulo">
        <h2 id="controle-titulo">Como controlar o armazenamento</h2>
        <p>Para remover os dados de sessão, utilize a ação Sair do portal e confirme a saída quando solicitado. Você também pode gerenciar os dados do site pelas configurações do navegador; a remoção pode encerrar a sessão e apagar a página lembrada. Isso não exclui sua conta nem os dados mantidos no servidor.</p>
        <p>Não exibimos o conteúdo do token nem os dados do seu perfil nesta página. Solicitações sobre dados pessoais são explicadas no <a href="/contato-privacidade">Contato de Privacidade</a>; o canal real ainda precisa estar operacional antes do uso real da plataforma.</p>
      </section>
      <section aria-labelledby="limites-titulo">
        <h2 id="limites-titulo">Limites deste inventário e próximas revisões</h2>
        <p>Este inventário descreve o código da aplicação. Cookies, logs e outros recursos da hospedagem, proxy e prestadores precisam de verificação no ambiente de publicação. Requisições à API e ao serviço de imagens podem transmitir informações técnicas, como endereço IP, aos serviços responsáveis.</p>
        <p>Antes de adicionar tecnologias opcionais ou integrar uma Landing Page, será necessário revisar o inventário, as finalidades e os requisitos aplicáveis. Se houver consentimento opcional, a escolha deverá permitir recusa e revogação e impedir o carregamento dessas tecnologias antes de uma escolha válida.</p>
        <p>A Política de Privacidade e os Termos de Uso continuam em revisão. Esta página não declara conformidade com a LGPD nem aprova bases legais ou prazos de retenção.</p>
      </section>
    </main>
    <footer className="transparenciaRodape"><LinksTransparencia /><a href="/">Voltar à página inicial</a></footer>
  </div>
}

// Somente os documentos e as preferências são públicos; demais caminhos mantêm o App.
// Links nativos fazem navegação de documento, sem alterar o estado de autenticação.
export function EntradaAplicacao({ children, caminho = typeof window === 'undefined' ? '/' : window.location.pathname }) {
  if (caminho === '/preferencias-privacidade' || caminho === '/preferencias-privacidade/') return <PaginaPreferenciasPrivacidade />
  const documento = documentoDaRota(caminho)
  return documento ? <PaginaTransparencia documento={documento} /> : children
}
