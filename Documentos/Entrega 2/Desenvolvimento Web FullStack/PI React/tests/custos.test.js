import test from 'node:test'
import assert from 'node:assert/strict'
import {
  valorParaCentavos,
  centavosParaReais,
  custosDaApiParaInterface,
  custosDaInterfaceParaPut,
  custosSemanticamenteIguais,
} from '../src/utils/custos.js'

const itemApi = (campos = {}) => ({
  id: 1, evento_id: 42, categoria: 'Áudio', descricao: 'Sonorização',
  valor_estimado: '0.10', ...campos,
})
const itemInterface = (campos = {}) => ({
  id: 'local-1', categoria: 'Áudio', descricao: 'Sonorização', valor: 0.1, ...campos,
})

test('converte valores válidos em centavos exatos, incluindo zero e o limite', () => {
  const casos = [
    [0, 0], [0.1, 10], [0.2, 20], [0.29, 29], [9999999999.99, 999999999999],
    ['0', 0], ['0,10', 10], ['0.20', 20], ['9999999999,99', 999999999999],
    ['9999999999.99', 999999999999], ['00000001.20', 120], [' 12,34 ', 1234],
  ]
  for (const [valor, esperado] of casos) assert.equal(valorParaCentavos(valor), esperado)
})

test('rejeita valores vazios e tipos que poderiam ser convertidos implicitamente', () => {
  for (const valor of ['', ' ', '\t\n', null, undefined, true, false, [], {}, 1n, new Number(1)]) {
    assert.throws(() => valorParaCentavos(valor))
  }
})

test('rejeita negativos, valores não finitos, inseguros e acima de DECIMAL(12,2)', () => {
  for (const valor of [-1, '-0.01', NaN, Infinity, -Infinity, 'NaN', 'Infinity',
    10000000000, '10000000000.00', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1,
    '9007199254740993', '9999999999.999']) {
    assert.throws(() => valorParaCentavos(valor))
  }
})

test('rejeita formatos malformados, agrupamentos e notação exponencial em texto', () => {
  for (const valor of ['1e2', '1E+2', '.5', ',5', '1.', '1,', '+1', 'R$ 1,00',
    '1 000', '1.234,56', '1,234.56', '1..00', '1,,00', '0x10', '１２', '1\n2']) {
    assert.throws(() => valorParaCentavos(valor))
  }
})

test('não arredonda casas extras nem resíduos de ponto flutuante', () => {
  for (const valor of ['1.230', '0.100', '1.0000000000000001', '0,001', 1.005,
    0.1 + 0.2, 0.0000001, 9999999999.999]) {
    assert.throws(() => valorParaCentavos(valor))
  }
})

test('converte centavos seguros para o contrato numérico em reais', () => {
  for (const [centavos, esperado] of [[0, 0], [1, 0.01], [10, 0.1], [20, 0.2],
    [29, 0.29], [999999999999, 9999999999.99]]) {
    assert.equal(centavosParaReais(centavos), esperado)
    assert.equal(valorParaCentavos(esperado), centavos)
  }
})

test('rejeita centavos fracionários, inseguros, negativos ou de tipo incorreto', () => {
  for (const valor of [null, undefined, '', '10', true, 1n, -1, 0.5, NaN, Infinity,
    1000000000000, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => centavosParaReais(valor))
  }
})

test('converte a resposta completa, preservando IDs, ordem e valores em reais', () => {
  const resposta = [itemApi({ id: 8, valor_estimado: '0.10' }), itemApi({ id: 3, valor_estimado: 0.2 })]
  assert.deepEqual(custosDaApiParaInterface(resposta, 42), [
    { id: 8, evento_id: 42, categoria: 'Áudio', descricao: 'Sonorização', valor: 0.1 },
    { id: 3, evento_id: 42, categoria: 'Áudio', descricao: 'Sonorização', valor: 0.2 },
  ])
})

test('aceita listas vazias sem confundir resposta inválida com ausência de custos', () => {
  assert.deepEqual(custosDaApiParaInterface([], 42), [])
  assert.deepEqual(custosDaInterfaceParaPut([]), { custos: [] })
  assert.equal(custosSemanticamenteIguais([], []), true)
  for (const resposta of [null, undefined, {}, { custos: [] }, '', 0, true]) {
    assert.throws(() => custosDaApiParaInterface(resposta, 42), TypeError)
  }
})

