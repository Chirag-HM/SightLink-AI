import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendTarget = process.env.VITE_PROXY_TARGET || process.env.VITE_API_BASE || 'http://127.0.0.1:8000'
const wsTarget = backendTarget.replace(/^http/, 'ws')

const sharedProxy = {
  '/api': { target: backendTarget, changeOrigin: true },
  '/ws': { target: wsTarget, ws: true, changeOrigin: true },
  '/bus-route': { target: backendTarget, changeOrigin: true },
  '/bus': { target: backendTarget, changeOrigin: true },
  '/discover-buses': { target: backendTarget, changeOrigin: true },
  '/nearby-bus': { target: backendTarget, changeOrigin: true },
  '/voice-bus': { target: backendTarget, changeOrigin: true },
  '/speak-bus': { target: backendTarget, changeOrigin: true },
  '/speak-vehicle': { target: backendTarget, changeOrigin: true },
  '/routes': { target: backendTarget, changeOrigin: true },
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          leaflet: ['leaflet'],
          gsap: ['gsap'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: sharedProxy,
  },
  preview: {
    port: 4173,
    host: true,
    proxy: sharedProxy,
  },
})
