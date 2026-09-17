# DECISIONS

Short ADRs for calls the brief left open.

**Process.** The agent does not make design decisions. It writes a *Proposed* ADR (options + recommendation), the developer decides, and only then is it *Accepted* and implemented. Each ADR records who decided.

> **Correction logged 2026-09-17.** In commit `5431329` the agent implemented several sub-decisions it had not been asked to make. The developer stopped it and introduced the propose → decide → implement rule (now in `CLAUDE.md`). Those items were marked Proposed in `e781d58`, then reviewed by the developer (task board BBL-7). Two were **overridden** (ADR-005b, ADR-006c) and one design detail changed as a result (ADR-006g, schema migration `20260917094500_share_grantee_user_id`).

| ADR | Topic | Status | Decided by |
|---|---|---|---|
| 001 | Pin dependency versions | Accepted | Developer (agent recommendation) |
| 002 | Drop agent skills installed by `prisma init` | Accepted | Developer (agent recommendation) |
| 003 | Frontend 3000, backend 4000 + CORS | Accepted | Developer (agent recommendation) |
| 004 | UUID v4 ids | Accepted | Developer |
| 004a | Malformed id → 404 | Accepted | Developer (agent recommendation) |
| 005 | Delete collection deletes its bookmarks, UI confirmation | Accepted | Developer |
| 005a | Same-owner enforced by composite FK + app check | Accepted | Developer (agent recommendation) |
| 005b | API requires `?confirm=true` to delete a non-empty collection | Accepted | Developer (**overrode** agent: no flag) |
| 006 | Read-only sharing to another registered user | Accepted | Developer |
| 006a | Owner names recipient by email | Accepted | Developer (agent recommendation) |
| 006b | Recipient must have a verified email | Accepted | Developer (agent recommendation) |
| 006c | Unknown/ineligible recipient → 404 | Accepted | Developer (**overrode** agent: same-response) |
| 006d | Shared data under `/shared/...` routes | Accepted | Developer (agent recommendation) |
| 006e | Recipient sees bookmarks incl. notes + owner email | Accepted | Developer (agent recommendation) |
| 006f | Share rules: list/revoke, no self-share, no edit/re-share | Accepted | Developer (agent recommendation) |
| 006g | Share stored by recipient user id | Accepted | Developer (agent recommendation) |
| 007 | Schema details; duplicate collection names allowed with UI warning | Accepted | Developer |
| 008 | API accepts the **access token** as Bearer | Accepted — confirmed by token inspection | Developer (agent recommendation) |
| 009 | Email/email_verified from `/userinfo`, stored, refreshed every 24h | Accepted | Developer (agent recommendation) |
| 010 | API authentication guard (library, scope, checks, JWKS, errors) | **Proposed** — awaiting developer | — |

---

## ADR-001 — Pin dependency versions
**Status.** Accepted.
**Context.** On 2026-09-17: `prisma@latest = 8.0.0-rc.15` (release candidate) but `@prisma/client@latest = 7.10.0`; installing both "latest" gives mismatched majors. `typescript@latest = 7.0.2`, but `ts-jest` peers `<7` and `@nestjs/cli` 12 ships `~6.0.2`.
**Decision.** Exact pins: `prisma`, `@prisma/client`, `@prisma/adapter-pg` = `7.10.0`; TypeScript `6.0.x`.
**Trade-off.** No automatic minor/patch updates; bumps are deliberate.

## ADR-002 — Drop agent skills installed by `prisma init`
**Status.** Accepted.
**Context.** `prisma init` downloaded 9 skills from `github.com/prisma/skills` into `backend/.agents`, symlinked into `.claude/skills` and `.windsurf/skills`. Several cover products we don't use (MongoDB, Prisma Postgres cloud, Compute).
**Decision.** None committed. Agent context lives only in `CLAUDE.md` and `/.agent/`.
**Trade-off.** Agents lose vendor Prisma 7 guidance; in exchange every instruction an agent receives in this repo is one we wrote and reviewed.

## ADR-003 — Ports and cross-origin
**Status.** Accepted.
**Context.** Auth0 callback/logout URLs are fixed to `http://localhost:3000`.
**Decision.** Frontend (Vite) on `3000`; API on `4000`; API CORS allows only origin `http://localhost:3000`.
**Trade-off vs Vite proxy.** CORS must be configured and explained, but dev mirrors a real deployment where SPA and API are separate origins.

