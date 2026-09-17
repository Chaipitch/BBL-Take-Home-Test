import { z } from 'zod';
import { paginationShape } from '../common/pagination.js';

// API_DESIGN §4–§5, ADR-014d. Strict objects: unknown or server-owned keys → 400.

/**
 * http/https only. Plain `z.url()` accepts `javascript:`, `data:` and `file:` URLs, which become
 * stored XSS when the UI renders the link (ADR-014 fact 1). localhost, IPs and IDN hosts are allowed.
 */
const url = z.url({ protocol: /^https?$/ }).max(2048);
const title = z.string().trim().min(1).max(500);
/** Empty after trimming is stored as null (ADR-012e). */
const notes = z
  .string()
  .trim()
  .max(10_000)
  .transform((value) => (value === '' ? null : value))
  .nullable();
const collectionId = z.uuid().nullable();

/** POST and PUT: omitted notes/collectionId mean null (ADR-012f). */
export const bookmarkBodySchema = z.strictObject({
  url,
  title,
  notes: notes.optional(),
  collectionId: collectionId.optional(),
});
export type BookmarkBody = z.output<typeof bookmarkBodySchema>;

export const bookmarkPatchSchema = z
  .strictObject({ url: url.optional(), title: title.optional(), notes: notes.optional(), collectionId: collectionId.optional() })
  .refine((body) => Object.keys(body).length > 0, { message: 'must contain at least one field' });
export type BookmarkPatch = z.output<typeof bookmarkPatchSchema>;

export const listBookmarksQuerySchema = z.strictObject({
  ...paginationShape,
  /** A UUID, or `none` for uncategorised. */
  collectionId: z.union([z.literal('none'), z.uuid()]).optional(),
  q: z.string().trim().min(1).max(500).optional(),
});
export type ListBookmarksQuery = z.output<typeof listBookmarksQuerySchema>;
