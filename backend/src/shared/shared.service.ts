import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { containsText } from '../common/filters.js';
import { afterCursor, orderNewestFirst, toPage, type Page } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ListSharedBookmarksQuery, ListSharedCollectionsQuery } from './shared.schemas.js';

/** Recipient views (ADR-015b): no ownerId, no other users' ids, no other recipients. */
export interface SharedCollectionDto {
  id: string;
  name: string;
  ownerEmail: string | null;
  sharedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const sharedBookmarkSelect = {
  id: true,
  url: true,
  title: true,
  notes: true,
  collectionId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BookmarkSelect;
export type SharedBookmarkDto = Prisma.BookmarkGetPayload<{ select: typeof sharedBookmarkSelect }>;

/**
 * THE ONLY place where `CollectionShare` grants read access (ADR-006d, ADR-015d). Every query is
 * restricted to collections with a share whose grantee is the caller. Read-only: no write methods.
 */
const sharedWith = (userId: string) => ({ shares: { some: { granteeUserId: userId } } }) satisfies Prisma.CollectionWhereInput;

@Injectable()
export class SharedService {
  constructor(private readonly prisma: PrismaService) {}

  private collectionSelect(userId: string) {
    return {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: { email: true } },
      shares: { where: { granteeUserId: userId }, select: { createdAt: true }, take: 1 },
    } satisfies Prisma.CollectionSelect;
  }

  private toDto(row: Prisma.CollectionGetPayload<{ select: ReturnType<SharedService['collectionSelect']> }>): SharedCollectionDto {
    return {
      id: row.id,
      name: row.name,
      ownerEmail: row.owner.email,
      sharedAt: row.shares[0].createdAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async list(userId: string, query: ListSharedCollectionsQuery): Promise<Page<SharedCollectionDto>> {
    const rows = await this.prisma.collection.findMany({
      where: { ...sharedWith(userId), ...afterCursor(query.cursor) },
      orderBy: orderNewestFirst,
      take: query.limit + 1,
      select: this.collectionSelect(userId),
    });
    const page = toPage(rows, query.limit);
    return { data: page.data.map((row) => this.toDto(row)), nextCursor: page.nextCursor };
  }

  async get(userId: string, id: string): Promise<SharedCollectionDto> {
    const row = await this.prisma.collection.findFirst({ where: { id, ...sharedWith(userId) }, select: this.collectionSelect(userId) });
    if (!row) throw new NotFoundException();
    return this.toDto(row);
  }

  async listBookmarks(userId: string, id: string, query: ListSharedBookmarksQuery): Promise<Page<SharedBookmarkDto>> {
    await this.get(userId, id);
    const rows = await this.prisma.bookmark.findMany({
      where: {
        collectionId: id,
        collection: sharedWith(userId),
        ...(query.q !== undefined && { title: containsText(query.q) }),
        ...afterCursor(query.cursor),
      },
      orderBy: orderNewestFirst,
      take: query.limit + 1,
      select: sharedBookmarkSelect,
    });
    return toPage(rows, query.limit);
  }
}
