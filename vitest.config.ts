// vitest.config.ts — Vitest configuration for frontend unit/component tests (jsdom + React)
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: ['node_modules', 'dist', 'functions/lib', 'functions/src', '.idea', '.git', '.DS_Store'],
  },
})
