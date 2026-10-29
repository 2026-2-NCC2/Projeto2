import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = fileURLToPath(new URL('.', import.meta.url))
const cache = fileURLToPath(new URL('./node_modules/.vite-isolado', import.meta.url))
const chaveModo = 'import.meta.env.TROCATICKET_API_MODO'
const rotaApi = '^/api(?:/|\\?|$)'
const destinoApi = 'http://127.0.0.1:3107'
const csp = "connect-src 'self' ws://127.0.0.1:5174;"

function reescreverApi(caminho) {
  const destino = caminho.replace(/^\/api(?=\/|\?|$)/u, '')
  return destino === '' || destino.startsWith('?') ? `/${destino}` : destino
}

function validarConfigIsolada(config, resolvida = false) {
  const { server } = config
  const proxy = server.proxy?.[rotaApi]
  const headersCsp = Object.entries(server.headers ?? {})
    .filter(([nome]) => nome.toLowerCase() === 'content-security-policy')

  // Valida a configuracao final, inclusive sobreposicoes feitas pela CLI.
  if (config.mode !== 'isolado' || (resolvida && config.env.MODE !== 'isolado') ||
      config.define[chaveModo] !== JSON.stringify('isolado') ||
      config.envDir !== false || !Array.isArray(config.envPrefix) || config.envPrefix.length !== 0 ||
      resolve(config.root) !== resolve(raiz) || resolve(config.cacheDir) !== resolve(cache) ||
      config.base !== '/' || server.host !== '127.0.0.1' || server.port !== 5174 ||
      server.strictPort !== true || server.https || server.middlewareMode ||
      server.hmr === false || server.ws?.host !== '127.0.0.1' || server.ws?.protocol !== 'ws' ||
      server.ws?.clientPort !== 5174 || (server.ws.port !== undefined && server.ws.port !== 5174) ||
      server.ws.server !== undefined ||
      Object.keys(server.proxy ?? {}).length !== 1 || proxy?.target !== destinoApi ||
      Object.keys(proxy).length !== 4 ||
      !Object.keys(proxy).every(chave => ['target', 'changeOrigin', 'ws', 'rewrite'].includes(chave)) ||
      proxy.changeOrigin !== true || proxy.rewrite !== reescreverApi || proxy.ws !== false ||
      headersCsp.length !== 1 || headersCsp[0][1] !== csp) {
    throw new Error('Configuracao isolada invalida; execucao interrompida sem fallback.')
  }
}

export default defineConfig(({ mode, command, isPreview }) => {
  if (mode !== 'isolado' || !['serve', 'build'].includes(command) || isPreview) {
    throw new Error('Use esta configuracao com --mode isolado; preview nao e suportado.')
  }

  return {
    mode: 'isolado',
    root: raiz,
    base: '/',
    plugins: [react(), {
      name: 'trocaticket-validar-isolamento',
      enforce: 'post',
      config: config => validarConfigIsolada(config),
      configResolved: config => validarConfigIsolada(config, true),
    }],
    cacheDir: cache,
    envDir: false,
    envPrefix: [], // Nao expoe nem mesmo VITE_* herdadas do terminal.
    define: { [chaveModo]: JSON.stringify('isolado') },
    server: {
      host: '127.0.0.1',
      port: 5174,
      strictPort: true,
      open: false,
      cors: false,
      hmr: true,
      ws: { host: '127.0.0.1', protocol: 'ws', clientPort: 5174 },
      headers: { 'Content-Security-Policy': csp },
      proxy: {
        [rotaApi]: {
          target: destinoApi,
          changeOrigin: true,
          ws: false,
          rewrite: reescreverApi,
        },
      },
    },
    // Um eventual build isolado nao sobrescreve os arquivos do build principal.
    build: { outDir: 'dist/isolado' },
  }
})
