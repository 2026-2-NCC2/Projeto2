import { apiUrl } from './api.js'

async function requisitar(caminho, options = {}) {
  const token = sessionStorage.getItem('token')
  if (!token) throw Object.assign(Error('Sessão expirada. Entre novamente.'), { status: 401 })
  const escrita = Boolean(options.method)
  const controle = new AbortController()
  const cancelar = () => controle.abort()
  options.signal?.addEventListener('abort', cancelar, { once: true })
  if (options.signal?.aborted) controle.abort()
  const timer = setTimeout(cancelar, 15000)
  try {
    let r
    try { r = await fetch(apiUrl(caminho), { ...options, signal: controle.signal, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, cache: 'no-store' }) }
    catch { throw Object.assign(Error('Não foi possível confirmar a operação. Consulte a lista antes de repetir.'), { resultadoIncerto: escrita }) }
    let data
    try { data = await r.json() } catch { throw Object.assign(Error('Resposta incompleta. Consulte novamente.'), { status: r.status, resultadoIncerto: escrita }) }
    if (sessionStorage.getItem('token') !== token) throw Object.assign(Error('A sessão mudou. Entre novamente.'), { resultadoIncerto: escrita })
    if (!r.ok) {
      // Gateway/erro sem contrato explícito não comprova rollback da escrita.
      const confirmada = typeof data?.resultado_incerto === 'boolean'
      throw Object.assign(Error(typeof data?.erro === 'string' ? data.erro : 'Consulta indisponível.'), {
        status: r.status, resultadoIncerto: data?.resultado_incerto === true || (escrita && !confirmada && (r.status >= 500 || r.status === 408)),
      })
    }
    return data
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancelar) }
}
export const capacidadesContratacoes = signal => requisitar('/contratacoes/capacidades', { signal })
const estados = ['ativo', 'concluido', 'cancelado']
export function validarContratacao(c) {
  return c && ['id','proposta_id','evento_id','cotacao_id','organizador_id','fornecedor_id','versao'].every(k => Number.isSafeInteger(c[k]) && c[k] > 0) &&
    estados.includes(c.estado) && typeof c.servico === 'string' && typeof c.condicoes_pagamento === 'string' &&
    c.moeda === 'BRL' && /^\d+(\.\d{1,2})?$/.test(String(c.valor_acordado)) &&
    typeof c.formalizado_em === 'string' && Number.isFinite(Date.parse(c.formalizado_em))
}
export async function listarContratacoes(evento, signal) {
  const data = await requisitar('/contratacoes' + (evento ? '?evento=' + evento : ''), { signal })
  if (!Array.isArray(data) || data.some(c => !validarContratacao(c)) || new Set(data.map(c => c.id)).size !== data.length) throw Error('Lista incompleta ou inválida. Atualize a consulta.')
  return data
}
async function confirmar(caminho, options) {
  const data = await requisitar(caminho, options)
  if (!validarContratacao(data)) throw Object.assign(Error('Confirmação incompleta. Consulte a lista antes de repetir.'), { resultadoIncerto: true })
  return data
}
export const formalizarContratacao = proposta => confirmar('/contratacoes', { method: 'POST', body: JSON.stringify({ proposta_id: proposta }) })
export const alterarContratacao = (contrato, estado, motivo) => confirmar('/contratacoes/' + contrato.id, { method: 'PATCH', body: JSON.stringify({ estado, motivo, versao: contrato.versao }) })
