import test from 'node:test'
import assert from 'node:assert/strict'
import { carregarAdmin, hooksAdmin, nodes } from './helpers/adminRuntime.js'
import { historicoFixture } from './helpers/historicoFixture.js'

function montar({ pagina = 'login', browser = historicoFixture(), validar = p => p, chave = 'segredo-sessao-a', ativo = true } = {}) {
  const chamadas = []
  const h = hooksAdmin({ window: browser.window, AbortController })
  const { useHistoricoNavegacao } = carregarAdmin('hooks/useNavegacao.js', ['useHistoricoNavegacao'], h.env)
  const opcoes = { ativo, chaveSessao: chave, contextoEvento: 'evento:7', iniciarNoLogin: false,
    aoRestaurar(p, contexto, signal) {
      chamadas.push([p, contexto])
      const resultado = validar(p, contexto, signal)
      if (resultado && typeof resultado.then === 'function') return resultado.then(r => {
        if (signal.aborted) return false
        if (r) pagina = typeof r === 'string' ? r : p
        return r
      })
      if (resultado) pagina = typeof resultado === 'string' ? resultado : p
      return resultado
    } }
  const render = () => h.render(() => useHistoricoNavegacao(pagina, opcoes))
  return { render, browser, chamadas, opcoes, pagina: () => pagina,
    navegar(p) { pagina = p; return render() }, close: h.close }
}

test('Landing → Login registra entrada; Back/Forward restaura sem duplicar e permite sair ao chegar ao início', () => {
  const r = montar(), b = r.browser
  assert.equal(b.entradas.length, 2)
  r.render(); assert.deepEqual(b.escritas, ['replace'])
  r.render().mudar({ login: true }); assert.equal(r.render().estado.login, true)
  assert.equal(b.entradas.length, 3)
  b.back(); assert.equal(r.render().estado.login, false)
  b.forward(); assert.equal(r.render().estado.login, true)
  assert.equal(b.entradas.length, 3)
  b.back(); r.render(); b.back()
  assert.equal(b.saiu(), true)
  r.close()
})

test('Visão geral, solicitações e painel preservam Voltar/Avançar e restauração por URL', () => {
  const r = montar({ pagina: 'admin' })
  assert.equal(r.render().estado.secao, 'inicio')
  r.render().mudar({ secao: 'contas', eventoId: null, cotacaoId: null }); r.render()
  r.render().mudar({ secao: 'painel', eventoId: 7, cotacaoId: null }); r.render()
  r.browser.back(); assert.equal(r.render().estado.secao, 'contas')
  r.browser.back(); assert.equal(r.render().estado.secao, 'inicio')
  r.browser.forward(); assert.equal(r.render().estado.secao, 'contas')
  r.browser.forward(); assert.equal(r.render().estado.eventoId, 7)
  r.close()
  const restaurado = montar({ pagina: 'admin', browser: historicoFixture({ hash: '#/admin' }) })
  assert.equal(restaurado.render().estado.secao, 'inicio')
  restaurado.close()
})

test('acesso direto sem histórico anterior não cria entrada extra ou volta forçada', () => {
  const r = montar({ browser: historicoFixture({ externo: false }) })
  r.render(); r.browser.back(); r.render()
  assert.equal(r.browser.entradas.length, 1)
  assert.deepEqual(r.chamadas, [])
  assert.equal(r.render().estado.login, false); r.close()
})

