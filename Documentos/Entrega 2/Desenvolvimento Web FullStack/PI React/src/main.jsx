import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { RouterProvider } from 'react-router/dom'
import { criarHashRouterAplicacao } from './router/RouterAplicacao.jsx'
import { EntradaAplicacao } from './pages/publicas/Transparencia.jsx'

const router = criarHashRouterAplicacao()
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <EntradaAplicacao><RouterProvider router={router} /></EntradaAplicacao>
  </StrictMode>,
)
