import { criarCarregador, criarTelaSobDemanda } from '../components/ui/ModuloSobDemanda.jsx'

const organizador = criarCarregador(() => import('../pages/organizador/modulo.jsx'))
export const Layout = criarTelaSobDemanda(organizador, 'Layout')
export const Eventos = criarTelaSobDemanda(organizador, 'Eventos')
export const CriarEvento = criarTelaSobDemanda(organizador, 'CriarEvento')
export const Custos = criarTelaSobDemanda(organizador, 'Custos')
export const Ticket = criarTelaSobDemanda(organizador, 'Ticket')
export const Cotacao = criarTelaSobDemanda(organizador, 'Cotacao')
export const PerfilOrganizador = criarTelaSobDemanda(organizador, 'PerfilOrganizador')

export const PortalParticipante = criarTelaSobDemanda(criarCarregador(() => import('../pages/participante/PortalParticipante.jsx')), 'PortalParticipante')
export const PortalFornecedor = criarTelaSobDemanda(criarCarregador(() => import('../pages/fornecedor/PortalFornecedor.jsx')), 'PortalFornecedor')
export const AdminPortal = criarTelaSobDemanda(criarCarregador(() => import('../components/admin/AdminPortal.jsx')), 'AdminPortal')
export const PerfilPessoal = criarTelaSobDemanda(criarCarregador(() => import('../components/perfil/PerfilPessoal.jsx')), 'PerfilPessoal')
export const Cadastro = criarTelaSobDemanda(criarCarregador(() => import('../pages/auth/Cadastro.jsx')), 'Cadastro')
export const SolicitarAcesso = criarTelaSobDemanda(criarCarregador(() => import('../pages/auth/SolicitarAcesso.jsx')), 'SolicitarAcesso')
