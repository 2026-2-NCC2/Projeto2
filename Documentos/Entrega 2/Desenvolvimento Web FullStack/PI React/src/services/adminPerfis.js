import { apiUrl } from './api.js'
export const perfisAdministraveis = ['participante', 'organizador', 'fornecedor', 'admin']
export function validarMudancaPerfil(atual, novo, motivo, confirmado) {
  return perfisAdministraveis.includes(atual) && perfisAdministraveis.includes(novo) && atual !== novo && confirmado === true &&
    typeof motivo === 'string' && Array.from(motivo.trim()).length >= 10 && Array.from(motivo.trim()).length <= 1000 &&
    !Array.from(motivo).some(c => c.codePointAt(0) < 32 || c.codePointAt(0) === 127)
}
export async function alterarPerfilAdmin(id, body, chave, signal) {
  const token = sessionStorage.getItem('token')
  if (!token) throw Object.assign(new Error('Sessão expirada. Entre novamente.'), { status: 401, incerto: false })
  let r
  try {
    r = await fetch(apiUrl(`/admin/usuarios/${id}/perfil`), { method: 'PATCH', signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': chave }, body: JSON.stringify(body) })
  } catch { throw Object.assign(new Error('Resultado não confirmado. Consulte a lista ou confirme novamente a mesma alteração.'), { incerto: true }) }
  let data
  try { data = await r.json() } catch { throw Object.assign(new Error('Resposta incompleta. Consulte a lista antes de outra alteração.'), { incerto: true }) }
  if (!r.ok) throw Object.assign(new Error(r.status === 401 ? 'Sessão expirada. Entre novamente.' : data.erro || 'Não foi possível alterar o perfil.'),
    { status: r.status, incerto: data.resultado_incerto !== false })
  if (data.usuario?.id !== id || data.usuario?.perfil !== body.perfil_novo) throw Object.assign(new Error('Resultado não confirmado. Atualize a lista.'), { incerto: true })
  return data.usuario
}
