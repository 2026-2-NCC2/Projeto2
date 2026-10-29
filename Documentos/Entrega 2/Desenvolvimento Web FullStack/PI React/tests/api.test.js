import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'

const fonteApi = readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8')

// Simula somente a injecao de import.meta.env feita pelo Vite; executa o modulo real.
async function carregarApi(ambiente) {
  const fonte = fonteApi.replace('import.meta.env', JSON.stringify(ambiente) ?? 'undefined')
  return import(`data:text/javascript;base64,${Buffer.from(fonte).toString('base64')}`)
}

const { apiUrl, criarConstrutorUrlApi } = await carregarApi({ MODE: 'development' })

test('a funcao da aplicacao e o modo padrao preservam o backend principal', () => {
  const construir = criarConstrutorUrlApi()
  for (const caminho of ['/', '/login', '/usuarios', '/eventos/42']) {
    assert.equal(apiUrl(caminho), `http://localhost:3001${caminho}`)
    assert.equal(construir(caminho), apiUrl(caminho))
  }
})

test('apiUrl no modo isolado utiliza exclusivamente o prefixo /api', async () => {
  const { apiUrl: construir } = await carregarApi({ MODE: 'isolado', TROCATICKET_API_MODO: 'isolado' })
  assert.equal(construir('/'), '/api/')
  assert.equal(construir('/login'), '/api/login')
  assert.equal(construir('/eventos/42/custos'), '/api/eventos/42/custos')
  assert.equal(apiUrl('/login'), 'http://localhost:3001/login')
})

test('apiUrl preserva o backend principal tambem no build de producao', async () => {
  const { apiUrl: producao } = await carregarApi({ MODE: 'production' })
  assert.equal(producao('/eventos'), 'http://localhost:3001/eventos')
})

test('apiUrl interrompe a importacao com configuracoes ausentes ou inconsistentes', async () => {
  for (const ambiente of [
    undefined, null, {}, { MODE: '' }, { MODE: 'desconhecido' }, { MODE: 'isolado' },
    { TROCATICKET_API_MODO: 'isolado' },
    { MODE: 'isolado', TROCATICKET_API_MODO: 'principal' },
    { MODE: 'isolado', TROCATICKET_API_MODO: '' },
    { MODE: 'isolado', TROCATICKET_API_MODO: null },
    { MODE: 'isolado', TROCATICKET_API_MODO: 'desconhecido' },
    { MODE: 'development', TROCATICKET_API_MODO: 'isolado' },
    { MODE: 'production', TROCATICKET_API_MODO: 'isolado' },
    { MODE: 'production', TROCATICKET_API_MODO: 'desconhecido' },
  ]) {
    await assert.rejects(() => carregarApi(ambiente), TypeError)
  }
})

test('modos incorretos nao produzem fallback para o principal', () => {
  for (const modo of ['', 'isoladoo', 'development', 'toString', null, false, 0, {}, []]) {
    assert.throws(() => criarConstrutorUrlApi(modo), TypeError)
  }
})

test('preserva caminhos, parametros e codificacao sem normalizacao silenciosa', () => {
  const caminhos = [
    '/eventos/', '/eventos?pagina=2&ordem=id', '/categorias/%C3%A1udio',
    '/eventos?busca=som%20e%20luz', '/eventos?origem=https%3A%2F%2Fexemplo.com',
  ]
  for (const modo of ['principal', 'isolado']) {
    const construir = criarConstrutorUrlApi(modo)
    const base = modo === 'principal' ? 'http://localhost:3001' : '/api'
    for (const caminho of caminhos) assert.equal(construir(caminho), base + caminho)
  }
})

