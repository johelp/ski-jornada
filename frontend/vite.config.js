import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // En producción la URL de la API se incrusta al compilar: sin ella la app apuntaría a localhost sin avisar.
  if (mode === 'production' && !env.VITE_API_URL && env.VITE_PERMITIR_API_LOCAL !== '1') {
    throw new Error('Falta VITE_API_URL: define la URL pública de la API (p. ej. https://api.tudominio.com) antes de compilar.')
  }
  return {
    plugins: [react()],
    server: { port: 5173, hmr: { overlay: false } },
  }
})
