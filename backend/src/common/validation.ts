import { Body, Query, StandardSchemaValidationPipe } from '@nestjs/common';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { ValidationFailedException, type FieldError } from './errors.js';

/**
 * Guardrail (ADR-013f): Nest's StandardSchemaValidationPipe silently skips any parameter without a
 * schema, so a bare @Body() / @Query() would accept anything. Controllers must use these instead;
 * test/api-guardrails.e2e-spec.ts fails if a bare one appears.
 */
export const ValidBody = (schema: StandardSchemaV1) => Body({ schema });
export const ValidQuery = (schema: StandardSchemaV1) => Query({ schema });

type Issue = StandardSchemaV1.Issue & { keys?: unknown };

function pathOf(issue: Issue): string {
  const parts = (issue.path ?? []).map((p) => String(typeof p === 'object' && p !== null && 'key' in p ? p.key : p));
  return parts.length > 0 ? parts.join('.') : '(root)';
}

/** Maps schema issues to API field errors. Unknown keys become one "is not allowed" error each. */
export function toFieldErrors(issues: readonly Issue[]): FieldError[] {
  return issues.flatMap((issue) =>
    Array.isArray(issue.keys)
      ? issue.keys.map((key) => ({ field: String(key), message: 'is not allowed' }))
      : [{ field: pathOf(issue), message: issue.message }],
  );
}

export const createValidationPipe = () =>
  new StandardSchemaValidationPipe({ exceptionFactory: (issues) => new ValidationFailedException(toFieldErrors(issues)) });
