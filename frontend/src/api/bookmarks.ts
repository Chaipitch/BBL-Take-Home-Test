import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from './useApi'
import { collectionKeys } from './collections'
import type { Bookmark, BookmarkInput, Page } from './types'

/** `collectionId`: a collection id, `none` for uncategorised, or undefined for all. */
export interface BookmarkFilters {
  collectionId?: string
  q?: string
}

export const bookmarkKeys = {
  all: ['bookmarks'] as const,
  list: (filters: BookmarkFilters) => [...bookmarkKeys.all, 'list', filters.collectionId ?? '', filters.q ?? ''] as const,
  detail: (id: string) => [...bookmarkKeys.all, 'detail', id] as const,
}

export function useBookmarks(filters: BookmarkFilters) {
  const api = useApi()
  return useInfiniteQuery({
    queryKey: bookmarkKeys.list(filters),
    queryFn: ({ pageParam }) =>
      api<Page<Bookmark>>('GET', '/bookmarks', { query: { cursor: pageParam, collectionId: filters.collectionId, q: filters.q } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}

export function useBookmark(id: string) {
  const api = useApi()
  return useQuery({ queryKey: bookmarkKeys.detail(id), queryFn: () => api<Bookmark>('GET', `/bookmarks/${id}`) })
}

export function useSaveBookmark() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    // PUT replaces all editable fields (ADR-012f), so the form always sends the full input.
    mutationFn: ({ id, input }: { id?: string; input: BookmarkInput }) =>
      id ? api<Bookmark>('PUT', `/bookmarks/${id}`, { body: input }) : api<Bookmark>('POST', '/bookmarks', { body: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: bookmarkKeys.all })
      await queryClient.invalidateQueries({ queryKey: collectionKeys.all })
    },
  })
}

export function useDeleteBookmark() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/bookmarks/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: bookmarkKeys.all })
      await queryClient.invalidateQueries({ queryKey: collectionKeys.all })
    },
  })
}
