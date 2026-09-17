// ADR-010d / ADR-011h: issuer, audience, JWKS URL and userinfo URL are required configuration.
// Missing or invalid values stop the app at startup rather than running half-configured.

export interface AuthConfig {
  issuer: string;
  audience: string;
  jwksUri: URL;
  userinfoUri: URL;
}

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

const REQUIRED = ['AUTH_ISSUER', 'AUTH_AUDIENCE', 'AUTH_JWKS_URI', 'AUTH_USERINFO_URI'] as const;

function parseUrl(env: NodeJS.ProcessEnv, key: (typeof REQUIRED)[number]): URL {
  try {
    return new URL(env[key]!.trim());
  } catch {
    throw new Error(`${key} is not a valid URL`);
  }
}

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const missing = REQUIRED.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required auth configuration: ${missing.join(', ')}`);
  }

  return {
    issuer: env.AUTH_ISSUER!.trim(),
    audience: env.AUTH_AUDIENCE!.trim(),
    jwksUri: parseUrl(env, 'AUTH_JWKS_URI'),
    userinfoUri: parseUrl(env, 'AUTH_USERINFO_URI'),
  };
}
