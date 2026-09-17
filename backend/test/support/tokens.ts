// Test token factory: a locally generated RSA key published through a local JWKS. Tests override
// only AUTH_CONFIG and JWKS_KEY_SOURCE, so tokens go through the real AuthGuard + TokenVerifier.
import { createLocalJWKSet, exportJWK, exportSPKI, generateKeyPair, SignJWT, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import type { AuthConfig } from '../../src/auth/auth.config.js';

export const TEST_ISSUER = 'https://issuer.test/';
export const TEST_AUDIENCE = 'https://api.test';
export const TEST_CLIENT_ID = 'spa-client-id';
export const TEST_KID = 'test-key-1';

export const testAuthConfig: AuthConfig = {
  issuer: TEST_ISSUER,
  audience: TEST_AUDIENCE,
  jwksUri: new URL('https://unused.test/jwks'),
  userinfoUri: new URL('https://unused.test/userinfo'),
};

export const nowSeconds = () => Math.floor(Date.now() / 1000);

export interface TestSigner {
  privateKey: CryptoKey;
  publicKeyPem: string;
  keySource: JWTVerifyGetKey;
  /**
   * Signs a token shaped like the real Auth0 access token (BBL-9: aud is an array).
   * Overrides are merged into the payload object last. Do NOT switch to SignJWT's setIssuer /
   * setAudience / setExpirationTime: they run after the constructor and silently overwrite the
   * overrides, which once made negative tests send valid tokens (see ADR-010 implementation notes).
   */
  sign(claims?: JWTPayload, header?: { alg?: string; kid?: string }, key?: CryptoKey): Promise<string>;
}

export async function createTestSigner(): Promise<TestSigner> {
  const pair = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: TEST_KID, alg: 'RS256', use: 'sig' };
  return {
    privateKey: pair.privateKey,
    publicKeyPem: await exportSPKI(pair.publicKey),
    keySource: createLocalJWKSet({ keys: [jwk] }),
    sign: (claims = {}, header = {}, key = pair.privateKey) =>
      new SignJWT({
        iss: TEST_ISSUER,
        aud: [TEST_AUDIENCE, `${TEST_ISSUER}userinfo`],
        sub: 'auth0|user-a',
        iat: nowSeconds(),
        exp: nowSeconds() + 7200,
        scope: 'openid profile email',
        ...claims,
      })
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: TEST_KID, ...header })
        .sign(key),
  };
}
