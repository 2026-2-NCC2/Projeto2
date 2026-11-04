import { apiUrl } from './api.js'

export async function salvarPerfil(token, dados, signal) {
  if (!token) throw new Error('Faça login novamente.')
  const body = Object.fromEntries(['nome', 'telefone', 'biografia'].map(campo => [campo, dados[campo]]))
  const resposta = await fetch(apiUrl('/perfil'), {
    method: 'PATCH', signal,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const perfil = await resposta.json()
  if (!resposta.ok) throw new Error(perfil?.erro || 'Não foi possível salvar seu perfil.')
  if (!perfil || !Number.isSafeInteger(perfil.id) || typeof perfil.nome !== 'string' ||
      typeof perfil.email !== 'string' || perfil.edicao_disponivel !== true ||
      ['telefone', 'biografia'].some(campo => perfil[campo] !== null && typeof perfil[campo] !== 'string')) {
    throw new Error('Não foi possível confirmar o salvamento. Recarregue o perfil.')
  }
  if (signal?.aborted || sessionStorage.getItem('token') !== token) throw new Error('A sessão foi alterada. Faça login novamente.')
  window.dispatchEvent(new CustomEvent('trocaticket:perfil-atualizado', { detail: { token, perfil } }))
  return perfil
}