## ADR-004 — Resource ids are UUID v4
**Status.** Accepted.
**Why.** Sequential ids would leak other users' activity volume, conflicting with "must not learn of the existence of".

### ADR-004a — Malformed id → 404
**Status.** Accepted.
**Decision.** A path id that is not a valid UUID returns `404`, identical to a valid id that doesn't exist or isn't yours.
**Trade-off.** Less helpful to API clients than `400`; keeps one rule: "can't access it → 404".

## ADR-005 — Deleting a collection deletes its bookmarks
**Status.** Accepted.
**Decision.** Deleting a collection deletes all bookmarks inside it (DB `ON DELETE CASCADE`) and its shares. The frontend shows a confirmation popup **including the number of bookmarks** that will be deleted.
**Trade-off.** Confirmed deletion is permanent; no undo.

### ADR-005a — Same-owner integrity: composite FK + app check
**Status.** Accepted.
**Decision.** Both layers:
- **App:** before writing a bookmark's `collectionId`, look up the collection by `id` **and** caller's `ownerId`; not found → 404.
- **DB:** composite FK `Bookmark(collectionId, ownerId) → Collection(id, ownerId)` rejects a cross-owner reference even if app code is wrong. NULL `collectionId` (uncategorised) skips the check.
**Evidence so far.** Raw SQL probe (manual): cross-owner insert rejected, uncategorised allowed, cascade works. Automated test still to write.

### ADR-005b — API confirmation flag for non-empty collections
**Status.** Accepted. Developer overrode the agent's "no flag" recommendation so that API clients, not only the UI, get a guard.
**Decision.** `DELETE /collections/:id`
- Empty collection → deleted, no flag needed.
- Has bookmarks and no `?confirm=true` → `409 Conflict` with the bookmark count; nothing deleted.
- Has bookmarks and `?confirm=true` → collection, bookmarks and shares deleted.
**Consequence.** The UI can call DELETE, receive the 409 + count, show the popup, and retry with `confirm=true`.
**Open detail (to decide when writing the API contract).** Race: a bookmark added between the 409 and the confirmed retry is also deleted.

## ADR-006 — Sharing a collection
**Status.** Accepted.
**Decision.** An owner can share a collection **read-only** with **another registered user**.

- **006a — Recipient named by email.** The owner enters an email address.
- **006b/006c — Eligibility and response.** A valid recipient is a user who has signed in at least once **and** whose email is verified (`email_verified = true`). If no such user exists — unknown email *or* registered-but-unverified — the API returns `404`, identical in both cases. Sharing with yourself → `400`.
  - **Accepted trade-off (developer, 2026-09-17):** any signed-in user can learn whether an email belongs to a verified account by attempting a share. Chosen for clear feedback to owners over hiding account existence. No rate limiting for now.
  - Why verified: otherwise anyone who registers an account with someone else's address could receive that person's shares.
- **006d — Routes.** Recipients read shared data only through `/shared/...` routes. Owner routes (`/collections`, `/bookmarks`) never consult shares, so the exception to the privacy rule lives in one module.
- **006e — What recipients see.** Collection name, its bookmarks (url, title, notes), and the owner's email. Never internal user ids of others, never the list of other recipients.
- **006f — Rules.** Only the owner can create, list and revoke shares of a collection. Recipients cannot edit or re-share. Deleting the collection removes its shares.
- **006g — Storage.** A share row stores the recipient's **user id** (`CollectionShare.granteeUserId → User`), resolved from the email at share time. Access follows the account, not the address: a later email change does not move access. Deleting a user removes shares granted to them. Email verification is checked **at share time**.

## ADR-007 — Schema details
**Status.** Accepted.
- **User table.** A `User` row is created on the first authenticated request, keyed by Auth0 `sub`; stores `email`, `emailVerified`, `name`.
- **Length limits.** Collection name 200, url 2048, title 500, notes 10 000.
- **Duplicate collection names are allowed** (no DB constraint). The frontend warns before create/rename with a popup ("a collection with this name already exists; this will create identical names"), comparing **client-side, trimmed and case-insensitive** against the user's loaded collections. The API does not check.
- **Indexes** on `(ownerId, createdAt)` and `(ownerId, collectionId)` for owner-scoped listing/filtering.
- **Separate test database** `bookmarks_test` in docker-compose.

