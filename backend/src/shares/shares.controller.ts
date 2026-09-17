import { Controller, Delete, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/user-provisioner.js';
import { IdParam } from '../common/id-param.decorator.js';
import type { Page } from '../common/pagination.js';
import { ValidBody, ValidQuery } from '../common/validation.js';
import { createShareSchema, listSharesQuerySchema, type CreateShareBody, type ListSharesQuery } from './shares.schemas.js';
import { SharesService, type ShareDto } from './shares.service.js';

/** Owner manages who a collection is shared with (ADR-015a). */
@Controller('collections/:id/shares')
export class SharesController {
  constructor(private readonly shares: SharesService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @IdParam() collectionId: string,
    @ValidBody(createShareSchema) body: CreateShareBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ShareDto> {
    const share = await this.shares.create(user.id, collectionId, body);
    res.location(`/collections/${collectionId}/shares/${share.id}`);
    return share;
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @IdParam() collectionId: string, @ValidQuery(listSharesQuerySchema) query: ListSharesQuery): Promise<Page<ShareDto>> {
    return this.shares.list(user.id, collectionId, query);
  }

  @Delete(':shareId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@CurrentUser() user: AuthenticatedUser, @IdParam() collectionId: string, @IdParam('shareId') shareId: string): Promise<void> {
    return this.shares.revoke(user.id, collectionId, shareId);
  }
}
