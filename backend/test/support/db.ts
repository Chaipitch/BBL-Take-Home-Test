import type { PrismaService } from '../../src/prisma/prisma.service.js';

export const TEST_DATABASE_NAME = 'bookmarks_test';
export const TEST_DATABASE_URL = `postgresql://bookmarks:bookmarks@localhost:5432/${TEST_DATABASE_NAME}?schema=public`;

/** Refuses to run destructive test setup against anything but the dedicated test database. */
export function assertTestDatabase(url = process.env.DATABASE_URL): string {
  if (!url) throw new Error('DATABASE_URL is not set for e2e tests');
  const name = new URL(url).pathname.replace(/^\//, '');
  if (name !== TEST_DATABASE_NAME) {
    throw new Error(`Refusing to run e2e tests against database "${name}"; expected "${TEST_DATABASE_NAME}"`);
  }
  return url;
}

/** ADR-011i: every test starts from empty tables. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  assertTestDatabase();
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "CollectionShare", "Bookmark", "Collection", "User" CASCADE');
}
