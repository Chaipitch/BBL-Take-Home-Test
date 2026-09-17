/** Build-time configuration from VITE_* variables (see .env.example). Fails fast if any is missing. */
function required(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required configuration ${name} (see frontend/.env.example)`)
  }
  return value.trim()
}

export const config = {
  apiBaseUrl: required('VITE_API_BASE_URL').replace(/\/$/, ''),
  auth0: {
    domain: required('VITE_AUTH0_DOMAIN'),
    clientId: required('VITE_AUTH0_CLIENT_ID'),
    audience: required('VITE_AUTH0_AUDIENCE'),
    /** Registered callback on the Auth0 client (brief §3.1). */
    redirectUri: `${window.location.origin}/callback`,
    scope: 'openid profile email',
  },
}
