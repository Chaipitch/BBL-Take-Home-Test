// User provisioning, /userinfo sync and GET /me (ADR-007, ADR-009, ADR-011) through the full
// AppModule against the real test database. Faked: signing keys (local JWKS) and the /userinfo
// HTTP client. Everything else — guard, verifier, provisioner, Prisma, Postgres — is real.
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AUTH_CONFIG } from '../src/auth/auth.config.js';
import { JWKS_KEY_SOURCE } from '../src/auth/token-verifier.js';
import { PROFILE_MAX_AGE_MS } from '../src/auth/user-provisioner.js';
import { UserInfoClient, type UserInfoResult } from '../src/auth/userinfo.client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDatabase } from './support/db.js';
import { createTestSigner, testAuthConfig, type TestSigner } from './support/tokens.js';

class FakeUserInfo {
  calls: string[] = [];
  delayMs = 0;
  respond: (token: string) => UserInfoResult = () => ({ kind: 'unavailable', reason: 'not configured' });

  async fetch(token: string): Promise<UserInfoResult> {
    this.calls.push(token);
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    return this.respond(token);
  }
}

const SUB_A = 'auth0|user-a';
const SUB_B = 'auth0|user-b';

describe('User provisioning and GET /me (e2e, real database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let signer: TestSigner;
  let userInfo: FakeUserInfo;

  const tokenFor = (sub: string) => signer.sign({ sub });
  const me = async (sub: string) =>
    request(app.getHttpServer()).get('/me').set('Authorization', `Bearer ${await tokenFor(sub)}`);
  const profileOk = (sub: string, extra: Record<string, unknown> = {}): UserInfoResult => ({
    kind: 'ok',
    claims: { sub, email: `${sub.split('|')[1]}@test.com`, email_verified: true, name: sub, ...extra },
  });
  const rowFor = (sub: string) => prisma.user.findUnique({ where: { auth0Sub: sub } });

  beforeAll(async () => {
    signer = await createTestSigner();
    userInfo = new FakeUserInfo();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_CONFIG)
      .useValue(testAuthConfig)
      .overrideProvider(JWKS_KEY_SOURCE)
      .useValue(signer.keySource)
      .overrideProvider(UserInfoClient)
      .useValue(userInfo)
      .compile();
    moduleRef.useLogger(false);
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    userInfo.calls = [];
    userInfo.delayMs = 0;
    userInfo.respond = (token) => profileOk(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('first sign-in', () => {
    it('creates the user, syncs the profile once, and GET /me returns it', async () => {
      userInfo.respond = () => profileOk(SUB_A, { email: '  User-A@Test.COM ', picture: 'https://pic', nickname: 'nick' });

      const res = await me(SUB_A);

      expect(res.status).toBe(200);
      const row = await rowFor(SUB_A);
      expect(res.body).toEqual({ id: row!.id, email: 'user-a@test.com', emailVerified: true, name: SUB_A });
      expect(Object.keys(res.body).sort()).toEqual(['email', 'emailVerified', 'id', 'name']);
      expect(row!.profileSyncedAt).toBeInstanceOf(Date);
      // Found in a real-login check: sync time was 13 ms before createdAt.
      expect(row!.profileSyncedAt!.getTime()).toBeGreaterThanOrEqual(row!.createdAt.getTime());
      expect(userInfo.calls).toHaveLength(1);
    });

    it('parallel first requests for the same user create exactly one row', async () => {
      userInfo.delayMs = 50; // widen the race window: all requests pass findUnique before any upsert
      const responses = await Promise.all(Array.from({ length: 10 }, () => me(SUB_A)));

      expect(responses.map((r) => r.status)).toEqual(Array(10).fill(200));
      expect(await prisma.user.count({ where: { auth0Sub: SUB_A } })).toBe(1);
      expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
    });

    it('parallel first requests while /userinfo is down also create exactly one row', async () => {
      userInfo.delayMs = 50;
      userInfo.respond = () => ({ kind: 'unavailable', reason: 'timeout' });
      const responses = await Promise.all(Array.from({ length: 10 }, () => me(SUB_A)));

      expect(responses.map((r) => r.status)).toEqual(Array(10).fill(200));
      expect(await prisma.user.count({ where: { auth0Sub: SUB_A } })).toBe(1);
    });
  });

  describe('24 h refresh rule (ADR-009)', () => {
    it('does not call /userinfo again within 24 h', async () => {
      await me(SUB_A);
      await me(SUB_A);
      await me(SUB_A);
      expect(userInfo.calls).toHaveLength(1);
    });

    it('refreshes after 24 h and stores the new values', async () => {
      await me(SUB_A);
      await prisma.user.update({
        where: { auth0Sub: SUB_A },
        data: { profileSyncedAt: new Date(Date.now() - PROFILE_MAX_AGE_MS - 60_000) },
      });
      userInfo.respond = () => profileOk(SUB_A, { email: 'changed@test.com', email_verified: false, name: 'New Name' });

      const res = await me(SUB_A);

      expect(userInfo.calls).toHaveLength(2);
      expect(res.body).toMatchObject({ email: 'changed@test.com', emailVerified: false, name: 'New Name' });
      expect(Date.now() - (await rowFor(SUB_A))!.profileSyncedAt!.getTime()).toBeLessThan(10_000);
    });

    it('does not refresh just before 24 h', async () => {
      await me(SUB_A);
      await prisma.user.update({
        where: { auth0Sub: SUB_A },
        data: { profileSyncedAt: new Date(Date.now() - PROFILE_MAX_AGE_MS + 60_000) },
      });
      await me(SUB_A);
      expect(userInfo.calls).toHaveLength(1);
    });
  });

  describe('/userinfo failures (ADR-011e)', () => {
    it('first sign-in with /userinfo down: user created without profile, retried on next request', async () => {
      userInfo.respond = () => ({ kind: 'unavailable', reason: 'timeout' });

      const first = await me(SUB_A);
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ email: null, emailVerified: false, name: null });
      expect((await rowFor(SUB_A))!.profileSyncedAt).toBeNull();

      userInfo.respond = () => profileOk(SUB_A);
      const second = await me(SUB_A);
      expect(userInfo.calls).toHaveLength(2);
      expect(second.body).toMatchObject({ id: first.body.id, email: 'user-a@test.com', emailVerified: true });
    });

    it('stale refresh with /userinfo down: keeps stored profile and sync time, retries next request', async () => {
      await me(SUB_A);
      const staleAt = new Date(Date.now() - PROFILE_MAX_AGE_MS - 60_000);
      await prisma.user.update({ where: { auth0Sub: SUB_A }, data: { profileSyncedAt: staleAt } });
      userInfo.respond = () => ({ kind: 'unavailable', reason: 'http_503' });

      const res = await me(SUB_A);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ email: 'user-a@test.com', emailVerified: true });
      expect((await rowFor(SUB_A))!.profileSyncedAt).toEqual(staleAt);
      await me(SUB_A);
      expect(userInfo.calls).toHaveLength(3);
    });

    it('/userinfo 401 on first sign-in: 401 invalid_token and no user created', async () => {
      userInfo.respond = () => ({ kind: 'unauthorized' });

      const res = await me(SUB_A);

      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
      expect(await prisma.user.count()).toBe(0);
    });

    it('/userinfo 401 on refresh: 401 and stored profile untouched', async () => {
      await me(SUB_A);
      const staleAt = new Date(Date.now() - PROFILE_MAX_AGE_MS - 60_000);
      await prisma.user.update({ where: { auth0Sub: SUB_A }, data: { profileSyncedAt: staleAt } });
      userInfo.respond = () => ({ kind: 'unauthorized' });

      expect((await me(SUB_A)).status).toBe(401);
      expect(await rowFor(SUB_A)).toMatchObject({ email: 'user-a@test.com', profileSyncedAt: staleAt });
    });

    it('/userinfo returns a different sub: 401, nothing stored under either user', async () => {
      userInfo.respond = () => profileOk(SUB_B, { email: 'victim@test.com' });

      const res = await me(SUB_A);

      expect(res.status).toBe(401);
      expect(await prisma.user.count()).toBe(0);
    });
  });

  describe('identity', () => {
    it('GET /me without a token → 401 and no user created', async () => {
      await request(app.getHttpServer()).get('/me').expect(401);
      expect(await prisma.user.count()).toBe(0);
    });

    it('two users get different ids and each /me returns only their own profile', async () => {
      const a = await me(SUB_A);
      const b = await me(SUB_B);

      expect(a.body.id).not.toBe(b.body.id);
      expect(a.body.email).toBe('user-a@test.com');
      expect(b.body.email).toBe('user-b@test.com');
      expect((await me(SUB_A)).body).toEqual(a.body);
    });

    it('email_verified missing → stored as not verified', async () => {
      userInfo.respond = () => ({ kind: 'ok', claims: { sub: SUB_A, email: 'a@test.com' } });
      expect((await me(SUB_A)).body).toMatchObject({ email: 'a@test.com', emailVerified: false });
    });
  });
});
