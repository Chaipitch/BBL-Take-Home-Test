import { STATUS_CODES } from 'node:http';
import { Catch, HttpException, HttpStatus, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { CollectionNotEmptyException, ValidationFailedException } from './errors.js';

export interface ProblemDetails {
  type: 'about:blank';
  title: string;
  status: number;
  detail: string;
  code: string;
  [extension: string]: unknown;
}

// Fixed detail text per status. Raw exception messages are never echoed: Nest's JSON parser errors
// contain parser internals, ParseUUIDPipe says "uuid is expected" (would distinguish a malformed id
// from a not-yours id), and 500s must not leak anything (ADR-013e).
const BY_STATUS: Record<number, { code: string; detail: string }> = {
  400: { code: 'validation_failed', detail: 'The request is malformed' },
  401: { code: 'unauthorized', detail: 'Authentication is required' },
  404: { code: 'not_found', detail: 'The requested resource was not found' },
  413: { code: 'payload_too_large', detail: 'The request body is too large' },
  500: { code: 'internal_error', detail: 'An unexpected error occurred' },
  503: { code: 'service_unavailable', detail: 'The service is temporarily unavailable' },
};

function problem(status: number, extensions: Record<string, unknown> = {}): ProblemDetails {
  const known = BY_STATUS[status] ?? { code: `http_${status}`, detail: STATUS_CODES[status] ?? 'Error' };
  return { type: 'about:blank', title: STATUS_CODES[status] ?? 'Error', status, ...known, ...extensions };
}

/** Status carried by non-Nest errors from Express middleware (e.g. body-parser's 413). */
function middlewareStatus(exception: unknown): number | undefined {
  const status = (exception as { status?: unknown; statusCode?: unknown })?.status ?? (exception as { statusCode?: unknown })?.statusCode;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toProblem(exception);
    response.status(body.status).type('application/problem+json').json(body);
  }

  private toProblem(exception: unknown): ProblemDetails {
    if (exception instanceof ValidationFailedException) {
      return problem(400, { detail: 'Request validation failed', errors: exception.errors });
    }
    if (exception instanceof CollectionNotEmptyException) {
      return problem(409, {
        code: 'collection_not_empty',
        detail: 'The collection has bookmarks; repeat with ?confirm=true to delete them too',
        bookmarkCount: exception.bookmarkCount,
      });
    }
    if (exception instanceof HttpException) {
      return problem(exception.getStatus());
    }
    const status = middlewareStatus(exception);
    if (status !== undefined) {
      return problem(status === HttpStatus.PAYLOAD_TOO_LARGE ? 413 : 400);
    }
    this.logger.error('Unhandled error', exception instanceof Error ? exception.stack : String(exception));
    return problem(500);
  }
}
