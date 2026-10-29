import { useCallback, useEffect, useRef } from 'react'
import { apiUrl } from '../services/api.js'
import { criarClienteCustos } from '../services/custosEvento.js'
import { iniciarRequisicaoCustos, concluirGetCustos, concluirPutCustos, falharRequisicaoCustos } from '../utils/rascunhosCustos.js'

const cliente = criarClienteCustos(apiUrl)

export function useCustosPersistidos({ pagina, chaveEvento, rascunhos, setRascunhos,
  geracaoSessao, geracaoSessaoRef, formularioPendenteRef, selecaoEventoRef }) {
  const requisicoes = useRef(new Map())
  const contador = useRef(0)
  const abertura = useRef(null)
  const rascunho = rascunhos[chaveEvento]
  const eventoId = chaveEvento.startsWith('evento:') ? Number(chaveEvento.slice(7)) : null
  const ativo = ['criar', 'custos', 'cotacao', 'ticket'].includes(pagina) &&
    Number.isSafeInteger(eventoId) && eventoId > 0

  const alterar = useCallback((requisicao, transformar) => {
    if (geracaoSessaoRef.current !== requisicao.geracaoSessao) return
    setRascunhos(atuais => {
      const anterior = atuais[requisicao.chave]
      if (!anterior || anterior.geracaoSessao !== requisicao.geracaoSessao) return atuais
      const proximo = transformar(anterior)
      return anterior === proximo ? atuais : { ...atuais, [requisicao.chave]: proximo }
    })
  }, [setRascunhos, geracaoSessaoRef])

  const executar = useCallback(async (metodo) => {
    const chaveOperacao = `${geracaoSessao}:${chaveEvento}`
    if (!cliente.disponivel || !eventoId || !rascunho ||
        geracaoSessaoRef.current !== geracaoSessao || requisicoes.current.has(chaveOperacao)) return
    if (metodo === 'PUT') {
      if (rascunho.basePersistida === null || rascunho.get.estado !== 'carregado' ||
          rascunho.put.estado === 'resultadoIncerto' || formularioPendenteRef.current) return
      if ((rascunho.conflitoRemoto || rascunho.put.confirmarReenvio) && !window.confirm(
        `${rascunho.put.confirmarReenvio ? 'A operação anterior pode ainda terminar. ' : ''}O servidor pode possuir custos diferentes. Salvar substituirá toda a lista do evento. Deseja continuar?`
      )) return
    }
    const requisicao = { id: ++contador.current, metodo, chave: chaveEvento,
      geracaoSessao, revisaoInicial: rascunho.revisaoLocal }
    const itensEnviados = rascunho.itens.map(item => ({ ...item }))
    requisicoes.current.set(chaveOperacao, requisicao.id)
    alterar(requisicao, atual => iniciarRequisicaoCustos(atual, requisicao))
    try {
      const token = sessionStorage.getItem('token')
      const servidor = metodo === 'GET'
        ? await cliente.carregar(eventoId, token)
        : await cliente.salvar(eventoId, itensEnviados, token)
      const formularioPendente = selecaoEventoRef.current.chave === requisicao.chave && formularioPendenteRef.current
      alterar(requisicao, atual => metodo === 'GET'
        ? concluirGetCustos(atual, requisicao, servidor, formularioPendente)
        : concluirPutCustos(atual, requisicao, servidor))
    } catch (erro) {
      alterar(requisicao, atual => falharRequisicaoCustos(atual, requisicao, erro))
    } finally {
      if (requisicoes.current.get(chaveOperacao) === requisicao.id) requisicoes.current.delete(chaveOperacao)
    }
  }, [chaveEvento, eventoId, geracaoSessao, geracaoSessaoRef, rascunho, alterar, formularioPendenteRef, selecaoEventoRef])

  useEffect(() => {
    if (!ativo || !cliente.disponivel) { abertura.current = null; return }
    const identidade = `${geracaoSessao}:${chaveEvento}`
    if (abertura.current === identidade) return
    abertura.current = identidade
    void executar('GET')
  }, [ativo, chaveEvento, geracaoSessao, executar])

  return { disponivel: cliente.disponivel, carregar: () => executar('GET'), salvar: () => executar('PUT') }
}
