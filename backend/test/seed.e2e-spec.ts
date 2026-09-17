// Seed data (ADR-016) against the real test database: ≥ 2 users, idempotent, non-destructive.
import { CANDIDATE, SEED_USERS, seed } from '../prisma/seed.js';
import { resetDatabase } from './support/db.js';
import { createTestApp, type TestApp } from './support/app.js';

describe('prisma/seed.ts (e2e, real database)', () => {
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

  const snapshot = async () => ({
    users: await t.prisma.user.count(),
    collections: await t.prisma.collection.count(),
    bookmarks: await t.prisma.bookmark.count(),
    shares: await t.prisma.collectionShare.count(),
  });

  it('creates at least two distinct users, each with collections and bookmarks, plus shares both ways', async () => {
    await expect(seed(t.prisma)).resolves.toEqual({ candidateSeeded: true });

    const users = await t.prisma.user.findMany({ include: { _count: { select: { collections: true, bookmarks: true, sharedWithMe: true } } } });
    expect(users.map((u) => u.auth0Sub).sort()).toEqual([CANDIDATE.auth0Sub, ...SEED_USERS.map((u) => u.auth0Sub)].sort());
    for (const u of users) {
      expect(u.emailVerified).toBe(true);
      expect(u._count.collections).toBeGreaterThan(0);
      expect(u._count.bookmarks).toBeGreaterThan(0);
    }
    const byEmail = Object.fromEntries(users.map((u) => [u.email, u._count.sharedWithMe]));
    expect(byEmail[CANDIDATE.email]).toBe(1);
    expect(byEmail['user-b@example.com']).toBe(1);
    // Integrity: no bookmark sits in a collection owned by someone else.
    const [{ mismatched }] = await t.prisma.$queryRawUnsafe<Array<{ mismatched: number }>>(
      'SELECT count(*)::int AS mismatched FROM "Bookmark" b JOIN "Collection" c ON c.id = b."collectionId" WHERE b."ownerId" <> c."ownerId"',
    );
    expect(mismatched).toBe(0);
  });

  it('is idempotent: running twice gives the same counts', async () => {
    await seed(t.prisma);
    const first = await snapshot();
    await expect(seed(t.prisma)).resolves.toEqual({ candidateSeeded: false });
    const second = await snapshot();
    // Compare field by field so a failure names the count that changed.
    expect(second.users).toBe(first.users);
    expect(second.collections).toBe(first.collections);
    expect(second.bookmarks).toBe(first.bookmarks);
    expect(second.shares).toBe(first.shares);
  });

  it('never deletes or duplicates the real test user’s own data on re-seed', async () => {
    await seed(t.prisma);
    const candidate = await t.prisma.user.findUniqueOrThrow({ where: { auth0Sub: CANDIDATE.auth0Sub } });
    const manual = await t.prisma.collection.create({ data: { name: 'Created manually', ownerId: candidate.id } });
    const before = await t.prisma.collection.count({ where: { ownerId: candidate.id } });

    await seed(t.prisma);

    expect(await t.prisma.collection.findUnique({ where: { id: manual.id } })).not.toBeNull();
    expect(await t.prisma.collection.count({ where: { ownerId: candidate.id } })).toBe(before);
    expect(candidate.id).toBe((await t.prisma.user.findUniqueOrThrow({ where: { auth0Sub: CANDIDATE.auth0Sub } })).id);
  });

  it('seeded data is visible through the API for the real test user (owner and recipient views)', async () => {
    await seed(t.prisma);
    const candidate = await t.as(CANDIDATE.auth0Sub);

    const collections = (await candidate.get('/collections').expect(200)).body.data.map((c: { name: string }) => c.name);
    expect(collections).toEqual(expect.arrayContaining(['Backend', 'Security', 'Empty collection']));
    expect(collections).not.toContain('Team reading list');

    const shared = (await candidate.get('/shared/collections').expect(200)).body.data;
    expect(shared.map((c: { name: string; ownerEmail: string }) => [c.name, c.ownerEmail])).toEqual([['Team reading list', 'user-b@example.com']]);
    expect((await candidate.get(`/shared/collections/${shared[0].id}/bookmarks`).expect(200)).body.data).toHaveLength(2);
  });
});
