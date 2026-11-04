import { apiUrl } from './api.js'

export const paginasPorPerfil = Object.freeze({
  participante: ['participante', 'solicitar-acesso'],
  organizador: ['eventos', 'criar', 'custos', 'cotacao', 'ticket', 'perfil'],
  fornecedor: ['fornecedor-mural', 'fornecedor-proposta', 'fornecedor-enviadas', 'fornecedor-cotacoes', 'fornecedor-contratos', 'fornecedor-catalogo', 'fornecedor-desempenho', 'fornecedor-perfil'],
  admin: ['admin'],
})

const verificacoes = {
  participante: '/participante/inscricoes',
  organizador: '/cotacoes',
  fornecedor: '/fornecedor/propostas',
  admin: '/admin/eventos',
}

export function paginaAutorizada(pagina, perfil) {
  if (['login', 'cadastro'].includes(pagina)) return pagina
  const permitidas = paginasPorPerfil[perfil]
  return permitidas?.includes(pagina) ? pagina : permitidas?.[0] || 'login'
}

// O perfil armazenado e apenas uma dica de ordem; a API decide a permissao.
export async function validarSessao(token, dicaPerfil, signal) {
  if (typeof token !== 'string' || !token.trim()) throw new Error('Faça login novamente.')
  const opcoes = { headers: { Authorization: `Bearer ${token}` }, signal }
  const identidade = await fetch(apiUrl('/perfil'), opcoes)
  if (!identidade.ok) throw new Error('Não foi possível validar sua sessão. Faça login novamente.')
  const usuario = await identidade.json()
  if (!usuario || !Number.isSafeInteger(usuario.id) || usuario.id <= 0) throw new Error('Identidade inválida.')
  const todos = Object.keys(verificacoes)
  const perfis = Object.hasOwn(verificacoes, dicaPerfil)
    ? [dicaPerfil, ...todos.filter(perfil => perfil !== dicaPerfil)] : todos
  for (const perfil of perfis) {
    const resposta = await fetch(apiUrl(verificacoes[perfil]), opcoes)
    if (resposta.ok) return { token, perfil }
    if (resposta.status !== 403) throw new Error('Não foi possível validar sua permissão. Faça login novamente.')
  }
  throw new Error('Perfil de usuário não reconhecido.')
}
