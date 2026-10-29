import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { build, mergeConfig, resolveConfig } from 'vite'
import configurarIsolado from '../vite.isolated.config.js'
import configPrincipal from '../vite.config.js'

const chaveModo = 'import.meta.env.TROCATICKET_API_MODO'
const ambiente = { command: 'serve', mode: 'isolado' }

async function resolverIsolado(sobreposicao = {}) {
  return resolveConfig(mergeConfig({
    ...configurarIsolado(ambiente), configFile: false, mode: 'isolado', logLevel: 'silent',
  }, sobreposicao), 'serve')
}

test('configuracao exige modo isolado explicito e rejeita preview', () => {
  for (const mode of [undefined, '', 'development', 'production', 'isoladoo']) {
    assert.throws(() => configurarIsolado({ command: 'serve', mode }), /--mode isolado/u)
  }
  assert.throws(() => configurarIsolado({ ...ambiente, isPreview: true }), /preview/u)
  assert.throws(() => configurarIsolado({ ...ambiente, command: 'invalido' }), /--mode isolado/u)
})

test('Vite resolve host, porta, strictPort, cache, HMR e marcador exclusivos', async () => {
  const config = await resolverIsolado()
  assert.equal(config.server.host, '127.0.0.1')
  assert.equal(config.server.port, 5174)
  assert.equal(config.server.strictPort, true)
  assert.equal(config.define[chaveModo], JSON.stringify('isolado'))
  assert.equal(resolve(config.cacheDir), fileURLToPath(new URL('../node_modules/.vite-isolado', import.meta.url)))
  assert.notEqual(config.server.hmr, false)
  assert.deepEqual(config.server.ws, { host: '127.0.0.1', protocol: 'ws', clientPort: 5174 })
  assert.equal(config.server.headers['Content-Security-Policy'], "connect-src 'self' ws://127.0.0.1:5174;")
  assert.equal(config.build.outDir, 'dist/isolado')
})

test('proxy corresponde somente a /api e remove o prefixo preservando rota e query', async () => {
  const { server } = await resolverIsolado()
  const [[padrao, proxy]] = Object.entries(server.proxy)
  assert.equal(Object.keys(server.proxy).length, 1)
  assert.equal(proxy.target, 'http://127.0.0.1:3107')
  assert.equal(proxy.changeOrigin, true)
  assert.equal(proxy.ws, false)
  const regex = new RegExp(padrao, 'u')
  for (const [entrada, saida] of [
    ['/api', '/'], ['/api/', '/'], ['/api?pagina=1', '/?pagina=1'],
    ['/api/login', '/login'], ['/api/eventos/42/custos', '/eventos/42/custos'],
    ['/api/eventos?pagina=1', '/eventos?pagina=1'],
  ]) {
    assert.equal(regex.test(entrada), true)
    assert.equal(proxy.rewrite(entrada), saida)
  }
  for (const caminho of ['/api2', '/apix/eventos', '/eventos', '//api/eventos']) {
    assert.equal(regex.test(caminho), false)
  }
})

test('ambiente isolado desativa arquivos .env e nao expoe variaveis herdadas VITE_*', async () => {
  const nome = 'VITE_TROCATICKET_TESTE_HERANCA'
  const anterior = process.env[nome]
  process.env[nome] = 'valor-simulado-sem-segredo'
  try {
    const config = await resolverIsolado()
    assert.equal(config.envDir, false)
    assert.deepEqual(config.envPrefix, [])
    assert.equal(config.env[nome], undefined)
  } finally {
    if (anterior === undefined) delete process.env[nome]
    else process.env[nome] = anterior
  }
})

test('sobreposicoes inseguras interrompem a resolucao antes de iniciar servidor', async () => {
  for (const sobreposicao of [
    { server: { host: '0.0.0.0' } }, { server: { port: 5173 } },
    { server: { strictPort: false } }, { server: { https: {} } },
    { server: { hmr: false } }, { server: { ws: { clientPort: 3001 } } },
    { server: { ws: { port: 5175 } } },
    { envDir: '.' }, { envPrefix: ['VITE_'] }, { cacheDir: 'node_modules/.vite' },
    { define: { [chaveModo]: JSON.stringify('principal') } },
    { server: { headers: { 'Content-Security-Policy': "connect-src *;" } } },
    { server: { proxy: { '^/api(?:/|\\?|$)': { target: 'http://localhost:3001' } } } },
    { server: { proxy: { '^/api(?:/|\\?|$)': { forward: 'http://localhost:3001' } } } },
    { server: { proxy: { '/outra-api': { target: 'http://localhost:3001' } } } },
  ]) {
    await assert.rejects(() => resolverIsolado(sobreposicao), /Configuracao isolada invalida/u,
      JSON.stringify(sobreposicao))
  }
})

test('marcador ausente e rejeitado antes do carregamento de arquivos de ambiente', () => {
  const config = configurarIsolado(ambiente)
  const guarda = config.plugins.flat().find(plugin => plugin.name === 'trocaticket-validar-isolamento')
  delete config.define[chaveModo]
  assert.throws(() => guarda.config(config), /Configuracao isolada invalida/u)
})

test('builds em memoria executam o apiUrl real nos modos principal e isolado', async () => {
  // Sem servidor, rede ou arquivos gerados: verifica a substituicao feita pelo proprio Vite.
  for (const isolado of [false, true]) {
    const mode = isolado ? 'isolado' : 'production'
    const config = isolado ? configurarIsolado({ command: 'build', mode }) : configPrincipal
    const resultado = await build({
      ...config, configFile: false, mode, envDir: false, logLevel: 'silent',
      build: {
        ...config.build, write: false, minify: false,
        lib: { entry: fileURLToPath(new URL('../src/services/api.js', import.meta.url)), formats: ['es'] },
      },
    })
    const resultados = Array.isArray(resultado) ? resultado : [resultado]
    const chunk = resultados.flatMap(saida => saida.output).find(arquivo => arquivo.type === 'chunk' && arquivo.isEntry)
    assert.ok(chunk)
    const modulo = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`)
    for (const caminho of ['/login', '/usuarios', '/eventos', '/cotacoes', '/admin/propostas']) {
      assert.equal(modulo.apiUrl(caminho), `${isolado ? '/api' : 'http://localhost:3001'}${caminho}`)
    }
  }
})
