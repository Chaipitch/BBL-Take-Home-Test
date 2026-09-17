import { vi } from 'vitest'

/** Mutable Auth0 state used by the mocked `useAuth0` (see setup.ts). Reset before each test. */
export const auth = {
  isLoading: false,
  isAuthenticated: true,
  error: undefined as Error | undefined,
  getAccessTokenSilently: vi.fn(async () => 'test-access-token'),
  loginWithRedirect: vi.fn(async () => {}),
  logout: vi.fn(async () => {}),
}

export function resetAuth() {
  auth.isLoading = false
  auth.isAuthenticated = true
  auth.error = undefined
  auth.getAccessTokenSilently = vi.fn(async () => 'test-access-token')
  auth.loginWithRedirect = vi.fn(async () => {})
  auth.logout = vi.fn(async () => {})
}
