import { useEffect, useRef, useState } from 'react'
import { useBlocker, useLocation, useNavigate } from 'react-router'
import { destinoDaLocalizacao, subtelaInicial, subtelaValida, urlDestinoNavegacao } from '../router/contratos.js'
export { lerDestinoNavegacao, urlDestinoNavegacao } from '../router/contratos.js'

export function useNavegacao(pagina) {
  useEffect(() => {
    if (pagina !== 'login' && pagina !== 'nao-encontrada') sessionStorage.setItem('paginaAtual', pagina)
  }, [pagina])
}

// A URL do React Router é a fonte da página. Nenhum listener ou índice de histórico próprio.
export function usePaginaRoteada() {
  const localizacao = useLocation(), navegar = useNavigate()
  const destino = destinoDaLocalizacao(localizacao)
  function definirPagina(pagina, contextoEvento = 'novo:0') {
    const dados = subtelaInicial(pagina)
    const alvo = urlDestinoNavegacao({ pagina, dados, contextoEvento }).slice(1)
    if (alvo !== localizacao.pathname + localizacao.search) navegar(alvo, { state: { ttTransicaoValidada: true } })
  }
  return { paginaSolicitada: destino?.pagina || 'nao-encontrada', definirPagina, localizacao, destino }
}

export function useHistoricoNavegacao(pagina, { ativo, chaveSessao, contextoEvento, iniciarNoLogin, aoRestaurar }) {
  const localizacao = useLocation(), navegar = useNavigate()
  const [pronto, setPronto] = useState(null)
  const [pendente, setPendente] = useState(false)
  const restaurar = useRef(aoRestaurar), autorizado = useRef(null)
  const edicao = useRef(null)
  const id = `${chaveSessao}:${localizacao.key}`
  const destino = destinoDaLocalizacao(localizacao)
  const dados = destino?.pagina === pagina ? destino.dados : subtelaInicial(pagina, iniciarNoLogin || pagina === 'login')
  useEffect(() => { restaurar.current = aoRestaurar }, [aoRestaurar])

  // O data HashRouter desfaz POP recusado e preserva a pilha real de Voltar/Avançar.
  const bloqueio = useBlocker(({ historyAction, nextLocation }) => ativo &&
    (historyAction === 'POP' || historyAction === 'PUSH' && !nextLocation.state?.ttTransicaoValidada))
  useEffect(() => {
    if (bloqueio.state !== 'blocked') return
    const controle = new AbortController()
    const proximo = destinoDaLocalizacao(bloqueio.location)
    const resultadoInicial = restaurar.current(proximo?.pagina || 'nao-encontrada', proximo?.contextoEvento || 'novo:0', controle.signal)
    if (resultadoInicial?.then) setPendente(true)
    Promise.resolve(resultadoInicial)
      .then(resultado => {
        if (controle.signal.aborted) return
        setPendente(false)
        if (!resultado) { bloqueio.reset(); return }
        autorizado.current = { url: bloqueio.location.pathname + bloqueio.location.search, resultado }
        bloqueio.proceed()
      }).catch(() => { if (!controle.signal.aborted) { setPendente(false); bloqueio.reset() } })
    return () => controle.abort()
  }, [bloqueio])

  useEffect(() => {
    if (!ativo) return
    const controle = new AbortController()
    const url = localizacao.pathname + localizacao.search
    const aplicado = autorizado.current?.url === url ? autorizado.current : null
    autorizado.current = null
    const alvo = destinoDaLocalizacao(localizacao)
    const resultadoInicial = aplicado ? aplicado.resultado : restaurar.current(alvo?.pagina || 'nao-encontrada', alvo?.contextoEvento || 'novo:0', controle.signal)
    if (resultadoInicial?.then) setPendente(true)
    Promise.resolve(resultadoInicial)
      .then(resultado => {
        if (controle.signal.aborted) return
        if (resultado && resultado !== (alvo?.pagina || 'nao-encontrada')) {
          navegar(urlDestinoNavegacao({ pagina: resultado, dados: subtelaInicial(resultado), contextoEvento: 'novo:0' }).slice(1), { replace: true })
        }
        setPronto(id)
        setPendente(false)
      }).catch(() => { if (!controle.signal.aborted) { setPronto(id); setPendente(false) } })
    return () => controle.abort()
  }, [ativo, id, localizacao, navegar])

  function mudar(valor, substituir = false) {
    // Updaters consecutivos no mesmo evento usam a intenção mais recente.
    const base = edicao.current?.origem === localizacao.key ? edicao.current.dados : dados
    const validado = subtelaValida(pagina, typeof valor === 'function' ? valor(base) : valor)
    if (!validado) return
    edicao.current = { origem: localizacao.key, dados: validado }
    const alvo = urlDestinoNavegacao({ pagina, dados: validado, contextoEvento: destino?.contextoEvento }).slice(1)
    if (alvo !== localizacao.pathname + localizacao.search) navegar(alvo, { replace: substituir })
  }
  const precisaContexto = destino?.pagina === pagina && ['criar', 'custos', 'cotacao', 'ticket'].includes(pagina) && destino.contextoEvento !== contextoEvento
  return { estado: dados, mudar, restaurando: ativo && (pronto === null || pendente || precisaContexto) }
}
