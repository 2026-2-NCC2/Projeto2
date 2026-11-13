import { JSDOM } from 'jsdom'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { transformSync } from 'rolldown/utils'
import { act } from 'react'

// Executa os componentes de produção, React DOM e React Router reais.
// O DOM fornece a History API; não há implementação de push/back/forward no teste.
registerHooks({ load(url, context, next) {
  if (url.endsWith('.css')) return { format: 'module', source: 'export default {}', shortCircuit: true }
  if (url.endsWith('.jsx')) {
    const source = readFileSync(new URL(url), 'utf8')
    const result = transformSync(url, source, { jsx: { runtime: 'automatic' } })
    if (result.errors.length) throw Error('JSX inválido: ' + url)
    return { format: 'module', source: result.code, shortCircuit: true }
  }
  if (url.includes('/src/') && url.endsWith('.js')) {
    const source = readFileSync(new URL(url), 'utf8').replaceAll('import.meta.env', "({ MODE: 'development', TROCATICKET_API_MODO: 'principal' })")
    return { format: 'module', source, shortCircuit: true }
  }
  return next(url, context)
} })

export async function montarRouter({ url = '/#/inicio', dados = {}, fetch: buscar, routes } = {}) {
  const dom = new JSDOM('<!doctype html><title>TrocaTicket</title><div id="root"></div>', { url: 'http://localhost' + url, pretendToBeVisual: true })
  const anteriores = new Map()
  for (const [nome, valor] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    sessionStorage: dom.window.sessionStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: buscar || (async () => { throw Error('Requisição não prevista; acesso externo bloqueado no teste.') }),
  })) { anteriores.set(nome, Object.getOwnPropertyDescriptor(globalThis, nome)); Object.defineProperty(globalThis, nome, { configurable: true, writable: true, value: valor }) }
  for (const [k, v] of Object.entries(dados)) sessionStorage.setItem(k, v)
  window.confirm = () => true
  window.alert = () => {}
  globalThis.alert = window.alert
  const { createElement } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { createHashRouter } = await import('react-router')
  const { RouterProvider } = await import('react-router/dom')
  const { rotasAplicacao } = await import('../../src/router/RouterAplicacao.jsx')
  const { EntradaAplicacao } = await import('../../src/pages/publicas/Transparencia.jsx')
  const router = createHashRouter(routes || rotasAplicacao, { window: dom.window })
  const root = createRoot(document.getElementById('root'))
  await act(async () => { root.render(createElement(EntradaAplicacao, null, createElement(RouterProvider, { router }))); await new Promise(r => setTimeout(r, 0)) })
  const settle = async () => { await act(async () => { await new Promise(r => setTimeout(r, 20)) }) }
  await settle()
  return { router, window: dom.window, document: dom.window.document, settle,
    async navegar(to, options) { await act(async () => { await router.navigate(to, options) }); await settle() },
    async back() { await act(async () => { dom.window.history.back(); await new Promise(r => setTimeout(r, 20)) }); await settle() },
    async forward() { await act(async () => { dom.window.history.forward(); await new Promise(r => setTimeout(r, 20)) }); await settle() },
    async clicar(elemento) { if (!elemento) throw Error('Controle ausente'); await act(async () => { elemento.click() }); await settle() },
    async close() { await act(async () => root.unmount()); router.dispose(); dom.window.close();
      for (const [nome, descritor] of anteriores) { if (descritor) Object.defineProperty(globalThis, nome, descritor); else delete globalThis[nome] }
      delete globalThis.alert
    },
  }
}

export function apiSintetica(perfil, { expirada = false, calls = [] } = {}) {
  const acessos = { participante: '/participante/inscricoes', organizador: '/cotacoes', fornecedor: '/fornecedor/propostas', admin: '/admin/eventos' }
  return async (input, opcoes = {}) => {
    const path = new URL(input, 'http://localhost').pathname
    calls.push([path, opcoes])
    const resposta = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
    if (path === '/login') return resposta(200, { token: 'jwt-sintetico', usuario: { perfil } })
    if (expirada) return resposta(401, { erro: 'Sessão expirada.' })
    if (path === '/perfil') return resposta(200, { id: 7, nome: 'Pessoa sintética', email: 'pessoa@example.invalid', perfil })
    if (Object.values(acessos).includes(path) && path !== acessos[perfil]) return resposta(403, {})
    if (path === '/eventos/capacidades') return resposta(200, { criar: false, editar: false, publicar: false })
    if (path === '/admin/eventos/capacidades') return resposta(200, { criar: false })
    if (path === '/admin/usuarios/perfis/capacidades') return resposta(200, { alterar: false, modelo: 'unico' })
    if (path === '/eventos/7') return resposta(200, { id: 7, nome: 'Evento sintético', data: '2030-12-10', horario: '10:00:00', local: 'Local', publico: 20, status: 'Em planejamento', usuario_id: 7, versao: 1 })
    if (path === '/eventos/7/custos') return resposta(200, [])
    if (path === '/termos/vigente') return resposta(200, { versao: 'sintetica' })
    return resposta(200, [])
  }
}
