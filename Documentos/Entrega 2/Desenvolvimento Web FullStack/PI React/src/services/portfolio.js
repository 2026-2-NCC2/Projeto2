import { apiUrl } from './api.js'
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)
function conferirPagina(dados, dono) {
  if (!dados || !Array.isArray(dados.itens) || dados.itens.length > 20 || !Number.isSafeInteger(dados.total) || dados.total < 0 ||
      !Number.isInteger(dados.pagina) || dados.pagina < 1 || !Number.isInteger(dados.totalPaginas) || dados.totalPaginas < 1) throw new Error('Resposta de portfólio inválida.')
  if (dono && dados.itens.some(i => !uuid(i.id) || i.fornecedor_id !== dono || !Number.isInteger(i.versao) || i.versao < 1 ||
      ['titulo','descricao','categoria'].some(k => typeof i[k] !== 'string' || !i[k].trim()))) throw new Error('Resposta de portfólio inválida.')
  if (!dono && dados.itens.some(i => !Number.isSafeInteger(i.id) || i.id <= 0 || typeof i.nome !== 'string')) throw new Error('Fornecedor inválido.')
  return dados
}
async function request(token, caminho, metodo, dados, signal) {
  if (!token) throw new Error('Faça login novamente.')
  try {
    const r = await fetch(apiUrl(caminho), { method: metodo, signal,
      headers: { Authorization: `Bearer ${token}`, ...(dados ? { 'Content-Type':'application/json' } : {}) },
      ...(dados ? { body: JSON.stringify(dados) } : {}),
    })
    if (!r.ok) {
      const mensagens = { 400:'Revise os campos e seus limites.', 401:'Faça login novamente.', 403:'Seu perfil não permite esta operação.',
        404:'Fornecedor não encontrado.', 409:'O item foi alterado ou não está disponível. Recarregue o portfólio.',
        503:'O portfólio está indisponível ou aguarda preparação do banco. Recarregue antes de repetir.' }
      throw Object.assign(new Error(mensagens[r.status] || 'Não foi possível confirmar a operação.'), { status:r.status })
    }
    const resposta = await r.json()
    if (signal?.aborted || sessionStorage.getItem('token') !== token) throw new Error('A sessão foi alterada.')
    return resposta
  } catch (erro) { throw Object.assign(new Error(erro.message || 'Resultado não confirmado. Recarregue antes de repetir.'),
    { status:erro.status, incerto:metodo !== 'GET' && (!erro.status || [409,500,503].includes(erro.status)) }) }
}
export async function consultarPortfolio({ token, donoId, publico = false, pagina = 1, signal }) {
  if (!Number.isSafeInteger(donoId) || donoId <= 0 || !Number.isInteger(pagina) || pagina < 1) throw new Error('Fornecedor inválido.')
  const dados = await request(token, `${publico ? '/fornecedores/'+donoId+'/portfolio' : '/portfolio'}?pagina=${pagina}`, 'GET', undefined, signal)
  if (publico && (dados.fornecedor?.id !== donoId || typeof dados.fornecedor.nome !== 'string')) throw new Error('Fornecedor inválido.')
  return conferirPagina(dados, donoId)
}
export async function salvarItemPortfolio({ token, donoId, item, dados, signal }) {
  if (item && !uuid(item.id)) throw new Error('Item inválido.')
  const corpo = Object.fromEntries(['titulo','descricao','categoria'].map(k => [k,dados[k]]))
  const resposta = await request(token, item ? '/portfolio/'+item.id : '/portfolio', item ? 'PATCH' : 'POST',
    { ...corpo, ...(item ? { versao:item.versao } : {}) }, signal)
  try {
    conferirPagina({itens:[resposta],total:1,pagina:1,totalPaginas:1},donoId)
    if ((item && resposta.id !== item.id) || resposta.versao !== (item ? item.versao+1 : 1) ||
        Object.keys(corpo).some(k => resposta[k] !== corpo[k].trim())) throw new Error()
  } catch { throw Object.assign(new Error('Salvamento não confirmado. Recarregue antes de repetir.'), {incerto:true}) }
  return resposta
}
export async function removerItemPortfolio({ token, item, signal }) {
  if (!uuid(item?.id)) throw new Error('Item inválido.')
  return request(token, '/portfolio/'+item.id, 'DELETE', {versao:item.versao}, signal)
}
export async function listarFornecedoresPortfolio({ token, pagina = 1, signal }) {
  return conferirPagina(await request(token, '/fornecedores?pagina='+pagina, 'GET', undefined, signal))
}
