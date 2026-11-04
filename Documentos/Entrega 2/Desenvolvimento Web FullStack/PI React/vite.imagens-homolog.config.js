import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => {
  if (mode !== 'isolado') throw new Error('Use exclusivamente --mode isolado.')
  return {
    envDir: fileURLToPath(new URL('./.sem-env-homologacao', import.meta.url)),
    envPrefix: [],
    plugins: [react(), { name: 'entrada-imagens-homologacao', transformIndexHtml: { order: 'pre', handler(html) {
      if (!html.includes('/src/main.jsx')) throw new Error('Entrada React incompatível.')
      return html.replace('/src/main.jsx', '/src/homologacao/main.jsx')
    } } }],
    define: { 'import.meta.env.TROCATICKET_API_MODO': JSON.stringify('isolado') },
    server: { host: '127.0.0.1', port: 5273, strictPort: true, open: false,
      proxy: { '/api': { target: 'http://127.0.0.1:3131', changeOrigin: false, ws: false,
        rewrite: path => path.replace(/^\/api/, '') } } },
    preview: { host: '127.0.0.1', port: 5273, strictPort: true,
      proxy: { '/api': { target: 'http://127.0.0.1:3131', changeOrigin: false, ws: false,
        rewrite: path => path.replace(/^\/api/, '') } } },
    build: { outDir: 'dist-imagens-homolog' },
  }
})
