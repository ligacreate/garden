import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // Absolute path for root deployment
  build: {
    rollupOptions: {
      output: {
        /** Разрывает цикл: PvlPrototypeApp тянул общий код из чанка CourseLibraryView → TDZ (Cannot access before initialization). */
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            if (id.includes('services/pvlAppKernel')) return 'pvl-kernel';
            if (id.includes('services/pvlMockApi')) return 'pvl-mock-api';
            if (id.includes('data/pvlMockData')) return 'pvl-mock-data';
            if (id.includes('selectors/pvlCalculators')) return 'pvl-calculators';
            if (id.includes('data/pvl') || id.includes('data\\pvl')) return 'pvl-data';
          }
        },
      },
    },
  },
})
