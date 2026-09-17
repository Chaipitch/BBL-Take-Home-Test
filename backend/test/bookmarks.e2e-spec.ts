// /bookmarks contract (API_DESIGN §2–§6, ADR-012, ADR-014) against the real database, as two users.
import { randomUUID } from 'node:crypto';
import { resetDatabase } from './support/db.js';
import { createTestApp, type AuthedClient, type TestApp } from './support/app.js';

const BOOKMARK_KEYS = ['collectionId', 'createdAt', 'id', 'notes', 'ownerId', 'title', 'updatedAt', 'url'];
const URL_OK = 'https://example.com/article';

type Res = { status: number; headers: Record<string, string>; body: Record<string, any> };

describe('/bookmarks (e2e, real database, users A and B)', () => {
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

  const collectionOf = async (client: AuthedClient, name = 'Col') => (await client.post('/collections').send({ name }).expect(201)).body;
  const bookmarkOf = async (client: AuthedClient, body: Record<string, unknown> = {}) =>
    (await client.post('/bookmarks').send({ url: URL_OK, title: 'Title', ...body }).expect(201)).body;
  const expectProblem = (res: Res, status: number, code: string) => {
    expect(res.status).toBe(status);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toMatchObject({ type: 'about:blank', status, code });
  };
  const expectCollectionNotFound = (res: Res) => {
    expectProblem(res, 400, 'validation_failed');
    expect(res.body.errors).toEqual([{ field: 'collectionId', message: 'collection not found' }]);
  };

  describe('happy paths', () => {
    it('POST: 201, Location, exact fields, trimmed, notes/collectionId default null, ownerId = caller', async () => {
      const res = await a.post('/bookmarks').send({ url: `  ${URL_OK}  `, title: '  Hello  ' }).expect(201);
      expect(Object.keys(res.body).sort()).toEqual(BOOKMARK_KEYS);
      expect(res.body).toMatchObject({ url: URL_OK, title: 'Hello', notes: null, collectionId: null, ownerId: a.userId });
      expect(res.headers.location).toBe(`/bookmarks/${res.body.id}`);
    });

    it('whitespace-only notes are stored as null; real notes are trimmed', async () => {
      expect((await bookmarkOf(a, { notes: '   ' })).notes).toBeNull();
      expect((await bookmarkOf(a, { notes: '  read later  ' })).notes).toBe('read later');
    });

    it('GET one returns the resource; DELETE → 204 then 404', async () => {
      const bm = await bookmarkOf(a);
      expect((await a.get(`/bookmarks/${bm.id}`).expect(200)).body).toEqual(bm);
      await a.delete(`/bookmarks/${bm.id}`).expect(204);
      expectProblem(await a.get(`/bookmarks/${bm.id}`), 404, 'not_found');
    });

    it('PUT replaces; omitted notes and collectionId become null', async () => {
      const col = await collectionOf(a);
      const bm = await bookmarkOf(a, { notes: 'n', collectionId: col.id });
      const res = await a.put(`/bookmarks/${bm.id}`).send({ url: 'https://new.example', title: 'New' }).expect(200);
      expect(res.body).toMatchObject({ id: bm.id, url: 'https://new.example', title: 'New', notes: null, collectionId: null });
    });

    it('PATCH changes only sent fields; null clears notes and uncategorises', async () => {
      const col = await collectionOf(a);
      const bm = await bookmarkOf(a, { notes: 'keep', collectionId: col.id });

      const titled = await a.patch(`/bookmarks/${bm.id}`).send({ title: 'Renamed' }).expect(200);
      expect(titled.body).toMatchObject({ title: 'Renamed', url: URL_OK, notes: 'keep', collectionId: col.id });

      const cleared = await a.patch(`/bookmarks/${bm.id}`).send({ notes: null, collectionId: null }).expect(200);
      expect(cleared.body).toMatchObject({ title: 'Renamed', notes: null, collectionId: null });
    });

    it('moves a bookmark between the caller’s own collections', async () => {
      const one = await collectionOf(a, 'One');
      const two = await collectionOf(a, 'Two');
      const bm = await bookmarkOf(a, { collectionId: one.id });
      expect((await a.patch(`/bookmarks/${bm.id}`).send({ collectionId: two.id }).expect(200)).body.collectionId).toBe(two.id);
    });
  });

  describe('privacy: user A can never see or touch user B’s bookmarks', () => {
    it.each([
      ['GET', (c: AuthedClient, id: string) => c.get(`/bookmarks/${id}`)],
      ['PUT', (c: AuthedClient, id: string) => c.put(`/bookmarks/${id}`).send({ url: URL_OK, title: 'hijack' })],
      ['PATCH', (c: AuthedClient, id: string) => c.patch(`/bookmarks/${id}`).send({ title: 'hijack' })],
      ['DELETE', (c: AuthedClient, id: string) => c.delete(`/bookmarks/${id}`)],
    ])('%s on B’s bookmark → 404 identical to a random UUID and a malformed id', async (_label, call) => {
      const bBookmark = await bookmarkOf(b, { title: 'B secret' });

      const notYours: Res = await call(a, bBookmark.id);
      const missing: Res = await call(a, randomUUID());
      const malformed: Res = await call(a, 'not-a-uuid');

      expectProblem(notYours, 404, 'not_found');
      expect(notYours.body).toEqual(missing.body);
      expect(notYours.body).toEqual(malformed.body);
      expect(await t.prisma.bookmark.findUnique({ where: { id: bBookmark.id } })).toMatchObject({ title: 'B secret' });
    });

    it('list never contains B’s bookmarks, including with q matching B’s title', async () => {
      await bookmarkOf(a, { title: 'Mine' });
      await bookmarkOf(b, { title: 'B secret' });
      expect((await a.get('/bookmarks').expect(200)).body.data.map((x: { title: string }) => x.title)).toEqual(['Mine']);
      expect((await a.get('/bookmarks?q=secret').expect(200)).body).toEqual({ data: [], nextCursor: null });
    });

    it('filter by B’s collectionId → empty page, identical to an own empty collection and a random id', async () => {
      const bCol = await collectionOf(b);
      await bookmarkOf(b, { collectionId: bCol.id });
      const aEmpty = await collectionOf(a);

      const byB = (await a.get(`/bookmarks?collectionId=${bCol.id}`).expect(200)).body;
      expect(byB).toEqual({ data: [], nextCursor: null });
      expect((await a.get(`/bookmarks?collectionId=${aEmpty.id}`).expect(200)).body).toEqual(byB);
      expect((await a.get(`/bookmarks?collectionId=${randomUUID()}`).expect(200)).body).toEqual(byB);
    });

    it.each([
      ['POST', async (bCol: string) => a.post('/bookmarks').send({ url: URL_OK, title: 't', collectionId: bCol })],
      ['PUT', async (bCol: string) => a.put(`/bookmarks/${(await bookmarkOf(a)).id}`).send({ url: URL_OK, title: 't', collectionId: bCol })],
      ['PATCH', async (bCol: string) => a.patch(`/bookmarks/${(await bookmarkOf(a)).id}`).send({ collectionId: bCol })],
    ])('%s assigning B’s collection → 400 identical to a random collectionId; nothing written', async (_label, call) => {
      const bCol = await collectionOf(b);
      const before = await t.prisma.bookmark.count({ where: { collectionId: bCol.id } });

      const intoB: Res = await call(bCol.id);
      const intoRandom: Res = await call(randomUUID());

      expectCollectionNotFound(intoB);
      expect(intoB.body).toEqual(intoRandom.body);
      expect(await t.prisma.bookmark.count({ where: { collectionId: bCol.id } })).toBe(before);
      expect(await t.prisma.bookmark.count({ where: { ownerId: a.userId, NOT: { collectionId: null } } })).toBe(0);
    });

    it('ownerId in the body is rejected on POST, PUT and PATCH', async () => {
      const bm = await bookmarkOf(a);
      for (const res of [
        await a.post('/bookmarks').send({ url: URL_OK, title: 't', ownerId: b.userId }),
        await a.put(`/bookmarks/${bm.id}`).send({ url: URL_OK, title: 't', ownerId: b.userId }),
        await a.patch(`/bookmarks/${bm.id}`).send({ ownerId: b.userId }),
      ]) {
        expectProblem(res, 400, 'validation_failed');
        expect(res.body.errors).toContainEqual({ field: 'ownerId', message: 'is not allowed' });
      }
      expect(await t.prisma.bookmark.count({ where: { ownerId: b.userId } })).toBe(0);
    });
  });

  describe('URL validation (ADR-014d)', () => {
    it.each([
      'javascript:alert(document.cookie)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'ftp://files.example.com',
      '/relative/path',
      'example.com',
      'http:example.com',
      'https://',
      `https://example.com/${'a'.repeat(2030)}`,
    ])('rejects %s', async (url) => {
      const res = await a.post('/bookmarks').send({ url, title: 't' });
      expectProblem(res, 400, 'validation_failed');
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain('url');
    });

    it.each(['http://localhost:3000/x', 'http://127.0.0.1:8080', 'HTTPS://EXAMPLE.COM', 'https://例子.测试/路径', 'https://user:pass@host.example'])(
      'accepts %s',
      async (url) => {
        await a.post('/bookmarks').send({ url, title: 't' }).expect(201);
      },
    );
  });

  describe('validation (400 validation_failed)', () => {
    it.each([
      ['unknown field', { url: URL_OK, title: 't', tags: [] }],
      ['id', { url: URL_OK, title: 't', id: randomUUID() }],
      ['createdAt', { url: URL_OK, title: 't', createdAt: '2020-01-01T00:00:00Z' }],
      ['missing url', { title: 't' }],
      ['missing title', { url: URL_OK }],
      ['whitespace title', { url: URL_OK, title: '   ' }],
      ['501-char title', { url: URL_OK, title: 't'.repeat(501) }],
      ['10 001-char notes', { url: URL_OK, title: 't', notes: 'n'.repeat(10_001) }],
      ['malformed collectionId', { url: URL_OK, title: 't', collectionId: 'nope' }],
      ['numeric notes', { url: URL_OK, title: 't', notes: 5 }],
    ])('POST with %s', async (_label, body) => {
      expectProblem(await a.post('/bookmarks').send(body), 400, 'validation_failed');
    });

    it('boundaries accepted: 500-char title, 10 000-char notes', async () => {
      await a.post('/bookmarks').send({ url: URL_OK, title: 't'.repeat(500), notes: 'n'.repeat(10_000) }).expect(201);
    });

    it('PATCH rejects {}, null url and null title; PUT requires url and title', async () => {
      const bm = await bookmarkOf(a);
      expectProblem(await a.patch(`/bookmarks/${bm.id}`).send({}), 400, 'validation_failed');
      expectProblem(await a.patch(`/bookmarks/${bm.id}`).send({ url: null }), 400, 'validation_failed');
      expectProblem(await a.patch(`/bookmarks/${bm.id}`).send({ title: null }), 400, 'validation_failed');
      expectProblem(await a.put(`/bookmarks/${bm.id}`).send({ title: 't' }), 400, 'validation_failed');
      expect((await a.get(`/bookmarks/${bm.id}`)).body).toEqual(bm);
    });

    it.each([
      ['malformed collectionId filter', '/bookmarks?collectionId=nope'],
      ['empty q', '/bookmarks?q='],
      ['unknown param', '/bookmarks?name=x'],
      ['bad limit', '/bookmarks?limit=0'],
    ])('%s', async (_label, path) => {
      expectProblem(await a.get(path), 400, 'validation_failed');
    });
  });

  describe('filters and pagination', () => {
    it('collectionId=<own> and collectionId=none', async () => {
      const col = await collectionOf(a);
      await bookmarkOf(a, { title: 'in col', collectionId: col.id });
      await bookmarkOf(a, { title: 'loose' });

      expect((await a.get(`/bookmarks?collectionId=${col.id}`).expect(200)).body.data.map((x: { title: string }) => x.title)).toEqual(['in col']);
      expect((await a.get('/bookmarks?collectionId=none').expect(200)).body.data.map((x: { title: string }) => x.title)).toEqual(['loose']);
    });

    it('q is case-insensitive on title only, % is literal, combinable with collectionId', async () => {
      const col = await collectionOf(a);
      await bookmarkOf(a, { title: 'Postgres tips', collectionId: col.id });
      await bookmarkOf(a, { title: 'postgres elsewhere' });
      await bookmarkOf(a, { title: 'Other', notes: 'postgres in notes only' });
      await bookmarkOf(a, { title: '50% off' });

      expect((await a.get('/bookmarks?q=POSTGRES').expect(200)).body.data).toHaveLength(2);
      expect((await a.get(`/bookmarks?q=postgres&collectionId=${col.id}`).expect(200)).body.data.map((x: { title: string }) => x.title)).toEqual(['Postgres tips']);
      expect((await a.get('/bookmarks?q=%25').expect(200)).body.data.map((x: { title: string }) => x.title)).toEqual(['50% off']);
    });

    it('paginates newest first across pages with a filter applied', async () => {
      for (const n of ['1', '2', '3']) await bookmarkOf(a, { title: `keep ${n}` });
      await bookmarkOf(a, { title: 'skip' });

      const p1 = await a.get('/bookmarks?q=keep&limit=2').expect(200);
      const p2 = await a.get(`/bookmarks?q=keep&limit=2&cursor=${p1.body.nextCursor}`).expect(200);
      expect([...p1.body.data, ...p2.body.data].map((x: { title: string }) => x.title)).toEqual(['keep 3', 'keep 2', 'keep 1']);
      expect(p2.body.nextCursor).toBeNull();
    });
  });
});
