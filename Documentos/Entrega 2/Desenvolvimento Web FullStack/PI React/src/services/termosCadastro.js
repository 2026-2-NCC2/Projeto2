import { apiUrl } from './api.js'
import termosUso from '../pages/publicas/termosUso.json' with { type: 'json' }

export async function consultarTermosCadastro(signal) {
  const resposta = await fetch(apiUrl('/termos/vigente'), { signal, cache: 'no-store' })
  const dados = await resposta.json()
  if (!resposta.ok || dados.disponivel !== true) throw new Error('Cadastro indisponível: os Termos de Uso ainda não possuem publicação aprovada ou infraestrutura validada.')
  const d = dados.documento
  if (!d || termosUso.estado !== 'aprovado' || typeof termosUso.aprovacao !== 'string' || !termosUso.aprovacao.trim() ||
    d.id !== termosUso.id || d.versao !== termosUso.versao || !/^[0-9a-f]{64}$/.test(d.hash) || JSON.stringify(d.conteudo) !== JSON.stringify(termosUso)) {
    throw new Error('O documento publicado é diferente desta página. Atualize a aplicação antes de aceitar os Termos.')
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(termosUso)))
  const hashLocal = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  if (hashLocal !== d.hash) throw new Error('Não foi possível conferir a integridade dos Termos apresentados. O cadastro permanece bloqueado.')
  return { documento: d.id, versao: d.versao, hash: d.hash }
}
