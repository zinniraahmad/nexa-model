import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'admin',
  plugins: [react()],
  build: { outDir: '../dist-admin', emptyOutDir: true },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'https://onlyadmin.nexa-model.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
