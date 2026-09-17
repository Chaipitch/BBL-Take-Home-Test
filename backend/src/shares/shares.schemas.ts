import { z } from 'zod';
import { paginationShape } from '../common/pagination.js';

/** Compared trimmed + lower-cased, matching how profiles are stored (ADR-011f). */
export const createShareSchema = z.strictObject({
  email: z.string().trim().toLowerCase().max(320).pipe(z.email()),
});
export type CreateShareBody = z.output<typeof createShareSchema>;

export const listSharesQuerySchema = z.strictObject({ ...paginationShape });
export type ListSharesQuery = z.output<typeof listSharesQuerySchema>;
