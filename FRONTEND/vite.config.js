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
]

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: Object.fromEntries(
      apiPrefixes.map((prefix) => [
        `/${prefix}`,
        { target: backendUrl, changeOrigin: true },
      ])
    ),
  },
})
