/**
 * Case-insensitive "contains" filter that matches the user's text literally.
 * Prisma passes `contains` values into a LIKE/ILIKE pattern WITHOUT escaping, so `%` and `_` act as
 * wildcards (found by e2e test: `?name=%` matched every row). Postgres' default LIKE escape
 * character is backslash, so escape backslash first, then the wildcards.
 */
export function containsText(value: string) {
  return { contains: escapeLike(value), mode: 'insensitive' as const };
}

/** Escapes LIKE/ILIKE wildcards so user text matches literally (backslash is the escape character). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
