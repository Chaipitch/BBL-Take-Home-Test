import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/user-provisioner.js';
import { IdParam } from '../common/id-param.decorator.js';
import type { Page } from '../common/pagination.js';
import { ValidBody, ValidQuery } from '../common/validation.js';
import type { BookmarkDto } from './bookmark.select.js';
import {
  bookmarkBodySchema,
  bookmarkPatchSchema,
  listBookmarksQuerySchema,
  type BookmarkBody,
  type BookmarkPatch,
  type ListBookmarksQuery,
} from './bookmarks.schemas.js';
import { BookmarksService } from './bookmarks.service.js';

/** HTTP only. Identity comes from @CurrentUser(); all queries live in BookmarksService. */
@Controller('bookmarks')
export class BookmarksController {
  constructor(private readonly bookmarks: BookmarksService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @ValidQuery(listBookmarksQuerySchema) query: ListBookmarksQuery): Promise<Page<BookmarkDto>> {
    return this.bookmarks.list(user.id, query);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @ValidBody(bookmarkBodySchema) body: BookmarkBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<BookmarkDto> {
    const bookmark = await this.bookmarks.create(user.id, body);
    res.location(`/bookmarks/${bookmark.id}`);
    return bookmark;
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @IdParam() id: string): Promise<BookmarkDto> {
    return this.bookmarks.get(user.id, id);
  }

  @Put(':id')
  replace(@CurrentUser() user: AuthenticatedUser, @IdParam() id: string, @ValidBody(bookmarkBodySchema) body: BookmarkBody): Promise<BookmarkDto> {
    return this.bookmarks.replace(user.id, id, body);
  }

  @Patch(':id')
  patch(@CurrentUser() user: AuthenticatedUser, @IdParam() id: string, @ValidBody(bookmarkPatchSchema) body: BookmarkPatch): Promise<BookmarkDto> {
    return this.bookmarks.patch(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @IdParam() id: string): Promise<void> {
    return this.bookmarks.delete(user.id, id);
  }
}
