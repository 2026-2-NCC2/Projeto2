import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement, useState } from 'react'
import { act } from 'react'
import { montarRouter, apiSintetica } from './helpers/routerDom.js'
import { useHistoricoNavegacao, usePaginaRoteada } from '../src/hooks/useNavegacao.js'

const sessao = perfil => ({ token: 'jwt-sintetico', perfil })
const texto = r => r.document.body.textContent
const botao = (r, texto) => [...r.document.querySelectorAll('button,a')].find(b => b.textContent.trim() === texto)

for (const [url, titulo] of [
  ['/#/desconhecida', 'Página não encontrada'], ['/#/admin?secao=desconhecida', 'Página não encontrada'],
  ['/#/participante?secao=errada', 'Página não encontrada'], ['/#/custos?evento=-1', 'Página não encontrada'],
  ['/#/admin?secao=perfil&cotacao=3', 'Página não encontrada'], ['/endereco-inexistente', 'Página não encontrada'],
]) test('404 real, sem redirecionar ou conteúdo protegido: ' + url, async () => {
  const r = await montarRouter({ url })
  try {
    assert.equal(r.document.querySelector('h1').textContent, titulo)
    assert.equal(r.document.activeElement, r.document.querySelector('h1'))
    assert.match(r.document.title, /Página não encontrada/)
    assert.equal(r.window.location.pathname + r.window.location.hash, url)
    assert.doesNotMatch(texto(r), /pessoa@example.invalid|Gerenciar perfis/)
  } finally { await r.close() }
})

test('404 autenticado mantém endereço e oferece portal sem expor identidade', async () => {
  const r = await montarRouter({ url: '/#/admin?secao=desconhecida', dados: sessao('admin'), fetch: apiSintetica('admin') })
  try { assert.match(texto(r), /Página não encontrada/); assert.equal(botao(r, 'Ir para meu portal').getAttribute('href'), '#/admin'); assert.doesNotMatch(texto(r), /Pessoa sintética/)
    await r.clicar(botao(r, 'Ir para meu portal')); assert.equal(r.window.location.hash, '#/admin'); assert.match(texto(r), /Visão geral/)
  } finally { await r.close() }
})

for (const perfil of ['participante', 'organizador', 'fornecedor', 'admin']) test('rota protegida de outro perfil mostra 403: ' + perfil, async () => {
  const url = perfil === 'admin' ? '/#/custos?evento=7' : '/#/admin?secao=usuarios'
  const r = await montarRouter({ url, dados: sessao(perfil), fetch: apiSintetica(perfil) })
  try { assert.match(texto(r), /Acesso não autorizado/); assert.doesNotMatch(texto(r), /Gerenciar perfis/); assert.equal(r.window.location.hash, url.slice(1)) }
  finally { await r.close() }
})

for (const expirada of [false, true]) test('URL protegida sem sessão válida apresenta login sem vazar painel: ' + expirada, async () => {
  const r = await montarRouter({ url: '/#/admin?secao=usuarios', dados: expirada ? sessao('admin') : {}, fetch: apiSintetica('admin', { expirada }) })
  try { assert.match(texto(r), /Acessar sua conta/); assert.doesNotMatch(texto(r), /Gerenciar perfis/); assert.equal(r.window.location.hash, '#/admin?secao=usuarios') }
  finally { await r.close() }
})

test('Landing → login → cadastro usa histórico real; Voltar/Avançar restaura', async () => {
  const r = await montarRouter()
  try {
    await r.navegar('/entrar'); assert.match(texto(r), /Acessar sua conta/)
    await r.clicar(botao(r, 'Criar conta')); assert.equal(r.window.location.hash, '#/cadastro')
    await r.back(); assert.equal(r.window.location.hash, '#/entrar'); assert.match(texto(r), /Acessar sua conta/)
    await r.back(); assert.match(texto(r), /TrocaTicket/); assert.equal(r.window.location.hash, '#/inicio')
    await r.forward(); assert.match(texto(r), /Acessar sua conta/)
  } finally { await r.close() }
})

