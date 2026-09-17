/**
 * Case-insensitive "contains" filter that matches the user's text literally.
 * Prisma passes `contains` values into a LIKE/ILIKE pattern WITHOUT escaping, so `%` and `_` act as
 * wildcards (found by e2e test: `?name=%` matched every row). Postgres' default LIKE escape
 * character is backslash, so escape backslash first, then the wildcards.
 */
export function containsText(value: string) {
  return { contains: value.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' as const };
}
