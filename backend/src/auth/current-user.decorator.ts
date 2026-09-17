import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './user-provisioner.js';

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/** Injects `{ id, sub }` set by AuthGuard. Use `id` as ownerId; never take identity from the request body. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
  if (!user) {
    // Only reachable if used on a @Public() route — a programming error, never a client error.
    throw new Error('CurrentUser used on a route without an authenticated user');
  }
  return user;
});
