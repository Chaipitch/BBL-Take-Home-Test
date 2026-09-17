import { z } from 'zod';
import { paginationShape } from '../common/pagination.js';

// API_DESIGN §4–§5. Strict objects: unknown or server-owned keys (id, ownerId, createdAt, updatedAt) → 400.

const name = z.string().trim().min(1).max(200);

export const collectionBodySchema = z.strictObject({ name });
export type CollectionBody = z.output<typeof collectionBodySchema>;

export const collectionPatchSchema = z
  .strictObject({ name: name.optional() })
  .refine((body) => Object.keys(body).length > 0, { message: 'must contain at least one field' });
export type CollectionPatch = z.output<typeof collectionPatchSchema>;

export const listCollectionsQuerySchema = z.strictObject({ ...paginationShape, name: name.optional() });
export type ListCollectionsQuery = z.output<typeof listCollectionsQuerySchema>;

export const deleteCollectionQuerySchema = z.strictObject({ confirm: z.literal('true').optional() });
export type DeleteCollectionQuery = z.output<typeof deleteCollectionQuerySchema>;

export const listCollectionBookmarksQuerySchema = z.strictObject({
  ...paginationShape,
  q: z.string().trim().min(1).max(500).optional(),
});
export type ListCollectionBookmarksQuery = z.output<typeof listCollectionBookmarksQuerySchema>;
