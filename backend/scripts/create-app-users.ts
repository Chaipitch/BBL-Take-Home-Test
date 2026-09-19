// Creates app users directly in the database: instant, unlimited, verified emails, usable as share
// recipients and as owners of test data. They cannot log in (their Auth0 identities are invented) —
// for real logins use scripts/create-auth0-user.mjs.
//
//   npx tsx scripts/create-app-users.ts --count 3
//   npx tsx scripts/create-app-users.ts --count 2 --with-data --share-to candidate@test.com
//   npx tsx scripts/create-app-users.ts --prefix demo --domain example.org --count 5
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

export interface CreateUsersOptions {
  count?: number;
  /** Used for the Auth0 `sub` and the email local part, e.g. `local|test-1`, `test-1@example.com`. */
  prefix?: string;
  domain?: string;
  /** Give each user a collection with two bookmarks and one uncategorised bookmark. */
  withData?: boolean;
  /** Share each new user's collection with this (existing, verified) email. Implies withData. */
  shareTo?: string;
}

export interface CreatedUser {
  id: string;
  auth0Sub: string;
  email: string;
  collectionId?: string;
  sharedWith?: string;
}

type Db = Pick<PrismaClient, 'user' | 'collection' | 'bookmark' | 'collectionShare'>;

/** Idempotent per `auth0Sub`: re-running with the same prefix updates instead of duplicating. */
export async function createAppUsers(db: Db, options: CreateUsersOptions = {}): Promise<CreatedUser[]> {
  const { count = 1, prefix = 'local', domain = 'example.com', shareTo } = options;
  const withData = options.withData || shareTo !== undefined;

  let recipientId: string | undefined;
  if (shareTo) {
    const recipient = await db.user.findFirst({ where: { email: shareTo.trim().toLowerCase(), emailVerified: true }, select: { id: true } });
    if (!recipient) throw new Error(`--share-to: no user with a verified email ${shareTo}. Create or verify them first.`);
    recipientId = recipient.id;
  }

  const created: CreatedUser[] = [];
  for (let n = 1; n <= count; n++) {
    const auth0Sub = `${prefix}|user-${n}`;
    const email = `${prefix}-${n}@${domain}`;
    const now = new Date();
    const user = await db.user.upsert({
      where: { auth0Sub },
      create: { auth0Sub, email, emailVerified: true, name: `${prefix} user ${n}`, profileSyncedAt: now, createdAt: now },
      update: { email, emailVerified: true },
      select: { id: true },
    });
    const entry: CreatedUser = { id: user.id, auth0Sub, email };

    if (withData) {
      const collection = await db.collection.create({ data: { name: `${prefix} collection ${n}`, ownerId: user.id }, select: { id: true } });
      await db.bookmark.createMany({
        data: [
          { ownerId: user.id, collectionId: collection.id, url: 'https://www.postgresql.org/docs/', title: `Postgres manual (${prefix} ${n})`, notes: 'created by create-app-users' },
          { ownerId: user.id, collectionId: collection.id, url: 'https://docs.nestjs.com', title: `Nest docs (${prefix} ${n})`, notes: null },
          { ownerId: user.id, collectionId: null, url: 'https://react.dev', title: `React docs (${prefix} ${n})`, notes: null },
        ],
      });
      entry.collectionId = collection.id;

      if (recipientId) {
        await db.collectionShare.upsert({
          where: { collectionId_granteeUserId: { collectionId: collection.id, granteeUserId: recipientId } },
          create: { collectionId: collection.id, granteeUserId: recipientId },
          update: {},
        });
        entry.sharedWith = shareTo;
      }
    }
    created.push(entry);
  }
  return created;
}

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const options: CreateUsersOptions = {
    count: Number(arg('count', '1')),
    prefix: arg('prefix', 'local'),
    domain: arg('domain', 'example.com'),
    withData: process.argv.includes('--with-data'),
    shareTo: arg('share-to'),
  };
  createAppUsers(prisma, options)
    .then((users) => {
      for (const user of users) {
        console.log(`${user.email}  (${user.auth0Sub})${user.collectionId ? `  collection ${user.collectionId}` : ''}${user.sharedWith ? `  shared with ${user.sharedWith}` : ''}`);
      }
      console.log(`\n${users.length} app user(s) ready. They cannot log in; for real logins use scripts/create-auth0-user.mjs.`);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
