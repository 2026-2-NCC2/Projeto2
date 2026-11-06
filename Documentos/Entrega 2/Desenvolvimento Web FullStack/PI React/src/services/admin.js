import { apiUrl } from './api.js'

export const nomesPerfis = { admin: 'Administrador', participante: 'Participante', organizador: 'Organizador', fornecedor: 'Fornecedor' }

export async function requisicaoAdmin(caminho, { signal, method = 'GET', body } = {}) {
  const token = sessionStorage.getItem('token')
  if (!token) throw Object.assign(new Error('Sessão expirada. Entre novamente.'), { status: 401 })
  let resposta
  try {
    resposta = await fetch(apiUrl(caminho), { method, signal, headers: {
      Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}) })
  } catch (erro) {
    if (erro.name === 'AbortError') throw erro
    throw new Error(method === 'GET' ? 'Não foi possível conectar. Tente atualizar a consulta.' : 'Resultado não confirmado. Atualize a lista antes de repetir a decisão.', { cause: erro })
  }
  if (!resposta.ok) {
    const mensagens = { 401: 'Sessão expirada. Entre novamente.', 403: 'Você não tem permissão para esta consulta.', 404: 'Registro não encontrado. Atualize a lista.', 409: 'Conflito: esta solicitação pode ter sido analisada ou o perfil mudou. Atualize a lista.' }
    throw Object.assign(new Error(mensagens[resposta.status] || (method === 'GET' ? 'Não foi possível carregar os dados. Tente novamente.' : 'Resultado não confirmado. Atualize a lista antes de repetir a decisão.')), { status: resposta.status })
  }
  try { return await resposta.json() }
  catch { throw new Error(method === 'GET' ? 'Resposta incompleta. Atualize a consulta.' : 'Resultado não confirmado. Atualize a lista antes de repetir a decisão.') }
}

export function listarAdmin(caminho, opcoes) {
  return requisicaoAdmin(caminho, opcoes).then(dados => {
    if (!Array.isArray(dados)) throw new Error('Resposta de consulta incompleta. Atualize a lista.')
    return dados
  })
}

export function criarDecisorAcesso(enviar = requisicaoAdmin) {
  const emAndamento = new Set()
  return async function decidir(id, status) {
    if (emAndamento.has(id)) return { ignorado: true }
    if (!Number.isSafeInteger(id) || id <= 0 || !['aprovado', 'rejeitado'].includes(status)) throw new Error('Decisão inválida.')
    emAndamento.add(id)
    try {
      const resposta = await enviar(`/solicitacoes-acesso/${id}`, { method: 'PATCH', body: { status } })
      const mensagemEsperada = status === 'aprovado' ? 'Solicitação aprovada com sucesso!' : 'Solicitação rejeitada com sucesso!'
      if (resposta?.mensagem !== mensagemEsperada) throw new Error('Resultado não confirmado. Atualize a lista antes de repetir a decisão.')
      return { status }
    } finally { emAndamento.delete(id) }
  }
}

export const normalizarBusca = valor => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim()
export function filtrarCatalogo(tipo, dados, filtros) {
  const busca = normalizarBusca(filtros.busca)
  return dados.filter(item => {
    const texto = tipo === 'usuarios' ? `${item.nome} ${item.email}` : item.nome
    return (!busca || normalizarBusca(texto).includes(busca)) &&
      (!filtros.estado || item.status === filtros.estado) && (!filtros.perfil || item.perfil === filtros.perfil) &&
      (!filtros.evento || String(item.evento_id) === filtros.evento) && (!filtros.fornecedor || String(item.fornecedor_id) === filtros.fornecedor)
  })
}
export function diaSolicitacao(valor) {
  const data = new Date(valor)
  if (!valor || Number.isNaN(data.getTime())) return ''
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(data)
  const p = tipo => partes.find(x => x.type === tipo).value
  return `${p('year')}-${p('month')}-${p('day')}`
}
export function filtrarSolicitacoes(dados, filtros) {
  if (filtros.inicio && filtros.fim && filtros.inicio > filtros.fim) return []
  return dados.filter(item => {
    const dia = diaSolicitacao(item.criada_em)
    return (!filtros.estado || item.status === filtros.estado) && (!filtros.tipo || item.perfil_solicitado === filtros.tipo) &&
      (!filtros.inicio || dia >= filtros.inicio) && (!filtros.fim || Boolean(dia) && dia <= filtros.fim)
  }).sort((a, b) => {
    if (filtros.ordem === 'nome') return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR') || a.id - b.id
    const da = Date.parse(a.criada_em), db = Date.parse(b.criada_em)
    if (!Number.isFinite(da)) return Number.isFinite(db) ? 1 : a.id - b.id
    if (!Number.isFinite(db)) return -1
    return (filtros.ordem === 'antigas' ? da - db : db - da) || a.id - b.id
  })
}
