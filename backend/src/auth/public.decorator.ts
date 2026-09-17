import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'auth:isPublic';

/**
 * Opts a route out of the global auth guard (ADR-010b). No route uses this today;
 * any use must be listed in API_DESIGN.md.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);
