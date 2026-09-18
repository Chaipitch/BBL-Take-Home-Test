import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Page, Share } from './types'
import { useApi } from './useApi'

export const shareKeys = {
  all: ['shares'] as const,
  list: (collectionId: string) => [...shareKeys.all, collectionId] as const,
}

/** Owner-side share management (ADR-015a). Recipient reads live in api/shared.ts. */
export function useShares(collectionId: string) {
  const api = useApi()
  return useInfiniteQuery({
    queryKey: shareKeys.list(collectionId),
    queryFn: ({ pageParam }) => api<Page<Share>>('GET', `/collections/${collectionId}/shares`, { query: { cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}

export function useCreateShare(collectionId: string) {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (email: string) => api<Share>('POST', `/collections/${collectionId}/shares`, { body: { email } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shareKeys.list(collectionId) }),
  })
}

export function useRevokeShare(collectionId: string) {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (shareId: string) => api<void>('DELETE', `/collections/${collectionId}/shares/${shareId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shareKeys.list(collectionId) }),
  })
}
