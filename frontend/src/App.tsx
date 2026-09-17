import { Auth0Provider } from '@auth0/auth0-react'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createBrowserRouter } from 'react-router'
import { ApiError } from './api/client'
import { ApiProvider } from './api/ApiProvider'
import { config } from './config'
import { routes } from './routes'

const router = createBrowserRouter(routes)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retrying 4xx (not found, not yours, validation) never helps; retry transient failures once.
      retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 1,
      refetchOnWindowFocus: false,
    },
  },
})

const theme = createTheme({ palette: { primary: { main: '#1455b8' } } })

export function App() {
  return (
    <Auth0Provider
      domain={config.auth0.domain}
      clientId={config.auth0.clientId}
      // ADR-018d: tokens in memory (SDK default), no refresh tokens. PKCE S256 + code flow are the SDK's only mode.
      cacheLocation="memory"
      useRefreshTokens={false}
      authorizationParams={{ redirect_uri: config.auth0.redirectUri, audience: config.auth0.audience, scope: config.auth0.scope }}
      onRedirectCallback={(appState) => void router.navigate((appState?.returnTo as string | undefined) ?? '/collections', { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ApiProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <RouterProvider router={router} />
          </ThemeProvider>
        </ApiProvider>
      </QueryClientProvider>
    </Auth0Provider>
  )
}