test('CTA do hero abre o login pelo Router, mantém foco e volta à apresentação sem consultas', async () => {
  let consultas = 0
  const r = await montarRouter({ fetch: async () => { consultas++; throw Error('Não deve consultar') } })
  try {
    await r.clicar(r.document.querySelector('.lpHeroAcessar'))
    assert.equal(r.window.location.hash, '#/entrar')
    assert.equal(r.document.activeElement.id, 'login-email')
    assert.equal(r.document.querySelectorAll('h1').length, 1)
    await r.back()
    assert.equal(r.window.location.hash, '#/inicio')
    assert.ok(r.document.querySelector('.lpHeroAcessar'))
    assert.equal(consultas, 0)
  } finally { await r.close() }
})

test('erro de login foca o alerta real e permite mostrar senha sem repetir o POST', async () => {
  const chamadas = []
  const r = await montarRouter({ url: '/#/entrar', fetch: async (input, options) => {
    chamadas.push([input, options])
    return { ok: false, status: 401, json: async () => ({ erro: 'Credenciais inválidas' }) }
  } })
  try {
    await act(async () => { r.document.querySelector('form').dispatchEvent(new r.window.Event('submit', { bubbles: true, cancelable: true })) })
    await r.settle()
    const alerta = r.document.getElementById('login-feedback')
    assert.equal(r.document.activeElement, alerta)
    assert.match(alerta.textContent, /Não foi possível entrar.*Credenciais inválidas/)
    assert.equal(r.document.querySelector('form').getAttribute('aria-describedby'), 'login-feedback')
    await r.clicar(botao(r, 'Mostrar senha'))
    assert.equal(r.document.getElementById('login-senha').type, 'text')
    await r.clicar(botao(r, 'Ocultar senha'))
    assert.equal(r.document.getElementById('login-senha').type, 'password')
    assert.equal(chamadas.length, 1)
    assert.equal(r.window.location.hash, '#/entrar')
    assert.equal(r.window.sessionStorage.getItem('token'), null)
  } finally { await r.close() }
})

for (const [perfil, urls] of [
  ['participante', ['/participante?secao=perfil', '/participante?secao=ingressos', '/participante?secao=eventos']],
  ['admin', ['/admin?secao=usuarios', '/admin?secao=propostas', '/admin?secao=relatorios', '/admin?secao=cotacoes', '/admin?secao=eventos', '/admin?secao=painel', '/admin?secao=novo-evento']],
  ['fornecedor', ['/fornecedor-mural', '/fornecedor-enviadas', '/fornecedor-perfil', '/fornecedor-catalogo']],
  ['organizador', ['/eventos', '/criar?evento=7', '/custos?evento=7', '/cotacao?evento=7', '/ticket?evento=7', '/perfil']],
]) test('seções reais de ' + perfil + ': acesso direto, Voltar/Avançar e remontagem (F5)', async () => {
  let r = await montarRouter({ url: '/#' + urls[0], dados: sessao(perfil), fetch: apiSintetica(perfil) })
  try {
    assert.doesNotMatch(texto(r), /Página não encontrada|Acesso não autorizado|Validando sessão/)
    for (const url of urls.slice(1)) { await r.navegar(url); assert.equal(r.window.location.hash, '#' + url); assert.doesNotMatch(texto(r), /Página não encontrada|Acesso não autorizado|Validando sessão/) }
    await r.back(); assert.equal(r.window.location.hash, '#' + urls.at(-2))
    await r.forward(); assert.equal(r.window.location.hash, '#' + urls.at(-1))
    const hash = r.window.location.hash; await r.close(); r = await montarRouter({ url: '/' + hash, dados: sessao(perfil), fetch: apiSintetica(perfil) })
    assert.equal(r.window.location.hash, hash); assert.doesNotMatch(texto(r), /Página não encontrada|Acesso não autorizado|Validando sessão/)
  } finally { await r.close() }
})

