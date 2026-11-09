import { useEffect, useRef, useState } from 'react'

export function useNavegacao(pagina) {
  useEffect(() => {
    if (pagina !== 'login') sessionStorage.setItem('paginaAtual', pagina)
  }, [pagina])
}

const paginas = ['participante', 'solicitar-acesso', 'eventos', 'criar', 'custos', 'cotacao', 'ticket', 'perfil', 'admin',
  'fornecedor-mural', 'fornecedor-proposta', 'fornecedor-enviadas', 'fornecedor-cotacoes', 'fornecedor-contratos',
  'fornecedor-catalogo', 'fornecedor-desempenho', 'fornecedor-perfil']
const idValido = v => Number.isSafeInteger(v) && v > 0
const escopo = p => p.startsWith('fornecedor-') ? 'fornecedor' : p
function subtelaInicial(p, login = false) {
  if (p === 'login') return { login: Boolean(login) }
  if (p === 'participante') return { aba: 'inicio', eventoId: null }
  if (p === 'admin') return { secao: 'contas', eventoId: null, cotacaoId: null }
  return p.startsWith('fornecedor-') ? { cotacaoId: null } : null
}
function subtelaValida(p, d) {
  if (p === 'login') return typeof d?.login === 'boolean' ? { login: d.login } : null
  if (p === 'participante') return d && ['inicio', 'eventos', 'detalhes', 'ingressos', 'perfil'].includes(d.aba) && (d.aba !== 'detalhes' || idValido(d.eventoId))
    ? { aba: d.aba, eventoId: d.aba === 'detalhes' ? d.eventoId : null } : null
  if (p === 'admin') return d && ['contas', 'eventos', 'usuarios', 'cotacoes', 'propostas', 'perfil', 'painel'].includes(d.secao)
    && (d.eventoId == null || idValido(d.eventoId)) && (d.cotacaoId == null || idValido(d.cotacaoId))
    ? { secao: d.secao, eventoId: d.secao === 'painel' ? d.eventoId ?? null : null, cotacaoId: d.secao === 'cotacoes' ? d.cotacaoId ?? null : null } : null
  return p.startsWith('fornecedor-') && d && (d.cotacaoId == null || idValido(d.cotacaoId)) ? { cotacaoId: d.cotacaoId ?? null } : null
}

