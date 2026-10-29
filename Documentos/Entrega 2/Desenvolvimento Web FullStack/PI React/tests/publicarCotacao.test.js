import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import { criarPublicadorCotacao, motivoBloqueioPublicacao } from '../src/services/publicarCotacao.js'
import { criarRascunhoCustos } from '../src/utils/rascunhosCustos.js'

const custo = { id: 1, categoria: 'Som', descricao: 'Locação', valor: 0.1 }
const contexto = () => ({ eventoId: 42, chaveEvento: 'evento:42', geracaoSessao: 0,
  rascunho: { ...criarRascunhoCustos(0), itens: [custo], basePersistida: [{ ...custo, id: 99 }],
    get: { estado: 'carregado', idRequisicao: 1 } },
  custosRevisados: [custo], formularioPendente: false, prazo: '2099-12-31', observacoes: '', token: 'simulado' })
const resposta = (valor = '0.10', evento = 42) => ({ ok: true, status: 201,
  json: async () => ({ cotacao: { id: 7, evento_id: evento,
    itens: [{ categoria: 'Som', descricao: 'Locação', valor_estimado: valor }] } }) })
const pendente = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }

test('modo efetivo da API preserva destinos principal e isolado', async () => {
  const fonte = readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8')
  for (const env of [{ MODE: 'development' }, { MODE: 'production' }, { MODE: 'isolado', TROCATICKET_API_MODO: 'isolado' }]) {
    const codigo = fonte.replace('import.meta.env', JSON.stringify(env))
    const { apiUrl } = await import(`data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`)
    let chamadas = 0
    const cliente = criarPublicadorCotacao(apiUrl, { executarFetch: async destino => {
      assert.equal(destino, env.MODE === 'isolado' ? '/api/cotacoes' : 'http://localhost:3001/cotacoes'); chamadas++; return resposta()
    } })
    const r = await cliente.publicar(contexto())
    assert.equal(cliente.disponivel, true)
    assert.equal(chamadas, 1)
    assert.equal(r.estado, 'sucesso')
  }
})

