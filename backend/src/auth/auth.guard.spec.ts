// Runs the real AuthModule (guard + TokenVerifier + jose) over HTTP. Only the key source, config and
// UserProvisioner are swapped: tokens are signed with a locally generated RSA key published through a
// local JWKS, so every check below goes through the same verification code as production.
// The provisioner is faked here (no database); its real behaviour is covered in test/users.e2e-spec.ts.
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createLocalJWKSet, errors, exportJWK, generateKeyPair, importJWK, SignJWT, type JWTVerifyGetKey } from 'jose';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import {
  createTestSigner,
  nowSeconds,
  TEST_AUDIENCE as AUDIENCE,
  TEST_CLIENT_ID as CLIENT_ID,
  TEST_ISSUER as ISSUER,
  TEST_KID as KID,
  testAuthConfig,
  type TestSigner,
} from '../../test/support/tokens.js';
import { AUTH_CONFIG } from './auth.config.js';
import { AuthModule } from './auth.module.js';
import { CurrentUser } from './current-user.decorator.js';
import { Public } from './public.decorator.js';
import { InvalidTokenError, JWKS_KEY_SOURCE } from './token-verifier.js';
import { UserProvisioner, type AuthenticatedUser } from './user-provisioner.js';

@Controller()
class ProbeController {
  @Get('private')
  whoami(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Public()
  @Get('open')
  open() {
    return { ok: true };
  }
}

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

type Resolve = (sub: string, token: string) => Promise<AuthenticatedUser>;
const fakeResolve: Resolve = async (sub) => ({ id: `db-id-for-${sub}`, sub });

describe('AuthGuard (real verifier, local test keys)', () => {
  let app: INestApplication;
  let signer: TestSigner;
  let privateKey: CryptoKey;
  let publicKeyPem: string;
  const sign: TestSigner['sign'] = (...args) => signer.sign(...args);

  const get = (path: string, token?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return token === undefined ? req : req.set('Authorization', `Bearer ${token}`);
  };

  async function startApp(source: JWTVerifyGetKey, resolve: Resolve = fakeResolve) {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [ProbeController],
    })
      .overrideProvider(AUTH_CONFIG)
      .useValue(testAuthConfig)
      .overrideProvider(JWKS_KEY_SOURCE)
      .useValue(source)
      .overrideProvider(UserProvisioner)
      .useValue({ resolve })
      .compile();
    moduleRef.useLogger(false);
    const nest = moduleRef.createNestApplication();
    await nest.init();
    return nest;
  }

  beforeAll(async () => {
    signer = await createTestSigner();
    privateKey = signer.privateKey;
    publicKeyPem = signer.publicKeyPem;
    app = await startApp(signer.keySource);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('accepts', () => {
    it('a valid access token whose aud array contains the API audience', async () => {
      const res = await get('/private', await sign()).expect(200);
      expect(res.body).toEqual({ id: 'db-id-for-auth0|user-a', sub: 'auth0|user-a' });
    });

    it('aud as a plain string equal to the API audience', async () => {
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: 'RS256', kid: KID })
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setSubject('auth0|user-a')
        .setExpirationTime('1h')
        .sign(privateKey);
      await get('/private', token).expect(200);
    });

    it('a lowercase "bearer" scheme (scheme is case-insensitive)', async () => {
      await request(app.getHttpServer())
        .get('/private')
        .set('Authorization', `bearer ${await sign()}`)
        .expect(200);
    });

    it('a token expired less than the 5 s clock tolerance ago', async () => {
      await get('/private', await sign({ exp: nowSeconds() - 2 })).expect(200);
    });

    it('a @Public() route without any token', async () => {
      await get('/open').expect(200);
    });
  });

