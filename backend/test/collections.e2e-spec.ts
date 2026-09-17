// /collections contract (API_DESIGN §2–§6, ADR-012, ADR-013) against the real database, as two users.
import { randomUUID } from 'node:crypto';
import { resetDatabase } from './support/db.js';
import { createTestApp, type AuthedClient, type TestApp } from './support/app.js';

const COLLECTION_KEYS = ['createdAt', 'id', 'name', 'ownerId', 'updatedAt'];
const BOOKMARK_KEYS = ['collectionId', 'createdAt', 'id', 'notes', 'ownerId', 'title', 'updatedAt', 'url'];

describe('/collections (e2e, real database, users A and B)', () => {
  let t: TestApp;
  let a: AuthedClient;
  let b: AuthedClient;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    a = await t.as('auth0|user-a');
    b = await t.as('auth0|user-b');
  });

  afterAll(async () => {
    await t.close();
  });

  const createAs = async (client: AuthedClient, name: string) => (await client.post('/collections').send({ name }).expect(201)).body;
  const addBookmark = (ownerId: string, collectionId: string | null, title = 'Bookmark') =>
    t.prisma.bookmark.create({ data: { ownerId, collectionId, title, url: 'https://example.com' } });

  const expectProblem = (res: { status: number; headers: Record<string, string>; body: Record<string, unknown> }, status: number, code: string) => {
    expect(res.status).toBe(status);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toMatchObject({ type: 'about:blank', status, code });
  };

  describe('happy paths', () => {
    it('POST creates with 201, Location, exact contract fields, trimmed name, ownerId = caller', async () => {
      const res = await a.post('/collections').send({ name: '  Reading  ' }).expect(201);

      expect(Object.keys(res.body).sort()).toEqual(COLLECTION_KEYS);
      expect(res.body).toMatchObject({ name: 'Reading', ownerId: a.userId });
      expect(res.headers.location).toBe(`/collections/${res.body.id}`);
    });

    it('GET one, PUT, PATCH return 200 with the resource', async () => {
      const created = await createAs(a, 'One');
      expect((await a.get(`/collections/${created.id}`).expect(200)).body).toEqual(created);

      const put = await a.put(`/collections/${created.id}`).send({ name: 'Two' }).expect(200);
      expect(put.body).toMatchObject({ id: created.id, name: 'Two', ownerId: a.userId });

      const patch = await a.patch(`/collections/${created.id}`).send({ name: 'Three' }).expect(200);
      expect(patch.body).toMatchObject({ id: created.id, name: 'Three' });
      expect(new Date(patch.body.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime());
    });

    it('duplicate names are allowed (ADR-007)', async () => {
      await createAs(a, 'Same');
      await createAs(a, 'Same');
      expect((await a.get('/collections').expect(200)).body.data).toHaveLength(2);
    });
  });

  describe('privacy: user A can never see or touch user B’s collections', () => {
    it('list only contains the caller’s collections, also when filtering by B’s name', async () => {
      await createAs(a, 'A stuff');
      await createAs(b, 'B secret');

      const all = await a.get('/collections').expect(200);
      expect(all.body.data.map((c: { name: string }) => c.name)).toEqual(['A stuff']);
      expect((await a.get('/collections?name=secret').expect(200)).body).toEqual({ data: [], nextCursor: null });
    });

    it.each([
      ['GET', (c: AuthedClient, id: string) => c.get(`/collections/${id}`)],
      ['PUT', (c: AuthedClient, id: string) => c.put(`/collections/${id}`).send({ name: 'hijack' })],
      ['PATCH', (c: AuthedClient, id: string) => c.patch(`/collections/${id}`).send({ name: 'hijack' })],
      ['DELETE', (c: AuthedClient, id: string) => c.delete(`/collections/${id}?confirm=true`)],
      ['GET bookmarks', (c: AuthedClient, id: string) => c.get(`/collections/${id}/bookmarks`)],
    ])('%s on B’s collection → 404 identical to a random UUID and a malformed id', async (_label, call) => {
      const bCollection = await createAs(b, 'B only');
      await addBookmark(b.userId, bCollection.id);

      const notYours = await call(a, bCollection.id);
      const missing = await call(a, randomUUID());
      const malformed = await call(a, 'not-a-uuid');

      expectProblem(notYours, 404, 'not_found');
      expect(missing.status).toBe(404);
      expect(malformed.status).toBe(404);
      expect(notYours.body).toEqual(missing.body);
      expect(notYours.body).toEqual(malformed.body);

      // B's data is untouched.
      expect(await t.prisma.collection.findUnique({ where: { id: bCollection.id } })).toMatchObject({ name: 'B only' });
      expect(await t.prisma.bookmark.count({ where: { collectionId: bCollection.id } })).toBe(1);
    });

    it('ownerId in the body is rejected, not used (even on the caller’s own collection)', async () => {
      const own = await createAs(a, 'Mine');
      for (const res of [
        await a.post('/collections').send({ name: 'x', ownerId: b.userId }),
        await a.put(`/collections/${own.id}`).send({ name: 'x', ownerId: b.userId }),
        await a.patch(`/collections/${own.id}`).send({ ownerId: b.userId }),
      ]) {
        expectProblem(res, 400, 'validation_failed');
        expect(res.body.errors).toContainEqual({ field: 'ownerId', message: 'is not allowed' });
      }
      expect(await t.prisma.collection.count({ where: { ownerId: b.userId } })).toBe(0);
    });
  });

  describe('validation (400 validation_failed)', () => {
    it.each([
      ['unknown field', { name: 'x', color: 'red' }, 'color'],
      ['id', { name: 'x', id: randomUUID() }, 'id'],
      ['createdAt', { name: 'x', createdAt: '2020-01-01T00:00:00Z' }, 'createdAt'],
      ['updatedAt', { name: 'x', updatedAt: '2020-01-01T00:00:00Z' }, 'updatedAt'],
      ['missing name', {}, 'name'],
      ['whitespace name', { name: '   ' }, 'name'],
      ['201-char name', { name: 'n'.repeat(201) }, 'name'],
      ['number name', { name: 42 }, 'name'],
      ['null name', { name: null }, 'name'],
    ])('POST with %s', async (_label, body, field) => {
      const res = await a.post('/collections').send(body);
      expectProblem(res, 400, 'validation_failed');
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
    });

    it('200-char name is accepted', async () => {
      await a.post('/collections').send({ name: 'n'.repeat(200) }).expect(201);
    });

    it('PUT requires name; PATCH rejects {} and null name', async () => {
      const own = await createAs(a, 'Mine');
      expectProblem(await a.put(`/collections/${own.id}`).send({}), 400, 'validation_failed');
      expectProblem(await a.patch(`/collections/${own.id}`).send({}), 400, 'validation_failed');
      expectProblem(await a.patch(`/collections/${own.id}`).send({ name: null }), 400, 'validation_failed');
      expect((await a.get(`/collections/${own.id}`)).body.name).toBe('Mine');
    });

    it('malformed JSON → 400 without parser internals in the body', async () => {
      const res = await a.post('/collections').set('Content-Type', 'application/json').send('{"name": ');
      expectProblem(res, 400, 'validation_failed');
      expect(JSON.stringify(res.body)).not.toMatch(/JSON|position|token/i);
    });

    it('non-JSON body → 400', async () => {
      expectProblem(await a.post('/collections').set('Content-Type', 'text/plain').send('name=x'), 400, 'validation_failed');
    });

    it('body over 100 KB → 413 payload_too_large (not 500)', async () => {
      expectProblem(await a.post('/collections').send({ name: 'x'.repeat(150_000) }), 413, 'payload_too_large');
    });

    it.each([
      ['unknown query param', '/collections?sort=name'],
      ['limit=0', '/collections?limit=0'],
      ['limit=101', '/collections?limit=101'],
      ['limit=abc', '/collections?limit=abc'],
      ['limit=1.5', '/collections?limit=1.5'],
      ['repeated limit', '/collections?limit=1&limit=2'],
      ['empty name filter', '/collections?name='],
      ['garbage cursor', '/collections?cursor=not-a-cursor'],
      ['cursor with non-uuid id', `/collections?cursor=${Buffer.from(JSON.stringify({ c: new Date().toISOString(), i: 'x' })).toString('base64url')}`],
      ['unknown query param on nested list', `/collections/${randomUUID()}/bookmarks?collectionId=x`],
    ])('%s', async (_label, path) => {
      expectProblem(await a.get(path), 400, 'validation_failed');
    });
  });

  describe('pagination and filters', () => {
    it('pages newest first with nextCursor, null on the last page', async () => {
      for (const n of ['1', '2', '3', '4', '5']) await createAs(a, n);

      const p1 = await a.get('/collections?limit=2').expect(200);
      const p2 = await a.get(`/collections?limit=2&cursor=${p1.body.nextCursor}`).expect(200);
      const p3 = await a.get(`/collections?limit=2&cursor=${p2.body.nextCursor}`).expect(200);

      expect([...p1.body.data, ...p2.body.data, ...p3.body.data].map((c: { name: string }) => c.name)).toEqual(['5', '4', '3', '2', '1']);
      expect(p3.body.nextCursor).toBeNull();
    });

    it('rows with identical createdAt are neither skipped nor duplicated (id tie-break)', async () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      await t.prisma.collection.createMany({ data: Array.from({ length: 5 }, (_, i) => ({ name: `tie ${i}`, ownerId: a.userId, createdAt })) });

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const res: { body: { data: Array<{ id: string }>; nextCursor: string | null } } = await a
          .get(`/collections?limit=2${cursor ? `&cursor=${cursor}` : ''}`)
          .expect(200);
        seen.push(...res.body.data.map((c: { id: string }) => c.id));
        cursor = res.body.nextCursor;
      } while (cursor);

      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
    });

    it('a collection created between pages does not shift the next page', async () => {
      for (const n of ['1', '2', '3', '4']) await createAs(a, n);
      const p1 = await a.get('/collections?limit=2').expect(200);
      await createAs(a, 'new');
      const p2 = await a.get(`/collections?limit=2&cursor=${p1.body.nextCursor}`).expect(200);

      expect(p1.body.data.map((c: { name: string }) => c.name)).toEqual(['4', '3']);
      expect(p2.body.data.map((c: { name: string }) => c.name)).toEqual(['2', '1']);
    });

    it('a cursor from B’s data cannot reveal B’s rows', async () => {
      for (const n of ['b1', 'b2', 'b3']) await createAs(b, n);
      const bPage = await b.get('/collections?limit=1').expect(200);
      expect((await a.get(`/collections?cursor=${bPage.body.nextCursor}`).expect(200)).body.data).toEqual([]);
    });

    it('name filter is case-insensitive contains', async () => {
      await createAs(a, 'Work Links');
      await createAs(a, 'Recipes');
      expect((await a.get('/collections?name=WORK').expect(200)).body.data.map((c: { name: string }) => c.name)).toEqual(['Work Links']);
    });

    // Prisma does not escape LIKE wildcards in `contains`; these failed before common/filters.ts.
    it.each([
      ['%', '100% done', 'nothing'],
      ['_', 'a_b', 'axb'],
      ['\\', 'back\\slash', 'backslash'],
      ['\\%', 'a\\%b', 'a%b'],
    ])('"%s" in the name filter matches literally', async (needle, literal, other) => {
      await createAs(a, literal);
      await createAs(a, other);
      const res = await a.get(`/collections?name=${encodeURIComponent(needle)}`).expect(200);
      expect(res.body.data.map((c: { name: string }) => c.name)).toEqual([literal]);
    });
  });

  describe('GET /collections/:id/bookmarks', () => {
    it('lists only this collection’s bookmarks, with contract fields and q on title', async () => {
      const reading = await createAs(a, 'Reading');
      const other = await createAs(a, 'Other');
      await addBookmark(a.userId, reading.id, 'Postgres Internals');
      await addBookmark(a.userId, reading.id, 'Nest docs');
      await addBookmark(a.userId, other.id, 'Postgres in other collection');
      await addBookmark(a.userId, null, 'Postgres uncategorised');

      const all = await a.get(`/collections/${reading.id}/bookmarks`).expect(200);
      expect(all.body.data).toHaveLength(2);
      expect(Object.keys(all.body.data[0]).sort()).toEqual(BOOKMARK_KEYS);

      const q = await a.get(`/collections/${reading.id}/bookmarks?q=postgres`).expect(200);
      expect(q.body.data.map((bm: { title: string }) => bm.title)).toEqual(['Postgres Internals']);
      expect((await a.get(`/collections/${reading.id}/bookmarks?q=%25`).expect(200)).body.data).toEqual([]);
    });
  });

  describe('DELETE /collections/:id (ADR-005, 005b)', () => {
    it('empty collection → 204 and gone (confirm not needed, but allowed)', async () => {
      const first = await createAs(a, 'Empty');
      const second = await createAs(a, 'Empty too');
      await a.delete(`/collections/${first.id}`).expect(204);
      await a.delete(`/collections/${second.id}?confirm=true`).expect(204);
      expect(await t.prisma.collection.count()).toBe(0);
    });

    it('non-empty without confirm → 409 with bookmarkCount, nothing deleted', async () => {
      const col = await createAs(a, 'Full');
      await addBookmark(a.userId, col.id);
      await addBookmark(a.userId, col.id);

      const res = await a.delete(`/collections/${col.id}`);

      expectProblem(res, 409, 'collection_not_empty');
      expect(res.body.bookmarkCount).toBe(2);
      expect(await t.prisma.collection.count()).toBe(1);
      expect(await t.prisma.bookmark.count()).toBe(2);
    });

    it('confirm=true → 204; its bookmarks are deleted, other bookmarks untouched', async () => {
      const col = await createAs(a, 'Full');
      const keep = await createAs(a, 'Keep');
      await addBookmark(a.userId, col.id);
      await addBookmark(a.userId, keep.id);
      await addBookmark(a.userId, null);

      await a.delete(`/collections/${col.id}?confirm=true`).expect(204);

      expect(await t.prisma.bookmark.count({ where: { collectionId: col.id } })).toBe(0);
      expect(await t.prisma.bookmark.count({ where: { ownerId: a.userId } })).toBe(2);
    });

    it('confirm with any value other than "true" → 400', async () => {
      const col = await createAs(a, 'Full');
      await addBookmark(a.userId, col.id);
      for (const value of ['yes', '1', 'TRUE', '']) {
        expectProblem(await a.delete(`/collections/${col.id}?confirm=${value}`), 400, 'validation_failed');
      }
      expect(await t.prisma.bookmark.count()).toBe(1);
    });
  });
});
