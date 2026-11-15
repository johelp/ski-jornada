import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // En producción la URL de la API se incrusta al compilar: sin ella la app apuntaría a localhost sin avisar.
  if (mode === 'production' && !env.VITE_API_URL && env.VITE_PERMITIR_API_LOCAL !== '1') {
    throw new Error('Falta VITE_API_URL: define la URL pública de la API (p. ej. https://api.tudominio.com) antes de compilar.')
  }
  return {
    plugins: [react()],
    // Versión visible en la app: la de package.json, el commit que compila Cloudflare Pages (o GitHub) y la fecha de compilación
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_COMMIT__: JSON.stringify((env.CF_PAGES_COMMIT_SHA || env.GITHUB_SHA || '').slice(0, 7) || 'local'),
      __APP_FECHA__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    },
    server: { port: 5173, hmr: { overlay: false } },
  }
})
