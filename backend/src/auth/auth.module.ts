import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { createRemoteJWKSet } from 'jose';
import { AUTH_CONFIG, loadAuthConfig, type AuthConfig } from './auth.config.js';
import { AuthGuard } from './auth.guard.js';
import { JWKS_KEY_SOURCE, TokenVerifier } from './token-verifier.js';

@Module({
  providers: [
    { provide: AUTH_CONFIG, useFactory: () => loadAuthConfig() },
    {
      provide: JWKS_KEY_SOURCE,
      // ADR-010d: jose defaults — 10 min cache, unknown-kid refetch at most every 30 s, 5 s timeout.
      useFactory: (config: AuthConfig) => createRemoteJWKSet(config.jwksUri),
      inject: [AUTH_CONFIG],
    },
    TokenVerifier,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
