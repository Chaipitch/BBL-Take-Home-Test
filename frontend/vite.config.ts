import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Port 3000 is fixed by the Auth0 client's callback/logout URLs (ADR-003, ADR-018a).
export default defineConfig({
  plugins: [react()],
  server: { port: 3000, strictPort: true, host: 'localhost' },
  preview: { port: 3000, strictPort: true, host: 'localhost' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