test('valida o ID solicitado mesmo quando a resposta é vazia', () => {
  for (const id of [undefined, null, 0, -1, 1.5, '42', true, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => custosDaApiParaInterface([], id), TypeError)
  }
})

test('rejeita tipos inválidos de itens e posições vazias da resposta', () => {
  for (const item of [null, undefined, [], 1, 'item', true, new Date()]) {
    assert.throws(() => custosDaApiParaInterface([item], 42))
  }
  assert.throws(() => custosDaApiParaInterface(new Array(1), 42))
})

test('exige IDs numéricos positivos, seguros e únicos na API', () => {
  for (const id of [undefined, null, 0, -1, 1.5, '1', true, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => custosDaApiParaInterface([itemApi({ id })], 42), TypeError)
  }
  assert.throws(() => custosDaApiParaInterface([itemApi(), itemApi()], 42), RangeError)
})

test('rejeita evento_id divergente ou com tipo incorreto em qualquer item', () => {
  for (const evento_id of [undefined, null, '42', true, 0, -1, 1.5, 43, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => custosDaApiParaInterface([itemApi(), itemApi({ id: 2, evento_id })], 42))
  }
})

test('exige categoria e descrição válidas nos dois contratos', () => {
  for (const campo of ['categoria', 'descricao']) {
    const limite = campo === 'categoria' ? 100 : 255
    for (const valor of [undefined, null, 0, false, {}, [], '', '   ', 'A'.repeat(limite + 1)]) {
      assert.throws(() => custosDaApiParaInterface([itemApi({ [campo]: valor })], 42))
      assert.throws(() => custosDaInterfaceParaPut([itemInterface({ [campo]: valor })]))
    }
  }
})

test('conta caracteres Unicode e normaliza somente espaços nas extremidades', () => {
  const categoria = '🎟'.repeat(100)
  const descricao = 'á'.repeat(255)
  const recebidos = custosDaApiParaInterface([itemApi({ categoria: ` ${categoria} `, descricao })], 42)
  assert.equal(recebidos[0].categoria, categoria)
  assert.equal(recebidos[0].descricao, descricao)
  assert.throws(() => custosDaApiParaInterface([itemApi({ categoria: `${categoria}🎟` })], 42))
  assert.throws(() => custosDaInterfaceParaPut([itemInterface({ descricao: `${descricao}á` })]))
})

test('a API aceita somente números ou decimais com ponto, sem fallback para valor', () => {
  for (const valor_estimado of [undefined, null, false, {}, [], '', ' ', '0,10', '1.001',
    -1, NaN, Infinity, '10000000000.00', 0.1 + 0.2]) {
    assert.throws(() => custosDaApiParaInterface([itemApi({ valor_estimado })], 42))
  }
  const semValorEstimado = itemApi()
  delete semValorEstimado.valor_estimado
  semValorEstimado.valor = 0.1
  assert.throws(() => custosDaApiParaInterface([semValorEstimado], 42))
})

test('valida integralmente sem modificar ou devolver parcialmente a lista de origem', () => {
  const resposta = Object.freeze([
    Object.freeze(itemApi()),
    Object.freeze(itemApi({ id: 2, evento_id: 43 })),
  ])
  assert.throws(() => custosDaApiParaInterface(resposta, 42))
  assert.equal(resposta[0].valor_estimado, '0.10')
  assert.equal(resposta[1].evento_id, 43)
  const herdado = Object.create(itemApi())
  assert.throws(() => custosDaApiParaInterface([herdado], 42))
})

test('gera o objeto do PUT com decimais exatos e sem identificadores', () => {
  const origem = Object.freeze([
    Object.freeze(itemInterface({ id: 'local-1', evento_id: 42, categoria: ' Áudio ', valor: 0 })),
    Object.freeze(itemInterface({ id: 999, valor: 0.1 })),
    Object.freeze(itemInterface({ id: 1000, valor: 9999999999.99 })),
  ])
  assert.deepEqual(custosDaInterfaceParaPut(origem), { custos: [
    { categoria: 'Áudio', descricao: 'Sonorização', valor_estimado: '0.00' },
    { categoria: 'Áudio', descricao: 'Sonorização', valor_estimado: '0.10' },
    { categoria: 'Áudio', descricao: 'Sonorização', valor_estimado: '9999999999.99' },
  ] })
  assert.equal(origem[0].categoria, ' Áudio ')
})

