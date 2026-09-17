// e2e global setup (ADR-011i): apply migrations to the test database once per run.
import { execFileSync } from 'node:child_process';
import { assertTestDatabase, TEST_DATABASE_URL } from './db.js';

export default function setup(): void {
  // Runs in the main Vitest process, where test.env from the config is not applied.
  const url = assertTestDatabase(TEST_DATABASE_URL);
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
