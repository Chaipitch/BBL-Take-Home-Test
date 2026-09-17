import { Inject, Injectable } from '@nestjs/common';
import { jwtVerify, type JWTVerifyGetKey } from 'jose';
import { AUTH_CONFIG, type AuthConfig } from './auth.config.js';

export const JWKS_KEY_SOURCE = Symbol('JWKS_KEY_SOURCE');

/** The only identity the guard hands to the rest of the app (ADR-010f). */
export interface Principal {
  sub: string;
  scope: string[];
}

/** The token itself is not acceptable. Maps to 401. */
export class InvalidTokenError extends Error {
  constructor(readonly reason: string) {
    super(`invalid token: ${reason}`);
  }
}

/** We could not check the token (signing keys unavailable). Maps to 503 (ADR-010e). */
export class KeySourceUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(`key source unavailable: ${reason}`);
  }
}

// jose error codes that mean "this token is bad". Classified by explicit code, not by
// `instanceof JOSEError`: jose also throws a generic JOSEError (ERR_JOSE_GENERIC) when the JWKS
// endpoint returns non-200 or bad JSON, and that is an outage on our side, not a bad token.
const INVALID_TOKEN_CODES = new Set([
  'ERR_JWS_INVALID',
  'ERR_JWT_INVALID',
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JOSE_ALG_NOT_ALLOWED',
  'ERR_JOSE_NOT_SUPPORTED',
  'ERR_JWT_EXPIRED',
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JWKS_NO_MATCHING_KEY',
  'ERR_JWKS_MULTIPLE_MATCHING_KEYS',
]);

// Failures fetching or reading the JWKS: timeout, non-200 / unparseable response, malformed key set.
const KEY_SOURCE_CODES = new Set(['ERR_JWKS_TIMEOUT', 'ERR_JOSE_GENERIC', 'ERR_JWKS_INVALID']);

@Injectable()
export class TokenVerifier {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(JWKS_KEY_SOURCE) private readonly keySource: JWTVerifyGetKey,
  ) {}

  async verify(token: string): Promise<Principal> {
    let payload;
    try {
      ({ payload } = await jwtVerify(token, this.keySource, {
        algorithms: ['RS256'], // ADR-010c-2: never trust the header's alg
        issuer: this.config.issuer, // exact match
        audience: this.config.audience, // passes if the aud array contains it; rejects ID tokens
        clockTolerance: 5, // seconds, ADR-010c-6
        requiredClaims: ['sub', 'exp'], // jose does not require exp unless asked
      }));
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      if (typeof code === 'string' && INVALID_TOKEN_CODES.has(code)) {
        throw new InvalidTokenError(code);
      }
      if (typeof code === 'string' && KEY_SOURCE_CODES.has(code)) {
        throw new KeySourceUnavailableError(code);
      }
      // fetch() rejects with a TypeError on network failure (DNS, refused connection).
      if (err instanceof TypeError) {
        throw new KeySourceUnavailableError('network');
      }
      throw err; // unknown failure: not swallowed; surfaces as 500, request still denied
    }

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new InvalidTokenError('sub not a non-empty string');
    }
    const scope = typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : [];
    return { sub: payload.sub, scope };
  }
}
