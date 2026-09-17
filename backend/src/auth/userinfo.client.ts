import { Inject, Injectable, Optional } from '@nestjs/common';
import { AUTH_CONFIG, type AuthConfig } from './auth.config.js';

export const USERINFO_TIMEOUT_MS = Symbol('USERINFO_TIMEOUT_MS');
const DEFAULT_TIMEOUT_MS = 3000; // ADR-011e: 3 s timeout, no backoff

export interface UserInfoClaims {
  sub: string;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
}

export type UserInfoResult =
  | { kind: 'ok'; claims: UserInfoClaims }
  /** Auth0 rejected the token (e.g. session revoked) even though its signature and claims were valid. */
  | { kind: 'unauthorized' }
  /** Could not get a usable answer: timeout, network, non-401 error status, or malformed body. */
  | { kind: 'unavailable'; reason: string };

/** Calls Auth0 /userinfo with the caller's access token. Never throws for HTTP/network outcomes. */
@Injectable()
export class UserInfoClient {
  private readonly timeoutMs: number;

  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Optional() @Inject(USERINFO_TIMEOUT_MS) timeoutMs?: number,
  ) {
    this.timeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async fetch(accessToken: string): Promise<UserInfoResult> {
    let response: Response;
    try {
      response = await fetch(this.config.userinfoUri, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: 'error',
      });
    } catch (err) {
      return { kind: 'unavailable', reason: (err as Error).name === 'TimeoutError' ? 'timeout' : 'network' };
    }

    if (response.status === 401) return { kind: 'unauthorized' };
    if (!response.ok) return { kind: 'unavailable', reason: `http_${response.status}` };

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { kind: 'unavailable', reason: 'invalid_json' };
    }
    if (typeof body !== 'object' || body === null || typeof (body as { sub?: unknown }).sub !== 'string') {
      return { kind: 'unavailable', reason: 'invalid_body' };
    }
    return { kind: 'ok', claims: body as UserInfoClaims };
  }
}
