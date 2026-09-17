import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/user-provisioner.js';
import { IdParam } from '../common/id-param.decorator.js';
import type { Page } from '../common/pagination.js';
import { ValidBody, ValidQuery } from '../common/validation.js';
import {
  collectionBodySchema,
  collectionPatchSchema,
  deleteCollectionQuerySchema,
  listCollectionBookmarksQuerySchema,
  listCollectionsQuerySchema,
  type CollectionBody,
  type CollectionPatch,
  type DeleteCollectionQuery,
  type ListCollectionBookmarksQuery,
  type ListCollectionsQuery,
} from './collections.schemas.js';
import type { BookmarkDto } from '../bookmarks/bookmark.select.js';
import { CollectionsService, type CollectionDto } from './collections.service.js';

/** HTTP only. Identity comes from @CurrentUser(); all queries live in CollectionsService. */
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @ValidQuery(listCollectionsQuerySchema) query: ListCollectionsQuery): Promise<Page<CollectionDto>> {
    return this.collections.list(user.id, query);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @ValidBody(collectionBodySchema) body: CollectionBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CollectionDto> {
    const collection = await this.collections.create(user.id, body);
    res.location(`/collections/${collection.id}`);
    return collection;
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @IdParam() id: string): Promise<CollectionDto> {
    return this.collections.get(user.id, id);
  }

  @Put(':id')
  replace(@CurrentUser() user: AuthenticatedUser, @IdParam() id: string, @ValidBody(collectionBodySchema) body: CollectionBody): Promise<CollectionDto> {
    return this.collections.update(user.id, id, body);
  }

  @Patch(':id')
  patch(@CurrentUser() user: AuthenticatedUser, @IdParam() id: string, @ValidBody(collectionPatchSchema) body: CollectionPatch): Promise<CollectionDto> {
    return this.collections.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @IdParam() id: string, @ValidQuery(deleteCollectionQuerySchema) query: DeleteCollectionQuery): Promise<void> {
    return this.collections.delete(user.id, id, query.confirm === 'true');
  }

  @Get(':id/bookmarks')
  listBookmarks(
    @CurrentUser() user: AuthenticatedUser,
    @IdParam() id: string,
    @ValidQuery(listCollectionBookmarksQuerySchema) query: ListCollectionBookmarksQuery,
  ): Promise<Page<BookmarkDto>> {
    return this.collections.listBookmarks(user.id, id, query);
  }
}
