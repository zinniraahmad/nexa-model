import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://nexa-model.itszinniraahmad.workers.dev',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
