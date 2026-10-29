import { apiUrl } from './api.js'

// Retorna a Response original; cada fluxo conserva sua leitura de JSON e erros.
export function listarEventos(token) {
  return fetch(apiUrl('/eventos'), {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function publicarEvento(id, token) {
  return fetch(apiUrl(`/eventos/${id}/publicar`), {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function excluirEvento(id, token) {
  return fetch(apiUrl(`/eventos/${id}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function salvarEvento(id, dados, token) {
  return fetch(id ? apiUrl(`/eventos/${id}`) : apiUrl('/eventos'), {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(dados),
  })
}
