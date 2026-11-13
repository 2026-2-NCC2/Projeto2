import { createHashRouter } from 'react-router'
import App from '../App.jsx'
import { paginas, rotasPublicas } from './contratos.js'

// Data HashRouter: useBlocker protege os rascunhos em POP pelo próprio roteador.
// App permanece montado entre rotas, preservando portais e rascunhos em memória.
export const rotasAplicacao = [{
  path: '/', element: <App />, children: [
    { index: true },
    ...['inicio', 'entrar', 'cadastro', ...paginas, ...rotasPublicas].map(path => ({ path })),
    { path: '*' },
  ],
}]
export function criarHashRouterAplicacao() { return createHashRouter(rotasAplicacao) }
