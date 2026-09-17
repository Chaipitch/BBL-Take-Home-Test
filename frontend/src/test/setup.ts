import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { auth, resetAuth } from './auth'
import { server } from './server'

// Auth0 is mocked at the hook boundary (ADR-018m). Real login is covered by the manual checklist.
vi.mock('@auth0/auth0-react', () => ({
  useAuth0: () => auth,
  Auth0Provider: ({ children }: { children: ReactNode }) => children,
}))

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => resetAuth())
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())
