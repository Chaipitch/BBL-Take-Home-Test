import type { Bookmark, Collection, Page } from '../api/types'

const now = '2026-09-17T10:00:00.000Z'
export const OWNER = '11111111-1111-4111-8111-111111111111'

export const collection = (id: string, name: string): Collection => ({ id, name, ownerId: OWNER, createdAt: now, updatedAt: now })

export const bookmark = (id: string, title: string, extra: Partial<Bookmark> = {}): Bookmark => ({
  id,
  title,
  url: 'https://example.com/' + id,
  notes: null,
  collectionId: null,
  ownerId: OWNER,
  createdAt: now,
  updatedAt: now,
  ...extra,
})

export const page = <T,>(data: T[], nextCursor: string | null = null): Page<T> => ({ data, nextCursor })

export const me = { id: OWNER, email: 'candidate@test.com', emailVerified: true, name: 'Candy' }

export const problem = (status: number, code: string, extra: Record<string, unknown> = {}) => ({
  type: 'about:blank',
  title: 'Error',
  status,
  code,
  detail: 'detail from api',
  ...extra,
})