for (const base of ['/api', 'http://localhost:3001']) {
  const url = caminho => `${base}${caminho}`
  const teste = (nome, executar) => test(`${base}: ${nome}`, executar)

  teste('POST envia copia decimal dos custos revisados e confirmados, com JWT', async () => {
    const ctx = contexto()
    const original = structuredClone(ctx)
    const cliente = criarPublicadorCotacao(url, { executarFetch: async (destino, options) => {
      assert.equal(destino, `${base}/cotacoes`); assert.equal(options.method, 'POST')
      assert.equal(options.headers.Authorization, 'Bearer simulado')
      assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit')
      assert.deepEqual(JSON.parse(options.body), { evento_id: 42, prazo: '2099-12-31', observacoes: '',
        itens: [{ categoria: 'Som', descricao: 'Locação', valor_estimado: '0.10' }] })
      return resposta()
    } })
    assert.equal((await cliente.publicar(ctx)).estado, 'sucesso')
    assert.deepEqual(ctx, original)
  })

  teste('bloqueia base desconhecida/vazia, rascunhos, campos, conflito e GET/PUT pendentes', async () => {
    const alterar = [
      c => { c.rascunho.basePersistida = null },
      c => { c.rascunho.basePersistida = []; c.rascunho.itens = []; c.custosRevisados = [] },
      c => { c.rascunho.itens = [{ ...custo, valor: 0.2 }] },
      c => { c.custosRevisados = [{ ...custo, descricao: 'Diferente' }] },
      c => { c.formularioPendente = true },
      c => { c.rascunho.conflitoRemoto = true },
      c => { c.rascunho.get.estado = 'carregando' },
      c => { c.rascunho.put.estado = 'salvando' },
      c => { c.rascunho.put.estado = 'resultadoIncerto' },
      c => { c.rascunho.put.confirmarReenvio = true },
      c => { c.chaveEvento = 'novo:1' },
      c => { c.geracaoSessao++ },
      c => { c.eventoId = Number.MAX_SAFE_INTEGER + 1 },
    ]
    let chamadas = 0
    const cliente = criarPublicadorCotacao(url, { executarFetch: async () => { chamadas++; return resposta() } })
    for (const mudar of alterar) {
      const ctx = contexto(); mudar(ctx)
      assert.ok(motivoBloqueioPublicacao(ctx))
      assert.equal((await cliente.publicar(ctx)).estado, 'bloqueado')
    }
    assert.equal(chamadas, 0)
  })

  teste('trava sincrona impede clique duplicado; evento diferente tem estado independente', async () => {
    const espera = pendente(); let chamadas = 0
    const cliente = criarPublicadorCotacao(url, { executarFetch: async () => { chamadas++; return espera.promise } })
    const ctx = contexto(); const primeiro = cliente.publicar(ctx)
    assert.equal((await cliente.publicar(ctx)).estado, 'publicando')
    assert.equal(chamadas, 1); assert.equal(cliente.temPendencias(0), true)
    assert.equal(cliente.estado({ ...ctx, chaveEvento: 'evento:43' }).estado, 'ocioso')
    espera.resolve(resposta()); assert.equal((await primeiro).estado, 'sucesso')
    assert.equal(cliente.temPendencias(0), false)
  })

  teste('409 exige GET novo concluido, mesmo apos sair e voltar ao evento', async () => {
    let chamadas = 0
    const cliente = criarPublicadorCotacao(url, { executarFetch: async () => {
      chamadas++; return chamadas === 1 ? { status: 409 } : resposta()
    } })
    const ctx = contexto()
    assert.equal((await cliente.publicar(ctx)).estado, 'conflito')
    assert.equal((await cliente.publicar(structuredClone(ctx))).estado, 'conflito')
    ctx.rascunho.get = { estado: 'carregando', idRequisicao: 2 }
    assert.equal((await cliente.publicar(ctx)).estado, 'conflito')
    ctx.rascunho.get.estado = 'carregado'
    assert.equal((await cliente.publicar(ctx)).estado, 'sucesso')
    assert.equal(chamadas, 2)
  })

  teste('timeout no fetch ou JSON bloqueia reenvio; resposta tardia nao confirma sucesso', async () => {
    for (const jsonPendente of [false, true]) {
      let chamadas = 0; let signal; const espera = pendente(); const notificacoes = []
      const cliente = criarPublicadorCotacao(url, { tempoMs: 5, executarFetch: async (_, options) => {
        chamadas++; signal = options.signal
        return jsonPendente ? { status: 201, ok: true, json: () => espera.promise } : espera.promise
      } })
      const ctx = contexto()
      assert.equal((await cliente.publicar(ctx, { notificar: r => notificacoes.push(r.estado) })).estado, 'incerto')
      assert.equal(signal.aborted, true)
      assert.equal((await cliente.publicar(ctx)).estado, 'incerto')
      espera.resolve(jsonPendente ? (await resposta().json()) : resposta())
      await new Promise(resolve => setTimeout(resolve, 0))
      assert.equal(cliente.estado(ctx).estado, 'incerto'); assert.equal(chamadas, 1)
      assert.deepEqual(notificacoes, ['publicando', 'incerto'])
    }
  })

  teste('rede, 500 e sucesso malformado/divergente sao incertos e nao repetidos', async () => {
    for (const responder of [() => { throw Error('segredo') }, () => ({ status: 500 }),
      () => resposta('0.20'), () => resposta('0.10', 43), () => ({ status: 201, ok: true, json: async () => ({}) })]) {
      let chamadas = 0
      const cliente = criarPublicadorCotacao(url, { executarFetch: async () => { chamadas++; return responder() } })
      const ctx = contexto(); const r = await cliente.publicar(ctx)
      assert.equal(r.estado, 'incerto'); assert.ok(!r.mensagem.includes('segredo'))
      await cliente.publicar(ctx); assert.equal(chamadas, 1)
    }
  })

  teste('respostas de outro evento ou sessao nao notificam contexto atual', async () => {
    for (const status of [201, 409]) {
      const espera = pendente(); let atual = true; const avisos = []
      const cliente = criarPublicadorCotacao(url, { executarFetch: () => espera.promise })
      const ctx = contexto(); const tarefa = cliente.publicar(ctx, { atual: () => atual, notificar: op => avisos.push(op.estado) })
      atual = false; espera.resolve(status === 201 ? resposta() : { status: 409 })
      await tarefa
      assert.deepEqual(avisos, ['publicando'])
      assert.equal(cliente.estado({ ...ctx, geracaoSessao: 1 }).estado, 'ocioso')
      assert.equal(cliente.estado({ ...ctx, chaveEvento: 'evento:43' }).estado, 'ocioso')
    }
  })

  teste('snapshot revisado nao muda durante requisicao e rejeicoes 4xx nao repetem', async () => {
    const ctx = contexto(); ctx.custosRevisados = [structuredClone(custo)]
    const espera = pendente()
    const cliente = criarPublicadorCotacao(url, { executarFetch: () => espera.promise })
    const tarefa = cliente.publicar(ctx); ctx.custosRevisados[0].valor = 0.2
    espera.resolve(resposta()); assert.equal((await tarefa).estado, 'sucesso')
    for (const status of [400, 401, 403, 404]) {
      let chamadas = 0
      const c = criarPublicadorCotacao(url, { executarFetch: async () => { chamadas++; return { status } } })
      assert.equal((await c.publicar(contexto())).estado, 'erro'); assert.equal(chamadas, 1)
    }
  })

}

test('destinos nao autorizados nao enviam POST nem tentam fallback', async () => {
  for (const base of ['', '//localhost:3001', 'http://127.0.0.1:3001', 'https://localhost:3001', 'http://localhost:3001.evil', '/api/', 'http://127.0.0.1:3107']) {
    let chamadas = 0
    const cliente = criarPublicadorCotacao(caminho => `${base}${caminho}`, { executarFetch: async () => { chamadas++; return resposta() } })
    assert.equal(cliente.disponivel, false)
    assert.equal((await cliente.publicar(contexto())).estado, 'bloqueado')
    assert.equal(chamadas, 0)
  }
})

test('recriar cliente apos atualizacao preserva trava pendente e resultado incerto', async () => {
  const operacoes = new Map()
  let chamadas = 0
  const espera = pendente()
  const options = { operacoes, tempoMs: 5, executarFetch: async () => { chamadas++; return espera.promise } }
  const destino = caminho => `http://localhost:3001${caminho}`
  const anterior = criarPublicadorCotacao(destino, options)
  const tarefa = anterior.publicar(contexto())
  const atualizado = criarPublicadorCotacao(destino, options)
  assert.equal(atualizado.disponivel, true)
  assert.equal((await atualizado.publicar(contexto())).estado, 'publicando')
  assert.equal((await tarefa).estado, 'incerto')
  const outro = criarPublicadorCotacao(destino, options)
  assert.equal((await outro.publicar(contexto())).estado, 'incerto')
  assert.equal(chamadas, 1)
  espera.resolve(resposta())
})
