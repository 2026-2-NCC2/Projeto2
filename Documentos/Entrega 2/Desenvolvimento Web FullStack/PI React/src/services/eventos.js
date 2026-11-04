import { apiUrl } from './api.js'

// Retorna a Response original; cada fluxo conserva sua leitura de JSON e erros.
export function listarEventos(token) {
  return fetch(apiUrl('/eventos'), {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function publicarEvento(id, token, versao) {
  return fetch(apiUrl(`/eventos/${id}/publicar`), {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type':'application/json' },
    body:JSON.stringify({versao}),
  })
}

export function excluirEvento(id, token) {
  return fetch(apiUrl(`/eventos/${id}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function salvarEvento(id, dados, token, chaveIdempotencia) {
  return fetch(id ? apiUrl(`/eventos/${id}`) : apiUrl('/eventos'), {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(!id&&chaveIdempotencia?{'Idempotency-Key':chaveIdempotencia}:{}) },
    body: JSON.stringify(dados),
  })
}

export function consultarEvento(id,token){return fetch(apiUrl(`/eventos/${id}`),{headers:{Authorization:`Bearer ${token}`}})}
export function capacidadesEventos(token){return fetch(apiUrl('/eventos/capacidades'),{headers:{Authorization:`Bearer ${token}`},cache:'no-store'})}
export function mudarEstadoEvento(evento,acao,token){
  if(!['cancelar','encerrar'].includes(acao))throw new Error('Ação inválida.')
  return fetch(apiUrl(`/eventos/${evento.id}/${acao}`),{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({versao:evento.versao,estado_esperado:evento.status})})
}
