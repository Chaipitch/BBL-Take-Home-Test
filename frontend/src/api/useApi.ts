import { createContext, useContext } from 'react'
import type { ApiRequest } from './client'

export const ApiContext = createContext<ApiRequest | null>(null)

export function useApi(): ApiRequest {
  const request = useContext(ApiContext)
  if (!request) throw new Error('useApi must be used inside <ApiProvider>')
  return request
}
