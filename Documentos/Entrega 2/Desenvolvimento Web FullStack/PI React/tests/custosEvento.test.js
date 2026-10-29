import test from 'node:test'
import assert from 'node:assert/strict'
import { criarClienteCustos } from '../src/services/custosEvento.js'

const resposta = dados => ({ ok: true, json: async () => dados })

for (const base of ['/api', 'http://localhost:3001']) {
  const urlIsolada = caminho => `${base}${caminho}`
  const teste = (nome, executar) => test(`${base}: ${nome}`, executar)
  const local = { id: 'local-1', categoria: 'Som', descricao: 'Sonorização', valor: 0.1 }
  const remoto = { id: 7, evento_id: 42, categoria: 'Som', descricao: 'Sonorização', valor_estimado: '0.10' }

  teste('GET usa URL centralizada, JWT e valida a lista inteira', async () => {
    const chamadas = []
    const cliente = criarClienteCustos(urlIsolada, { executarFetch: async (...args) => {
      chamadas.push(args); return resposta([remoto])
    } })
    const itens = await cliente.carregar(42, 'token-simulado')
    assert.equal(itens[0].valor, 0.1)
    assert.equal(itens[0].evento_id, 42)
    assert.equal(chamadas[0][0], `${base}/eventos/42/custos`)
    assert.equal(chamadas[0][1].method, 'GET')
    assert.equal(chamadas[0][1].headers.Authorization, 'Bearer token-simulado')
    assert.equal(chamadas[0][1].redirect, 'error')
    assert.equal(chamadas[0][1].credentials, 'omit')
    assert.equal(chamadas[0][1].body, undefined)
  })

  teste('PUT envia decimais exatos sem IDs e aceita lista vazia', async () => {
    let opcoes
    const cliente = criarClienteCustos(urlIsolada, { executarFetch: async (_, options) => {
      opcoes = options
      return resposta(JSON.parse(options.body).custos.map((item, i) => ({ ...item, id: i + 10, evento_id: 42 })))
    } })
    const itens = [local, { ...local, id: 'local-2', valor: 0.2 }]
    const antes = structuredClone(itens)
    assert.equal((await cliente.salvar(42, itens, 'token-simulado')).length, 2)
    assert.equal(opcoes.method, 'PUT')
    assert.equal(opcoes.headers['Content-Type'], 'application/json')
    assert.deepEqual(JSON.parse(opcoes.body), { custos: [
      { categoria: 'Som', descricao: 'Sonorização', valor_estimado: '0.10' },
      { categoria: 'Som', descricao: 'Sonorização', valor_estimado: '0.20' },
    ] })
    assert.deepEqual(itens, antes)
    assert.deepEqual(await cliente.salvar(42, [], 'token-simulado'), [])
    assert.deepEqual(JSON.parse(opcoes.body), { custos: [] })
  })

  teste('ID, sessao e payload invalidos sao recusados antes de qualquer HTTP', async () => {
    let chamadas = 0
    const cliente = criarClienteCustos(urlIsolada, { executarFetch: async () => { chamadas++; return resposta([]) } })
    for (const id of [null, undefined, 0, -1, '42', NaN, Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(() => cliente.carregar(id, 'simulado'), e => !e.resultadoIncerto)
    }
    await assert.rejects(() => cliente.salvar(42, [], ''), e => !e.resultadoIncerto)
    await assert.rejects(() => cliente.salvar(42, [{ ...local, valor: 0.001 }], 'simulado'), e => !e.resultadoIncerto)
    assert.equal(chamadas, 0)
  })

  teste('GET rejeita evento divergente, corpo incorreto e resposta parcial', async () => {
    for (const dados of [{ custos: [] }, [remoto, { ...remoto, id: 8, evento_id: 43 }], [{ ...remoto, valor_estimado: '0.001' }]]) {
      const cliente = criarClienteCustos(urlIsolada, { executarFetch: async () => resposta(dados) })
      await assert.rejects(() => cliente.carregar(42, 'simulado'), e => !e.resultadoIncerto)
    }
  })

  teste('erro HTTP de PUT preserva o payload e informa incerteza sem repetir', async () => {
    for (const status of [400, 401, 403, 404, 409, 500, 503]) {
      let chamadas = 0
      const cliente = criarClienteCustos(urlIsolada, { executarFetch: async () => { chamadas++; return { ok: false, status } } })
      const itens = [structuredClone(local)]
      await assert.rejects(() => cliente.salvar(42, itens, 'simulado'), e => e.resultadoIncerto && /incerto/u.test(e.message))
      assert.equal(chamadas, 1)
      assert.deepEqual(itens, [local])
    }
  })

  teste('resposta PUT divergente ou ilegivel nao confirma salvamento', async () => {
    for (const dados of [[], [{ ...remoto, valor_estimado: '0.20' }], [{ ...remoto, evento_id: 43 }], {}]) {
      const cliente = criarClienteCustos(urlIsolada, { executarFetch: async () => resposta(dados) })
      await assert.rejects(() => cliente.salvar(42, [local], 'simulado'), e => e.resultadoIncerto)
    }
  })

  teste('timeout abrange fetch e leitura JSON, aborta e nao repete PUT', async () => {
    for (const [metodo, corpoPendente] of [['GET', false], ['PUT', false], ['PUT', true]]) {
      let chamadas = 0
      let signal
      const cliente = criarClienteCustos(urlIsolada, { tempoMs: 5, executarFetch: async (_, options) => {
        chamadas++; signal = options.signal
        return corpoPendente ? { ok: true, json: () => new Promise(() => {}) } : new Promise(() => {})
      } })
      await assert.rejects(() => metodo === 'GET' ? cliente.carregar(42, 'simulado') : cliente.salvar(42, [local], 'simulado'),
        e => e.resultadoIncerto === (metodo === 'PUT'))
      assert.equal(chamadas, 1)
      assert.equal(signal.aborted, true)
    }
  })

  teste('falha de rede nao vaza erro bruto nem repete GET ou PUT', async () => {
    for (const metodo of ['GET', 'PUT']) {
      let chamadas = 0
      const cliente = criarClienteCustos(urlIsolada, { executarFetch: async () => { chamadas++; throw new Error('detalhe-privado') } })
      await assert.rejects(() => metodo === 'GET' ? cliente.carregar(42, 'simulado') : cliente.salvar(42, [local], 'simulado'),
        e => e.resultadoIncerto === (metodo === 'PUT') && !e.message.includes('detalhe-privado'))
      assert.equal(chamadas, 1)
    }
  })

}

test('destinos inesperados sao bloqueados sem HTTP ou fallback', async () => {
  for (const base of ['', '/api/', '//localhost:3001', 'http://127.0.0.1:3001', 'https://localhost:3001', 'http://localhost:3001.evil', 'http://localhost:3107']) {
    let chamadas = 0
    const cliente = criarClienteCustos(caminho => `${base}${caminho}`, { executarFetch: async () => { chamadas++; return resposta([]) } })
    assert.equal(cliente.disponivel, false)
    await assert.rejects(() => cliente.carregar(42, 'simulado'), /não permitido/u)
    await assert.rejects(() => cliente.salvar(42, [], 'simulado'), /não permitido/u)
    assert.equal(chamadas, 0)
  }
})

test('construtor nao pode trocar o destino depois da verificacao inicial', async () => {
  let chamadas = 0
  const cliente = criarClienteCustos(caminho => caminho.includes('/1/') ? `/api${caminho}` : `http://localhost:3001${caminho}`, {
    executarFetch: async () => { chamadas++; return resposta([]) },
  })
  await assert.rejects(() => cliente.carregar(42, 'simulado'), /não permitido/u)
  await assert.rejects(() => cliente.salvar(42, [], 'simulado'), /não permitido/u)
  assert.equal(chamadas, 0)
})
