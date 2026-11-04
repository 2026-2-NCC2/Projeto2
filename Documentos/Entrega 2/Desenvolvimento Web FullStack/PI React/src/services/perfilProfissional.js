import { apiUrl } from './api.js'

const redes = ['instagram', 'linkedin', 'facebook', 'tiktok', 'site_pessoal']
const comerciais = ['nome_comercial', 'descricao', 'telefone_comercial', 'email_comercial', 'cidade', 'site_oficial', 'categorias_servicos']
export function urlProfissionalSegura(valor) {
  if (typeof valor !== 'string' || valor.length > 2048 || /[\s\p{Cc}\\]/u.test(valor) || !/^https:\/\//i.test(valor)) return false
  try { const url = new URL(valor); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password } catch { return false }
}
export function conferirProfissional(perfil, id) {
  if (!perfil || perfil.id !== id || perfil.edicao_disponivel !== true || !['organizador', 'fornecedor', 'participante', 'admin'].includes(perfil.perfil)) throw new Error('Não foi possível confirmar os dados profissionais. Recarregue o perfil.')
  for (const [campo, permitidos] of [['redes_sociais', redes], ['dados_comerciais', comerciais]]) {
    const secao = perfil[campo]
    if (secao === null) continue
    if (!secao || typeof secao !== 'object' || Array.isArray(secao) || Object.keys(secao).some(k => !permitidos.includes(k)) ||
        Object.entries(secao).some(([k, v]) => k === 'categorias_servicos' ? !Array.isArray(v) || v.some(c => typeof c !== 'string') : typeof v !== 'string' || ((campo === 'redes_sociais' || k === 'site_oficial') && !urlProfissionalSegura(v)))) throw new Error('Resposta profissional inválida. Recarregue o perfil.')
  }
  return perfil
}
export async function acessarProfissional(token, id, dados, signal) {
  if (!token) throw new Error('Faça login novamente.')
  const resposta = await fetch(apiUrl('/perfil/profissional'), {
    method: dados === undefined ? 'GET' : 'PATCH', signal,
    headers: { Authorization: `Bearer ${token}`, ...(dados === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(dados === undefined ? {} : { body: JSON.stringify(dados) }),
  })
  const perfil = await resposta.json()
  if (!resposta.ok) throw Object.assign(new Error(perfil?.erro || 'Não foi possível confirmar os dados profissionais. Recarregue o perfil.'), { indisponivel: resposta.status === 503 })
  if (signal?.aborted || sessionStorage.getItem('token') !== token) throw new Error('A sessão foi alterada. Faça login novamente.')
  return conferirProfissional(perfil, id)
}
