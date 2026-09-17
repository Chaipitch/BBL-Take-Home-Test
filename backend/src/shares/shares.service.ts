import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  AlreadySharedException,
  AmbiguousRecipientException,
  RecipientNotFoundException,
  ValidationFailedException,
} from '../common/errors.js';
import { afterCursor, orderNewestFirst, toPage, type Page } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateShareBody, ListSharesQuery } from './shares.schemas.js';

/** Owner view of a share (ADR-015b). No recipient user id. */
export interface ShareDto {
  id: string;
  collectionId: string;
  email: string | null;
  createdAt: Date;
}

const shareSelect = { id: true, collectionId: true, createdAt: true, grantee: { select: { email: true } } } satisfies Prisma.CollectionShareSelect;
const toDto = (row: Prisma.CollectionShareGetPayload<{ select: typeof shareSelect }>): ShareDto => ({
  id: row.id,
  collectionId: row.collectionId,
  email: row.grantee.email,
  createdAt: row.createdAt,
});

/**
 * Owner-side share management (ADR-006, ADR-015). Every method first proves the collection belongs
 * to the caller (404 otherwise), exactly like the collection routes. Grants access to nobody by
 * itself — recipient reads live only in SharedService.
 */
@Injectable()
export class SharesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, collectionId: string, body: CreateShareBody): Promise<ShareDto> {
    await this.assertOwnCollection(ownerId, collectionId);

    const candidates = await this.prisma.user.findMany({
      where: { email: body.email, emailVerified: true },
      select: { id: true },
      take: 2,
    });
    if (candidates.length === 0) throw new RecipientNotFoundException();
    if (candidates.length > 1) throw new AmbiguousRecipientException();
    const [recipient] = candidates;
    if (recipient.id === ownerId) {
      throw new ValidationFailedException([{ field: 'email', message: 'cannot share a collection with yourself' }]);
    }

    try {
      const share = await this.prisma.collectionShare.create({
        data: { collectionId, granteeUserId: recipient.id },
        select: shareSelect,
      });
      return toDto(share);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new AlreadySharedException();
      // Collection deleted between the ownership check and the insert.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') throw new NotFoundException();
      throw err;
    }
  }

  async list(ownerId: string, collectionId: string, query: ListSharesQuery): Promise<Page<ShareDto>> {
    await this.assertOwnCollection(ownerId, collectionId);
    const rows = await this.prisma.collectionShare.findMany({
      where: { collectionId, collection: { ownerId }, ...afterCursor(query.cursor) },
      orderBy: orderNewestFirst,
      take: query.limit + 1,
      select: shareSelect,
    });
    const page = toPage(rows, query.limit);
    return { data: page.data.map(toDto), nextCursor: page.nextCursor };
  }

  async revoke(ownerId: string, collectionId: string, shareId: string): Promise<void> {
    const { count } = await this.prisma.collectionShare.deleteMany({
      where: { id: shareId, collectionId, collection: { ownerId } },
    });
    if (count === 0) throw new NotFoundException();
  }

  private async assertOwnCollection(ownerId: string, collectionId: string): Promise<void> {
    const collection = await this.prisma.collection.findUnique({
      where: { id_ownerId: { id: collectionId, ownerId } },
      select: { id: true },
    });
    if (!collection) throw new NotFoundException();
  }
}
