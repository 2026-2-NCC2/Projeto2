import { custosDaInterfaceParaPut, custosDaApiParaInterface, custosSemanticamenteIguais } from '../utils/custos.js'

export function motivoBloqueioPublicacao(contexto) {
  const { eventoId, chaveEvento, geracaoSessao, rascunho, custosRevisados, formularioPendente } = contexto
  if (!Number.isSafeInteger(eventoId) || eventoId <= 0 || chaveEvento !== `evento:${eventoId}` ||
      !rascunho || rascunho.geracaoSessao !== geracaoSessao) return 'Evento ou sessão inválidos.'
  if (formularioPendente || rascunho.basePersistida === null || rascunho.get.estado !== 'carregado' ||
      rascunho.put.estado !== 'ocioso' || rascunho.conflitoRemoto || rascunho.put.confirmarReenvio) {
    return 'Consulte e confirme os custos salvos antes de publicar.'
  }
  try {
    if (!rascunho.basePersistida.length) return 'Cadastre e salve pelo menos um custo.'
    if (!custosSemanticamenteIguais(rascunho.itens, rascunho.basePersistida) ||
        !custosSemanticamenteIguais(custosRevisados, rascunho.basePersistida)) {
      return 'Há alterações não salvas ou custos diferentes da lista revisada.'
    }
  } catch { return 'A lista de custos é inválida.' }
  return null
}

// Estado por evento/sessao sobrevive a troca de pagina enquanto o App estiver montado.
export function criarPublicadorCotacao(construirUrl, { executarFetch = (...args) => fetch(...args), tempoMs = 10000, operacoes = new Map() } = {}) {
  const url = construirUrl('/cotacoes')
  const disponivel = ['/api/cotacoes', 'http://localhost:3001/cotacoes'].includes(url)
  const estado = chave => operacoes.get(chave) ?? { estado: 'ocioso', mensagem: '' }
  const chaveDe = c => `${c.geracaoSessao}:${c.chaveEvento}`

  async function publicar(contexto, { atual = () => true, notificar = () => {} } = {}) {
    const chave = chaveDe(contexto)
    if (!disponivel) return { estado: 'bloqueado', mensagem: 'Destino da API de publicação não permitido.' }
    if (['publicando', 'incerto'].includes(estado(chave).estado)) return estado(chave)
    if (estado(chave).estado === 'conflito' && (contexto.rascunho?.get.estado !== 'carregado' ||
        contexto.rascunho.get.idRequisicao === estado(chave).getRequisicao)) return estado(chave)
    const motivo = motivoBloqueioPublicacao(contexto)
    if (motivo) return { estado: 'bloqueado', mensagem: motivo }
    if (!atual()) return { estado: 'obsoleto', mensagem: '' }
    const { eventoId, prazo, observacoes, token } = contexto
    const data = typeof prazo === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(prazo) ? new Date(`${prazo}T00:00:00Z`) : null
    if (!token || typeof token !== 'string' || !token.trim() || !data || Number.isNaN(data.getTime()) ||
        data.toISOString().slice(0, 10) !== prazo || prazo < new Date().toISOString().slice(0, 10) || typeof observacoes !== 'string') {
      return { estado: 'bloqueado', mensagem: 'Confira a sessão, o prazo e as observações.' }
    }
    const revisados = contexto.custosRevisados.map(item => ({ ...item }))
    const itens = custosDaInterfaceParaPut(revisados).custos
    const op = { estado: 'publicando', mensagem: 'Publicando cotação...' }
    operacoes.set(chave, op) // Trava sincrona, antes do primeiro await.
    notificar(op)
    const controller = new AbortController()
    let timer
    try {
      const resultado = await Promise.race([
        (async () => {
          const resposta = await executarFetch(url, {
            method: 'POST', signal: controller.signal, redirect: 'error', credentials: 'omit',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ evento_id: eventoId, prazo, observacoes, itens }),
          })
          if (resposta.status === 409) return { estado: 'conflito', getRequisicao: contexto.rascunho.get.idRequisicao,
            mensagem: 'Os custos mudaram. Consulte novamente os custos e revise antes de publicar.' }
          if ([400, 401, 403, 404].includes(resposta.status)) {
            return { estado: 'erro', mensagem: 'Publicação rejeitada. Confira sessão, evento, prazo e custos salvos.' }
          }
          if (resposta.status !== 201 || !resposta.ok) throw new Error()
          const dados = await resposta.json()
          const cotacao = dados?.cotacao
          if (!Number.isSafeInteger(cotacao?.id) || cotacao.id <= 0 || cotacao.evento_id !== eventoId || !Array.isArray(cotacao.itens)) throw new Error()
          const confirmados = custosDaApiParaInterface(cotacao.itens.map((item, indice) => ({
            ...item, id: indice + 1, evento_id: eventoId,
          })), eventoId)
          if (!custosSemanticamenteIguais(revisados, confirmados)) throw new Error()
          return { estado: 'sucesso', mensagem: 'Cotação publicada com os custos confirmados.', cotacaoId: cotacao.id }
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error()) }, tempoMs) }),
      ])
      operacoes.set(chave, resultado)
    } catch {
      operacoes.set(chave, { estado: 'incerto', mensagem: 'Resultado da publicação incerto. Consulte as cotações antes de qualquer nova tentativa. Não reenvie a publicação.' })
    } finally { clearTimeout(timer) }
    const resultado = estado(chave)
    if (atual()) notificar(resultado)
    return resultado
  }
  return { disponivel, estado: contexto => estado(chaveDe(contexto)), publicar,
    temPendencias: geracao => [...operacoes].some(([chave, op]) => chave.startsWith(`${geracao}:`) &&
      ['publicando', 'incerto'].includes(op.estado)) }
}
