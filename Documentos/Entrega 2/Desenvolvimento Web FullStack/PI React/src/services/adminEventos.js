import { apiUrl } from './api.js'
import { requisicaoAdmin } from './admin.js'

export async function capacidadesAdminEventos({ signal } = {}) {
  const c = await requisicaoAdmin('/admin/eventos/capacidades', { signal })
  if (typeof c?.criar !== 'boolean' || typeof c.controleCapacidade !== 'boolean') throw new Error('Disponibilidade não confirmada.')
  return c
}

// Uma chave por tentativa lógica. Resultado incerto nunca troca a chave/payload.
export function criarEnvioAdmin({ enviar = fetch, uuid = () => crypto.randomUUID(), storage = sessionStorage } = {}) {
  let tentativa = null, ocupado = false
  return async dados => {
    if (ocupado) throw new Error('Aguarde o envio em andamento.')
    const token = storage.getItem('token')
    if (!token) throw new Error('Sessão expirada. Entre novamente.')
    const texto = JSON.stringify(dados)
    if (tentativa && (tentativa.texto !== texto || tentativa.token !== token)) throw new Error('Consulte Eventos antes de iniciar outro cadastro: há uma tentativa não confirmada.')
    if (!tentativa && storage.getItem('adminEventoPendente')) throw new Error('Há um cadastro anterior a conferir em Eventos. Não repita o cadastro.')
    tentativa ||= { texto, token, chave: uuid() }
    ocupado = true
    try {
      storage.setItem('adminEventoPendente', '1')
      const r = await enviar(apiUrl('/admin/eventos'), { method: 'POST', headers: {
        Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': tentativa.chave,
      }, body: tentativa.texto })
      const b = await r.json()
      if (!r.ok) {
        // Apenas erros definitivos anteriores à escrita permitem corrigir o formulário.
        if ([400, 401, 403].includes(r.status) && b.resultado_incerto === false) {
          tentativa = null; storage.removeItem('adminEventoPendente')
        }
        throw new Error(b.erro || 'Resultado não confirmado. Consulte Eventos antes de repetir.')
      }
      if (!Number.isSafeInteger(b?.evento?.id) || b.evento.id <= 0 || b.evento.usuario_id !== dados.organizador_id) throw new Error('Resposta incompleta. Consulte Eventos antes de repetir.')
      if (storage.getItem('token') !== token) throw new Error('Sessão alterada. Consulte Eventos para confirmar o cadastro.')
      storage.removeItem('adminEventoPendente'); tentativa = null
      return b.evento
    } catch (erro) {
      erro.resultadoIncerto = tentativa !== null
      throw erro
    } finally { ocupado = false }
  }
}
