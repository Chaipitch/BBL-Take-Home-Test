import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/user-provisioner.js';
import { IdParam } from '../common/id-param.decorator.js';
import type { Page } from '../common/pagination.js';
import { ValidQuery } from '../common/validation.js';
import {
  listSharedBookmarksQuerySchema,
  listSharedCollectionsQuerySchema,
  type ListSharedBookmarksQuery,
  type ListSharedCollectionsQuery,
} from './shared.schemas.js';
import { SharedService, type SharedBookmarkDto, type SharedCollectionDto } from './shared.service.js';

/** Recipient read-only access (ADR-006d). GET only — enforced by test/api-guardrails.e2e-spec.ts. */
@Controller('shared/collections')
export class SharedController {
  constructor(private readonly shared: SharedService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @ValidQuery(listSharedCollectionsQuerySchema) query: ListSharedCollectionsQuery): Promise<Page<SharedCollectionDto>> {
    return this.shared.list(user.id, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @IdParam() id: string): Promise<SharedCollectionDto> {
    return this.shared.get(user.id, id);
  }

  @Get(':id/bookmarks')
  listBookmarks(
    @CurrentUser() user: AuthenticatedUser,
    @IdParam() id: string,
    @ValidQuery(listSharedBookmarksQuerySchema) query: ListSharedBookmarksQuery,
  ): Promise<Page<SharedBookmarkDto>> {
    return this.shared.listBookmarks(user.id, id, query);
  }
}
