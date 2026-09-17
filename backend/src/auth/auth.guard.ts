import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import type { AuthenticatedRequest } from './current-user.decorator.js';
import { IS_PUBLIC } from './public.decorator.js';
import { InvalidTokenError, KeySourceUnavailableError, TokenVerifier } from './token-verifier.js';

// "Bearer" is case-insensitive (RFC 7235 auth-scheme); exactly one space, then a non-empty token.
const BEARER = /^Bearer ([^\s]+)$/i;

/**
 * Global guard (ADR-010b): every route requires a valid access token unless marked @Public().
 * Token is read from the Authorization header only (ADR-010c-1). All auth failures return the same
 * generic 401 body; the specific reason is logged, never the token (ADR-010e).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();

    const header = request.headers.authorization;
    const match = typeof header === 'string' ? BEARER.exec(header) : null;
    if (!match) {
      // RFC 6750 §3.1: no error code when the request carried no usable credentials.
      response.setHeader('WWW-Authenticate', 'Bearer');
      this.logger.warn(`auth rejected: ${header === undefined ? 'no authorization header' : 'not a bearer credential'}`);
      throw new UnauthorizedException();
    }

    try {
      request.principal = await this.verifier.verify(match[1]);
      return true;
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        response.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
        this.logger.warn(`auth rejected: ${err.reason}`);
        throw new UnauthorizedException();
      }
      if (err instanceof KeySourceUnavailableError) {
        this.logger.error(`cannot verify tokens, signing keys unavailable: ${err.reason}`);
        throw new ServiceUnavailableException();
      }
      throw err;
    }
  }
}
