import { apiUrl } from './api.js'

const limiteBytes = 5_000_000
const arquivo = 'dados-privacidade.json'
const falha = () => new Error('Não foi possível confirmar a cópia limitada. Nenhum arquivo foi disponibilizado.')
const objeto = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const chaves = (v, campos) => objeto(v) && Object.keys(v).length === campos.length && campos.every(k => Object.hasOwn(v, k))
const exigir = v => { if (!v) throw falha() }
const categorias = ['cadastro', 'perfil_pessoal', 'perfil_profissional', 'atividades', 'portfolio', 'aceites']

export function validarExportacao(d, id) {
  exigir(chaves(d, ['versao', 'escopo', 'situacao', 'situacao_consulta', 'snapshot_transacional_unico', 'categorias', 'limitacoes']))
  exigir(d.versao === 1 && d.escopo === 'copia_limitada' && d.situacao === 'limitada' &&
    d.snapshot_transacional_unico === false && ['disponivel', 'limitada'].includes(d.situacao_consulta))
  exigir(chaves(d.categorias, categorias) && Array.isArray(d.limitacoes) && d.limitacoes.length > 0 && d.limitacoes.every(t => typeof t === 'string'))
  for (const nome of categorias) {
    const s = d.categorias[nome], excluida = ['perfil_pessoal', 'perfil_profissional'].includes(nome)
    exigir(chaves(s, excluida ? ['estado', 'dados', 'excluida_por_minimizacao'] : ['estado', 'dados']))
    exigir(['disponivel', 'infraestrutura_pendente', 'nao_habilitado'].includes(s.estado))
    if (excluida) { exigir(s.dados === null && s.excluida_por_minimizacao === true); continue }
    if (s.estado !== 'disponivel') { exigir(s.dados === null && !['cadastro', 'atividades'].includes(nome)); continue }
    if (nome === 'cadastro') exigir(chaves(s.dados, ['id', 'perfil']) && s.dados.id === id && ['participante', 'organizador', 'fornecedor', 'admin'].includes(s.dados.perfil))
    else if (nome === 'aceites') {
      const versoes = new Set()
      exigir(Array.isArray(s.dados))
      for (const a of s.dados) {
        exigir(chaves(a, ['documento', 'versao', 'aceito_em', 'fluxo']) && a.documento === 'termos-uso' && a.fluxo === 'cadastro' &&
          typeof a.versao === 'string' && /^[a-zA-Z0-9._-]{1,80}$/.test(a.versao) && !versoes.has(a.versao) &&
          typeof a.aceito_em === 'string' && Number.isFinite(Date.parse(a.aceito_em)) && new Date(a.aceito_em).toISOString() === a.aceito_em)
        versoes.add(a.versao)
      }
    } else {
      const campos = nome === 'portfolio' ? ['itens'] : ['eventos_organizados', 'inscricoes', 'propostas_enviadas', 'solicitacoes_acesso']
      exigir(chaves(s.dados, campos) && campos.every(k => Number.isSafeInteger(s.dados[k]) && s.dados[k] >= 0))
    }
  }
  exigir(d.situacao_consulta === (categorias.some(n => d.categorias[n].estado !== 'disponivel') ? 'limitada' : 'disponivel'))
  return d
}

function conferirSessao(token, signal) {
  if (signal?.aborted || !token || sessionStorage.getItem('token') !== token) throw new Error('A sessão mudou ou o download foi cancelado. Faça login novamente se necessário.')
}

export async function baixarCopiaPrivacidade(token, id, signal) {
  conferirSessao(token, signal)
  exigir(Number.isSafeInteger(id) && id > 0)
  const r = await fetch(apiUrl('/minha-privacidade/exportacao'), {
    method: 'GET', cache: 'no-store', signal, headers: { Authorization: `Bearer ${token}` },
  })
  if (!r.ok) throw new Error([401, 403].includes(r.status) ? 'Faça login novamente para baixar seus dados.' : 'Exportação indisponível. A geração pode aguardar validação operacional. Tente novamente mais tarde.')
  exigir(r.headers.get('content-type')?.split(';')[0].trim() === 'application/json' &&
    r.headers.get('content-disposition') === `attachment; filename="${arquivo}"`)
  const tamanho = r.headers.get('content-length')
  exigir(tamanho === null || (/^\d+$/.test(tamanho) && Number(tamanho) <= limiteBytes))
  // Leitura limitada tambem no cliente: nunca acumula corpo acima do limite.
  const reader = r.body?.getReader()
  exigir(reader)
  const partes = []; let bytes = 0
  try {
    for (;;) {
      conferirSessao(token, signal)
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      exigir(bytes <= limiteBytes)
      partes.push(value)
    }
  } catch (e) { await reader.cancel().catch(() => {}); throw e }
  finally { reader.releaseLock() }
  const buffer = new Uint8Array(bytes); let offset = 0
  for (const p of partes) { buffer.set(p, offset); offset += p.byteLength }
  const d = validarExportacao(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)), id)
  conferirSessao(token, signal)
  const blob = new Blob([JSON.stringify(d)], { type: 'application/json' })
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  try {
    conferirSessao(token, signal)
    link.href = url; link.download = arquivo; link.hidden = true
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
