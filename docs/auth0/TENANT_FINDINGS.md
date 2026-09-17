# Auth0 tenant findings

Snapshots taken 2026-09-17 from the live tenant (`openid-configuration.json`, `jwks.json` in this folder).
Re-fetch before relying on them — keys rotate.

| Question | Observed | Implication for our design |
|---|---|---|
| Issuer | `https://dev-yg.us.auth0.com/` (trailing slash) | Issuer check must match exactly, including the slash. |
| Response types | `code`, `token`, `id_token`, hybrids | Implicit is *available* but forbidden by the brief. Frontend requests `response_type=code` only. |
| Grant types | includes `implicit`, `password`, `client_credentials`, … | Tenant permits more than we use. We use `authorization_code` (+ maybe `refresh_token`). |
| PKCE methods | `S256`, `plain` | `plain` is advertised — we must send `S256` explicitly. |
| ID token signing algs advertised | `HS256`, `RS256`, `PS256` | Advertised ≠ in use. |
| JWKS keys | 2 keys, both `kty=RSA`, `alg=RS256`, `use=sig` | Only RS256 is actually published. API must **pin `algorithms: ['RS256']`** — never trust the token header's `alg` (blocks HS256 key-confusion / `none`). Two keys ⇒ select by `kid`, cache JWKS. |

Open question (to decide in DECISIONS.md): which token the API accepts as Bearer — ID token vs access token for audience `https://bbl-candidate-test-api`. Needs a real login to inspect whether the access token is a JWT for that audience.