// Fragmentos guardam somente telas e IDs; não contêm tokens, dados pessoais ou rascunhos.
export function lerDestinoNavegacao(hash = typeof window === 'undefined' ? '' : window.location?.hash || '') {
  if (/^#lp-[a-z-]+$/.test(hash)) return { pagina: 'login', dados: { login: false }, contextoEvento: 'novo:0' }
  const m = /^#\/([a-z-]+)(?:\?([a-zA-Z0-9=&-]+))?$/.exec(hash)
  if (!m || !['inicio', 'entrar', 'cadastro', ...paginas].includes(m[1])) return null
  const p = ['inicio', 'entrar'].includes(m[1]) ? 'login' : m[1], q = {}
  for (const par of (m[2] || '').split('&').filter(Boolean)) {
    const [k, v, extra] = par.split('=')
    if (!['secao', 'evento', 'cotacao'].includes(k) || Object.hasOwn(q, k) || !v || extra !== undefined) return null
    q[k] = v
  }
  for (const k of ['evento', 'cotacao']) if (q[k] && (!/^[1-9]\d*$/.test(q[k]) || !idValido(Number(q[k])))) return null
  const eventoId = q.evento ? Number(q.evento) : null, cotacaoId = q.cotacao ? Number(q.cotacao) : null
  let dados = subtelaInicial(p, m[1] === 'entrar')
  if (p === 'participante') dados = subtelaValida(p, { aba: q.secao || 'inicio', eventoId })
  if (p === 'admin') dados = subtelaValida(p, { secao: q.secao || 'contas', eventoId, cotacaoId })
  if (p.startsWith('fornecedor-')) dados = { cotacaoId }
  if (['login', 'cadastro'].includes(p) && Object.keys(q).length) return null
  if (q.secao && !['participante', 'admin'].includes(p)) return null
  if (eventoId && !['participante', 'admin', 'criar', 'custos', 'cotacao', 'ticket'].includes(p)) return null
  if (cotacaoId && p !== 'admin' && !p.startsWith('fornecedor-')) return null
  if (p === 'participante' && (!dados || eventoId && dados.aba !== 'detalhes')) return null
  if (p === 'admin' && (!dados || eventoId && dados.secao !== 'painel' || cotacaoId && dados.secao !== 'cotacoes')) return null
  return { pagina: p, dados, contextoEvento: eventoId && ['criar', 'custos', 'cotacao', 'ticket'].includes(p) ? 'evento:' + eventoId : 'novo:0' }
}
export function urlDestinoNavegacao({ pagina: p, dados: d, contextoEvento: c }) {
  const q = []
  if (p === 'participante' && d?.aba !== 'inicio') q.push('secao=' + d.aba)
  if (p === 'admin' && d?.secao !== 'contas') q.push('secao=' + d.secao)
  if (['participante', 'admin'].includes(p) && d?.eventoId) q.push('evento=' + d.eventoId)
  if (d?.cotacaoId) q.push('cotacao=' + d.cotacaoId)
  if (['criar', 'custos', 'cotacao', 'ticket'].includes(p) && /^evento:[1-9]\d*$/.test(c || '')) q.push('evento=' + c.slice(7))
  return '#/' + (p === 'login' ? d?.login ? 'entrar' : 'inicio' : p) + (q.length ? '?' + q.join('&') : '')
}

export function useHistoricoNavegacao(pagina, { ativo, chaveSessao, contextoEvento, iniciarNoLogin, aoRestaurar }) {
  const [local, setLocal] = useState(null), [signalPendente, setPendente] = useState(null)
  const pendente = Boolean(signalPendente && !signalPendente.aborted)
  const [inicializado, setInicializado] = useState(() => !lerDestinoNavegacao())
  const controle = useRef(null), restaurar = useRef(aoRestaurar)
  const inicial = lerDestinoNavegacao()
  const dados = local?.escopo === escopo(pagina) && local.chave === chaveSessao ? local.dados
    : inicial?.pagina === pagina ? inicial.dados : subtelaInicial(pagina, iniciarNoLogin)
  const texto = JSON.stringify({ pagina, dados, contextoEvento })
  useEffect(() => { restaurar.current = aoRestaurar }, [aoRestaurar])
  useEffect(() => {
    if (!ativo || typeof window === 'undefined' || !window.history?.pushState) return
    const anterior = controle.current, m = window.history.state?.trocaticketNavegacao
    const atual = { chave: chaveSessao, pronto: false, substituir: true, ultima: null, ignorar: null,
      documento: m?.versao === 3 && typeof m.documento === 'string' ? m.documento : Date.now() + '-' + Math.random(),
      indice: m?.versao === 3 && Number.isSafeInteger(m.indice) ? m.indice : 0 }
    controle.current = atual
    let requisicao
    function aplicar(destino, inicio = false) {
      requisicao?.abort()
      const c = new AbortController(); requisicao = c
      function concluir(resultado) {
        if (c.signal.aborted) return
        setPendente(null); setInicializado(true); atual.pronto = true
        const alvo = window.history.state?.trocaticketNavegacao
        if (!resultado) {
          const delta = alvo?.documento === atual.documento && Number.isSafeInteger(alvo.indice) ? atual.indice - alvo.indice : 0
          if (!inicio && delta && window.history.go) { atual.ignorar = atual.indice; window.history.go(delta) }
          else if (atual.ultima) window.history.replaceState(window.history.state, '', urlDestinoNavegacao(JSON.parse(atual.ultima)))
          return
        }
        const p = typeof resultado === 'string' ? resultado : destino.pagina
        if (!inicio && alvo?.documento === atual.documento && Number.isSafeInteger(alvo.indice)) atual.indice = alvo.indice
        const proximo = { escopo: escopo(p), chave: chaveSessao, substituir: true,
          dados: p === destino.pagina ? destino.dados : subtelaInicial(p, p === 'login') }
        atual.aguardarLocal = proximo
        setLocal(proximo)
      }
      const resultado = restaurar.current(destino.pagina, destino.contextoEvento, c.signal)
      if (resultado && typeof resultado.then === 'function') { setPendente(c.signal); resultado.then(concluir).catch(() => concluir(false)) }
      else concluir(resultado)
    }
    const destino = !anterior ? lerDestinoNavegacao() : null
    if (destino) aplicar(destino, true)
    else { atual.pronto = true; setInicializado(true) }
    function voltar() {
      const m = window.history.state?.trocaticketNavegacao
      if (atual.ignorar !== null && m?.documento === atual.documento && m.indice === atual.ignorar) { atual.ignorar = null; return }
      const destino = lerDestinoNavegacao()
      if (destino) aplicar(destino)
    }
    window.addEventListener('popstate', voltar)
    return () => { requisicao?.abort(); window.removeEventListener('popstate', voltar) }
  }, [ativo, chaveSessao])
  useEffect(() => {
    const atual = controle.current
    if (!ativo || pendente || !atual?.pronto || atual.aguardarLocal && atual.aguardarLocal !== local || typeof window === 'undefined') return
    const substituirLocal = local?.substituir && local.chave === chaveSessao && atual.substituida !== local
    if (texto === atual.ultima && !atual.substituir && !substituirLocal) return
    const hash = urlDestinoNavegacao(JSON.parse(texto)), substituir = atual.substituir || substituirLocal || !atual.ultima || window.location?.hash === hash
    const indice = atual.indice + (substituir ? 0 : 1)
    try {
      window.history[substituir ? 'replaceState' : 'pushState']({ trocaticketNavegacao: { versao: 3, documento: atual.documento, indice } }, '', hash)
      atual.indice = indice; atual.ultima = texto; atual.substituir = false; atual.substituida = local; atual.aguardarLocal = null
    } catch { atual.substituir = true }
  }, [ativo, chaveSessao, texto, local, pendente])
  function mudar(valor, substituir = false) {
    setLocal(anterior => {
      const base = anterior?.escopo === escopo(pagina) && anterior.chave === chaveSessao ? anterior.dados : dados
      const validado = subtelaValida(pagina, typeof valor === 'function' ? valor(base) : valor)
      return validado ? { escopo: escopo(pagina), chave: chaveSessao, dados: validado, substituir } : anterior
    })
  }
  return { estado: dados, mudar, restaurando: Boolean(!inicializado || pendente) }
}