  describe('rejects with 401 and no hint about why', () => {
    const expectGeneric401 = (res: request.Response, wwwAuthenticate: string) => {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Unauthorized', statusCode: 401 });
      expect(res.headers['www-authenticate']).toBe(wwwAuthenticate);
    };

    it('no Authorization header', async () => {
      expectGeneric401(await get('/private'), 'Bearer');
    });

    it('a non-Bearer scheme', async () => {
      const res = await request(app.getHttpServer()).get('/private').set('Authorization', 'Basic dXNlcjpwYXNz');
      expectGeneric401(res, 'Bearer');
    });

    it('a token passed only in the query string', async () => {
      const res = await request(app.getHttpServer()).get('/private').query({ access_token: await sign() });
      expectGeneric401(res, 'Bearer');
    });

    it('a token that is not a JWT', async () => {
      expectGeneric401(await get('/private', 'not-a-jwt'), 'Bearer error="invalid_token"');
    });

    it('alg "none" (unsigned token)', async () => {
      const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ iss: ISSUER, aud: AUDIENCE, sub: 'x', exp: nowSeconds() + 600 })}.`;
      expectGeneric401(await get('/private', token), 'Bearer error="invalid_token"');
    });

    it('HS256 key-confusion: HMAC-signed with the RSA public key as the secret', async () => {
      const header = b64({ alg: 'HS256', typ: 'JWT', kid: KID });
      const payload = b64({ iss: ISSUER, aud: AUDIENCE, sub: 'auth0|attacker', exp: nowSeconds() + 600 });
      const signature = createHmac('sha256', publicKeyPem).update(`${header}.${payload}`).digest('base64url');
      expectGeneric401(await get('/private', `${header}.${payload}.${signature}`), 'Bearer error="invalid_token"');
    });

    it('a signature from a different RSA key using a known kid', async () => {
      const attacker = await generateKeyPair('RS256');
      expectGeneric401(await get('/private', await sign({}, {}, attacker.privateKey)), 'Bearer error="invalid_token"');
    });

    it('a tampered payload (valid signature over different claims)', async () => {
      const [h, , s] = (await sign()).split('.');
      const forged = `${h}.${b64({ iss: ISSUER, aud: AUDIENCE, sub: 'auth0|user-b', exp: nowSeconds() + 600 })}.${s}`;
      expectGeneric401(await get('/private', forged), 'Bearer error="invalid_token"');
    });

    it('an unknown kid', async () => {
      expectGeneric401(await get('/private', await sign({}, { kid: 'rotated-away' })), 'Bearer error="invalid_token"');
    });

    it('the wrong issuer', async () => {
      expectGeneric401(await get('/private', await sign({ iss: 'https://evil.test/' })), 'Bearer error="invalid_token"');
    });

    it('an issuer differing only by the trailing slash', async () => {
      expectGeneric401(await get('/private', await sign({ iss: ISSUER.slice(0, -1) })), 'Bearer error="invalid_token"');
    });

    it('an ID token (aud is the SPA client id, not the API)', async () => {
      const idToken = await sign({ aud: CLIENT_ID, email: 'a@test.com', email_verified: true });
      expectGeneric401(await get('/private', idToken), 'Bearer error="invalid_token"');
    });

    it('a token expired beyond the clock tolerance', async () => {
      expectGeneric401(await get('/private', await sign({ exp: nowSeconds() - 60 })), 'Bearer error="invalid_token"');
    });

    it('a token not yet valid (nbf in the future)', async () => {
      expectGeneric401(await get('/private', await sign({ nbf: nowSeconds() + 60 })), 'Bearer error="invalid_token"');
    });

    it('a token without exp', async () => {
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: 'RS256', kid: KID })
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setSubject('auth0|user-a')
        .sign(privateKey);
      expectGeneric401(await get('/private', token), 'Bearer error="invalid_token"');
    });

    it('a token without sub', async () => {
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: 'RS256', kid: KID })
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setExpirationTime('1h')
        .sign(privateKey);
      expectGeneric401(await get('/private', token), 'Bearer error="invalid_token"');
    });
  });

  describe('algorithm pin (ADR-010c-2)', () => {
    // jose on its own already refuses alg "none" and won't match an HS256 header to an RSA key, so
    // the tests above still pass with the RS256 pin removed (found by mutation testing). The pin is
    // what matters when a JWKS key doesn't declare "alg": the tenant advertises PS256, and a PS256
    // signature made with the genuine RSA key would otherwise verify.
    it('rejects PS256 signed with the genuine key when the JWKS key has no alg', async () => {
      // One RSA key, imported once per algorithm: WebCrypto binds a CryptoKey to a single algorithm.
      const pair = await generateKeyPair('RS256', { extractable: true });
      const privateJwk = await exportJWK(pair.privateKey);
      const jwkWithoutAlg = { ...(await exportJWK(pair.publicKey)), kid: 'no-alg-key', use: 'sig' };
      const noAlgApp = await startApp(createLocalJWKSet({ keys: [jwkWithoutAlg] }));
      try {
        const ps256 = await sign({}, { alg: 'PS256', kid: 'no-alg-key' }, (await importJWK(privateJwk, 'PS256')) as CryptoKey);
        const rs256 = await sign({}, { alg: 'RS256', kid: 'no-alg-key' }, (await importJWK(privateJwk, 'RS256')) as CryptoKey);
        await request(noAlgApp.getHttpServer()).get('/private').set('Authorization', `Bearer ${rs256}`).expect(200);
        await request(noAlgApp.getHttpServer()).get('/private').set('Authorization', `Bearer ${ps256}`).expect(401);
      } finally {
        await noAlgApp.close();
      }
    });
  });

  describe('user resolution after verification (ADR-011a)', () => {
    it('passes the verified sub and the raw token to the provisioner', async () => {
      const calls: Array<[string, string]> = [];
      const token = await sign({ sub: 'auth0|someone' });
      const spyApp = await startApp(signer.keySource, async (sub, raw) => {
        calls.push([sub, raw]);
        return { id: 'x', sub };
      });
      try {
        await request(spyApp.getHttpServer()).get('/private').set('Authorization', `Bearer ${token}`).expect(200);
        expect(calls).toEqual([['auth0|someone', token]]);
      } finally {
        await spyApp.close();
      }
    });

    it('does not call the provisioner when the token is invalid', async () => {
      let called = false;
      const spyApp = await startApp(signer.keySource, async (sub) => {
        called = true;
        return { id: 'x', sub };
      });
      try {
        await request(spyApp.getHttpServer()).get('/private').set('Authorization', `Bearer ${await sign({ aud: CLIENT_ID })}`).expect(401);
        expect(called).toBe(false);
      } finally {
        await spyApp.close();
      }
    });

    it('provisioner InvalidTokenError (e.g. /userinfo 401) → generic 401 invalid_token', async () => {
      const rejecting = await startApp(signer.keySource, async () => {
        throw new InvalidTokenError('userinfo_unauthorized');
      });
      try {
        const res = await request(rejecting.getHttpServer()).get('/private').set('Authorization', `Bearer ${await sign()}`);
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ message: 'Unauthorized', statusCode: 401 });
        expect(res.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
      } finally {
        await rejecting.close();
      }
    });

    it('unexpected provisioner failure (e.g. database down) → 500, request denied', async () => {
      const broken = await startApp(signer.keySource, async () => {
        throw new Error('connection refused');
      });
      try {
        await request(broken.getHttpServer()).get('/private').set('Authorization', `Bearer ${await sign()}`).expect(500);
      } finally {
        await broken.close();
      }
    });
  });

  describe('signing keys unavailable → 503, not 401', () => {
    const failingSource = (error: Error): JWTVerifyGetKey => async () => {
      throw error;
    };

    it.each([
      ['JWKS fetch timeout', new errors.JWKSTimeout()],
      ['JWKS endpoint non-200 / bad JSON (generic JOSEError)', new errors.JOSEError('Expected 200 OK')],
      ['malformed JWKS', new errors.JWKSInvalid()],
      ['network failure (fetch TypeError)', new TypeError('fetch failed')],
    ])('%s', async (_label, error) => {
      const outageApp = await startApp(failingSource(error));
      try {
        const res = await request(outageApp.getHttpServer())
          .get('/private')
          .set('Authorization', `Bearer ${await sign()}`);
        expect(res.status).toBe(503);
        expect(res.headers['www-authenticate']).toBeUndefined();
      } finally {
        await outageApp.close();
      }
    });
  });
});
