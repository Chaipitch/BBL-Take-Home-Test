import { useQuery } from '@tanstack/react-query'
import { useApi } from './useApi'
import type { Me } from './types'

export function useMe() {
  const api = useApi()
  return useQuery({ queryKey: ['me'], queryFn: () => api<Me>('GET', '/me'), staleTime: 5 * 60_000 })
}
