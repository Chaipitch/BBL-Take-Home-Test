// Runs the real AuthModule (guard + TokenVerifier + jose) over HTTP. Only the key source and
// config are swapped: tokens are signed with a locally generated RSA key published through a local
// JWKS, so every check below goes through the same verification code as production.
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  createLocalJWKSet,
  errors,
  exportJWK,
  exportSPKI,
  generateKeyPair,
  importJWK,
  SignJWT,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { AUTH_CONFIG, type AuthConfig } from './auth.config.js';
import { AuthModule } from './auth.module.js';
import { CurrentUser } from './current-user.decorator.js';
import { Public } from './public.decorator.js';
import { JWKS_KEY_SOURCE, type Principal } from './token-verifier.js';

const ISSUER = 'https://issuer.test/';
const AUDIENCE = 'https://api.test';
const CLIENT_ID = 'spa-client-id';
const KID = 'test-key-1';

@Controller()
class ProbeController {
  @Get('private')
  whoami(@CurrentUser() user: Principal) {
    return user;
  }

  @Public()
  @Get('open')
  open() {
    return { ok: true };
  }
}

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const nowSeconds = () => Math.floor(Date.now() / 1000);

describe('AuthGuard (real verifier, local test keys)', () => {
  let app: INestApplication;
  let privateKey: CryptoKey;
  let publicKeyPem: string;
  let keySource: JWTVerifyGetKey;

  // Default claims mirror the real Auth0 access token observed in BBL-9 (aud is an array).
  // Overrides are merged into the payload object last. Do NOT use SignJWT's setIssuer/setAudience/
  // setExpirationTime here: they run after the constructor and silently overwrite the overrides,
  // which made negative tests pass tokens that were actually valid (caught on first run).
  const sign = (
    claims: JWTPayload = {},
    header: { alg?: string; kid?: string } = {},
    key: CryptoKey = privateKey,
  ) =>
    new SignJWT({
      iss: ISSUER,
      aud: [AUDIENCE, `${ISSUER}userinfo`],
      sub: 'auth0|user-a',
      iat: nowSeconds(),
      exp: nowSeconds() + 7200,
      scope: 'openid profile email',
      ...claims,
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: KID, ...header })
      .sign(key);

  const get = (path: string, token?: string) => {
    const req = request(app.getHttpServer()).get(path);
    return token === undefined ? req : req.set('Authorization', `Bearer ${token}`);
  };

  async function startApp(source: JWTVerifyGetKey) {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [ProbeController],
    })
      .overrideProvider(AUTH_CONFIG)
      .useValue({ issuer: ISSUER, audience: AUDIENCE, jwksUri: new URL('https://unused.test/jwks') } satisfies AuthConfig)
      .overrideProvider(JWKS_KEY_SOURCE)
      .useValue(source)
      .compile();
    moduleRef.useLogger(false);
    const nest = moduleRef.createNestApplication();
    await nest.init();
    return nest;
  }

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    privateKey = pair.privateKey;
    publicKeyPem = await exportSPKI(pair.publicKey);
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' };
    keySource = createLocalJWKSet({ keys: [jwk] });
    app = await startApp(keySource);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('accepts', () => {
    it('a valid access token whose aud array contains the API audience', async () => {
      const res = await get('/private', await sign()).expect(200);
      expect(res.body).toEqual({ sub: 'auth0|user-a', scope: ['openid', 'profile', 'email'] });
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