test('A7 permanece bloqueado e A10 exige confirmação positiva da capacidade', async () => {
  const base = apiSintetica('admin')
  const r = await montarRouter({ url: '/#/admin?secao=novo-evento', dados: sessao('admin'), fetch: (input, opts) => new URL(input).pathname === '/usuarios'
    ? Promise.resolve({ ok: true, status: 200, json: async () => [{ id: 7, nome: 'Sintético', email: 'sintetico@example.invalid', perfil: 'participante' }] }) : base(input, opts) })
  try {
    assert.match(texto(r), /indisponível|desativad|não está ativad/); assert.equal(r.document.querySelector('form[aria-label="Dados do evento"]'), null)
    await r.navegar('/admin?secao=usuarios'); await r.clicar(botao(r, 'Gerenciar perfis'))
    assert.match(texto(r), /gerenciamento de perfis ainda não está disponível/)
    assert.equal(r.document.querySelector('[role="dialog"] form'), null)
  }
  finally { await r.close() }
})

for (const documento of ['privacidade', 'termos', 'contato-privacidade', 'preferencias-privacidade']) test('documento público por hash sem login: ' + documento, async () => {
  const r = await montarRouter({ url: '/#/' + documento })
  try { assert.ok(r.document.querySelector('h1')); assert.doesNotMatch(texto(r), /Página não encontrada|Acessar sua conta/) }
  finally { await r.close() }
})

for (const documento of ['privacidade', 'termos', 'contato-privacidade', 'preferencias-privacidade']) test('link público legado continua disponível sem consulta de sessão: ' + documento, async () => {
  let chamadas = 0
  const r = await montarRouter({ url: '/' + documento, dados: sessao('admin'), fetch: async () => { chamadas++; throw Error('Não deve consultar API') } })
  try { assert.ok(r.document.querySelector('h1')); assert.doesNotMatch(texto(r), /Página não encontrada|Acessar sua conta/); assert.equal(chamadas, 0) }
  finally { await r.close() }
})

test('bloqueio POP do React Router mantém a pilha quando guard recusa; aceita na próxima tentativa', async () => {
  let permitir = false, atual
  function Fluxo() {
    const { paginaSolicitada, definirPagina } = usePaginaRoteada()
    const [chave, setChave] = useState('novo:0')
    const nav = useHistoricoNavegacao(paginaSolicitada, { ativo: true, chaveSessao: 'sintetica', contextoEvento: chave,
      aoRestaurar(p, contexto) { if (p === 'custos' && !permitir) return false; setChave(contexto); return p } })
    atual = { nav, definirPagina }
    return createElement('p', null, paginaSolicitada + (nav.restaurando ? ' carregando' : ' pronto'))
  }
  const r = await montarRouter({ url: '/#/custos?evento=7', routes: [{ path: '*', element: createElement(Fluxo) }] })
  try {
    await act(async () => atual.definirPagina('cotacao', 'evento:7')); await r.settle()
    await r.back(); assert.equal(r.window.location.hash, '#/cotacao?evento=7')
    permitir = true; await r.back(); assert.equal(r.window.location.hash, '#/custos?evento=7')
    await r.forward(); assert.equal(r.window.location.hash, '#/cotacao?evento=7')
  } finally { await r.close() }
})

for (const perfil of ['participante', 'organizador', 'fornecedor', 'admin']) test('login e saída reais navegam e limpam a sessão: ' + perfil, async () => {
  const calls = [], r = await montarRouter({ url: '/#/entrar', fetch: apiSintetica(perfil, { calls }) })
  try {
    await act(async () => { r.document.querySelector('form').dispatchEvent(new r.window.Event('submit', { bubbles: true, cancelable: true })) })
    await r.settle()
    const portal = { participante: '/participante', organizador: '/eventos', fornecedor: '/fornecedor-mural', admin: '/admin' }[perfil]
    assert.equal(r.window.location.hash, '#' + portal)
    assert.equal(r.window.sessionStorage.getItem('token'), 'jwt-sintetico')
    assert.ok(calls.some(([p, o]) => p === '/login' && o.method === 'POST'))
    await r.clicar(botao(r, 'Sair'))
    assert.equal(r.window.location.hash, '#/inicio')
    assert.equal(r.window.sessionStorage.getItem('token'), null)
    assert.equal(r.window.sessionStorage.getItem('perfil'), null)
    await r.back(); assert.match(texto(r), /Acessar sua conta/); assert.doesNotMatch(texto(r), /Gerenciar perfis/)
  } finally { await r.close() }
})