test('âncora do painel conserva rota/evento para F5 e não interfere em Voltar/Avançar', () => {
  const r = montar({ pagina: 'admin' })
  r.render()
  r.render().mudar({ secao: 'painel', eventoId: 13, cotacaoId: null }); r.render()
  const hash = r.browser.window.location.hash, tamanho = r.browser.entradas.length
  let focos = 0
  const { LinkSecaoPainel } = carregarAdmin('components/admin/PainelEventoAdmin.jsx', ['LinkSecaoPainel'], {
    document: { getElementById: () => ({ focus() { focos++ }, scrollIntoView() {} }) },
  })
  const link = LinkSecaoPainel({ destino: 'pea-custos', eventoId: 13 })
  link.props.onClick({ preventDefault() {} })
  assert.equal(focos, 1)
  assert.equal(r.browser.window.location.hash, hash)
  assert.equal(r.browser.entradas.length, tamanho)
  assert.equal(link.props.href, hash)
  const f5 = montar({ pagina: 'admin', browser: historicoFixture({ hash }) })
  assert.equal(f5.render().estado.secao, 'painel'); assert.equal(f5.render().estado.eventoId, 13)
  r.browser.back(); assert.equal(r.render().estado.secao, 'inicio')
  r.browser.forward(); assert.equal(r.render().estado.eventoId, 13)
  f5.close(); r.close()
})

test('fechar cotação substitui URL; F5 não reabre e histórico mantém a seção anterior', () => {
  const r = montar({ pagina: 'admin' }); r.render()
  r.render().mudar({ secao: 'propostas', eventoId: null, cotacaoId: null }); r.render()
  r.render().mudar({ secao: 'cotacoes', eventoId: null, cotacaoId: 21 }); r.render()
  const tamanho = r.browser.entradas.length
  const h = hooksAdmin({ AdminCatalogo: 'catalogo', NavegacaoRecolhivel: 'menu' })
  const { AdminPortal } = carregarAdmin('components/admin/AdminPortal.jsx', ['AdminPortal'], h.env)
  const v = h.render(AdminPortal, { navegacao: r.render() })
  nodes(v).find(n => n.type === 'catalogo').props.aoFecharCotacao()
  r.render()
  assert.equal(r.browser.escritas.at(-1), 'replace')
  assert.equal(r.browser.entradas.length, tamanho)
  assert.equal(r.browser.window.location.hash, '#/admin?secao=cotacoes')
  const f5 = montar({ pagina: 'admin', browser: historicoFixture({ hash: r.browser.window.location.hash }) })
  assert.equal(f5.render().estado.cotacaoId, null)
  r.browser.back(); assert.equal(r.render().estado.secao, 'propostas')
  r.browser.forward(); assert.equal(r.render().estado.secao, 'cotacoes'); assert.equal(r.render().estado.cotacaoId, null)
  f5.close(); h.close(); r.close()
})

test('Relatórios restaura seção por F5 e mantém Voltar/Avançar', () => {
  const r = montar({ pagina: 'admin', browser: historicoFixture({ hash: '#/admin?secao=relatorios' }) })
  assert.equal(r.render().estado.secao, 'relatorios')
  r.render().mudar({ secao: 'usuarios', eventoId: null, cotacaoId: null }); r.render()
  r.browser.back(); assert.equal(r.render().estado.secao, 'relatorios')
  r.browser.forward(); assert.equal(r.render().estado.secao, 'usuarios')
  r.close()
})

test('Novo evento administrativo preserva F5, Voltar/Avançar e guarda somente a seção', () => {
  const r = montar({ pagina: 'admin', browser: historicoFixture({ hash: '#/admin?secao=novo-evento' }) })
  assert.equal(r.render().estado.secao, 'novo-evento')
  r.render().mudar({ secao: 'eventos', eventoId: null, cotacaoId: null }); r.render()
  r.browser.back(); assert.equal(r.render().estado.secao, 'novo-evento')
  r.browser.forward(); assert.equal(r.render().estado.secao, 'eventos')
  assert.doesNotMatch(JSON.stringify(r.browser.window.history.state), /organizador_id|nome|payload|token|chaveIdempotencia/)
  r.close()
})

