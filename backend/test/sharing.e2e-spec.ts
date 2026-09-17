// Sharing (ADR-006, ADR-015) — the only exception to "private to the owner". Real database; users:
// A (owner), B (recipient, verified email), C (verified, not a recipient), U (unverified email).
import { randomUUID } from 'node:crypto';
import { resetDatabase } from './support/db.js';
import { createTestApp, type AuthedClient, type TestApp } from './support/app.js';

type Res = { status: number; headers: Record<string, string>; body: Record<string, any> };

describe('Sharing (e2e, real database)', () => {
  let t: TestApp;
  let a: AuthedClient;
  let b: AuthedClient;
  let c: AuthedClient;

  beforeAll(async () => {
    t = await createTestApp();
  });

  // FakeUserInfo gives every user `<sub suffix>@test.com`, verified.
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    a = await t.as('auth0|user-a');
    b = await t.as('auth0|user-b');
    c = await t.as('auth0|user-c');
  });

  afterAll(async () => {
    await t.close();
  });

  const expectProblem = (res: Res, status: number, code: string) => {
    expect(res.status).toBe(status);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toMatchObject({ status, code });
  };
  const notFoundBody = { type: 'about:blank', title: 'Not Found', status: 404, code: 'not_found', detail: 'The requested resource was not found' };

  /** A's collection with two bookmarks, shared with B. */
  async function sharedSetup() {
    const col = (await a.post('/collections').send({ name: 'A shared' }).expect(201)).body;
    const bm1 = (await a.post('/bookmarks').send({ url: 'https://one.example', title: 'Postgres one', notes: 'n1', collectionId: col.id }).expect(201)).body;
    const bm2 = (await a.post('/bookmarks').send({ url: 'https://two.example', title: 'Two', collectionId: col.id }).expect(201)).body;
    const share = (await a.post(`/collections/${col.id}/shares`).send({ email: 'user-b@test.com' }).expect(201)).body;
    return { col, bm1, bm2, share };
  }

  describe('owner: create, list, revoke', () => {
    it('POST share → 201 with Location and the owner view (no recipient user id)', async () => {
      const col = (await a.post('/collections').send({ name: 'X' }).expect(201)).body;
      const res = await a.post(`/collections/${col.id}/shares`).send({ email: '  USER-B@Test.com ' }).expect(201);

      expect(Object.keys(res.body).sort()).toEqual(['collectionId', 'createdAt', 'email', 'id']);
      expect(res.body).toMatchObject({ collectionId: col.id, email: 'user-b@test.com' });
      expect(res.headers.location).toBe(`/collections/${col.id}/shares/${res.body.id}`);
      expect(JSON.stringify(res.body)).not.toContain(b.userId);
    });

    it('unknown email and unverified user → identical 404 recipient_not_found (ADR-006c)', async () => {
      await t.prisma.user.create({ data: { auth0Sub: 'auth0|unverified', email: 'unverified@test.com', emailVerified: false } });
      const col = (await a.post('/collections').send({ name: 'X' }).expect(201)).body;

      const unknown: Res = await a.post(`/collections/${col.id}/shares`).send({ email: 'nobody@test.com' });
      const unverified: Res = await a.post(`/collections/${col.id}/shares`).send({ email: 'unverified@test.com' });

      expectProblem(unknown, 404, 'recipient_not_found');
      expect(unverified.body).toEqual(unknown.body);
      expect(await t.prisma.collectionShare.count()).toBe(0);
    });

    it('two verified users with the same email → 409 ambiguous_recipient, nothing shared', async () => {
      await t.prisma.user.create({ data: { auth0Sub: 'google|user-b-twin', email: 'user-b@test.com', emailVerified: true } });
      const col = (await a.post('/collections').send({ name: 'X' }).expect(201)).body;
      expectProblem(await a.post(`/collections/${col.id}/shares`).send({ email: 'user-b@test.com' }), 409, 'ambiguous_recipient');
      expect(await t.prisma.collectionShare.count()).toBe(0);
    });

    it('sharing with yourself → 400; sharing twice → 409 already_shared', async () => {
      const col = (await a.post('/collections').send({ name: 'X' }).expect(201)).body;
      const self: Res = await a.post(`/collections/${col.id}/shares`).send({ email: 'user-a@test.com' });
      expectProblem(self, 400, 'validation_failed');
      expect(self.body.errors).toEqual([{ field: 'email', message: 'cannot share a collection with yourself' }]);

      await a.post(`/collections/${col.id}/shares`).send({ email: 'user-b@test.com' }).expect(201);
      expectProblem(await a.post(`/collections/${col.id}/shares`).send({ email: 'user-b@test.com' }), 409, 'already_shared');
    });

    it.each([
      ['missing email', {}],
      ['not an email', { email: 'not-an-email' }],
      ['extra field', { email: 'user-b@test.com', canEdit: true }],
    ])('invalid body (%s) → 400', async (_label, body) => {
      const col = (await a.post('/collections').send({ name: 'X' }).expect(201)).body;
      expectProblem(await a.post(`/collections/${col.id}/shares`).send(body), 400, 'validation_failed');
    });

    it('someone else’s collection → 404 not_found BEFORE the email is looked at (no recipient_not_found leak)', async () => {
      const bCol = (await b.post('/collections').send({ name: 'B' }).expect(201)).body;
      const valid: Res = await a.post(`/collections/${bCol.id}/shares`).send({ email: 'user-c@test.com' });
      const unknownEmail: Res = await a.post(`/collections/${bCol.id}/shares`).send({ email: 'nobody@test.com' });
      const random: Res = await a.post(`/collections/${randomUUID()}/shares`).send({ email: 'user-c@test.com' });

      expect(valid.body).toEqual(notFoundBody);
      expect(unknownEmail.body).toEqual(notFoundBody);
      expect(random.body).toEqual(notFoundBody);
      expect(await t.prisma.collectionShare.count()).toBe(0);
    });

    it('list and revoke are owner-only; revoke removes the recipient’s access immediately', async () => {
      const { col, share } = await sharedSetup();

      const list = await a.get(`/collections/${col.id}/shares`).expect(200);
      expect(list.body.data.map((s: { id: string }) => s.id)).toEqual([share.id]);

      // Recipient and outsider cannot see or revoke the owner's shares.
      expect((await b.get(`/collections/${col.id}/shares`)).body).toEqual(notFoundBody);
      expect((await c.delete(`/collections/${col.id}/shares/${share.id}`)).body).toEqual(notFoundBody);
      expect((await b.delete(`/collections/${col.id}/shares/${share.id}`)).body).toEqual(notFoundBody);

      await b.get(`/shared/collections/${col.id}`).expect(200);
      await a.delete(`/collections/${col.id}/shares/${share.id}`).expect(204);
      expect((await b.get(`/shared/collections/${col.id}`)).body).toEqual(notFoundBody);
      expect((await a.delete(`/collections/${col.id}/shares/${share.id}`)).body).toEqual(notFoundBody);
    });

    it('a share id from another collection cannot be revoked through this collection', async () => {
      const { share } = await sharedSetup();
      const other = (await a.post('/collections').send({ name: 'Other' }).expect(201)).body;
      expect((await a.delete(`/collections/${other.id}/shares/${share.id}`)).body).toEqual(notFoundBody);
      expect(await t.prisma.collectionShare.count()).toBe(1);
    });
  });

  describe('recipient: read-only access under /shared', () => {
    it('lists and reads shared collections with the recipient shape (no ownerId, no user ids)', async () => {
      const { col, share } = await sharedSetup();

      const list = await b.get('/shared/collections').expect(200);
      expect(list.body.data).toHaveLength(1);
      const shared = list.body.data[0];
      expect(Object.keys(shared).sort()).toEqual(['createdAt', 'id', 'name', 'ownerEmail', 'sharedAt', 'updatedAt']);
      expect(shared).toMatchObject({ id: col.id, name: 'A shared', ownerEmail: 'user-a@test.com', sharedAt: share.createdAt });

      expect((await b.get(`/shared/collections/${col.id}`).expect(200)).body).toEqual(shared);
      for (const body of [list.body, shared]) {
        expect(JSON.stringify(body)).not.toContain(a.userId);
        expect(JSON.stringify(body)).not.toContain(b.userId);
      }
    });

    it('reads the shared collection’s bookmarks (with notes, q filter) without ownerId', async () => {
      const { col, bm1 } = await sharedSetup();
      await a.post('/bookmarks').send({ url: 'https://private.example', title: 'Postgres private' }).expect(201);

      const all = await b.get(`/shared/collections/${col.id}/bookmarks`).expect(200);
      expect(all.body.data).toHaveLength(2);
      expect(Object.keys(all.body.data[0]).sort()).toEqual(['collectionId', 'createdAt', 'id', 'notes', 'title', 'updatedAt', 'url']);
      expect(JSON.stringify(all.body)).not.toContain(a.userId);

      const q = await b.get(`/shared/collections/${col.id}/bookmarks?q=postgres`).expect(200);
      expect(q.body.data.map((x: { id: string }) => x.id)).toEqual([bm1.id]);
    });

    it('not shared with the caller, the caller’s own collection, random and malformed ids → identical 404', async () => {
      const { col } = await sharedSetup();
      const bOwn = (await b.post('/collections').send({ name: 'B own' }).expect(201)).body;

      for (const path of [
        `/shared/collections/${col.id}`, // shared with B, not C
        `/shared/collections/${col.id}/bookmarks`,
      ]) {
        expect((await c.get(path)).body).toEqual(notFoundBody);
      }
      expect((await b.get(`/shared/collections/${bOwn.id}`)).body).toEqual(notFoundBody);
      expect((await b.get(`/shared/collections/${randomUUID()}`)).body).toEqual(notFoundBody);
      expect((await b.get('/shared/collections/not-a-uuid')).body).toEqual(notFoundBody);
      expect((await c.get('/shared/collections').expect(200)).body).toEqual({ data: [], nextCursor: null });
    });

    it('recipient cannot modify anything: owner routes ignore shares (404) and /shared has no write routes', async () => {
      const { col, bm1, share } = await sharedSetup();

      const attempts: Res[] = [
        await b.get(`/collections/${col.id}`),
        await b.put(`/collections/${col.id}`).send({ name: 'hijack' }),
        await b.patch(`/collections/${col.id}`).send({ name: 'hijack' }),
        await b.delete(`/collections/${col.id}?confirm=true`),
        await b.get(`/collections/${col.id}/bookmarks`),
        await b.get(`/bookmarks/${bm1.id}`),
        await b.patch(`/bookmarks/${bm1.id}`).send({ title: 'hijack' }),
        await b.delete(`/bookmarks/${bm1.id}`),
        await b.post('/bookmarks').send({ url: 'https://x.example', title: 'into A', collectionId: col.id }),
        await b.post(`/collections/${col.id}/shares`).send({ email: 'user-c@test.com' }),
        await b.patch(`/shared/collections/${col.id}`).send({ name: 'hijack' }),
        await b.delete(`/shared/collections/${col.id}`),
      ];

      expect(attempts.map((r) => r.status)).toEqual([404, 404, 404, 404, 404, 404, 404, 404, 400, 404, 404, 404]);
      expect(await t.prisma.collection.findUnique({ where: { id: col.id } })).toMatchObject({ name: 'A shared' });
      expect(await t.prisma.bookmark.findUnique({ where: { id: bm1.id } })).toMatchObject({ title: 'Postgres one' });
      expect(await t.prisma.collectionShare.findMany()).toEqual([expect.objectContaining({ id: share.id })]);
      expect((await b.get('/bookmarks').expect(200)).body.data).toEqual([]);
    });

    it('recipient never learns about other recipients', async () => {
      const { col } = await sharedSetup();
      await a.post(`/collections/${col.id}/shares`).send({ email: 'user-c@test.com' }).expect(201);
      const body = JSON.stringify([
        (await b.get('/shared/collections').expect(200)).body,
        (await b.get(`/shared/collections/${col.id}`).expect(200)).body,
      ]);
      expect(body).not.toContain('user-c@test.com');
      expect(body).not.toContain(c.userId);
    });

    it('deleting the collection removes the recipient’s access (cascade)', async () => {
      const { col } = await sharedSetup();
      await a.delete(`/collections/${col.id}?confirm=true`).expect(204);
      expect((await b.get(`/shared/collections/${col.id}`)).body).toEqual(notFoundBody);
      expect((await b.get('/shared/collections').expect(200)).body.data).toEqual([]);
      expect(await t.prisma.collectionShare.count()).toBe(0);
    });

    it('access follows the account, not the address: changing B’s stored email keeps the share (ADR-006g)', async () => {
      const { col } = await sharedSetup();
      await t.prisma.user.update({ where: { id: b.userId }, data: { email: 'b-new@test.com' } });
      await b.get(`/shared/collections/${col.id}`).expect(200);
    });
  });
});
