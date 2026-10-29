import { useState, useRef, useLayoutEffect, useEffect, useMemo } from 'react'
import { apiUrl } from '../services/api.js'
import { criarPublicadorCotacao, motivoBloqueioPublicacao } from '../services/publicarCotacao.js'

export function usePublicacaoCotacao({ eventoId, chaveEvento, geracaoSessao, rascunho, formularioPendente,
  formularioPendenteRef, geracaoSessaoRef, selecaoEventoRef, paginaAtualRef, setRascunhos }) {
  const [operacoes] = useState(() => new Map())
  // Fast Refresh recalcula o cliente, mas preserva operacoes pendentes/incertas.
  const cliente = useMemo(() => criarPublicadorCotacao(apiUrl, { operacoes }), [operacoes])
  const [, atualizar] = useState(0)
  const contexto = { eventoId, chaveEvento, geracaoSessao, rascunho }
  const contextoRef = useRef(null)
  useLayoutEffect(() => { contextoRef.current = contexto })
  const estado = cliente.estado(contexto)
  const temPendencias = cliente.temPendencias(geracaoSessao)
  useEffect(() => {
    if (!temPendencias) return
    const avisar = evento => { evento.preventDefault(); evento.returnValue = '' }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [temPendencias])
  const conflitoPendente = estado.estado === 'conflito' &&
    (rascunho?.get.estado !== 'carregado' || rascunho.get.idRequisicao === estado.getRequisicao)
  const motivo = !cliente.disponivel
    ? 'Destino da API de publicação não permitido.'
    : conflitoPendente ? estado.mensagem
      : motivoBloqueioPublicacao({ ...contexto, custosRevisados: rascunho?.itens, formularioPendente })

  async function publicar({ prazo, observacoes, custosRevisados }) {
    if (contextoRef.current?.rascunho !== rascunho) {
      return { estado: 'obsoleto', contextoAtual: false }
    }
    const selecao = { ...selecaoEventoRef.current }
    const token = sessionStorage.getItem('token')
    const atual = () => geracaoSessaoRef.current === geracaoSessao &&
      selecaoEventoRef.current.chave === chaveEvento && selecaoEventoRef.current.versao === selecao.versao &&
      sessionStorage.getItem('token') === token
    const notificar = resultado => {
      if (!atual()) return
      if (resultado.estado === 'conflito') {
        setRascunhos(atuais => {
          const anterior = atuais[chaveEvento]
          if (!anterior || anterior.geracaoSessao !== geracaoSessao) return atuais
          return { ...atuais, [chaveEvento]: { ...anterior,
            get: { ...anterior.get, estado: 'erro', erro: resultado.mensagem } } }
        })
      }
      atualizar(n => n + 1)
    }
    const resultado = await cliente.publicar({ ...contexto, prazo, observacoes, custosRevisados, token,
      formularioPendente: formularioPendenteRef.current }, { atual, notificar })
    const ultimo = contextoRef.current
    return { ...resultado, contextoAtual: atual() && paginaAtualRef.current === 'cotacao' &&
      ultimo?.rascunho?.revisaoLocal === rascunho?.revisaoLocal &&
      !motivoBloqueioPublicacao({ ...ultimo, custosRevisados, formularioPendente: formularioPendenteRef.current }) }
  }
  return { ...estado, motivo, publicar, temPendencias, disponivel: cliente.disponivel,
    bloqueada: Boolean(motivo) || ['publicando', 'incerto'].includes(estado.estado),
    publicando: estado.estado === 'publicando' }
}