test('página inexistente física oferece saída para a raiz, não para o mesmo endereço inválido', async () => {
  const r = await montarRouter({ url: '/endereco-inexistente' })
  try { assert.equal(botao(r, 'Ir para o início').getAttribute('href'), '/#/inicio') }
  finally { await r.close() }
})

test('404 não reutiliza página salva; foco e título seguem outro endereço inexistente', async () => {
  const r = await montarRouter({ url: '/#/errada', dados: { paginaAtual: 'admin', perfil: 'admin' } })
  try { assert.match(texto(r), /Página não encontrada/); await r.navegar('/tambem-errada')
    assert.equal(r.document.activeElement, r.document.querySelector('h1')); assert.match(r.document.title, /Página não encontrada/)
    await r.clicar(botao(r, 'Ir para o início')); assert.doesNotMatch(r.document.title, /Página não encontrada/)
  } finally { await r.close() }
})

test('sumário e atalhos dos documentos públicos preservam rota e movem foco', async () => {
  const r = await montarRouter({ url: '/#/termos' })
  try {
    await r.clicar(r.document.querySelector('.transparenciaPular')); assert.equal(r.window.location.hash, '#/termos')
    assert.equal(r.document.activeElement.id, 'transparencia-conteudo')
    const sumario = r.document.querySelector('.transparenciaSumario a'); const id = sumario.getAttribute('href').slice(1)
    await r.clicar(sumario); assert.equal(r.window.location.hash, '#/termos'); assert.equal(r.document.activeElement.id, id)
  } finally { await r.close() }
})

test('detalhe de cotação fecha por replace; Back/Forward e remontagem não reabrem', async () => {
  const base = apiSintetica('admin'), calls = []
  const buscar = async (input, opts) => {
    const path = new URL(input).pathname; calls.push(path)
    if (path === '/admin/cotacoes/21') return { ok: true, status: 200, json: async () => ({ id: 21, evento_id: 7, evento_nome: 'Sintético', modalidade: 'Fechada', status: 'Aberta', itens: [] }) }
    return base(input, opts)
  }
  const r = await montarRouter({ url: '/#/admin?secao=propostas', dados: sessao('admin'), fetch: buscar })
  try {
    await r.navegar('/admin?secao=cotacoes&cotacao=21'); assert.ok(r.document.querySelector('[role="dialog"]'))
    const tamanho = r.window.history.length
    await r.clicar(r.document.querySelector('[aria-label="Fechar detalhes da cotação"]'))
    assert.equal(r.window.location.hash, '#/admin?secao=cotacoes'); assert.equal(r.window.history.length, tamanho)
    assert.equal(r.document.querySelector('[role="dialog"]'), null)
    await r.back(); assert.equal(r.window.location.hash, '#/admin?secao=propostas')
    await r.forward(); assert.equal(r.window.location.hash, '#/admin?secao=cotacoes'); assert.equal(r.document.querySelector('[role="dialog"]'), null)
    assert.ok(calls.includes('/admin/cotacoes/21'))
  } finally { await r.close() }
})

test('mudança entre seções do fornecedor mantém a mesma instância do portal', async () => {
  const r = await montarRouter({ url: '/#/fornecedor-mural', dados: sessao('fornecedor'), fetch: apiSintetica('fornecedor') })
  try {
    const estrutura = r.document.querySelector('.fornLayout') || r.document.querySelector('main')
    assert.ok(estrutura)
    await r.clicar(botao(r, 'Propostas enviadas'))
    assert.ok(estrutura.isConnected); assert.equal(r.window.location.hash, '#/fornecedor-enviadas')
    await r.back(); assert.ok(estrutura.isConnected)
  } finally { await r.close() }
})

