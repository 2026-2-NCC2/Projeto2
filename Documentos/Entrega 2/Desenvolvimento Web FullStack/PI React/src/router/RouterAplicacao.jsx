import { createHashRouter } from 'react-router'
import App from '../App.jsx'

// App compõe as telas e valida os caminhos em contratos.js, inclusive 404/403.
// Uma rota contêiner mantém sua identidade entre URLs e preserva os rascunhos.
// Não há rotas filhas vazias: App não usa Outlet. POP segue protegido por useBlocker.
export const rotasAplicacao = [{ path: '*', element: <App /> }]
export function criarHashRouterAplicacao() { return createHashRouter(rotasAplicacao) }
