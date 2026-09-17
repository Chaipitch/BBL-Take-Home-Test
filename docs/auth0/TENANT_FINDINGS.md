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

Token choice: resolved — the API accepts the access token (DECISIONS.md ADR-008), confirmed by the real token inspection below.

---

## Real token inspection — 2026-09-17 (task BBL-9)

Obtained with `scripts/inspect-tokens.mjs` (Authorization Code + PKCE S256, `audience=https://bbl-candidate-test-api`, scope `openid profile email`). The developer performed the login as the test user. Only decoded claims are recorded here; raw tokens were never printed. `sid` and `nonce` values omitted.

### Token response
`token_type: Bearer`, `expires_in: 7200`, `scope: openid profile email`. Returned: `access_token`, `id_token`. **No `refresh_token`** (`offline_access` not requested).

### Access token
| Item | Observed |
|---|---|
| Format | JWS (3 parts) — **a JWT, not opaque** |
| Header | `alg: RS256`, `typ: JWT`, `kid: tOu0FHcN3C2etrel4Qhaz` |
| Signature | Valid against JWKS key with matching `kid` |
| `iss` | `https://dev-yg.us.auth0.com/` (matches discovery) |
| `aud` | **Array**: `["https://bbl-candidate-test-api", "https://dev-yg.us.auth0.com/userinfo"]` |
| `sub` | `auth0\|62e089faea483987422db6cc` |
| `azp` | `H9F6QG5SzTKMv0tbmgxLj9LjG1EKVllA` (the SPA client id) |
| `scope` | `openid profile email` |
| `permissions` | absent |
| `email`, `email_verified`, `name` | **absent** |
| Lifetime | 7200 s (2 h) |

### ID token
| Item | Observed |
|---|---|
| Format / header | JWS, `RS256`, same `kid` |
| Signature | Valid |
| `aud` | `H9F6QG5SzTKMv0tbmgxLj9LjG1EKVllA` (client id, a string) |
| Profile claims | `name: Candy`, `nickname: candidate`, `picture`, `updated_at`, `email: candidate@test.com`, `email_verified: true` |
| Other | `sid`, `nonce` (matched the one sent), and an unexpected non-namespaced custom claim `user_id: 1` (added by tenant configuration we cannot see) |
| Lifetime | 36000 s (10 h) |

### `/userinfo` with the access token
`200` → `sub`, `nickname`, `name`, `picture`, `updated_at`, `email: candidate@test.com`, `email_verified: true`.

### Implications
1. **ADR-008 confirmed:** the access token is a signed JWT whose audience includes our API.
2. **`aud` is an array** → the API must check that it *contains* `https://bbl-candidate-test-api`; a string-equality check would reject every valid token.
3. **Signing** matched the JWKS analysis above: RS256, key chosen by `kid`.
4. **No email in the access token** → email/email_verified must come from `/userinfo` (ADR-009).
5. **No refresh token; access token lives 2 h** → frontend expiry handling to be decided (BBL-20).
6. **`user_id: 1` custom claim** is tenant-specific and undocumented → not used; identity is `sub`.

---

## Real tokens against the running API — 2026-09-17 (BBL-10 verification)

`node scripts/inspect-tokens.mjs --api http://localhost:4000/` with the API built from commit `3c07c29`. Developer performed the login. A second login produced tokens with the same shape as above (RS256, `kid tOu0FHcN3C2etrel4Qhaz`, access-token `aud` array incl. the API, ID-token `aud` = client id).

| Probe `GET /` | Status | `WWW-Authenticate` | API log reason |
|---|---|---|---|
| Real access token | 200 | — | — |
| Real ID token | 401 | `Bearer error="invalid_token"` | `ERR_JWT_CLAIM_VALIDATION_FAILED` (audience) |
| No token | 401 | `Bearer` | `no authorization header` |

No JWT-shaped strings found in the API log or script output.
