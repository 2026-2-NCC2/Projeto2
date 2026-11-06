import { apiUrl } from './api.js'

export async function consultarPainelEvento(id, { token, signal } = {}) {
  if (!token) throw Object.assign(new Error('Sua sessão expirou. Entre novamente.'), { status: 401 })
  const resposta = await fetch(apiUrl(`/admin/eventos/${id}/painel`), {
    method: 'GET', headers: { Authorization: `Bearer ${token}` }, signal,
  })
  if (!resposta.ok) {
    const mensagens = { 401: 'Sua sessão expirou. Entre novamente.', 403: 'Somente administradores podem consultar este painel.', 404: 'Evento não encontrado. Selecione outro evento.' }
    throw Object.assign(new Error(mensagens[resposta.status] || 'Não foi possível carregar o painel. Tente novamente.'), { status: resposta.status })
  }
  const dados = await resposta.json()
  if (dados?.evento?.id !== id || !Array.isArray(dados.custos) || !Array.isArray(dados.cotacoes) || !Array.isArray(dados.propostas) || !dados.resumo) {
    throw new Error('O painel retornou dados incompletos. Tente novamente.')
  }
  return dados
}

export function moedaPainel(valor) {
  // NUMERIC textual: preservar centavos sem converter montantes para Number.
  const partes = String(valor).match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/)
  if (!partes) return 'Valor indisponível'
  const [, sinal, inteiro, fracao = ''] = partes
  return `${sinal}R$ ${BigInt(inteiro).toLocaleString('pt-BR')},${fracao.padEnd(2, '0')}`
}

export function dataPainel(valor) {
  if (!valor) return 'Não informada'
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? 'Não informada' : data.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}
