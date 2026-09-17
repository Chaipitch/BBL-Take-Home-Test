import type { Prisma } from '../generated/prisma/client.js';

/** Bookmark response = exactly the contract fields (API_DESIGN §3, ADR-013h). Shared by bookmarks and collections. */
export const bookmarkSelect = {
  id: true,
  url: true,
  title: true,
  notes: true,
  collectionId: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BookmarkSelect;

export type BookmarkDto = Prisma.BookmarkGetPayload<{ select: typeof bookmarkSelect }>;
