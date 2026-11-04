import { apiUrl } from './api.js'

export function validarArquivoImagem(tipo, arquivo) {
  const limite = tipo === 'foto' ? 5242880 : tipo === 'capa' ? 10485760 : 0
  if (!limite || !arquivo || !Number.isSafeInteger(arquivo.size) || arquivo.size < 1 || arquivo.size > limite) throw new Error('Arquivo vazio ou acima do limite permitido.')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(arquivo.type)) throw new Error('Escolha uma imagem JPEG, PNG ou WebP.')
}
export function conferirImagem(imagem, tipo, id) {
  if (imagem === null) return null
  const bucket = tipo === 'foto' ? 'perfil-fotos' : 'perfil-capas'
  if (!imagem || typeof imagem.url !== 'string' || imagem.expira_em_segundos !== 120) throw new Error('Resposta de imagem inválida.')
  const url = new URL(imagem.url)
  const caminho = new RegExp(`^/storage/v1/object/sign/${bucket}/${id}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.webp$`)
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.username || url.password || url.hash || !caminho.test(url.pathname)) throw new Error('Endereço de imagem inválido.')
  return imagem
}
export async function acessarImagem({ token, id, tipo, metodo = 'GET', arquivo, signal }) {
  if (!token || !Number.isSafeInteger(id) || id <= 0 || !['foto', 'capa'].includes(tipo) || !['GET','PUT','DELETE'].includes(metodo)) throw new Error('Sessão ou operação inválida.')
  if (metodo === 'PUT') validarArquivoImagem(tipo, arquivo)
  let resposta
  try {
    resposta = await fetch(apiUrl(`/perfil/imagens/${tipo}`), {
      method: metodo, signal, headers: { Authorization: `Bearer ${token}`,
        ...(metodo === 'PUT' ? { 'Content-Type': 'application/octet-stream' } : {}) },
      ...(metodo === 'PUT' ? { body: arquivo } : {}),
    })
  } catch { throw new Error('Resultado não confirmado. Consulte suas imagens antes de tentar novamente.') }
  if (signal?.aborted || sessionStorage.getItem('token') !== token) throw new Error('A sessão foi alterada.')
  if (!resposta.ok) {
    // Não propagar detalhes ou URLs do SDK. Escritas nunca são repetidas.
    const mensagens = { 401: 'Faça login novamente.', 409: 'Existe uma operação pendente. Consulte suas imagens.',
      413: 'A imagem excede o tamanho permitido.', 415: 'Envie JPEG, PNG ou WebP.',
      422: 'Imagem inválida, animada ou com dimensões não permitidas.', 429: 'Muitas tentativas. Aguarde antes de continuar.',
      503: 'Imagens indisponíveis ou resultado não confirmado. Consulte antes de repetir.' }
    throw new Error(mensagens[resposta.status] || 'Não foi possível concluir a operação de imagem.')
  }
  const dados = await resposta.json()
  return metodo === 'GET' ? conferirImagem(dados.imagem, tipo, id) : dados
}
