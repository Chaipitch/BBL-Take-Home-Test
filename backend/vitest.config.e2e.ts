import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { TEST_DATABASE_URL } from './test/support/db.js';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // ADR-011i: real database, truncated before each test → files must not run concurrently.
    fileParallelism: false,
    globalSetup: ['./test/support/global-setup.ts'],
    env: {
      // Overrides backend/.env so e2e tests can never touch the dev database.
      DATABASE_URL: TEST_DATABASE_URL,
      AUTH_ISSUER: 'https://dev-yg.us.auth0.com/',
      AUTH_AUDIENCE: 'https://bbl-candidate-test-api',
      AUTH_JWKS_URI: 'https://dev-yg.us.auth0.com/.well-known/jwks.json',
      AUTH_USERINFO_URI: 'https://dev-yg.us.auth0.com/userinfo',
    },
  },
});
