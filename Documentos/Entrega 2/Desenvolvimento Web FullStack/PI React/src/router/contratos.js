export const paginas = ['participante', 'solicitar-acesso', 'eventos', 'criar', 'custos', 'cotacao', 'ticket', 'perfil', 'admin',
  'fornecedor-mural', 'fornecedor-proposta', 'fornecedor-enviadas', 'fornecedor-cotacoes', 'fornecedor-contratos',
  'fornecedor-catalogo', 'fornecedor-desempenho', 'fornecedor-perfil']
const idValido = v => Number.isSafeInteger(v) && v > 0
export function subtelaInicial(p, login = false) {
  if (p === 'login') return { login: Boolean(login) }
  if (p === 'participante') return { aba: 'inicio', eventoId: null }
  if (p === 'admin') return { secao: 'inicio', eventoId: null, cotacaoId: null }
  return p.startsWith('fornecedor-') ? { cotacaoId: null } : null
}
export function subtelaValida(p, d) {
  if (p === 'login') return typeof d?.login === 'boolean' ? { login: d.login } : null
  if (p === 'participante') return d && ['inicio', 'eventos', 'detalhes', 'ingressos', 'perfil'].includes(d.aba) && (d.aba !== 'detalhes' || idValido(d.eventoId))
    ? { aba: d.aba, eventoId: d.aba === 'detalhes' ? d.eventoId : null } : null
  if (p === 'admin') return d && ['inicio', 'novo-evento', 'relatorios', 'contas', 'eventos', 'usuarios', 'cotacoes', 'propostas', 'perfil', 'painel'].includes(d.secao)
    && (d.eventoId == null || idValido(d.eventoId)) && (d.cotacaoId == null || idValido(d.cotacaoId))
    ? { secao: d.secao, eventoId: d.secao === 'painel' ? d.eventoId ?? null : null, cotacaoId: d.secao === 'cotacoes' ? d.cotacaoId ?? null : null } : null
  return p.startsWith('fornecedor-') && d && (d.cotacaoId == null || idValido(d.cotacaoId)) ? { cotacaoId: d.cotacaoId ?? null } : null
}

// Fragmentos guardam somente telas e IDs; não contêm tokens, dados pessoais ou rascunhos.
export function lerDestinoNavegacao(hash = typeof window === 'undefined' ? '' : window.location?.hash || '') {
  if (hash === '' || hash === '#' || hash === '#/') return { pagina: 'login', dados: { login: false }, contextoEvento: 'novo:0' }
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
  if (p === 'admin') dados = subtelaValida(p, { secao: q.secao || 'inicio', eventoId, cotacaoId })
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
  if (p === 'admin' && d?.secao !== 'inicio') q.push('secao=' + d.secao)
  if (['participante', 'admin'].includes(p) && d?.eventoId) q.push('evento=' + d.eventoId)
  if (d?.cotacaoId) q.push('cotacao=' + d.cotacaoId)
  if (['criar', 'custos', 'cotacao', 'ticket'].includes(p) && /^evento:[1-9]\d*$/.test(c || '')) q.push('evento=' + c.slice(7))
  return '#/' + (p === 'login' ? d?.login ? 'entrar' : 'inicio' : p) + (q.length ? '?' + q.join('&') : '')
}
export const rotasPublicas = ['privacidade', 'termos', 'contato-privacidade', 'preferencias-privacidade']
export function destinoDaLocalizacao(location) {
  const caminho = location.pathname.replace(/\/$/, '') || '/'
  if (rotasPublicas.includes(caminho.slice(1)) && !location.search) return { pagina: caminho.slice(1), dados: null, contextoEvento: 'novo:0' }
  if (/^\/?lp-[a-z-]+$/.test(caminho) && !location.search) return lerDestinoNavegacao('#' + caminho.replace(/^\//, ''))
  return lerDestinoNavegacao('#' + caminho + location.search)
}