test('restauração de evento mostra skeleton e ignora resposta obsoleta após navegar', async () => {
  const base = apiSintetica('organizador'); let liberar
  const buscar = (input, opts) => new URL(input).pathname === '/eventos/7'
    ? new Promise(r => { liberar = () => base(input, opts).then(r) }) : base(input, opts)
  const r = await montarRouter({ url: '/#/custos?evento=7', dados: sessao('organizador'), fetch: buscar })
  try {
    assert.match(texto(r), /Validando sessão/)
    await r.navegar('/eventos'); assert.doesNotMatch(texto(r), /Validando sessão/)
    await act(async () => liberar()); await r.settle()
    assert.equal(r.window.location.hash, '#/eventos'); assert.doesNotMatch(texto(r), /Validando sessão/)
  } finally { await r.close() }
})

test('evento indisponível normaliza para Meus eventos sem duplicar histórico', async () => {
  const base = apiSintetica('organizador')
  const r = await montarRouter({ url: '/#/custos?evento=999', dados: sessao('organizador'), fetch: (input, opts) =>
    new URL(input).pathname === '/eventos/999' ? Promise.resolve({ ok: false, status: 404, json: async () => ({}) }) : base(input, opts) })
  try { assert.equal(r.window.location.hash, '#/eventos'); assert.match(texto(r), /Visão geral dos seus eventos/); assert.equal(r.window.history.length, 1) }
  finally { await r.close() }
})

test('perfil revogado durante navegação volta ao acesso e remove token', async () => {
  let revogada = false; const base = apiSintetica('participante')
  const r = await montarRouter({ url: '/#/participante', dados: sessao('participante'), fetch: (input, opts) => revogada
    ? Promise.resolve({ ok: false, status: 401, json: async () => ({}) }) : base(input, opts) })
  try { revogada = true; await r.navegar('/solicitar-acesso'); assert.match(texto(r), /Acessar sua conta/); assert.equal(r.window.sessionStorage.getItem('token'), null) }
  finally { await r.close() }
})

test('updaters de seção consecutivos preservam a última intenção com Router real', async () => {
  let nav
  function Fluxo() {
    nav = useHistoricoNavegacao('participante', { ativo: true, chaveSessao: '', contextoEvento: 'novo:0', aoRestaurar: p => p })
    return createElement('p', null, nav.estado.aba)
  }
  const r = await montarRouter({ url: '/#/participante?secao=detalhes&evento=7', routes: [{ path: '*', element: createElement(Fluxo) }] })
  try {
    await act(async () => {
      nav.mudar({ aba: 'ingressos', eventoId: null })
      nav.mudar(atual => ({ aba: atual.aba === 'detalhes' ? 'eventos' : atual.aba, eventoId: null }))
    }); await r.settle()
    assert.equal(r.window.location.hash, '#/participante?secao=ingressos')
    assert.doesNotMatch(JSON.stringify(r.window.history.state), /token|email|perfil|eventoId|payload/)
  } finally { await r.close() }
})

test('formulário real de custos conserva campos quando saída interna ou POP é recusada', async () => {
  const r = await montarRouter({ url: '/#/eventos', dados: sessao('organizador'), fetch: apiSintetica('organizador') })
  try {
    await r.navegar('/custos?evento=7')
    const campo = r.document.getElementById('custo-descricao')
    await act(async () => {
      Object.getOwnPropertyDescriptor(r.window.HTMLInputElement.prototype, 'value').set.call(campo, 'Rascunho sintético')
      campo.dispatchEvent(new r.window.Event('input', { bubbles: true }))
      campo.dispatchEvent(new r.window.Event('change', { bubbles: true }))
    }); await r.settle()
    let avisos = 0; r.window.confirm = () => { avisos++; return false }
    await r.clicar(botao(r, 'Meus eventos'))
    assert.ok(avisos > 0); assert.equal(r.window.location.hash, '#/custos?evento=7'); assert.equal(r.document.getElementById('custo-descricao').value, 'Rascunho sintético')
    await r.navegar('/admin?secao=usuarios'); assert.equal(r.window.location.hash, '#/custos?evento=7')
    await r.clicar(botao(r, 'Sair')); assert.equal(r.window.sessionStorage.getItem('token'), 'jwt-sintetico'); assert.equal(r.document.getElementById('custo-descricao').value, 'Rascunho sintético')
    await r.back(); assert.equal(r.window.location.hash, '#/custos?evento=7'); assert.equal(r.document.getElementById('custo-descricao').value, 'Rascunho sintético')
    r.window.confirm = () => true; await r.back(); assert.equal(r.window.location.hash, '#/eventos')
  } finally { await r.close() }
})

