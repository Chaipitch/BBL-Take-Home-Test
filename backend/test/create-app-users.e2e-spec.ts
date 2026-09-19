// scripts/create-app-users.ts against the real test database.
import { createAppUsers } from '../scripts/create-app-users.js';
import { createTestApp, type TestApp } from './support/app.js';
import { resetDatabase } from './support/db.js';

describe('create-app-users (e2e, real database)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  it('creates verified users that can receive shares, and is idempotent per prefix', async () => {
    const first = await createAppUsers(t.prisma, { count: 3, prefix: 'demo' });

    expect(first).toHaveLength(3);
    expect(first.map((u) => u.email)).toEqual(['demo-1@example.com', 'demo-2@example.com', 'demo-3@example.com']);
    const rows = await t.prisma.user.findMany({ where: { auth0Sub: { startsWith: 'demo|' } } });
    expect(rows.every((r) => r.emailVerified)).toBe(true);

    await createAppUsers(t.prisma, { count: 3, prefix: 'demo' });
    expect(await t.prisma.user.count({ where: { auth0Sub: { startsWith: 'demo|' } } })).toBe(3);
  });

  it('--with-data gives each user their own collection and bookmarks, owned correctly', async () => {
    const [user] = await createAppUsers(t.prisma, { count: 1, prefix: 'data', withData: true });

    const bookmarks = await t.prisma.bookmark.findMany({ where: { ownerId: user.id } });
    expect(bookmarks).toHaveLength(3);
    expect(bookmarks.filter((b) => b.collectionId === user.collectionId)).toHaveLength(2);
    expect(bookmarks.filter((b) => b.collectionId === null)).toHaveLength(1);
    const mismatched = await t.prisma.bookmark.count({ where: { collectionId: user.collectionId, NOT: { ownerId: user.id } } });
    expect(mismatched).toBe(0);
  });

  it('--share-to shares each new collection with an existing verified user, visible to them through the API', async () => {
    const recipient = await t.as('auth0|recipient');

    const [created] = await createAppUsers(t.prisma, { count: 1, prefix: 'sharer', shareTo: 'recipient@test.com' });

    const shared = (await recipient.get('/shared/collections').expect(200)).body.data;
    expect(shared.map((c: { id: string; ownerEmail: string }) => [c.id, c.ownerEmail])).toEqual([[created.collectionId, created.email]]);
    // Read-only: the recipient still cannot reach it through the owner routes.
    expect((await recipient.get(`/collections/${created.collectionId}`)).status).toBe(404);
  });

  it('refuses --share-to for an unknown or unverified recipient, creating nothing', async () => {
    await t.prisma.user.create({ data: { auth0Sub: 'auth0|unverified', email: 'unverified@test.com', emailVerified: false } });

    await expect(createAppUsers(t.prisma, { count: 1, shareTo: 'nobody@test.com' })).rejects.toThrow(/no user with a verified email/);
    await expect(createAppUsers(t.prisma, { count: 1, shareTo: 'unverified@test.com' })).rejects.toThrow(/no user with a verified email/);
    expect(await t.prisma.user.count({ where: { auth0Sub: { startsWith: 'local|' } } })).toBe(0);
  });
});
