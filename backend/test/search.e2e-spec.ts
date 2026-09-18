// Full-text search over title + notes (bonus, ADR-020c). This is the only raw SQL query in the app,
// so the cross-user and injection cases matter more here than anywhere else.
import { randomUUID } from 'node:crypto';
import { createTestApp, type AuthedClient, type TestApp } from './support/app.js';
import { resetDatabase } from './support/db.js';

describe('GET /bookmarks?search= (e2e, real database)', () => {
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

  const add = (client: AuthedClient, body: Record<string, unknown>) =>
    client.post('/bookmarks').send({ url: 'https://example.com', title: 'Untitled', ...body }).expect(201);
  const titles = async (query: string, client: AuthedClient = a) =>
    (await client.get(`/bookmarks?${query}`).expect(200)).body.data.map((x: { title: string }) => x.title);

  it('searches notes as well as titles, and stems words', async () => {
    await add(a, { title: 'Postgres internals', notes: 'indexes and planning' });
    await add(a, { title: 'Nest docs', notes: 'guards, pipes and interceptors' });
    await add(a, { title: 'Unrelated', notes: null });

    expect(await titles('search=interceptor')).toEqual(['Nest docs']);        // notes, stemmed
    expect(await titles('search=indexing')).toEqual(['Postgres internals']);  // notes, stemmed
    expect(await titles('search=postgres')).toEqual(['Postgres internals']);  // title
    expect(await titles('search=nothinghere')).toEqual([]);
  });

  it('supports quoted phrases and -exclusions (websearch syntax)', async () => {
    await add(a, { title: 'Query planning in Postgres', notes: 'execution plans' });
    await add(a, { title: 'Planning a party', notes: 'not about databases' });

    expect(await titles('search=' + encodeURIComponent('"query planning"'))).toEqual(['Query planning in Postgres']);
    expect(await titles('search=' + encodeURIComponent('planning -party'))).toEqual(['Query planning in Postgres']);
  });

  it('never returns another user’s bookmarks, even when they match', async () => {
    await add(b, { title: 'B secret', notes: 'postgres tuning' });
    await add(a, { title: 'A postgres note', notes: null });

    expect(await titles('search=postgres')).toEqual(['A postgres note']);
    expect(await titles('search=secret')).toEqual([]);
    expect(await titles('search=postgres', b)).toEqual(['B secret']);
  });

  it('combines with collectionId and q', async () => {
    const collection = (await a.post('/collections').send({ name: 'Work' }).expect(201)).body;
    await add(a, { title: 'Postgres at work', notes: 'tuning', collectionId: collection.id });
    await add(a, { title: 'Postgres at home', notes: 'tuning' });

    expect(await titles(`search=tuning&collectionId=${collection.id}`)).toEqual(['Postgres at work']);
    expect(await titles('search=tuning&collectionId=none')).toEqual(['Postgres at home']);
    expect(await titles('search=tuning&q=home')).toEqual(['Postgres at home']);
    expect(await titles(`search=tuning&collectionId=${randomUUID()}`)).toEqual([]);
  });

  it('paginates newest first, like every other list', async () => {
    for (const n of ['1', '2', '3']) await add(a, { title: `Postgres ${n}`, notes: 'tuning' });

    const first = await a.get('/bookmarks?search=tuning&limit=2').expect(200);
    expect(first.body.data.map((x: { title: string }) => x.title)).toEqual(['Postgres 3', 'Postgres 2']);

    const second = await a.get(`/bookmarks?search=tuning&limit=2&cursor=${first.body.nextCursor}`).expect(200);
    expect(second.body.data.map((x: { title: string }) => x.title)).toEqual(['Postgres 1']);
    expect(second.body.nextCursor).toBeNull();
  });

  it.each([
    ["' OR 1=1 --", 'quote and comment'],
    ["'; DROP TABLE \"Bookmark\"; --", 'statement terminator'],
    ['% _ \\', 'like wildcards'],
    ['& | ! ( ) : *', 'tsquery operators'],
    ['🙂 ünïcode', 'unicode'],
  ])('handles hostile input safely: %s (%s)', async (input) => {
    await add(a, { title: 'Still here', notes: 'postgres' });

    const res = await a.get(`/bookmarks?search=${encodeURIComponent(input)}`);

    expect(res.status).toBe(200);
    expect(await t.prisma.bookmark.count()).toBe(1);
  });

  it('rejects an empty or oversized search, and unknown parameters', async () => {
    for (const query of ['search=', `search=${'x'.repeat(501)}`, 'search=postgres&sort=rank']) {
      const res = await a.get(`/bookmarks?${query}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('validation_failed');
    }
  });

  // Claim: the GIN index from the migration is *usable* by this query. With a handful of test rows
  // Postgres rightly prefers a sequential scan, so seqscan is disabled to force the choice; if the
  // index were missing, the plan would still show a sequential scan and this test would fail.
  it('the search query can use the full-text index', async () => {
    await add(a, { title: 'Postgres internals', notes: 'indexes' });
    await t.prisma.$executeRawUnsafe('SET enable_seqscan = off');
    const plan = await t.prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
      `EXPLAIN SELECT id FROM "Bookmark" b WHERE to_tsvector('english', coalesce(b."title", '') || ' ' || coalesce(b."notes", '')) @@ websearch_to_tsquery('english', 'postgres')`,
    );
    await t.prisma.$executeRawUnsafe('SET enable_seqscan = on');

    const text = plan.map((row) => row['QUERY PLAN']).join('\n');
    expect(text).toContain('Bookmark_search_idx');
    expect(text).not.toMatch(/Seq Scan/);
  });
});
