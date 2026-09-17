import { z } from 'zod';
import { paginationShape } from '../common/pagination.js';

export const listSharedCollectionsQuerySchema = z.strictObject({ ...paginationShape });
export type ListSharedCollectionsQuery = z.output<typeof listSharedCollectionsQuerySchema>;

export const listSharedBookmarksQuerySchema = z.strictObject({
  ...paginationShape,
  q: z.string().trim().min(1).max(500).optional(),
});
export type ListSharedBookmarksQuery = z.output<typeof listSharedBookmarksQuerySchema>;
