// Preencher somente com um endereço real, monitorado e aprovado para atendimento.
// Configurar o contato não transforma as minutas em documentos aprovados.
export const configuracaoPrivacidade = Object.freeze({ email: '' })

export function contatoPrivacidade(email = configuracaoPrivacidade.email) {
  if (typeof email !== 'string') return null
  const valor = email.trim()
  if (!/^[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d](?:[a-z\d.-]*[a-z\d])?\.[a-z]{2,}$/i.test(valor)) return null
  const dominio = valor.split('@')[1].toLowerCase()
  if (/(^|\.)(example\.(com|org|net)|invalid|example|test|localhost)$/.test(dominio)) return null
  return valor
}
