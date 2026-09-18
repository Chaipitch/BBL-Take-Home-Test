import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { Page, SharedBookmark, SharedCollection } from './types'
import { useApi } from './useApi'

export const sharedKeys = {
  all: ['shared'] as const,
  list: () => [...sharedKeys.all, 'list'] as const,
  detail: (id: string) => [...sharedKeys.all, 'detail', id] as const,
  bookmarks: (id: string, q?: string) => [...sharedKeys.all, 'bookmarks', id, q ?? ''] as const,
}

/** Collections other people shared with me (read-only, ADR-006d). */
export function useSharedCollections() {
  const api = useApi()
  return useInfiniteQuery({
    queryKey: sharedKeys.list(),
    queryFn: ({ pageParam }) => api<Page<SharedCollection>>('GET', '/shared/collections', { query: { cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}

export function useSharedCollection(id: string) {
  const api = useApi()
  return useQuery({ queryKey: sharedKeys.detail(id), queryFn: () => api<SharedCollection>('GET', `/shared/collections/${id}`) })
}

export function useSharedBookmarks(id: string, q?: string) {
  const api = useApi()
  return useInfiniteQuery({
    queryKey: sharedKeys.bookmarks(id, q),
    queryFn: ({ pageParam }) => api<Page<SharedBookmark>>('GET', `/shared/collections/${id}/bookmarks`, { query: { cursor: pageParam, q } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}
