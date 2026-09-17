import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from './useApi'
import type { ApiRequest } from './client'
import type { Bookmark, Collection, Page } from './types'

export const collectionKeys = {
  all: ['collections'] as const,
  list: () => [...collectionKeys.all, 'list'] as const,
  detail: (id: string) => [...collectionKeys.all, 'detail', id] as const,
  bookmarks: (id: string, q?: string) => [...collectionKeys.all, 'bookmarks', id, q ?? ''] as const,
}

export function useCollections(limit = 50) {
  const api = useApi()
  return useInfiniteQuery({
    queryKey: [...collectionKeys.list(), limit],
    queryFn: ({ pageParam }) => api<Page<Collection>>('GET', '/collections', { query: { limit, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}

export function useCollection(id: string) {
  const api = useApi()
  return useQuery({ queryKey: collectionKeys.detail(id), queryFn: () => api<Collection>('GET', `/collections/${id}`) })
}

export function useCollectionBookmarks(id: string, q?: string) {
  const api = useApi()
  return useInfiniteQuery({
    queryKey: collectionKeys.bookmarks(id, q),
    queryFn: ({ pageParam }) => api<Page<Bookmark>>('GET', `/collections/${id}/bookmarks`, { query: { cursor: pageParam, q } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}

/**
 * ADR-018j: exact, trimmed, case-insensitive duplicate check. The list is paginated, so ask the API
 * (`?name=` is a contains filter) and compare exactly here. `excludeId` skips the collection being renamed.
 */
export async function findDuplicateCollection(api: ApiRequest, name: string, excludeId?: string): Promise<Collection | undefined> {
  const wanted = name.trim().toLowerCase()
  if (wanted === '') return undefined
  let cursor: string | undefined
  do {
    const page = await api<Page<Collection>>('GET', '/collections', { query: { name: name.trim(), limit: 100, cursor } })
    const match = page.data.find((c) => c.id !== excludeId && c.name.trim().toLowerCase() === wanted)
    if (match) return match
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  return undefined
}

export function useSaveCollection() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id?: string; name: string }) =>
      id ? api<Collection>('PATCH', `/collections/${id}`, { body: { name } }) : api<Collection>('POST', '/collections', { body: { name } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectionKeys.all }),
  })
}

/** ADR-005b: without confirm a non-empty collection answers 409 collection_not_empty + bookmarkCount. */
export function useDeleteCollection() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, confirm }: { id: string; confirm: boolean }) =>
      api<void>('DELETE', `/collections/${id}`, { query: { confirm: confirm ? 'true' : undefined } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: collectionKeys.all })
      await queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
    },
  })
}
