import { useAuth0 } from '@auth0/auth0-react'
import { useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { ErrorAlert } from '../components/common/ErrorAlert'
import { LoadingState } from '../components/common/LoadingState'

/** Every page except /callback requires login; unauthenticated users go to Auth0 (ADR-018g). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, error, loginWithRedirect } = useAuth0()
  const location = useLocation()

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !error) {
      void loginWithRedirect({ appState: { returnTo: location.pathname + location.search } })
    }
  }, [isLoading, isAuthenticated, error, loginWithRedirect, location.pathname, location.search])

  if (error) return <ErrorAlert error={error} title="Sign-in failed" />
  if (isLoading || !isAuthenticated) return <LoadingState label="Signing in…" />
  return children
}
