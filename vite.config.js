import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // Absolute path for root deployment
  server: {
    // Иначе на Windows Vite часто слушает только [::1], а localhost уходит на 127.0.0.1 — страница не открывается
    host: true,
    port: 5173,
  },
})