test('restauração da sessão mantém skeleton, URL e token até a validação terminar', async () => {
  const api=apiSintetica('admin'); let liberar
  const r=await montarRouter({url:'/#/admin?secao=usuarios',dados:sessao('admin'),fetch:(input,opcoes)=>new URL(input).pathname==='/perfil'
    ?new Promise(resolve=>{liberar=()=>api(input,opcoes).then(resolve)}):api(input,opcoes)})
  try {
    assert.match(texto(r),/Validando sessão/);assert.doesNotMatch(texto(r),/Acessar sua conta|Gerenciar perfis/)
    assert.equal(r.window.sessionStorage.getItem('token'),'jwt-sintetico');assert.equal(r.window.location.hash,'#/admin?secao=usuarios')
    await act(async()=>liberar());await r.settle();assert.doesNotMatch(texto(r),/Validando sessão/)
  }finally{await r.close()}
})

test('troca de sessão durante restauração não aplica evento da conta anterior',async()=>{
  const organizador=apiSintetica('organizador'),fornecedor=apiSintetica('fornecedor');let liberar
  const r=await montarRouter({url:'/#/custos?evento=7',dados:sessao('organizador'),fetch:(input,opcoes={})=>{
    if(new URL(input).pathname==='/eventos/7')return new Promise(resolve=>{liberar=()=>organizador(input,opcoes).then(resolve)})
    return opcoes.headers?.Authorization==='Bearer outra-sessao'?fornecedor(input,opcoes):organizador(input,opcoes)
  }})
  try {
    assert.match(texto(r),/Validando sessão/);r.window.sessionStorage.setItem('token','outra-sessao');r.window.sessionStorage.setItem('perfil','fornecedor')
    await r.navegar('/fornecedor-mural');await act(async()=>liberar());await r.settle()
    assert.equal(r.window.location.hash,'#/fornecedor-mural');assert.doesNotMatch(texto(r),/Evento sintético|Validando sessão/)
  }finally{await r.close()}
})

test('Landing e login explícitos com sessão válida permanecem públicos sem logout',async()=>{
  const r=await montarRouter({url:'/#/inicio',dados:sessao('admin'),fetch:apiSintetica('admin')})
  try {
    assert.equal(r.window.location.hash,'#/inicio');assert.doesNotMatch(texto(r),/Gerenciar perfis/)
    await r.navegar('/entrar');assert.match(texto(r),/Acessar sua conta/);assert.equal(r.window.sessionStorage.getItem('token'),'jwt-sintetico')
  }finally{await r.close()}
})

test('detalhes do participante preservam ID ao voltar da seção de perfil',async()=>{
  const api=apiSintetica('participante')
  const r=await montarRouter({url:'/#/participante?secao=detalhes&evento=9',dados:sessao('participante'),fetch:(input,opcoes)=>new URL(input).pathname==='/participante/eventos'
    ?Promise.resolve({ok:true,status:200,json:async()=>[{id:9,nome:'Evento participante sintético',data:'2030-12-10',horario:'10:00',local:'Local',status:'Ativo',publico:20}]}):api(input,opcoes)})
  try {
    assert.match(texto(r),/Evento participante sintético/);await r.navegar('/participante?secao=perfil');await r.back()
    assert.equal(r.window.location.hash,'#/participante?secao=detalhes&evento=9');assert.match(texto(r),/Evento participante sintético/)
  }finally{await r.close()}
})
