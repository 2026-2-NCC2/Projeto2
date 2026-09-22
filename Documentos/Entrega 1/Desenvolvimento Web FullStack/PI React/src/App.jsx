import { useState } from 'react'
import './App.css'

function App() {
const [pagina, setPagina] = useState('login')

const eventos = [
{
nome: 'Festa Universitária',
status: 'Ativo',
data: '23/08/2026',
publico: '800',
cotacao: '100%',
ticket: 'R$ 45,00',
},
{
nome: 'Show Rock Night',
status: 'Em planejamento',
data: '30/09/2026',
publico: '1.200',
cotacao: '4/6',
ticket: 'R$ 85,00',
},
{
nome: 'Conferência Anual de Inovação & Tecnologia 2026',
status: 'Em planejamento',
data: '18/11/2026',
publico: '600',
cotacao: '100%',
ticket: 'R$ 75,00',
},
{
nome: 'Summit Corporativo Nexus',
status: 'Rascunho',
data: '10/12/2026',
publico: '350',
cotacao: '2/6',
ticket: 'A calcular',
},
]

function Menu() {
return (
<aside className="menu">
<div className="logo">▣ <span>TrocaTicket</span></div>

<button className="novo" onClick={() => setPagina('criar')}>
+ Novo evento
</button>

<nav>
<button onClick={() => setPagina('eventos')}>▦ Eventos</button>
<button onClick={() => setPagina('criar')}>▣ Cotações</button>
<button onClick={() => setPagina('ticket')}>◇ Propostas</button>
<button>▤ Fornecedores</button>
<button>▧ Relatórios</button>
</nav>

<div className="menuRodape">
<button>◉ Perfil</button>
<button onClick={() => setPagina('login')}>↪ Sair</button>
</div>
</aside>
)
}

function Cabecalho() {
return (
<header>
<div className="logo">▣ <span>TrocaTicket</span></div>
<div className="empresa">Gestão Corporativa</div>
<div className="usuario">
<strong>Roberto Albuquerque</strong>
<small>Organizador</small>
</div>
</header>
)
}

function Login() {
return (
<div className="loginPage">
<div className="loginHeader">
<div className="logo">▣ <span>TrocaTicket</span></div>
<span>🔒 Ambiente Seguro</span>
</div>

<main className="loginBox">
<span className="tag">● Acesso do Organizador</span>
<h1>Boas-vindas de volta!</h1>
<p>Acesse seu painel de gestão e cotações de eventos corporativos.</p>

<label>E-mail corporativo / Geral</label>
<input type="email" placeholder="seuemail@empresa.com" />

<div className="senhaLabel">
<label>Senha</label>
<a>Esqueci minha senha</a>
</div>
<input type="password" placeholder="••••••••" />

<label className="lembrar">
<input type="checkbox" /> Lembrar deste dispositivo
</label>

<button className="principal" onClick={() => setPagina('eventos')}>
ENTRAR →
</button>

<div className="divisor">ou continue com</div>
<button className="google">🌐 Google Workspace / SSO</button>

<p className="cadastro">
Ainda não tem uma conta de organizador? <b>Solicitar acesso</b>
</p>
</main>
</div>
)
}

function Layout({ children }) {
return (
<>
<Cabecalho />
<div className="layout">
<Menu />
<main className="conteudo">{children}</main>
</div>
</>
)
}

function Eventos() {
return (
<Layout>
<div className="tituloLinha">
<div>
<p className="breadcrumb">TrocaTicket › Gestão Corporativa › Meus Eventos</p>
<h1>Meus eventos: <small>4 eventos ativos</small></h1>
<p>Acompanhamento centralizado de cotações, orçamentos e preço sugerido.</p>
</div>

<button className="principal pequeno" onClick={() => setPagina('criar')}>
+ Novo Evento
</button>
</div>

<div className="filtros">
<input placeholder="🔍 Filtrar por nome do evento..." />
<button>Todos (4)</button>
<button>Ativos (1)</button>
<button>Em planejamento (2)</button>
</div>

<div className="listaEventos">
{eventos.map((evento, index) => (
<div className="evento" key={index}>
<div className="barra"></div>

<div className="eventoInfo">
<h2>{evento.nome}</h2>
<span className="status">{evento.status}</span>
<p>▣ {evento.data} &nbsp; ◉ São Paulo - SP</p>
</div>

<div className="numero">
<small>PREVISTOS</small>
<strong>{evento.publico}</strong>
</div>

<div className="numero">
<small>COTAÇÃO</small>
<strong>{evento.cotacao}</strong>
</div>

<div className="numero">
<small>TICKET SUGERIDO</small>
<strong>{evento.ticket}</strong>
</div>

<button className="seta" onClick={() => setPagina('criar')}>›</button>
</div>
))}
</div>
</Layout>
)
}

function CriarEvento() {
return (
<Layout>
<button className="voltar" onClick={() => setPagina('eventos')}>
← Voltar para Meus Eventos
</button>

<h1>CRIAR EVENTO</h1>
<p>Comece pelos dados básicos para criar o evento.</p>

<div className="etapas">
<b>1 &nbsp; Dados Básicos</b>
<span>2 &nbsp; Custos e Cotações</span>
<span>3 &nbsp; Ticket e Viabilidade</span>
</div>

<div className="formCard">
<label>Nome do evento</label>
<input defaultValue="Summit Corporativo de Inovação & Tecnologia 2026" />

<div className="duasColunas">
<div>
<label>Data do evento</label>
<input type="date" defaultValue="2026-11-18" />
</div>
<div>
<label>Horário de início</label>
<input type="time" defaultValue="09:00" />
</div>
</div>

<label>Local do evento</label>
<input defaultValue="Centro de Convenções Rebouças - São Paulo - SP" />

<label>Categoria do evento</label>
<div className="categorias">
<button className="selecionado">Corporativo</button>
<button>Confraternização</button>
<button>Workshop</button>
<button>Social</button>
</div>

<label>Descrição do evento e escopo previsto</label>
<textarea
rows="5"
defaultValue="Evento corporativo focado em inovação, tecnologia e integração entre equipes."
/>

<div className="acoes">
<button className="secundario" onClick={() => setPagina('eventos')}>
Cancelar
</button>
<button className="principal" onClick={() => setPagina('custos')}>
Salvar para Custos & Cotações →
</button>
</div>
</div>
</Layout>
)
}

function Custos() {
const custos = [
['Áudio & Som', 'Som / PA Principal', 'R$ 8.000,00'],
['Iluminação & Vídeo', 'Painel de LED e Iluminação Cênica', 'R$ 12.000,00'],
['Estrutura & Palco', 'Montagem de Palco & Cenografia', 'R$ 4.500,00'],
['Segurança & Brigada', 'Equipe de Segurança e Credenciamento', 'R$ 3.500,00'],
['Limpeza & Facilities', 'Equipe de Limpeza & Conservação', 'R$ 2.000,00'],
]

return (
<Layout>
<button className="voltar" onClick={() => setPagina('criar')}>← Voltar</button>

<h1>ITENS DE CUSTO</h1>
<p>Defina os itens necessários para seu evento.</p>

<div className="resumoCategorias">
<div>🔊 Áudio & Som<br /><b>R$ 8.000,00</b></div>
<div>💡 Iluminação<br /><b>R$ 12.000,00</b></div>
<div>🏗 Estrutura<br /><b>R$ 4.500,00</b></div>
<div>🛡 Segurança<br /><b>R$ 3.500,00</b></div>
<div>🧹 Facilities<br /><b>R$ 2.000,00</b></div>
</div>

<div className="tabela">
<div className="tabelaCabecalho">
<span>Categoria</span>
<span>Descrição</span>
<span>Custo estimado</span>
</div>

{custos.map((item, i) => (
<div className="tabelaLinha" key={i}>
<span>{item[0]}</span>
<span>{item[1]}</span>
<strong>{item[2]}</strong>
</div>
))}
</div>

<div className="total">
<span>Total estimado</span>
<strong>R$ 30.000,00</strong>
</div>

<div className="acoes">
<button className="secundario" onClick={() => setPagina('criar')}>Voltar</button>
<button className="principal" onClick={() => setPagina('cotacao')}>
Revisar e avançar para Cotação →
</button>
</div>
</Layout>
)
}

function Cotacao() {
return (
<Layout>
<button className="voltar" onClick={() => setPagina('custos')}>← Voltar para Itens de Custo</button>

<h1>PUBLICAR COTAÇÃO</h1>
<p>Revise o resumo dos itens e configure o prazo para fornecedores.</p>

<div className="gridCotacao">
<div className="formCard">
<h2>▣ Resumo da Cotação & Evento</h2>
<h3>Summit Corporativo de Inovação & Tecnologia 2026</h3>
<p>18/11/2026 às 09:00</p>

<div className="miniItem"><span>Áudio & Som</span><b>R$ 8.000,00</b></div>
<div className="miniItem"><span>Iluminação & Vídeo</span><b>R$ 12.000,00</b></div>
<div className="miniItem"><span>Estrutura & Palco</span><b>R$ 4.500,00</b></div>
<div className="miniItem"><span>Segurança</span><b>R$ 3.500,00</b></div>
<div className="miniItem"><span>Facilities</span><b>R$ 2.000,00</b></div>

<div className="total">
<span>Total estimado</span>
<strong>R$ 30.000,00</strong>
</div>
</div>

<div className="formCard">
<h2>Parâmetros & Prazo da Concorrência</h2>

<label>Prazo para envio de propostas</label>
<input type="date" defaultValue="2026-10-18" />

<label>Modalidade da cotação</label>
<div className="opcaoSelecionada">
◉ Cotação Fechada
<small>Melhor preço e condições comerciais.</small>
</div>

<label>Observações para os fornecedores</label>
<textarea rows="5" defaultValue="Apresentar proposta comercial completa, incluindo impostos e condições de pagamento." />

<button className="principal" onClick={() => setPagina('ticket')}>
Publicar Cotação →
</button>
</div>
</div>
</Layout>
)
}

function Ticket() {
return (
<Layout>
<button className="voltar" onClick={() => setPagina('cotacao')}>← Voltar às Propostas</button>

<div className="tituloLinha">
<div>
<h1>TICKET ESTIMADO</h1>
<p>Com base nas propostas selecionadas para o evento.</p>
</div>
<span className="status">● Cotações suficientes recebidas</span>
</div>

<div className="ticketGrid">
<div className="ticketCard">
<span className="tag">TICKET SUGERIDO POR PARTICIPANTE</span>
<div className="preco">R$ <strong>75,00</strong></div>
<p>Preço recomendado considerando custos, margem e quantidade prevista.</p>

<hr />

<div className="miniItem"><span>Custo total selecionado</span><b>R$ 27.750,00</b></div>
<div className="miniItem"><span>Quantidade de participantes</span><b>600</b></div>
<div className="miniItem"><span>Margem operacional</span><b>R$ 17.250,00</b></div>
</div>

<div className="ticketCard">
<h2>Composição e Detalhamento de Custos</h2>

<div className="barraCusto">
<span></span><span></span><span></span>
</div>

<h3>Principais custos</h3>
<div className="miniItem"><span>Áudio, Som e Estrutura</span><b>R$ 12.000,00</b></div>
<div className="miniItem"><span>Iluminação e Cenário</span><b>R$ 8.500,00</b></div>
<div className="miniItem"><span>Segurança e Operação</span><b>R$ 7.250,00</b></div>

<button className="principal" onClick={() => setPagina('eventos')}>
Finalizar planejamento →
</button>
</div>
</div>
</Layout>
)
}

if (pagina === 'login') return <Login />
if (pagina === 'eventos') return <Eventos />
if (pagina === 'criar') return <CriarEvento />
if (pagina === 'custos') return <Custos />
if (pagina === 'cotacao') return <Cotacao />
if (pagina === 'ticket') return <Ticket />

return <Login />
}

export default App