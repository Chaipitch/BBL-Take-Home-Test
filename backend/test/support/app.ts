// Builds the full AppModule the way main.ts does (configureApp included). Faked: signing keys (local
// JWKS) and Auth0 /userinfo. Guard, verifier, provisioner, filter, pipes, services, Prisma, Postgres
// are real.
import type { INestApplication, ModuleMetadata } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { AUTH_CONFIG } from '../../src/auth/auth.config.js';
import { JWKS_KEY_SOURCE } from '../../src/auth/token-verifier.js';
import { UserInfoClient, type UserInfoResult } from '../../src/auth/userinfo.client.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTestSigner, type TestSigner } from './tokens.js';

/** /userinfo stand-in: returns a verified profile derived from the token's sub. */
export class FakeUserInfo {
  calls: string[] = [];
  async fetch(token: string): Promise<UserInfoResult> {
    this.calls.push(token);
    const { sub } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { sub: string };
    return { kind: 'ok', claims: { sub, email: `${sub.split('|')[1]}@test.com`, email_verified: true, name: sub } };
  }
}

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  signer: TestSigner;
  http: () => ReturnType<typeof request>;
  /** Authenticated request helpers for a given Auth0 sub. */
  as: (sub: string) => Promise<AuthedClient>;
  close: () => Promise<void>;
}

export type AuthedClient = Record<'get' | 'post' | 'put' | 'patch' | 'delete', (path: string) => request.Test> & {
  /** The DB user id for this sub (provisioned on first call to `as`). */
  userId: string;
};

/**
 * Starts the app once on 127.0.0.1 and returns its base URL. Never pass `app.getHttpServer()` to
 * supertest: it then listens on a random port on `::` per request, and on macOS another local app
 * bound to 127.0.0.1 on the same port receives the request (observed: random 401/404/parse errors in
 * 4–5 of 20 runs; 0 of 20 after this change).
 */
export async function listenOnLoopback(app: INestApplication): Promise<string> {
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as { port: number };
  return `http://127.0.0.1:${port}`;
}

export async function createTestApp(extra: Pick<ModuleMetadata, 'imports'> = {}): Promise<TestApp> {
  const signer = await createTestSigner();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule, ...(extra.imports ?? [])] })
    .overrideProvider(AUTH_CONFIG)
    .useValue((await import('./tokens.js')).testAuthConfig)
    .overrideProvider(JWKS_KEY_SOURCE)
    .useValue(signer.keySource)
    .overrideProvider(UserInfoClient)
    .useValue(new FakeUserInfo())
    .compile();
  moduleRef.useLogger(false);
  const app = moduleRef.createNestApplication();
  configureApp(app);
  const baseUrl = await listenOnLoopback(app);
  const prisma = app.get(PrismaService);
  const http = () => request(baseUrl);

  const as = async (sub: string): Promise<AuthedClient> => {
    const token = await signer.sign({ sub });
    const me = await http().get('/me').set('Authorization', `Bearer ${token}`).expect(200);
    const withAuth = (method: 'get' | 'post' | 'put' | 'patch' | 'delete') => (path: string) =>
      http()[method](path).set('Authorization', `Bearer ${token}`);
    return {
      userId: me.body.id as string,
      get: withAuth('get'),
      post: withAuth('post'),
      put: withAuth('put'),
      patch: withAuth('patch'),
      delete: withAuth('delete'),
    };
  };

  return { app, prisma, signer, http, as, close: () => app.close() };
}
