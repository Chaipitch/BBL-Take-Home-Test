import { loadAuthConfig } from './auth.config.js';

describe('loadAuthConfig', () => {
  const valid = {
    AUTH_ISSUER: 'https://dev-yg.us.auth0.com/',
    AUTH_AUDIENCE: 'https://bbl-candidate-test-api',
    AUTH_JWKS_URI: 'https://dev-yg.us.auth0.com/.well-known/jwks.json',
  };

  it('returns the configured values', () => {
    expect(loadAuthConfig(valid)).toEqual({
      issuer: valid.AUTH_ISSUER,
      audience: valid.AUTH_AUDIENCE,
      jwksUri: new URL(valid.AUTH_JWKS_URI),
    });
  });

  it.each(['AUTH_ISSUER', 'AUTH_AUDIENCE', 'AUTH_JWKS_URI'])('refuses to start without %s', (key) => {
    expect(() => loadAuthConfig({ ...valid, [key]: '' })).toThrow(`Missing required auth configuration: ${key}`);
    expect(() => loadAuthConfig({ ...valid, [key]: undefined })).toThrow(key);
  });

  it('refuses an invalid JWKS URL', () => {
    expect(() => loadAuthConfig({ ...valid, AUTH_JWKS_URI: 'not a url' })).toThrow('AUTH_JWKS_URI is not a valid URL');
  });
});
