import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // 1. Don't create map files (Hides original code)
    sourcemap: false,
    
    // 2. Use 'terser' for better obfuscation than 'esbuild'
    minify: 'terser',
    
    // 3. Aggressive settings
    terserOptions: {
      compress: {
        drop_console: true,    // Removes console.log()
        drop_debugger: true,   // Removes debugger statements
        passes: 2,             // Compress twice for better results
      },
      format: {
        comments: false,       // Remove ALL comments
      },
      mangle: {
        toplevel: true,        // Scramble top-level variable names
      }
    },
  },
})