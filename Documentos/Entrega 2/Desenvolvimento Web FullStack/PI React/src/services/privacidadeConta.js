import { apiUrl } from './api.js'

const categorias = ['cadastro', 'perfil_pessoal', 'perfil_profissional', 'atividades', 'portfolio', 'aceites']
const objeto = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const falha = () => new Error('Não foi possível confirmar os dados de privacidade. Tente novamente.')
export function validarConsultaPrivacidade(dados, id) {
  if (!objeto(dados) || dados.versao !== 1 || !['disponivel', 'limitada'].includes(dados.situacao) ||
      !objeto(dados.categorias) || !Array.isArray(dados.limitacoes) || !dados.limitacoes.every(v => typeof v === 'string')) throw falha()
  for (const nome of categorias) {
    const secao = dados.categorias[nome]
    if (!objeto(secao) || !['disponivel', 'infraestrutura_pendente', 'nao_habilitado'].includes(secao.estado) ||
        (secao.estado !== 'disponivel' && secao.dados !== null) || (secao.estado === 'disponivel' && secao.dados === null)) throw falha()
  }
  const limitada = categorias.some(nome => dados.categorias[nome].estado !== 'disponivel')
  if ((dados.situacao === 'limitada') !== limitada || dados.categorias.atividades.estado !== 'disponivel') throw falha()
  const cadastro = dados.categorias.cadastro
  if (cadastro.estado !== 'disponivel' || !objeto(cadastro.dados) || cadastro.dados.id !== id ||
      typeof cadastro.dados.nome !== 'string' || typeof cadastro.dados.email !== 'string' ||
      !['participante', 'organizador', 'fornecedor', 'admin'].includes(cadastro.dados.perfil)) throw falha()
  for (const nome of ['atividades', 'portfolio']) {
    const secao = dados.categorias[nome]
    const campos = nome === 'portfolio' ? ['itens'] : ['eventos_organizados', 'inscricoes', 'propostas_enviadas', 'solicitacoes_acesso']
    if (secao.estado === 'disponivel' && (!objeto(secao.dados) || campos.some(k => !Number.isSafeInteger(secao.dados[k]) || secao.dados[k] < 0))) throw falha()
  }
  const aceites = dados.categorias.aceites
  if (aceites.estado === 'disponivel' && (!Array.isArray(aceites.dados) || aceites.dados.some(a => !objeto(a) ||
      a.documento !== 'termos-uso' || typeof a.versao !== 'string' || !/^[a-f0-9]{64}$/.test(a.hash_documento) ||
      typeof a.aceito_em !== 'string' || !Number.isFinite(Date.parse(a.aceito_em)) || a.fluxo !== 'cadastro'))) throw falha()
  for (const nome of ['perfil_pessoal', 'perfil_profissional']) {
    const secao = dados.categorias[nome]
    if (secao.estado === 'disponivel' && !objeto(secao.dados)) throw falha()
  }
  const pessoal = dados.categorias.perfil_pessoal
  if (pessoal.estado === 'disponivel' && ['telefone', 'biografia'].some(k => pessoal.dados[k] !== null && typeof pessoal.dados[k] !== 'string')) throw falha()
  const profissional = dados.categorias.perfil_profissional
  if (profissional.estado === 'disponivel' && ['redes_sociais', 'dados_comerciais'].some(k => profissional.dados[k] !== null && !objeto(profissional.dados[k]))) throw falha()
  return dados
}

export async function consultarPrivacidadeConta(token, id, signal) {
  if (!token || !Number.isSafeInteger(id) || id <= 0) throw new Error('Faça login novamente para consultar seus dados.')
  const resposta = await fetch(apiUrl('/minha-privacidade/dados'), {
    method: 'GET', cache: 'no-store', signal, headers: { Authorization: `Bearer ${token}` },
  })
  if (!resposta.ok) throw new Error([401, 403].includes(resposta.status)
    ? 'Sua sessão não permite esta consulta. Faça login novamente.'
    : 'Consulta de privacidade indisponível. Tente novamente mais tarde.')
  const dados = await resposta.json()
  if (signal?.aborted || sessionStorage.getItem('token') !== token) throw new Error('A sessão mudou. Faça login novamente.')
  return validarConsultaPrivacidade(dados, id)
}