## ADR-008 — Bearer token accepted by the API
**Status.** Accepted — confirmed 2026-09-17 by a real login (BBL-9, `docs/auth0/TENANT_FINDINGS.md`): the access token is an RS256-signed JWT with `aud` containing `https://bbl-candidate-test-api`.
**Decision.** The API accepts the **Auth0 access token** issued for audience `https://bbl-candidate-test-api`.
**Rationale (README one-liner).** Access tokens are issued *for* an API (`aud` = this API); ID tokens are issued for the client app and prove a login to it, not authorisation to call an API.
**Trade-offs.**
- Confirmed: the access token carries **no** `email` / `email_verified`; sharing (ADR-006b) needs them → resolved by ADR-009.
- `aud` is an **array** (our API + Auth0 `/userinfo`), so audience validation must be "contains", not string equality.
- No refresh token and a 2-hour lifetime; frontend expiry handling is decided separately (BBL-20).
- The SPA must request the `audience` parameter at login.
**Rejected.** ID token as Bearer: `aud` is the client id, so any token minted for this SPA would be accepted by the API; no scope/audience separation.

## ADR-009 — Where the API gets the user's email
**Status.** Accepted — developer, 2026-09-17 (agent recommendation).
**Context.** The access token (ADR-008) has no `email` / `email_verified` (observed, BBL-9). Sharing needs both: owners name recipients by email, and recipients must be verified (ADR-006b/c). `/userinfo` called with the access token returns both.
**Options considered.**
- **A. `/userinfo` at provisioning + periodic refresh** — chosen.
- B. `/userinfo` on every request — always fresh, but a network call per request and Auth0 rate-limit exposure.
- C. Frontend sends email from the ID token — rejected: client-controlled, anyone could claim any verified email.
- D. Tenant action adds email to the access token — rejected: we don't control the tenant.
**Decision.** When an authenticated request arrives, the API calls Auth0 `/userinfo` with the caller's (already verified) access token and stores `email`, `emailVerified`, `name` on the `User` row if:
- the user is seen for the first time, or
- the stored profile was last synced **more than 24 hours** ago.
**Trade-offs.**
- Stored email can be up to 24 h stale: an email changed or un-verified in Auth0 still counts for sharing for up to a day.
- Adds a dependency on Auth0 availability at first sign-in and at each 24 h refresh.
- Requires a sync timestamp on `User` (schema change, implemented with BBL-11).
**Open detail (decide in BBL-11).** Behaviour when `/userinfo` fails: on first sign-in (no stored profile) vs on a stale refresh (profile exists).

## ADR-010 — API authentication guard (BBL-10)
**Status.** **Proposed** — awaiting developer decision. Nothing implemented.
**Context.** Every route must require OIDC auth (brief §3.1). The API accepts the Auth0 access token (ADR-008). Observed (BBL-9): RS256 JWT, `kid` header, `typ: JWT`, `iss = https://dev-yg.us.auth0.com/`, `aud` is an **array** containing `https://bbl-candidate-test-api`, lifetime 2 h. JWKS has 2 RS256 keys. The on-site includes a live security review of this code.

### 010a — Verification library
| Option | Notes |
|---|---|
| **A. `jose` 6.2.12** | Zero dependencies, actively maintained (2026-09). One call `jwtVerify(token, JWKS, { algorithms, issuer, audience, clockTolerance })`. `createRemoteJWKSet` handles fetch, cache, and `kid` rotation. Audience check accepts an array `aud` (verified in source). Small surface → easy to explain line by line. |
| B. `@nestjs/passport` + `passport-jwt` + `jwks-rsa` | Common Nest tutorial path. Three packages + passport; `passport-jwt` last released 2025-01 and wraps `jsonwebtoken`. More indirection (strategy, `validate()`, `AuthGuard('jwt')`) to explain. |
| C. `express-oauth2-jwt-bearer` (Auth0) | Auth0's official Express middleware, but depends on old `jose` 4 and is Express middleware, not a Nest guard. |
| D. `@nestjs/jwt` | Built for secrets/static keys; no JWKS fetching — would need custom key lookup. |
**Recommendation: A.**

