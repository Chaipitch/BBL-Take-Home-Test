// Seed data (ADR-016): the brief requires data for at least two distinct users.
// Run: npx prisma db seed   (uses DATABASE_URL from backend/.env)
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/** The real Auth0 test user (sub observed in docs/auth0/TENANT_FINDINGS.md), so a real login sees data. */
export const CANDIDATE = { auth0Sub: 'auth0|62e089faea483987422db6cc', email: 'candidate@test.com', name: 'Candy' };
/** Seed-only users; they cannot log in. Recreated from scratch on every run. */
export const SEED_USERS = [
  { auth0Sub: 'seed|user-b', email: 'user-b@example.com', name: 'Seed User B' },
  { auth0Sub: 'seed|user-c', email: 'user-c@example.com', name: 'Seed User C' },
];

type Db = Pick<PrismaClient, 'user' | 'collection' | 'bookmark' | 'collectionShare' | '$transaction'>;

interface SeedCollection {
  name: string;
  bookmarks: Array<{ url: string; title: string; notes?: string }>;
}

async function addCollections(db: Db, ownerId: string, collections: SeedCollection[], loose: SeedCollection['bookmarks']) {
  const created: Array<{ id: string; name: string }> = [];
  for (const c of collections) {
    const collection = await db.collection.create({ data: { name: c.name, ownerId }, select: { id: true, name: true } });
    await db.bookmark.createMany({ data: c.bookmarks.map((b) => ({ ...b, notes: b.notes ?? null, ownerId, collectionId: collection.id })) });
    created.push(collection);
  }
  await db.bookmark.createMany({ data: loose.map((b) => ({ ...b, notes: b.notes ?? null, ownerId, collectionId: null })) });
  return created;
}

export interface SeedResult {
  candidateSeeded: boolean;
}

/**
 * Idempotent and non-destructive (ADR-016): seed-only users are deleted (cascade) and recreated;
 * the real test user gets seed data only if they have no collections yet, so manual data survives.
 */
export async function seed(db: Db): Promise<SeedResult> {
  const now = new Date();
  const verified = { emailVerified: true, profileSyncedAt: now };

  await db.user.deleteMany({ where: { auth0Sub: { in: SEED_USERS.map((u) => u.auth0Sub) } } });
  const [userB, userC] = await Promise.all(SEED_USERS.map((u) => db.user.create({ data: { ...u, ...verified, createdAt: now } })));
  // Upsert keeps the real user's id stable; the auth guard refreshes the profile from Auth0 anyway.
  const candidate = await db.user.upsert({
    where: { auth0Sub: CANDIDATE.auth0Sub },
    create: { ...CANDIDATE, ...verified, createdAt: now },
    update: { email: CANDIDATE.email },
  });

  const bCollections = await addCollections(
    db,
    userB.id,
    [
      { name: 'Team reading list', bookmarks: [
        { url: 'https://martinfowler.com/articles/microservices.html', title: 'Microservices', notes: 'Shared with candidate' },
        { url: 'https://12factor.net', title: 'The Twelve-Factor App' },
      ] },
      { name: 'B private', bookmarks: [{ url: 'https://example.com/b-private', title: 'Only B can see this' }] },
    ],
    [{ url: 'https://example.com/b-loose', title: 'B uncategorised' }],
  );
  await addCollections(
    db,
    userC.id,
    [{ name: 'C recipes', bookmarks: [{ url: 'https://example.com/c-recipe', title: 'Only C can see this' }] }],
    [],
  );

  let candidateSeeded = false;
  if ((await db.collection.count({ where: { ownerId: candidate.id } })) === 0) {
    await addCollections(
      db,
      candidate.id,
      [
        { name: 'Backend', bookmarks: [
          { url: 'https://docs.nestjs.com', title: 'NestJS documentation', notes: 'Guards, pipes, filters' },
          { url: 'https://www.prisma.io/docs', title: 'Prisma documentation' },
          { url: 'https://www.postgresql.org/docs/current/', title: 'PostgreSQL manual' },
        ] },
        { name: 'Security', bookmarks: [
          { url: 'https://datatracker.ietf.org/doc/html/rfc7636', title: 'RFC 7636: PKCE', notes: 'S256 only' },
          { url: 'https://owasp.org/www-project-top-ten/', title: 'OWASP Top 10' },
        ] },
        { name: 'Empty collection', bookmarks: [] },
      ],
      [{ url: 'https://react.dev', title: 'React documentation', notes: 'Uncategorised' }],
    );
    candidateSeeded = true;
  }

  // Candidate shares "Security" with user B. Re-created on every run: recreating user B above
  // cascades away shares granted to the old B row (found by the idempotency test).
  const security = await db.collection.findFirst({ where: { ownerId: candidate.id, name: 'Security' }, select: { id: true } });
  if (security) {
    await db.collectionShare.upsert({
      where: { collectionId_granteeUserId: { collectionId: security.id, granteeUserId: userB.id } },
      create: { collectionId: security.id, granteeUserId: userB.id },
      update: { granteeUserId: userB.id },
    });
  }

  // B shares a collection with the candidate, so the recipient view has data after a real login.
  await db.collectionShare.create({ data: { collectionId: bCollections[0].id, granteeUserId: candidate.id } });
  return { candidateSeeded };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  seed(prisma)
    .then((r) => console.log(`Seeded users: ${SEED_USERS.length + 1}. Candidate data ${r.candidateSeeded ? 'added' : 'kept (already had collections)'}.`))
    .finally(() => prisma.$disconnect());
}
