import { Injectable, NotFoundException } from '@nestjs/common';
import { bookmarkSelect, type BookmarkDto } from '../bookmarks/bookmark.select.js';
import { Prisma } from '../generated/prisma/client.js';
import { CollectionNotEmptyException } from '../common/errors.js';
import { containsText } from '../common/filters.js';
import { afterCursor, orderNewestFirst, toPage, type Page } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CollectionBody,
  CollectionPatch,
  ListCollectionBookmarksQuery,
  ListCollectionsQuery,
} from './collections.schemas.js';

// ADR-013h: responses are exactly the contract fields; new columns can't leak.
const collectionSelect = { id: true, name: true, ownerId: true, createdAt: true, updatedAt: true } satisfies Prisma.CollectionSelect;

export type CollectionDto = Prisma.CollectionGetPayload<{ select: typeof collectionSelect }>;

const isRecordNotFound = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';

/**
 * Every method takes the caller's ownerId and every query filters by it (ADR-013b). Single-row reads
 * and writes use the compound unique `id_ownerId`, so "doesn't exist" and "not yours" are the same
 * Prisma result and become the same 404 (ADR-013c).
 */
@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: string, query: ListCollectionsQuery): Promise<Page<CollectionDto>> {
    const rows = await this.prisma.collection.findMany({
      where: {
        ownerId,
        ...(query.name !== undefined && { name: containsText(query.name) }),
        ...afterCursor(query.cursor),
      },
      orderBy: orderNewestFirst,
      take: query.limit + 1,
      select: collectionSelect,
    });
    return toPage(rows, query.limit);
  }

  create(ownerId: string, body: CollectionBody): Promise<CollectionDto> {
    return this.prisma.collection.create({ data: { name: body.name, ownerId }, select: collectionSelect });
  }

  async get(ownerId: string, id: string): Promise<CollectionDto> {
    const collection = await this.prisma.collection.findUnique({ where: { id_ownerId: { id, ownerId } }, select: collectionSelect });
    if (!collection) throw new NotFoundException();
    return collection;
  }

  /** PUT and PATCH both land here; the schemas decide which fields are required. */
  async update(ownerId: string, id: string, data: CollectionBody | CollectionPatch): Promise<CollectionDto> {
    try {
      return await this.prisma.collection.update({ where: { id_ownerId: { id, ownerId } }, data, select: collectionSelect });
    } catch (err) {
      if (isRecordNotFound(err)) throw new NotFoundException();
      throw err;
    }
  }

  /**
   * ADR-005/005b/013d: find → count → delete (cascade removes bookmarks and shares). Accepted race:
   * a bookmark inserted between the count and the delete is deleted too, even without confirm.
   */
  async delete(ownerId: string, id: string, confirm: boolean): Promise<void> {
    await this.get(ownerId, id);
    const bookmarkCount = await this.prisma.bookmark.count({ where: { collectionId: id, ownerId } });
    if (bookmarkCount > 0 && !confirm) throw new CollectionNotEmptyException(bookmarkCount);
    try {
      await this.prisma.collection.delete({ where: { id_ownerId: { id, ownerId } } });
    } catch (err) {
      if (isRecordNotFound(err)) throw new NotFoundException();
      throw err;
    }
  }

  async listBookmarks(ownerId: string, id: string, query: ListCollectionBookmarksQuery): Promise<Page<BookmarkDto>> {
    await this.get(ownerId, id);
    const rows = await this.prisma.bookmark.findMany({
      where: {
        ownerId,
        collectionId: id,
        ...(query.q !== undefined && { title: containsText(query.q) }),
        ...afterCursor(query.cursor),
      },
      orderBy: orderNewestFirst,
      take: query.limit + 1,
      select: bookmarkSelect,
    });
    return toPage(rows, query.limit);
  }
}
