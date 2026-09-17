// ADR-010d: issuer, audience and JWKS URL are required configuration. Missing or invalid values
// stop the app at startup rather than running with verification half-configured.

export interface AuthConfig {
  issuer: string;
  audience: string;
  jwksUri: URL;
}

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const missing = ['AUTH_ISSUER', 'AUTH_AUDIENCE', 'AUTH_JWKS_URI'].filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required auth configuration: ${missing.join(', ')}`);
  }

  let jwksUri: URL;
  try {
    jwksUri = new URL(env.AUTH_JWKS_URI!.trim());
  } catch {
    throw new Error('AUTH_JWKS_URI is not a valid URL');
  }

  return {
    issuer: env.AUTH_ISSUER!.trim(),
    audience: env.AUTH_AUDIENCE!.trim(),
    jwksUri,
  };
}
