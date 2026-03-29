import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@xenova/transformers', 'onnxruntime-web', 'onnxruntime-common'],
  },
  worker: {
    format: 'es',
    rollupOptions: {
      // @xenova/transformers is loaded from CDN at runtime in the worker,
      // so we must prevent Rollup from trying to bundle it during production builds.
      external: ['@xenova/transformers'],
    },
  },
})
