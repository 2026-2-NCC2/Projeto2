const MAXIMO_CENTAVOS = 999999999999

function lerCentavos(valor, aceitarVirgula) {
  if (typeof valor !== 'number' && typeof valor !== 'string') {
    throw new TypeError('O valor monetário deve ser um número ou uma string decimal.')
  }
  if (typeof valor === 'number' && !Number.isFinite(valor)) {
    throw new RangeError('O valor monetário deve ser finito.')
  }

  const texto = String(valor).trim()
  const formato = aceitarVirgula ? /^\d+(?:[.,]\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/
  if (!formato.test(texto)) {
    throw new RangeError('Informe um valor não negativo, sem separador de milhar e com até duas casas decimais.')
  }

  const [parteInteira, parteDecimal = ''] = texto.replace(',', '.').split('.')
  const inteiro = parteInteira.replace(/^0+(?=\d)/, '')
  if (inteiro.length > 10) {
    throw new RangeError('O valor monetário não pode exceder 9999999999.99.')
  }

  const exato = BigInt(inteiro) * 100n + BigInt(parteDecimal.padEnd(2, '0'))
  if (exato > BigInt(MAXIMO_CENTAVOS)) {
    throw new RangeError('O valor monetário não pode exceder 9999999999.99.')
  }

  // Todo DECIMAL(12,2) cabe em centavos inteiros seguros de JavaScript.
  const centavos = Number(exato)
  if (!Number.isSafeInteger(centavos) || (typeof valor === 'number' && centavos / 100 !== valor)) {
    throw new RangeError('A conversão monetária causaria perda de precisão.')
  }
  return centavos
}

/** Aceita reais numéricos ou texto decimal com ponto/vírgula; nunca arredonda. */
export function valorParaCentavos(valor) {
  return lerCentavos(valor, true)
}

/** Retorna o contrato numérico em reais utilizado pelas telas. */
export function centavosParaReais(centavos) {
  if (typeof centavos !== 'number') {
    throw new TypeError('Os centavos devem ser numéricos.')
  }
  if (!Number.isSafeInteger(centavos) || centavos < 0 || centavos > MAXIMO_CENTAVOS) {
    throw new RangeError('Os centavos devem ser inteiros seguros dentro de DECIMAL(12,2).')
  }

  const reais = centavos / 100
  if (lerCentavos(reais, false) !== centavos) {
    throw new RangeError('A conversão para reais causaria perda de precisão.')
  }
  return reais
}

function decimalParaApi(centavos) {
  const exato = BigInt(centavos)
  return `${exato / 100n}.${(exato % 100n).toString().padStart(2, '0')}`
}

function validarArray(lista) {
  if (!Array.isArray(lista)) throw new TypeError('A lista de custos deve ser um array.')
}

function validarId(id, nome) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new TypeError(`${nome} deve ser um inteiro positivo e seguro.`)
  }
}

function validarTexto(item, campo, limite) {
  if (!Object.hasOwn(item, campo) || typeof item[campo] !== 'string') {
    throw new TypeError(`${campo} deve ser uma string obrigatória.`)
  }
  const texto = item[campo].trim()
  if (!texto || Array.from(texto).length > limite) {
    throw new RangeError(`${campo} deve conter de 1 a ${limite} caracteres.`)
  }
  return texto
}

function normalizarItem(item, campoValor, exigirNumero) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new TypeError('Cada custo deve ser um objeto.')
  }
  const categoria = validarTexto(item, 'categoria', 100)
  const descricao = validarTexto(item, 'descricao', 255)
  if (!Object.hasOwn(item, campoValor) || (exigirNumero && typeof item[campoValor] !== 'number')) {
    throw new TypeError(`${campoValor} é obrigatório e deve respeitar o tipo do contrato.`)
  }
  return { categoria, descricao, centavos: lerCentavos(item[campoValor], false) }
}

/** Valida toda a resposta, inclusive IDs únicos e o evento, antes de retornar. */
export function custosDaApiParaInterface(resposta, eventoId) {
  validarId(eventoId, 'O ID do evento solicitado')
  validarArray(resposta)
  const ids = new Set()
  const convertidos = []

  for (const item of resposta) {
    const normalizado = normalizarItem(item, 'valor_estimado', false)
    if (!Object.hasOwn(item, 'id') || !Object.hasOwn(item, 'evento_id')) {
      throw new TypeError('O custo recebido deve possuir id e evento_id.')
    }
    validarId(item.id, 'O ID do custo')
    validarId(item.evento_id, 'O ID do evento recebido')
    if (item.evento_id !== eventoId) throw new RangeError('O custo recebido pertence a outro evento.')
    if (ids.has(item.id)) throw new RangeError('A resposta contém IDs de custos duplicados.')
    ids.add(item.id)

    convertidos.push({
      id: item.id,
      evento_id: item.evento_id,
      categoria: normalizado.categoria,
      descricao: normalizado.descricao,
      valor: centavosParaReais(normalizado.centavos),
    })
  }
  return convertidos
}

function normalizarListaInterface(custos) {
  validarArray(custos)
  // Array.from também visita posições vazias, que devem ser rejeitadas.
  return Array.from(custos, (item) => normalizarItem(item, 'valor', true))
}

/** Produz o corpo completo do PUT; IDs locais ou antigos não são enviados. */
export function custosDaInterfaceParaPut(custos) {
  return {
    custos: normalizarListaInterface(custos).map((item) => ({
      categoria: item.categoria,
      descricao: item.descricao,
      valor_estimado: decimalParaApi(item.centavos),
    })),
  }
}

/** Compara listas da interface, na ordem, ignorando IDs e normalizando apenas trim. */
export function custosSemanticamenteIguais(custosA, custosB) {
  const listaA = normalizarListaInterface(custosA)
  const listaB = normalizarListaInterface(custosB)
  return listaA.length === listaB.length && listaA.every((item, indice) => (
    item.categoria === listaB[indice].categoria &&
    item.descricao === listaB[indice].descricao &&
    item.centavos === listaB[indice].centavos
  ))
}
