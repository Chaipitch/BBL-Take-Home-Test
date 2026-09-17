#!/usr/bin/env node
// Dev tool (task BBL-9): log in once via Authorization Code + PKCE (S256) and print what the
// tenant actually issues — decoded token headers/claims, signature check against JWKS, /userinfo.
// It NEVER prints raw tokens or signatures. The human types the password in the browser.
//
// Usage: node scripts/inspect-tokens.mjs                              (port 3000 must be free)
//        node scripts/inspect-tokens.mjs --api http://localhost:4000/  (also probe the running API)
import { createServer } from 'node:http';
import { randomBytes, createHash, createPublicKey, verify } from 'node:crypto';
import { execFile } from 'node:child_process';

const DISCOVERY = 'https://dev-yg.us.auth0.com/.well-known/openid-configuration';
const CLIENT_ID = 'H9F6QG5SzTKMv0tbmgxLj9LjG1EKVllA';
const REDIRECT_URI = 'http://localhost:3000/callback';
const SCOPE = 'openid profile email';
const AUDIENCE = 'https://bbl-candidate-test-api';
const TIMEOUT_MS = 5 * 60 * 1000;
const apiFlag = process.argv.indexOf('--api');
const API_URL = apiFlag !== -1 ? process.argv[apiFlag + 1] : undefined;

const b64url = (buf) => buf.toString('base64url');
const section = (title) => console.log(`\n=== ${title} ===`);

function decodeJwt(token) {
  const parts = token.split('.');
  if (parts.length === 5) return { kind: 'JWE (encrypted, 5 parts) — cannot decode' };
  if (parts.length !== 3) return { kind: `opaque (not a JWT, ${parts.length} part(s), length ${token.length})` };
  const [h, p] = parts;
  return {
    kind: 'JWS (3 parts)',
    header: JSON.parse(Buffer.from(h, 'base64url').toString()),
    payload: JSON.parse(Buffer.from(p, 'base64url').toString()),
  };
}

function checkSignature(token, header, jwks) {
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) return `no JWKS key with kid=${header.kid}`;
  if (header.alg !== 'RS256') return `alg is ${header.alg}, not checked (only RS256 keys published)`;
  const [h, p, s] = token.split('.');
  const ok = verify('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'));
  return ok ? `valid (RS256, kid=${header.kid})` : 'INVALID signature';
}

function describeTimes(payload) {
  const fmt = (t) => (typeof t === 'number' ? `${new Date(t * 1000).toISOString()}` : t);
  const out = {};
  for (const k of ['iat', 'nbf', 'exp', 'auth_time']) if (k in payload) out[k] = fmt(payload[k]);
  if (payload.iat && payload.exp) out.lifetime_seconds = payload.exp - payload.iat;
  return out;
}

function report(name, token, jwks, config) {
  section(name);
  if (!token) return console.log('not returned');
  const d = decodeJwt(token);
  console.log('format:', d.kind);
  if (!d.header) return;
  console.log('header:', d.header);
  console.log('claims:', d.payload);
  console.log('times:', describeTimes(d.payload));
  console.log('signature:', checkSignature(token, d.header, jwks));
  console.log('iss matches discovery issuer:', d.payload.iss === config.issuer);
}

async function main() {
  const config = await (await fetch(DISCOVERY)).json();
  const jwks = await (await fetch(config.jwks_uri)).json();

  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const state = b64url(randomBytes(16));
  const nonce = b64url(randomBytes(16));

  const authUrl = new URL(config.authorization_endpoint);
  authUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    audience: AUDIENCE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  }).toString();

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { server.close(); reject(new Error('timed out waiting for login')); }, TIMEOUT_MS);
    const server = createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      if (url.pathname !== '/callback') { res.writeHead(404).end(); return; }
      const finish = (msg, result) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' }).end(msg);
        clearTimeout(timer);
        server.close();
        result instanceof Error ? reject(result) : resolve(result);
      };
      if (url.searchParams.get('error')) return finish('Login failed. See terminal.', new Error(`${url.searchParams.get('error')}: ${url.searchParams.get('error_description')}`));
      if (url.searchParams.get('state') !== state) return finish('State mismatch. See terminal.', new Error('state mismatch — possible CSRF, aborting'));
      finish('Login complete. You can close this tab and return to the terminal.', url.searchParams.get('code'));
    });
    server.listen(3000, 'localhost', () => {
      console.log('Opening browser for login. If it does not open, visit:\n' + authUrl.toString());
      execFile('open', [authUrl.toString()], () => {});
    });
  });

  const tokenRes = await fetch(config.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: CLIENT_ID, code, redirect_uri: REDIRECT_URI, code_verifier: verifier }),
  });
  const tokens = await tokenRes.json();
  if (!tokenRes.ok) {
    section('Token endpoint error');
    console.log(tokenRes.status, tokens.error, tokens.error_description);
    process.exit(1);
  }

  section('Token response (values hidden)');
  console.log({
    token_type: tokens.token_type,
    expires_in: tokens.expires_in,
    scope: tokens.scope,
    returned: Object.keys(tokens),
    refresh_token_returned: 'refresh_token' in tokens,
  });

  report('Access token', tokens.access_token, jwks, config);
  report('ID token', tokens.id_token, jwks, config);

  const idClaims = decodeJwt(tokens.id_token ?? '').payload;
  if (idClaims) {
    section('ID token checks');
    console.log({ nonce_matches: idClaims.nonce === nonce, aud_is_client_id: idClaims.aud === CLIENT_ID });
  }

  section('/userinfo called with the access token');
  const ui = await fetch(config.userinfo_endpoint, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  console.log('status:', ui.status);
  console.log(ui.ok ? await ui.json() : await ui.text());

  if (API_URL) {
    section(`API probe: GET ${API_URL} (statuses only)`);
    const probe = async (label, token, expected) => {
      const res = await fetch(API_URL, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
      const verdict = res.status === expected ? 'OK' : 'UNEXPECTED';
      console.log(`${verdict}  ${label}: ${res.status} (expected ${expected}) www-authenticate=${res.headers.get('www-authenticate') ?? '-'}`);
      // Response bodies never contain tokens; print successful JSON bodies (e.g. GET /me).
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) console.log('     body:', await res.json());
    };
    await probe('real access token', tokens.access_token, 200);
    await probe('real ID token (aud = client id)', tokens.id_token, 401);
    await probe('no token', undefined, 401);
  }
}

main().catch((err) => { console.error('\nERROR:', err.message); process.exit(1); });