test('exige item.valor numérico e rejeita a lista inteira para PUT inválido', () => {
  for (const lista of [null, undefined, {}, 'custos', [null], [[]], new Array(1)]) {
    assert.throws(() => custosDaInterfaceParaPut(lista))
  }
  for (const valor of [undefined, null, '', '0.10', '0,10', false, NaN, Infinity, -1,
    0.001, 0.1 + 0.2, 10000000000, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => custosDaInterfaceParaPut([itemInterface(), itemInterface({ valor })]))
  }
})

test('compara conteúdo igual com IDs diferentes e normalização equivalente ao backend', () => {
  assert.equal(custosSemanticamenteIguais(
    [itemInterface({ id: 'local-1', categoria: ' Áudio ', evento_id: 42 })],
    [itemInterface({ id: 99, categoria: 'Áudio', evento_id: 100 })],
  ), true)
})

test('detecta diferenças de ordem, quantidade, categoria, descrição e centavos', () => {
  const primeiro = itemInterface()
  const segundo = itemInterface({ id: 'local-2', descricao: 'Outro item', valor: 0.2 })
  assert.equal(custosSemanticamenteIguais([primeiro, segundo], [segundo, primeiro]), false)
  assert.equal(custosSemanticamenteIguais([primeiro], []), false)
  for (const campos of [{ categoria: 'Outra' }, { categoria: 'áudio' },
    { descricao: 'Sonorização nova' }, { descricao: 'Sonori  zação' }, { valor: 0.11 }]) {
    assert.equal(custosSemanticamenteIguais([primeiro], [itemInterface(campos)]), false)
  }
})

test('comparação rejeita dados inválidos em vez de mascará-los como diferenças', () => {
  assert.throws(() => custosSemanticamenteIguais([], null))
  assert.throws(() => custosSemanticamenteIguais([null], []))
  assert.throws(() => custosSemanticamenteIguais([itemInterface({ valor: '0.10' })], []))
  assert.throws(() => custosSemanticamenteIguais(
    [itemInterface({ descricao: 'Diferente' })],
    [itemInterface(), itemInterface({ valor: Infinity })],
  ))
})

test('conversão de ida e volta preserva moeda, ordem e conteúdo sem depender de IDs', () => {
  const resposta = [
    itemApi({ id: 1, valor_estimado: '0.00' }),
    itemApi({ id: 2, valor_estimado: '0.10' }),
    itemApi({ id: 3, valor_estimado: '0.20' }),
    itemApi({ id: 4, valor_estimado: '9999999999.99' }),
  ]
  const interfaceInicial = custosDaApiParaInterface(resposta, 42)
  const payload = custosDaInterfaceParaPut(interfaceInicial)
  assert.deepEqual(payload.custos.map((item) => item.valor_estimado), ['0.00', '0.10', '0.20', '9999999999.99'])
  const respostaPut = payload.custos.map((item, indice) => ({ ...item, id: 100 + indice, evento_id: 42 }))
  assert.equal(custosSemanticamenteIguais(interfaceInicial, custosDaApiParaInterface(respostaPut, 42)), true)
})

test('1024 amostras determinísticas atravessam o intervalo sem perda monetária', () => {
  let estado = 123456789n
  for (let indice = 0; indice < 1024; indice += 1) {
    estado = (estado * 1103515245n + 12345n) % 1000000000000n
    const centavos = Number(estado)
    const valor = centavosParaReais(centavos)
    assert.equal(valorParaCentavos(valor), centavos)
    const payload = custosDaInterfaceParaPut([itemInterface({ valor })])
    assert.equal(valorParaCentavos(payload.custos[0].valor_estimado), centavos)
    const recebidos = custosDaApiParaInterface([{ ...payload.custos[0], id: 1, evento_id: 42 }], 42)
    assert.equal(valorParaCentavos(recebidos[0].valor), centavos)
  }
})
