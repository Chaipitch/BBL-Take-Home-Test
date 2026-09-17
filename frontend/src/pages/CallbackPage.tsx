import { useAuth0 } from '@auth0/auth0-react'
import { Navigate } from 'react-router'
import { ErrorAlert } from '../components/common/ErrorAlert'
import { LoadingState } from '../components/common/LoadingState'

/**
 * Auth0 redirect target (brief: http://localhost:3000/callback). The SDK exchanges the code (PKCE)
 * and `onRedirectCallback` in main.tsx navigates to the page the user started from.
 */
export function CallbackPage() {
  const { isLoading, isAuthenticated, error } = useAuth0()
  if (error) return <ErrorAlert error={error} title="Sign-in failed" />
  if (!isLoading && isAuthenticated) return <Navigate to="/collections" replace />
  return <LoadingState label="Signing in…" />
}