### 010b — Where the guard applies
| Option | Notes |
|---|---|
| **A. Global guard (`APP_GUARD`), deny by default** | Every route, including ones added later, is protected unless explicitly marked `@Public()`. Forgetting a decorator fails *closed*. |
| B. `@UseGuards` per controller | Explicit, but a new controller without it is silently public — fails *open*. |
| C. Express middleware | Runs before Nest routing; loses Nest metadata (no clean `@Public()`), less idiomatic. |
**Recommendation: A**, with **no public routes planned** (not even a health check) unless you decide otherwise; a test would assert every registered route returns 401 without a token.

### 010c — What a valid token must satisfy
Recommended checks (each is a question — accept/reject individually):
1. **Transport:** only `Authorization: Bearer <token>` header. Not query string, not cookies.
2. **Algorithm pinned:** `algorithms: ['RS256']`. Never trust the header `alg` (blocks `none` and HS256 key-confusion).
3. **Signature:** key selected by `kid` from the tenant JWKS.
4. **Issuer:** exactly `https://dev-yg.us.auth0.com/` (trailing slash).
5. **Audience:** `aud` contains `https://bbl-candidate-test-api` — this is what rejects ID tokens (`aud` = client id).
6. **Time:** `exp` required and not passed; `nbf`/`iat` honoured. **Clock tolerance:** options 0 s / **5 s (recommended)** / 60 s.
7. **Subject:** `sub` required (it's our user identity key).
8. **`azp` (authorized party):** *optional check* — require `azp = H9F6QG5SzTKMv0tbmgxLj9LjG1EKVllA` so only tokens obtained through our SPA are accepted. Stricter, but rejects tokens other legitimate clients might obtain for the same API. **Recommendation: skip**, rely on audience; mention as a hardening option.
9. **Not checked:** `typ` (Auth0 sets `JWT` on both token kinds, so it doesn't distinguish them); `scope`/`permissions` (no per-route permissions in this app).

### 010d — JWKS source and caching
| Option | Notes |
|---|---|
| **A. `createRemoteJWKSet` with jose defaults** | Cache 10 min; on unknown `kid`, refetch at most once per 30 s (limits abuse by tokens with random `kid`s); 5 s fetch timeout. |
| B. Same, tuned values | e.g. longer cache. No evidence we need it. |
| C. Static JWKS file committed to repo | No network dependency, but breaks on key rotation. |
**Recommendation: A.**
**JWKS URL / issuer / audience configuration:** from environment variables validated at startup (app refuses to start if missing), defaulting nothing. Rationale: BBL-17 (tests) may need to point verification at test keys *while running the same verification code* — the brief asks to keep the real validation path exercised. How tests get tokens is decided in BBL-17, not here.

### 010e — Failure responses
| Case | Recommended |
|---|---|
| Missing header / not `Bearer` / malformed / bad signature / wrong iss / wrong aud / expired | **401**, `WWW-Authenticate: Bearer` (RFC 6750, with `error="invalid_token"` when a token was present), **identical generic body** for all — the reason is logged server-side (never the token), not returned. |
| JWKS unreachable and no cached key | Options: **503 (recommended)** — honest "can't verify right now", avoids telling the SPA to re-login in a loop — or 401. |
Body shape follows the API error format decided in BBL-12.

### 010f — What the guard produces
Guard attaches a minimal typed principal `{ sub, scope }` to the request, exposed via a `@CurrentUser()` parameter decorator. User provisioning / `/userinfo` sync (ADR-009) is **not** in the guard — it's BBL-11, so token verification stays a pure, separately testable step.

### Tests that would prove it (for BBL-18)
No token → 401 · non-Bearer scheme → 401 · garbage token → 401 · `alg: none` → 401 · HS256 signed with the RSA public key → 401 · valid signature but wrong `iss` → 401 · ID token (`aud` = client id) → 401 · expired beyond tolerance → 401 · `nbf` in future → 401 · unknown `kid` → 401 · missing `sub` → 401 · token in query string only → 401 · valid access token → 200 · every registered route without token → 401.