test('rerenders e valores inválidos não geram entradas; history.state não contém rotas, dados ou credenciais', () => {
  const r = montar({ pagina: 'participante' })
  for (let i = 0; i < 4; i++) r.render()
  r.render().mudar({ aba: 'admin', eventoId: 7 }); r.render()
  r.render().mudar({ aba: 'detalhes', eventoId: -1 }); r.render()
  assert.equal(r.browser.escritas.length, 1)
  r.render().mudar({ aba: 'detalhes', eventoId: 7 }); r.render()
  const state = JSON.stringify(r.browser.window.history.state)
  assert.doesNotMatch(state, /segredo|participante|detalhes|eventoId|email|token|evento:7/)
  assert.deepEqual(Object.keys(r.browser.window.history.state), ['trocaticketNavegacao']); r.close()
})

test('seções e detalhes do participante voltam e avançam com ID, sem carregar dados do histórico', () => {
  const r = montar({ pagina: 'participante' })
  r.render().mudar({ aba: 'eventos', eventoId: null }); r.render()
  r.render().mudar({ aba: 'detalhes', eventoId: 9 }); r.render()
  r.render().mudar({ aba: 'perfil', eventoId: null }); r.render()
  r.browser.back(); assert.equal(r.render().estado.aba, 'detalhes'); assert.equal(r.render().estado.eventoId, 9)
  r.browser.back(); assert.equal(r.render().estado.aba, 'eventos')
  r.browser.forward(); assert.equal(r.render().estado.eventoId, 9)
  assert.equal(r.pagina(), 'participante'); r.close()
})

test('updaters preservam a ordem das transições de inscrição e normalizam ID ao sair dos detalhes', () => {
  const r = montar({ pagina: 'participante' })
  r.render().mudar({ aba: 'detalhes', eventoId: 9 }); r.render()
  const nav = r.render()
  nav.mudar({ aba: 'ingressos', eventoId: null })
  nav.mudar(atual => ({ aba: atual.aba === 'detalhes' ? 'eventos' : atual.aba, eventoId: null }))
  assert.equal(r.render().estado.aba, 'ingressos'); r.close()
})

test('fallback de detalhe indisponível substitui a entrada; próxima navegação normal volta a criar histórico', () => {
  const r = montar({ pagina: 'participante' })
  r.render().mudar({ aba: 'detalhes', eventoId: 9 }); r.render()
  const antes = r.browser.entradas.length
  r.render().mudar({ aba: 'eventos', eventoId: null }, true); r.render()
  assert.equal(r.browser.entradas.length, antes)
  r.navegar('solicitar-acesso')
  assert.equal(r.browser.entradas.length, antes + 1)
  r.close()
})

test('retorno entre páginas passa pelo guard existente e cancelamento conserva a tela e não prende o navegador', () => {
  let permitir = false
  const r = montar({ pagina: 'custos', validar: p => permitir ? p : false })
  r.render(); r.navegar('cotacao')
  r.browser.back(); r.render()
  assert.equal(r.pagina(), 'cotacao')
  assert.deepEqual(r.chamadas, [['custos', 'evento:7']])
  permitir = true
  r.browser.back(); r.render(); assert.equal(r.pagina(), 'custos')
  r.browser.back(); assert.equal(r.browser.saiu(), true)
  r.close()
})

test('guard pode normalizar contexto antigo para uma listagem segura sem adicionar nova entrada', () => {
  const r = montar({ pagina: 'custos', validar: () => 'eventos' })
  r.render(); r.opcoes.contextoEvento = 'evento:8'; r.navegar('cotacao')
  const n = r.browser.entradas.length
  r.browser.back(); r.render()
  assert.equal(r.pagina(), 'eventos')
  assert.equal(r.browser.entradas.length, n); r.close()
})

test('troca de sessão revalida destinos da URL sem reutilizar dados privados da sessão anterior', () => {
  const r = montar({ pagina: 'participante' })
  r.render().mudar({ aba: 'perfil', eventoId: null }); r.render()
  const anterior = r.browser.window.history.state
  r.opcoes.chaveSessao = 'segredo-sessao-b'; r.render()
  assert.equal(r.render().estado.aba, 'perfil')
  r.browser.emitir(anterior)
  assert.equal(r.chamadas.length, 1)
  assert.deepEqual(r.chamadas[0], ['participante', 'novo:0'])
  assert.equal(r.render().estado.aba, 'perfil'); r.close()
})

