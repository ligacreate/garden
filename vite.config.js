import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// MON-001 — стабильный per-build идентификатор. Прокидывается в
// frontend через `__BUILD_ID__` (см. utils/clientErrorReporter.js).
// Это позволяет различать «новая ошибка после деплоя» vs «зомби-bundle».
const BUILD_ID = process.env.GITHUB_SHA
  || process.env.BUILD_ID
  || `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // Absolute path for root deployment
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  server: {
    // Иначе на Windows Vite часто слушает только [::1], а localhost уходит на 127.0.0.1 — страница не открывается
    host: true,
    port: 5173,
  },
})
