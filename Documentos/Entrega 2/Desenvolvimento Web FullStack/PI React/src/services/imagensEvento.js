import { apiUrl } from './api.js'
import { validarArquivoImagem } from './imagensPerfil.js'

export function conferirImagensEvento(eventoId, imagens) {
  if (!Number.isSafeInteger(eventoId) || eventoId <= 0 || !Array.isArray(imagens) || imagens.length > 9) throw new Error('Imagens do evento inválidas.')
  const posicoes = new Set()
  for (const imagem of imagens) {
    if (!imagem || !Number.isInteger(imagem.posicao) || imagem.posicao < 0 || imagem.posicao > 8 || posicoes.has(imagem.posicao) || imagem.expira_em_segundos !== 120) throw new Error('Imagens do evento inválidas.')
    posicoes.add(imagem.posicao)
    const url = new URL(imagem.url)
    const caminho = new RegExp(`^/storage/v1/object/sign/eventos-imagens/${eventoId}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.webp$`)
    if (url.origin !== 'https://gnwybroqfvwosiqzsfla.supabase.co' || url.username || url.password || url.hash || !caminho.test(url.pathname)) throw new Error('Endereço de imagem inválido.')
  }
  return imagens
}

// Contrato candidato; nenhuma chamada é feita sem admissão explícita futura.
export async function acessarImagensEvento({ token, eventoId, metodo = 'GET', posicao, arquivo, signal, habilitado = false }) {
  if (!habilitado) throw new Error('Imagens de eventos ainda indisponíveis.')
  if (!token || !Number.isSafeInteger(eventoId) || eventoId <= 0 || !['GET','PUT','DELETE'].includes(metodo)) throw new Error('Operação inválida.')
  if (metodo !== 'GET' && (!Number.isInteger(posicao) || posicao < 0 || posicao > 8)) throw new Error('Posição inválida.')
  if (metodo === 'PUT') validarArquivoImagem('capa', arquivo)
  const r = await fetch(apiUrl(`/eventos/${eventoId}/imagens${metodo === 'GET' ? '' : '/' + posicao}`), {
    method: metodo, signal, headers: { Authorization: `Bearer ${token}`, ...(metodo === 'PUT' ? { 'Content-Type':'application/octet-stream' } : {}) },
    ...(metodo === 'PUT' ? { body: arquivo } : {}),
  }).catch(()=>{throw new Error(metodo==='GET'?'Não foi possível consultar as imagens. Tente consultar novamente.':'Operação não confirmada. Consulte as imagens antes de repetir.')})
  if (!r.ok) {
    const mensagens={401:'Faça login novamente.',403:'Sem permissão para alterar estas imagens.',404:'Evento não encontrado ou sem permissão.',409:'Evento finalizado ou envio pendente. Consulte as imagens antes de repetir.',413:'O arquivo excede 10 MiB.',415:'Envie JPEG, PNG ou WebP.',422:'Imagem inválida ou animada.',429:'Muitas solicitações. Aguarde um minuto.',503:'Imagens indisponíveis ou operação não confirmada. Consulte antes de repetir.'}
    throw new Error(mensagens[r.status]||'Operação não confirmada. Consulte o evento antes de repetir.')
  }
  const dados = await r.json()
  if (signal?.aborted || sessionStorage.getItem('token') !== token) throw new Error('A sessão foi alterada.')
  return metodo === 'GET' ? conferirImagensEvento(eventoId, dados.imagens) : dados
}

export async function capacidadesImagensEvento(token,signal) {
  if(!token)return {consultar:false,alterar:false}
  const r=await fetch(apiUrl('/eventos/imagens/capacidades'),{signal,cache:'no-store',headers:{Authorization:`Bearer ${token}`}})
  if(!r.ok)throw new Error('Imagens de eventos aguardam liberação.')
  const dados=await r.json()
  if(signal?.aborted||sessionStorage.getItem('token')!==token)throw new Error('Sessão alterada.')
  return {consultar:dados.consultar===true,alterar:dados.alterar===true}
}
