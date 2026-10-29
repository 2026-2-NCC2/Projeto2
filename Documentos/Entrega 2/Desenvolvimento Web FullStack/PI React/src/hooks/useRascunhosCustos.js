import { useState, useRef, useCallback, useEffect } from 'react'
import { criarRascunhoCustos, rascunhoCustosTemAlteracoes } from '../utils/rascunhosCustos.js'
import { custosSemanticamenteIguais } from '../utils/custos.js'

export function useRascunhosCustos({ geracaoSessaoRef }) {
  const [rascunhos, setRascunhos] = useState(() => ({
    'novo:0': criarRascunhoCustos(0),
  }))
  const [formularioCustosPendente, definirFormularioCustosPendente] = useState(false)
  const formularioCustosPendenteRef = useRef(false)
  const setFormularioCustosPendente = useCallback((pendente) => {
    formularioCustosPendenteRef.current = pendente
    definirFormularioCustosPendente(pendente)
  }, [])
  const [contextoFormularioCustos, setContextoFormularioCustos] = useState(0)
  const temRascunhos = Object.values(rascunhos).some(rascunhoCustosTemAlteracoes)

  useEffect(() => {
    if (!temRascunhos && !formularioCustosPendente) return
    const avisarAoSair = (evento) => {
      evento.preventDefault()
      evento.returnValue = ''
    }
    window.addEventListener('beforeunload', avisarAoSair)
    return () => window.removeEventListener('beforeunload', avisarAoSair)
  }, [temRascunhos, formularioCustosPendente])

  function garantirRascunho(chave) {
    const geracaoAtual = geracaoSessaoRef.current
    setRascunhos(atuais => {
      if (atuais[chave]?.geracaoSessao === geracaoAtual) return atuais
      return { ...atuais, [chave]: criarRascunhoCustos(geracaoAtual) }
    })
  }

  function removerRascunho(chave) {
    setRascunhos(atuais => {
      const restantes = { ...atuais }
      delete restantes[chave]
      return restantes
    })
  }

  function atualizarCustos(chave, geracaoDoCallback, proximosCustos) {
    // A geracao vem do render que originou o callback, nunca da sessao nova.
    if (geracaoDoCallback !== geracaoSessaoRef.current) return
    setRascunhos(atuais => {
      const rascunho = atuais[chave]
      if (!rascunho || rascunho.geracaoSessao !== geracaoDoCallback) return atuais
      const itens = typeof proximosCustos === 'function'
        ? proximosCustos(rascunho.itens)
        : proximosCustos
      const mudouConteudo = !custosSemanticamenteIguais(rascunho.itens, itens)
      return {
        ...atuais,
        [chave]: {
          ...rascunho,
          itens,
          revisaoLocal: rascunho.revisaoLocal + (mudouConteudo ? 1 : 0),
          put: { ...rascunho.put, mensagem: rascunho.put.confirmarReenvio ? rascunho.put.mensagem : null },
        },
      }
    })
  }

  // O setter original e compartilhado com persistencia, publicacao e migracao.
  return { rascunhos, setRascunhos, garantirRascunho, removerRascunho, atualizarCustos,
    formularioCustosPendente, formularioCustosPendenteRef, setFormularioCustosPendente,
    contextoFormularioCustos, setContextoFormularioCustos, temRascunhos }
}
