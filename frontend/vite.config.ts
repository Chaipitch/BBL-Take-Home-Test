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
    // Explicit values so tests don't depend on a local .env (gitignored).
    env: {
      VITE_API_BASE_URL: 'http://api.test',
      VITE_AUTH0_DOMAIN: 'tenant.test',
      VITE_AUTH0_CLIENT_ID: 'test-client-id',
      VITE_AUTH0_AUDIENCE: 'https://api.test',
    },
  },
})
