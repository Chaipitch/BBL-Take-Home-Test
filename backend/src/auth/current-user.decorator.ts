import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Principal } from './token-verifier.js';

export interface AuthenticatedRequest extends Request {
  principal?: Principal;
}

/** Injects the verified principal set by AuthGuard. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): Principal => {
  const principal = ctx.switchToHttp().getRequest<AuthenticatedRequest>().principal;
  if (!principal) {
    // Only reachable if used on a @Public() route — a programming error, never a client error.
    throw new Error('CurrentUser used on a route without an authenticated principal');
  }
  return principal;
});