const casosInvalidos = [
  '', ' ', 'eventos', '?pagina=1', '#eventos', null, undefined, 1, false, {}, [],
  new URL('http://localhost:3001/eventos'),
  'http://localhost:3001/eventos', 'https://exemplo.com/eventos',
  '//localhost:3001/eventos', '///eventos', '/eventos//42',
  'data:text/plain,eventos', 'javascript:alert(1)',
  '/\\localhost:3001/eventos', '/eventos\\42',
  '/eventos#lista', '/ eventos', '/eventos ', '/eventos\n', '/eventos\u0000',
  '/../eventos', '/./eventos', '/eventos/../usuarios',
  '/%2e%2e/eventos', '/eventos/%2E/', '/%2flocalhost:3001',
  '/%5clocalhost:3001', '/eventos/%00', '/eventos/%20',
  '/eventos/%23lista', '/eventos/%3Foutro', '/eventos/%', '/eventos/%GG',
  '/eventos/%FF', '/eventos?pagina=%GG',
]

for (const modo of ['principal', 'isolado']) {
  test(`rejeita tipos, destinos e caminhos invalidos no modo ${modo}`, () => {
    const construir = criarConstrutorUrlApi(modo)
    for (const caminho of casosInvalidos) {
      assert.throws(() => construir(caminho), TypeError, String(caminho))
    }
  })
}

test('as 25 referencias dos componentes usam apiUrl com destinos preservados', async () => {
  const { apiUrl: construirIsolado } = await carregarApi({ MODE: 'isolado', TROCATICKET_API_MODO: 'isolado' })
  let totalFetch = 0
  for (const [arquivo, quantidade] of [
    ['../src/App.jsx', 19], ['../src/components/admin/AdminPortal.jsx', 6],
  ]) {
    const fonte = readFileSync(new URL(arquivo, import.meta.url), 'utf8')
    assert.doesNotMatch(fonte, /(?:localhost|127\.0\.0\.1):3001/u)
    assert.match(fonte, /import \{ apiUrl \} from /u)
    const chamadas = [...fonte.matchAll(/apiUrl\((['"`])([^'"`\r\n]*)\1\)/gu)]
    assert.equal(chamadas.length, quantidade)
    totalFetch += [...fonte.matchAll(/\bfetch\(/gu)].length
    for (const [, , expressao] of chamadas) {
      const caminho = expressao.replace(/\$\{[^}]+\}/gu, '42')
      assert.equal(apiUrl(caminho), `http://localhost:3001${caminho}`)
      assert.equal(construirIsolado(caminho), `/api${caminho}`)
    }
  }
  assert.equal(totalFetch, 23)
})

test('respostas simuladas funcionam nos dois modos sem requisicoes reais', async () => {
  for (const modo of ['principal', 'isolado']) {
    const { apiUrl: construir } = await carregarApi(modo === 'isolado'
      ? { MODE: 'isolado', TROCATICKET_API_MODO: 'isolado' } : { MODE: 'development' })
    const opcoes = {
      method: 'POST', headers: { Authorization: 'Bearer token-simulado' },
      body: JSON.stringify({ exemplo: true }),
    }
    const chamadas = []
    const fetchSimulado = async (url, options) => {
      chamadas.push({ url, options })
      return { ok: true, json: async () => ({ resultado: 'simulado' }) }
    }
    const resposta = await fetchSimulado(construir('/login'), opcoes)
    assert.deepEqual(await resposta.json(), { resultado: 'simulado' })
    assert.equal(chamadas.length, 1)
    assert.equal(chamadas[0].url, modo === 'isolado' ? '/api/login' : 'http://localhost:3001/login')
    assert.equal(chamadas[0].options, opcoes)
  }
})

test('falha simulada no modo isolado nao tenta acessar o backend principal', async () => {
  const { apiUrl: construir } = await carregarApi({ MODE: 'isolado', TROCATICKET_API_MODO: 'isolado' })
  const destinos = []
  const fetchSimulado = async url => {
    destinos.push(url)
    throw new Error('Backend de teste indisponivel')
  }
  await assert.rejects(() => fetchSimulado(construir('/eventos')), /indisponivel/u)
  assert.deepEqual(destinos, ['/api/eventos'])
})