test('durante restauração não escreve histórico nem instala listener; eventos externos/desconhecidos são ignorados', () => {
  const r = montar({ ativo: false })
  r.render(); assert.equal(r.browser.escritas.length, 0); assert.equal(r.browser.ouvintes(), 0)
  r.opcoes.ativo = true; r.render()
  assert.equal(r.browser.ouvintes(), 1)
  r.browser.emitir(null, '#/desconhecido'); r.browser.emitir({ perfil: 'admin' }, '#/admin?token=segredo')
  r.browser.emitir({ trocaticketNavegacao: { documento: 'externo', indice: 999999 } }, '#/participante?secao=perfil&evento=-1')
  assert.deepEqual(r.chamadas, [])
  r.opcoes.ativo = false; r.render(); assert.equal(r.browser.ouvintes(), 0); r.close()
})

test('History API indisponível não impede navegação interna nem aciona autenticação ou rede', () => {
  const r = montar({ browser: historicoFixture({ indisponivel: true }) })
  r.render().mudar({ login: true })
  assert.equal(r.render().estado.login, true)
  assert.deepEqual(r.chamadas, []); r.close()
})

test('desmontagem remove listener sem alterar entradas ou tentar reter o usuário', () => {
  const r = montar(); r.render()
  const antes = r.browser.escritas.length
  r.close(); assert.equal(r.browser.ouvintes(), 0)
  assert.equal(r.browser.escritas.length, antes)
})

test('F5 restaura seção da URL, revalida destino e não duplica entradas do histórico', () => {
  const browser = historicoFixture(), anterior = montar({ browser, pagina: 'participante' })
  anterior.render().mudar({ aba: 'perfil', eventoId: null }); anterior.render()
  const n = browser.entradas.length, url = browser.window.location.hash
  anterior.close()
  const atual = montar({ browser, pagina: 'participante' })
  assert.equal(atual.render().restaurando, true)
  assert.equal(atual.render().estado.aba, 'perfil')
  assert.equal(atual.render().restaurando, false)
  assert.deepEqual(atual.chamadas, [['participante', 'novo:0']])
  assert.equal(browser.entradas.length, n); assert.equal(browser.window.location.hash, url)
  browser.back(); assert.equal(atual.render().estado.aba, 'inicio')
  browser.forward(); assert.equal(atual.render().estado.aba, 'perfil')
  atual.close()
})

test('restauração assíncrona mantém URL e skeleton; nova navegação cancela a resposta anterior', async () => {
  let concluir, signalAnterior
  const browser = historicoFixture({ hash: '#/custos?evento=7' })
  const r = montar({ pagina: 'custos', browser, validar: (p, contexto, signal) => {
    if (p !== 'custos') return p
    signalAnterior = signal
    return new Promise(resolve => { concluir = resolve })
  } })
  assert.equal(r.render().restaurando, true)
  assert.equal(r.render().restaurando, true)
  assert.equal(browser.window.location.hash, '#/custos?evento=7')
  browser.emitir(null, '#/participante?secao=perfil')
  assert.equal(signalAnterior.aborted, true)
  r.render(); concluir('custos'); await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(r.pagina(), 'participante')
  assert.equal(r.render().estado.aba, 'perfil')
  assert.equal(r.render().restaurando, false)
  assert.equal(browser.window.location.hash, '#/participante?secao=perfil')
  r.close()
})

test('mudança de contexto irrelevante não duplica a mesma URL', () => {
  const r = montar({ pagina: 'eventos' })
  r.render(); const n = r.browser.entradas.length
  r.opcoes.contextoEvento = 'evento:99'; r.render()
  assert.equal(r.browser.entradas.length, n)
  assert.equal(r.browser.window.location.hash, '#/eventos')
  r.close()
})
