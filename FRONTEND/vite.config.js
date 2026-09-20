import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendUrl = process.env.VITE_BACKEND_URL || 'http://localhost:3001'
const apiPrefixes = [
  'auth',
  'user',
  'requests',
  'donor',
  'hospital',
  'admin',
  'notifications',
  'receiver',
  'donations',
  'hospitals',
  'stats',
  'health',
  'geocode',
  'tiles',   // OSM tile proxy — serves map tiles through the backend
]

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
    proxy: Object.fromEntries(
      apiPrefixes.map((prefix) => [
        `/${prefix}`,
        { target: backendUrl, changeOrigin: true },
      ])
    ),
  },
})
