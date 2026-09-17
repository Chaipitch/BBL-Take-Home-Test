import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { ValidationFailedException } from '../common/errors.js';
import { containsText } from '../common/filters.js';
import { afterCursor, orderNewestFirst, toPage, type Page } from '../common/pagination.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { bookmarkSelect, type BookmarkDto } from './bookmark.select.js';
import type { BookmarkBody, BookmarkPatch, ListBookmarksQuery } from './bookmarks.schemas.js';

const COLLECTION_FK = 'Bookmark_collectionId_ownerId_fkey';

const collectionNotFound = () => new ValidationFailedException([{ field: 'collectionId', message: 'collection not found' }]);

function isPrismaError(err: unknown, code: string): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;
}

/** P2003 on the composite (collectionId, ownerId) FK only — other FK violations are not the client's collectionId. */
export function isCollectionFkViolation(err: unknown): boolean {
  if (!isPrismaError(err, 'P2003')) return false;
  const constraint = (err.meta as { driverAdapterError?: { cause?: { constraint?: { index?: string } } } } | undefined)
    ?.driverAdapterError?.cause?.constraint?.index;
  return constraint === COLLECTION_FK;
}

/**
 * Every method takes the caller's ownerId and every query filters by it (ADR-013b). Single-row reads
 * and writes use `where: { id, ownerId }` (ADR-014b): not found and not yours → null / P2025 → 404.
 */
@Injectable()
export class BookmarksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: string, query: ListBookmarksQuery): Promise<Page<BookmarkDto>> {
    const rows = await this.prisma.bookmark.findMany({
      where: {
        ownerId,
        // A collectionId that isn't the caller's simply matches nothing → same empty page (ADR-012i).
        ...(query.collectionId !== undefined && { collectionId: query.collectionId === 'none' ? null : query.collectionId }),
        ...(query.q !== undefined && { title: containsText(query.q) }),
        ...afterCursor(query.cursor),
      },
      orderBy: orderNewestFirst,
      take: query.limit + 1,
      select: bookmarkSelect,
    });
    return toPage(rows, query.limit);
  }

  async create(ownerId: string, body: BookmarkBody): Promise<BookmarkDto> {
    await this.assertOwnCollection(ownerId, body.collectionId);
    return this.writing(() =>
      this.prisma.bookmark.create({
        data: { ownerId, url: body.url, title: body.title, notes: body.notes ?? null, collectionId: body.collectionId ?? null },
        select: bookmarkSelect,
      }),
    );
  }

  async get(ownerId: string, id: string): Promise<BookmarkDto> {
    const bookmark = await this.prisma.bookmark.findUnique({ where: { id, ownerId }, select: bookmarkSelect });
    if (!bookmark) throw new NotFoundException();
    return bookmark;
  }

  /** PUT: full replacement; omitted notes/collectionId become null (ADR-012f). */
  async replace(ownerId: string, id: string, body: BookmarkBody): Promise<BookmarkDto> {
    await this.assertOwnCollection(ownerId, body.collectionId);
    return this.writing(() =>
      this.prisma.bookmark.update({
        where: { id, ownerId },
        data: { url: body.url, title: body.title, notes: body.notes ?? null, collectionId: body.collectionId ?? null },
        select: bookmarkSelect,
      }),
    );
  }

  /** PATCH: only provided fields change; null clears notes/collectionId (ADR-012f). */
  async patch(ownerId: string, id: string, body: BookmarkPatch): Promise<BookmarkDto> {
    await this.assertOwnCollection(ownerId, body.collectionId);
    return this.writing(() => this.prisma.bookmark.update({ where: { id, ownerId }, data: body, select: bookmarkSelect }));
  }

  async delete(ownerId: string, id: string): Promise<void> {
    await this.writing(() => this.prisma.bookmark.delete({ where: { id, ownerId } }));
  }

  /** ADR-005a / 014c app check. Same 400 for "doesn't exist" and "someone else's". */
  private async assertOwnCollection(ownerId: string, collectionId: string | null | undefined): Promise<void> {
    if (collectionId === undefined || collectionId === null) return;
    const collection = await this.prisma.collection.findUnique({ where: { id_ownerId: { id: collectionId, ownerId } }, select: { id: true } });
    if (!collection) throw collectionNotFound();
  }

  /** Maps Prisma write errors: record not found/not yours → 404; collection FK race (014c) → 400. */
  private async writing<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw new NotFoundException();
      if (isCollectionFkViolation(err)) throw collectionNotFound();
      throw err;
    }
  }
}
