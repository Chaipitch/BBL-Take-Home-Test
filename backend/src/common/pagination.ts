import { z } from 'zod';

// Keyset pagination (ADR-012h, ADR-013g). Order is always createdAt desc, id desc.

export interface CursorPosition {
  createdAt: Date;
  id: string;
}

const cursorPayload = z.strictObject({ c: z.iso.datetime(), i: z.uuid() });

export function encodeCursor(item: CursorPosition): string {
  return Buffer.from(JSON.stringify({ c: item.createdAt.toISOString(), i: item.id })).toString('base64url');
}

/** Opaque, unsigned: tampering can only move within the caller's own rows (queries stay owner-scoped). */
export const cursorSchema = z.string().transform((value, ctx): CursorPosition => {
  try {
    const parsed = cursorPayload.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    return { createdAt: new Date(parsed.c), id: parsed.i };
  } catch {
    ctx.addIssue({ code: 'custom', message: 'is not a valid cursor' });
    return z.NEVER;
  }
});

export const paginationShape = {
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: cursorSchema.optional(),
};

export const orderNewestFirst = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

/** Prisma `where` fragment for rows strictly after the cursor in newest-first order. */
export function afterCursor(cursor: CursorPosition | undefined) {
  return cursor
    ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }
    : {};
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

/** Call with rows fetched using `take: limit + 1`. */
export function toPage<T extends CursorPosition>(rows: T[], limit: number): Page<T> {
  const data = rows.slice(0, limit);
  return { data, nextCursor: rows.length > limit ? encodeCursor(data[data.length - 1]) : null };
}
