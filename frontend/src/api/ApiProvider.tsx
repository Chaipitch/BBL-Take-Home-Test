import { useAuth0 } from '@auth0/auth0-react'
import { useMemo, type ReactNode } from 'react'
import { config } from '../config'
import { createApiClient } from './client'
import { ApiContext } from './useApi'

/** Provides the authenticated API client. Tokens come from Auth0 memory cache (ADR-018d). */
export function ApiProvider({ children }: { children: ReactNode }) {
  const { getAccessTokenSilently, loginWithRedirect } = useAuth0()

  const request = useMemo(
    () =>
      createApiClient({
        baseUrl: config.apiBaseUrl,
        getAccessToken: async () => {
          const token = await getAccessTokenSilently({ authorizationParams: { audience: config.auth0.audience } })
          // Never send "Bearer undefined"; surface it as a sign-in problem instead.
          if (!token) throw new Error('No access token available')
          return token
        },
        onUnauthorized: () => {
          void loginWithRedirect({ appState: { returnTo: window.location.pathname + window.location.search } })
        },
      }),
    [getAccessTokenSilently, loginWithRedirect],
  )

  return <ApiContext.Provider value={request}>{children}</ApiContext.Provider>
}
