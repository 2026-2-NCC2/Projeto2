import { useEffect, useState } from 'react'
import { listarAdmin, requisicaoAdmin } from '../services/admin.js'

export function useConsultaAdmin(caminho, lista = true, manterDadosAoAtualizar = false) {
  const [recurso, setRecurso] = useState({ carregando: true, dados: lista ? [] : null, erro: null })
  const [versao, setVersao] = useState(0)
  useEffect(() => {
    const controle = new AbortController()
    const consultar = lista ? listarAdmin : requisicaoAdmin
    consultar(caminho, { signal: controle.signal }).then(dados => {
      if (!controle.signal.aborted) setRecurso({ dados, carregando: false, erro: null })
    }).catch(erro => {
      if (!controle.signal.aborted) setRecurso({ dados: lista ? [] : null, carregando: false, erro })
    })
    return () => controle.abort()
  }, [caminho, lista, versao])
  function recarregar() {
    setRecurso(atual => ({ dados: manterDadosAoAtualizar ? atual.dados : lista ? [] : null, carregando: true, erro: null }))
    setVersao(v => v + 1)
  }
  function atualizar(alterar) { setRecurso(atual => ({ ...atual, dados: alterar(atual.dados) })) }
  return { ...recurso, recarregar, atualizar }
}
