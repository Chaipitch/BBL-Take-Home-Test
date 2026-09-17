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
| 010 | API authentication guard (library, scope, checks, JWKS, errors) | Accepted — implemented | Developer (all agent recommendations) |
| 011 | User provisioning, `/userinfo` sync, `GET /me` | Accepted — implemented | Developer (agent recommendations; chose no backoff in 011e) |
| 012 | API contract: errors, validation, verbs, lists, filters (BBL-12) | Accepted — contract in `API_DESIGN.md` | Developer (agent recommendations; 012g follow the brief; `?q=` on title) |
| 013 | Collections implementation design + shared API plumbing (BBL-13) | Accepted — implemented | Developer (all agent recommendations, incl. wider delete race and 413) |
| 014 | Bookmarks implementation design (BBL-14) | Accepted — implemented | Developer (all agent recommendations) |
| 015 | Sharing routes and behaviour (BBL-15) | Accepted — pre-approved | Developer pre-approved agent recommendations for remaining backend work |
| 016 | Seed data (BBL-16) | Accepted — pre-approved | same |
| 017 | Route-wide authentication sweep test (BBL-18) | Accepted — pre-approved | same |
| 018 | Frontend architecture: scaffold, routing, auth, data, UI flows, tests (BBL-19–22) | Accepted | Developer (all agent recommendations) |
| 019 | Sharing UI: share/revoke and shared-with-me pages (BBL-23) | **Proposed** — awaiting developer | — |

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
**Status.** Accepted — developer, 2026-09-17 (all recommendations below). Implemented in `backend/src/auth/`.
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
> **Amended by ADR-011a/b:** the guard now also resolves the DB user after verification, and `@CurrentUser()` returns `{ id, sub }` (no `scope`). `TokenVerifier` itself is unchanged and still pure.
Guard attaches a minimal typed principal `{ sub, scope }` to the request, exposed via a `@CurrentUser()` parameter decorator. User provisioning / `/userinfo` sync (ADR-009) is **not** in the guard — it's BBL-11, so token verification stays a pure, separately testable step.

### Tests that would prove it (for BBL-18)
No token → 401 · non-Bearer scheme → 401 · garbage token → 401 · `alg: none` → 401 · HS256 signed with the RSA public key → 401 · valid signature but wrong `iss` → 401 · ID token (`aud` = client id) → 401 · expired beyond tolerance → 401 · `nbf` in future → 401 · unknown `kid` → 401 · missing `sub` → 401 · token in query string only → 401 · valid access token → 200 · every registered route without token → 401.

### Implementation notes (found while building ADR-010)
- **Outage vs bad token needs explicit error codes.** jose throws a *generic* `JOSEError` (`ERR_JOSE_GENERIC`) when the JWKS endpoint returns non-200 or bad JSON, a `JWKSTimeout` on timeout, and a raw `TypeError` on network failure. Treating "any jose error" as 401 would report an Auth0 outage as an invalid token. `TokenVerifier` classifies by an allow-list of token-error codes → 401, key-source codes/`TypeError` → 503, anything else rethrown (500, still denied). Verified manually (unreachable host and a 404 JWKS URL both → 503) and by tests.
- **jose already blocks `alg: none` and HS256-vs-RSA-key confusion on its own** (it never supports `none`, and only matches JWKS keys whose type/declared `alg` fit the header). Mutation testing showed removing our RS256 pin broke no test. The pin still matters when a JWKS key doesn't declare `alg`: a PS256 signature from the genuine RSA key (the tenant advertises PS256) would verify. A dedicated test covers that case and fails if the pin is removed or widened.
- **`exp` is not required by jose by default** → `requiredClaims: ['sub', 'exp']`.
- **Configuration** loads `backend/.env` via Node's built-in `process.loadEnvFile` (no new dependency); real environment variables take precedence.
- **Verified end to end with real Auth0 tokens (2026-09-17).** Developer logged in via `node scripts/inspect-tokens.mjs --api http://localhost:4000/` against the running API: real access token → `200`; real ID token → `401` (`WWW-Authenticate: Bearer error="invalid_token"`, logged reason `ERR_JWT_CLAIM_VALIDATION_FAILED`, i.e. the audience check); no token → `401` (`Bearer`). API log and script output searched for JWT-shaped strings: none.
- **401 body** is Nest's default `{"message":"Unauthorized","statusCode":401}` until the error shape is decided in BBL-12.

## ADR-011 — User provisioning, profile sync, and `GET /me` (BBL-11)
**Status.** Accepted — developer, 2026-09-17. All recommendations below, and for the retry storm (011e) **3 s timeout, no backoff**.
**Already decided (inputs).** ADR-007: a `User` row keyed by Auth0 `sub`, created on the first authenticated request. ADR-009: `email`, `emailVerified`, `name` come from Auth0 `/userinfo` (server-side, caller's verified access token) on first sign-in and when older than 24 h. ADR-010f: `TokenVerifier` stays a pure verification step; controllers get identity via `@CurrentUser()`.
**Current schema.** `User(id uuid, auth0Sub unique, email?, emailVerified=false, name?, createdAt, updatedAt)`. No sync timestamp yet.

### 011a — Where provisioning runs
| Option | Notes |
|---|---|
| **A. In `AuthGuard`, after `TokenVerifier` succeeds** | Guard calls `UserProvisioner.resolve(principal, token)` and puts the DB user on the request. Deterministic order, one place, every authenticated route has a user row. `TokenVerifier` remains pure and keeps its own tests. **Amends ADR-010f's wording** ("not in the guard") — the verifier is still separate, but the guard orchestrates both. |
| B. Global interceptor after the guard | Keeps the guard untouched. Nest always runs guards before interceptors, so order is safe, but auth now spans two classes and two places to skip `@Public()`. |
| C. Each controller calls `usersService.resolve()` | Explicit, but can be forgotten → a handler without an owner id. Fails open-ish. |
**Recommendation: A.**

### 011b — What controllers receive
`@CurrentUser()` returns `{ id, sub }` where **`id` is the `User.id` UUID used as `ownerId` everywhere**. Email/name are not on the request object (fetch via `/me` or the users service when needed, e.g. sharing), so handlers can't accidentally trust a stale or unverified email.
**Recommendation: `{ id, sub }`.** Alternative: include `email`, `emailVerified` for convenience.

### 011c — Creating the row safely under concurrency
A new user's SPA may fire several requests at once → two "create" attempts for the same `sub`.
| Option | Notes |
|---|---|
| **A. Prisma `upsert` keyed on `auth0Sub`** | With a single unique field in `where` and no nested writes Prisma issues a native `INSERT … ON CONFLICT`, so parallel first requests can't create duplicates or throw. To be proven with a parallel-request test, not assumed. |
| B. `findUnique`, then `create`, catch unique violation (`P2002`) and re-read | Works, more code paths to test. |
**Recommendation: A**, with the parallel test.

### 011d — When `/userinfo` is called
Per ADR-009: user has never synced, or last sync > 24 h ago. **Schema change:** add `profileSyncedAt DateTime?` (null = never synced).
Concurrency after 24 h: several parallel requests may each call `/userinfo` once. **Recommendation: accept** (rare, bounded per user) rather than add an in-memory single-flight lock (doesn't work across multiple API instances anyway).

### 011e — When `/userinfo` fails
| Case | Options | Recommendation |
|---|---|---|
| **First sign-in**, Auth0 down / timeout / 5xx / 429 | (1) 503, user can't use the app until Auth0 recovers. (2) Create user with no email, `emailVerified=false`, `profileSyncedAt=null`; retry on the next request. | **(2)** — private features don't need email; sharing to this user is impossible until verified, which fails safe. |
| **Stale refresh** fails | (1) Keep stored values, don't bump `profileSyncedAt`, log warning, continue. (2) Set `emailVerified=false` until refresh succeeds (fail closed for sharing). | **(1)** — availability; the sharing risk window is "an email that stopped being verified during an Auth0 outage". Mention (2) as hardening. |
| `/userinfo` returns **401** for a token our guard accepted | (1) 401 `invalid_token` (Auth0 considers the session invalid). (2) Treat as outage. | **(1)** |
| `/userinfo` `sub` ≠ token `sub` | Should never happen. | **Reject → 401, log error.** |
| **Retry storm** while Auth0 is down and user never synced | Every request retries with a timeout → slow requests. Options were: 60 s backoff via extra column, in-memory backoff, or no backoff. | **Decided: 3 s timeout, no backoff.** Trade-off accepted: during an Auth0 outage a never-synced user's requests may each wait up to 3 s. |

### 011f — What is stored
- `email`: **trimmed and lower-cased** so sharing lookups (ADR-006a) are case-insensitive. Alternative: store as returned and compare case-insensitively in queries.
- `emailVerified`: `email_verified === true` only (missing → false).
- `name`: as returned.
- **Not stored:** `picture`, `nickname`, `updated_at`, anything else (data minimisation).
- If Auth0 returns no email → store `null`, `emailVerified=false`.

### 011g — `GET /me` response
| Option | Body |
|---|---|
| **A** | `{ id, email, emailVerified, name }` |
| B | A + `createdAt` |
| C | A + Auth0 `sub` |
**Recommendation: A.** `sub` is an external identifier the SPA doesn't need; `id` is the user's own id (not another user's), so exposing it is fine. Status `200`. No token → `401` (guard). Does not force a `/userinfo` refresh — same 24 h rule as every route.

### 011h — Configuration and HTTP client
- `AUTH_USERINFO_URI` as a **required env var** (consistent with ADR-010d; tests point it at a fake). Alternative: derive `issuer + "userinfo"`.
- Built-in `fetch` with `AbortSignal.timeout(3000)`. No new dependency.
- Prisma: a `PrismaService` using `@prisma/adapter-pg` with required `DATABASE_URL`; app refuses to start without it.

### 011i — How it's tested (needs a DB, overlaps BBL-17)
- `UserInfoClient` is an injectable provider → tests override it with a fake (success, timeout, 401, 5xx, sub mismatch).
- DB tests run against `bookmarks_test`. **Decision needed now (pulls part of BBL-17 forward):** reset strategy.
  - **A. `prisma migrate deploy` once, then `TRUNCATE` all tables before each test; test files run serially.** Simple, realistic (real commits, real constraints). *Recommended.*
  - B. Wrap each test in a transaction and roll back — fast, but the request handling runs its own connection, so hard to make work through HTTP.
  - C. Unique random `sub` per test, never clean — no isolation guarantees.
- Planned tests: first request creates user + syncs; second request within 24 h doesn't call `/userinfo`; after 24 h it does; parallel first requests create exactly one row; each failure case in 011e; email lower-cased; picture not stored; `/me` shape; `/me` without token → 401.

### Implementation notes (found while building ADR-011)
- **Prisma `upsert` is only atomic when `update` is non-empty.** 011c assumed a native `INSERT … ON CONFLICT`. The e2e test "parallel first requests while /userinfo is down" failed (9 of 10 requests → 500). A probe over 200 parallel upserts per variant against Postgres showed: `update: {}` → Prisma issues `SELECT` then `INSERT`, **171/200 failed** with `P2002`; any non-empty `update` → single `INSERT … ON CONFLICT`, **0/200 failed**. The first-sign-in-without-profile path now uses a same-value update (`update: { auth0Sub: sub }`). Restoring `update: {}` makes the test fail again. An earlier single-round probe had shown "10 ok" by luck — one round is not evidence for a race.
- **Mutation-checked** provisioner rules (each change made the e2e suite fail): no 24 h cache, never refresh, no sub-mismatch check, `/userinfo` 401 treated as outage, stale failure overwriting the profile, email not lower-cased.
- **Test DB safety:** e2e setup refuses to run unless the database name is `bookmarks_test` (checked in global setup and before every truncate). Vitest `globalSetup` runs in the main process where `test.env` isn't applied, so the test URL is a shared constant.
- `picture`, `nickname` etc. are not stored because the `User` model has no columns for them; `toProfile` only maps email, email_verified, name.
- **Verified manually:** built app starts against the dev DB and maps `GET /` and `GET /me`; `/me` without token → 401; missing `DATABASE_URL` or `AUTH_USERINFO_URI` → app refuses to start.
- **Verified with a real Auth0 login (2026-09-17)** via `node scripts/inspect-tokens.mjs --api http://localhost:4000/me` against the dev DB (0 users before): real access token → `200 { id, email: "candidate@test.com", emailVerified: true, name: "Candy" }` using the **real** `/userinfo`; real ID token → `401` (audience); no token → `401`. DB row: one user, `auth0Sub` = token `sub`, id = `/me` id, `profileSyncedAt` set. No `/userinfo` warnings; no tokens in logs. Not verified with a real login: the 24 h cache (covered by e2e tests).
- **Timestamp fix found by that check:** `profileSyncedAt` was 13 ms *before* `createdAt` (sync time taken in app code before the insert; `createdAt` defaulted during it). On creation both are now set to the same instant. e2e asserts `profileSyncedAt >= createdAt`; removing the fix fails it 5/5 runs.

## ADR-012 — API contract for `/collections`, `/bookmarks`, `/me` (BBL-12)
**Status.** Accepted — developer, 2026-09-17: all recommendations; 012g follows the brief's resource shape; 012i `?q=` = case-insensitive contains on **title**. Contract written to `API_DESIGN.md` and endpoints/tests follow it. Sharing routes (`/shared/...`) are specified in BBL-15.
**Already decided (inputs).** UUID ids, malformed path id → 404 (004/004a); collection delete cascades, non-empty needs `?confirm=true` else 409 + count (005/005b); same-owner check + composite FK (005a); duplicate names allowed (007); 401/503 rules (010e); `@CurrentUser()` → `{ id, sub }` (011b); length limits: collection name 200, url 2048, title 500, notes 10 000 (007).
**Brief requires.** Both resources: get one, list, create, PUT, PATCH, delete, **filtering**; `GET /collections/:id/bookmarks`; `/me`. Suggested fields include `ownerId`.

> **Details filled in by the agent while writing `API_DESIGN.md` — not individually decided; flagged for developer review.** Error `code` values (`validation_failed`, `unauthorized`, `not_found`, `collection_not_empty`, `internal_error`, `service_unavailable`) and `"type": "about:blank"`; filter values `name`/`q` must be non-empty (empty → 400), `q` max 500 chars; `collectionId=none` as the literal for uncategorised; `confirm` must be exactly `true` (other values → 400); `?confirm=true` on an empty collection is allowed; `Location` header paths; cursor encodes `(createdAt, id)`; 500 body carries no internal details.

### 012a — Error response body
| Option | Example |
|---|---|
| **A. RFC 9457 Problem Details** (`application/problem+json`) | `{ "type": "about:blank", "title": "Not Found", "status": 404, "detail": "Collection not found", "code": "collection_not_found" }`; validation adds `"errors": [{ "field": "url", "message": "must be an http(s) URL" }]` |
| B. Keep Nest default | `{ "statusCode": 404, "message": "Not Found", "error": "Not Found" }` — validation `message` becomes an array of strings |
| C. Custom envelope | `{ "error": { "code": "...", "message": "...", "details": [...] } }` |
**Recommendation: A** — a published standard (easy to defend), one global exception filter formats every error (including 401/503 from the guard), stable machine-readable `code`. The 401 body stays identical for all auth failures (010e).

### 012b — Status codes
| Situation | Recommended |
|---|---|
| GET one / list, PUT, PATCH success | `200` with the resource / list |
| POST success | `201` with the resource + `Location: /collections/{id}` |
| DELETE success | `204` no body |
| Body/query validation failure, malformed JSON, unknown fields | `400` with `errors[]` |
| Not found, not yours, malformed path id | `404`, identical body |
| Delete non-empty collection without `?confirm=true` | `409` with `bookmarkCount` |
| No/invalid token · signing keys down | `401` · `503` |
**Question:** validation `400` (recommended — one code, common) or `422 Unprocessable Content` for well-formed JSON that fails rules?

### 012c — Validation approach
| Option | Notes |
|---|---|
| **A. zod 4 schemas + Nest 12's built-in `StandardSchemaValidationPipe`** | One schema per body/query; `z.strictObject` rejects unknown keys by default; PATCH schema derived from PUT (`.partial()`); TypeScript types inferred from the schema, so validation and types can't drift. zod 4.6.5 (2026-09). |
| B. `class-validator` + `class-transformer` + `ValidationPipe({ whitelist, forbidNonWhitelisted })` | Classic Nest tutorial approach; decorators on DTO classes; relies on decorator metadata; `class-transformer` last released 2022. Easy to forget `forbidNonWhitelisted` and silently strip fields. |
**Recommendation: A.**

### 012d — Unknown and server-owned fields in request bodies
`id`, `ownerId`, `createdAt`, `updatedAt`, or any unknown key in a body.
| Option | Notes |
|---|---|
| **A. Reject with 400** | Client learns immediately that `ownerId` can't be set; nothing silently ignored. |
| B. Silently strip | Lenient, but a client could believe it set `ownerId`. |
**Recommendation: A.**

### 012e — String input rules
- Strings are **trimmed**; empty after trimming → 400 for required fields.
- `notes`: empty after trimming → stored as `null`? **Recommendation: yes** (one representation for "no notes").
- `url`: absolute URL, scheme **`http` or `https` only** — rejects `javascript:`, `data:`, `file:` which would become XSS/abuse vectors when the frontend renders the link. Stored as given (no normalisation, no fetching). Max 2048.
- Max lengths enforced in validation → `400` (not a database error → `500`).

### 012f — PUT vs PATCH semantics
- **PUT = full replacement** of client-editable fields. Collection: `{ name }` required. Bookmark: `{ url, title }` required; `notes`, `collectionId` **optional and default to `null` when omitted** (omitting them clears them). No create-via-PUT: unknown id → 404.
- **PATCH = partial update.** Only provided fields change; `null` clears a nullable field (`notes`, `collectionId`); `null` on a required field → 400. **Empty PATCH body `{}` → 400** (recommended) or 200 no-op?
- Both return `200` with the updated resource.

### 012g — Resource representation
**Follows the brief's suggested shape exactly** (§3.1.4):
- Collection: `{ id, name, ownerId, createdAt, updatedAt }`
- Bookmark: `{ id, url, title, notes, collectionId, ownerId, createdAt, updatedAt }`
- Timestamps ISO 8601 UTC; `notes` / `collectionId` present as `null` when empty (never omitted).

> **Revised 2026-09-17 (developer: "don't go against the brief").** The first draft recommended omitting `ownerId` and adding `bookmarkCount`. Omitting `ownerId` contradicted the brief's suggested shape, so it was withdrawn. `bookmarkCount` would be an addition the brief permits only with justification; it is not needed (the delete popup gets the count from the `409`, ADR-005b), so it is no longer recommended. Proposals are now checked against the brief before being written (rule added to `CLAUDE.md`).

### 012h — List responses and pagination
| Option | Notes |
|---|---|
| **A. Envelope + cursor (keyset) pagination** | `{ "data": [...], "nextCursor": "opaque" \| null }`; `?limit=` default 50, max 100; order `createdAt desc, id desc`; cursor encodes the last `(createdAt, id)`. Stable when items are added/deleted between pages; uses the existing `(ownerId, createdAt)` indexes. |
| B. Envelope + `limit`/`offset` + `total` | Simplest to explain; pages shift when items are inserted; `OFFSET` scans. |
| C. Bare array, no pagination | Simplest; unbounded responses. |
**Recommendation: A.** An invalid or tampered cursor → 400.
**Sorting:** fixed `createdAt desc` (recommended) or an allow-listed `?sort=` (e.g. `createdAt`, `-createdAt`, `title`, `name`)?

### 012i — Filters
- `GET /collections?name=` — case-insensitive **contains** on name.
- `GET /bookmarks?collectionId=<uuid>` — bookmarks in that collection; `?collectionId=none` — uncategorised only.
- `GET /bookmarks?q=` — case-insensitive contains on **title** (full-text over notes stays a bonus) — include or skip?
- **Unknown query parameters → 400** (recommended) or ignored?
- **Filtering by a `collectionId` that isn't yours or doesn't exist:**
  - **A. `200` with an empty list (recommended).** The filter is a WHERE clause scoped to the caller; the response is identical for "not yours", "doesn't exist" and "yours but empty", so nothing leaks, and it needs no extra query.
  - B. `404`, like the nested route.
- **Malformed `collectionId` in the query string:** `400` (it's query validation) — note this differs from malformed *path* ids (404, ADR-004a) — or `404` for consistency?

### 012j — `GET /collections/:id/bookmarks`
Collection not found / not yours / malformed id → `404` (it's a path resource). Otherwise same list envelope, pagination and `q` filter as `/bookmarks`, without `collectionId`.

### 012k — Assigning a bookmark to a collection that isn't yours
On POST/PUT/PATCH `/bookmarks` with a `collectionId` that doesn't exist or belongs to someone else:
- **A. `400` with `errors: [{ field: "collectionId", message: "collection not found" }]` (recommended).** Same response for "doesn't exist" and "not yours" → no leak; and it isn't confused with "the bookmark itself was not found".
- B. `404` — ambiguous on PATCH (`404` normally means the bookmark doesn't exist).

### 012l — The ADR-005b race
A bookmark added between the `409` and the confirmed retry is deleted too.
- **A. Accept and document (recommended)** — single-user data, the window is seconds.
- B. `?confirm=<count>`: delete only if the current count matches, else `409` again. Changes the accepted ADR-005b flag.

### 012m — Other
- Request bodies must be JSON; anything else fails validation → `400` (no separate `415`).
- No ETags / optimistic concurrency (last write wins) — documented as skipped.
- OpenAPI/Swagger: **skip** (contract written by hand in `API_DESIGN.md`) or add `@nestjs/swagger` 12.0.1?

## ADR-013 — Implementation design for `/collections` and shared API plumbing (BBL-13)
**Status.** Accepted — developer, 2026-09-17: all recommendations, including 013d (sequential delete; the race also covers unconfirmed deletes, documented) and 013e (contract amended with `413 payload_too_large`).

### Facts checked before proposing (2026-09-17)
1. **Nest 12 `StandardSchemaValidationPipe` silently skips validation when a parameter has no schema** (`if (!schema) return value` in its source). A plain `@Body()` compiles and accepts anything. Schemas attach via `@Body({ schema })` / `@Query({ schema })`.
2. **Malformed JSON** reaches a global exception filter as `BadRequestException` whose message contains parser internals ("Expected property name or '}' in JSON at position …") — must not be echoed.
3. **Bodies over Express's 100 KB default** raise `PayloadTooLargeError` (status 413), which is *not* a Nest `HttpException` → a naive filter turns it into 500. The contract has no 413.
4. **`text/plain` bodies** arrive as `undefined` → schema validation returns 400 as the contract says.
5. **Prisma** exposes compound unique `id_ownerId` on `Collection` (from `@@unique([id, ownerId])`), so `findUnique` / `update` / `delete` can match id **and** owner in one statement; not found → `null` / `P2025`.
6. Nest's `ParseUUIDPipe` supports `errorHttpStatusCode`, so malformed path ids can return 404 with no custom code.

### 013a — Module layout
- `src/common/` — Problem Details exception filter, validation decorators, UUID path pipe, cursor helpers.
- `src/collections/` — `collections.controller.ts` (HTTP only), `collections.service.ts` (all queries), `collections.schemas.ts` (zod body/query schemas + inferred types), `collections.module.ts`.
**Recommendation:** as above (controller thin, service owns every Prisma call).

### 013b — How every query is scoped to the owner
| Option | Notes |
|---|---|
| **A. Explicit `ownerId` parameter on every service method; every Prisma call includes it** | Reads: `findUnique({ where: { id_ownerId: { id, ownerId } } })`, lists `where: { ownerId, … }`. Writes: `update/delete({ where: { id_ownerId } })` — a single statement, so there's no read-then-write gap. Visible in every line; easy to review and to explain live. |
| B. Per-request Prisma client extension that injects `ownerId` automatically | Central, but "magic": the filter is invisible at the call site, and it must handle every operation type correctly — harder to defend in the live data-access review. |
| C. Postgres Row-Level Security (`SET app.user_id` per transaction + policies) | Strongest (database enforces it even for raw SQL), but every request needs a transaction to set the session variable on a pooled connection; large added complexity. |
**Recommendation: A**, proven by cross-user tests and a mutation check (removing `ownerId` from a query must fail a test).

### 013c — "Not found" handling
- Read: `findUnique` by `id_ownerId` → `null` → 404.
- Update/delete: by `id_ownerId`; Prisma `P2025` (record not found) → 404. No separate existence query.
- Malformed path id → `ParseUUIDPipe({ errorHttpStatusCode: 404 })` → same 404 body (and Postgres never sees a non-UUID string).
**Recommendation:** as above.

### 013d — `DELETE /collections/:id` with the confirm rule (ADR-005b)
Steps are: collection exists for this owner? (404) → has bookmarks and no `confirm`? (409 + count) → delete (cascade).
| Option | Notes |
|---|---|
| **A. Sequential: find → count → delete** | Simple. Race windows both ways: a bookmark added after the count is deleted even when `confirm` was absent (count was 0) or after a 409. Single-user data; window is milliseconds. **Extends the accepted 012l race to the unconfirmed case — needs your OK.** |
| B. Unconfirmed delete as one conditional statement: `deleteMany({ where: { id, ownerId, bookmarks: { none: {} } } })`; if 0 rows → find + count to answer 404 or 409 | Narrows the "deleted without confirmation" window to a single SQL statement. More code paths to test; the exact concurrency guarantee depends on Postgres statement semantics — would be documented as "narrowed", not "eliminated". |
**Recommendation: A** and document the widened race in API_DESIGN.md. Choose B if "never delete a bookmark without confirmation" should be as strict as reasonably possible.

### 013e — Global error filter (and a contract amendment)
One `APP_FILTER` that writes every error as Problem Details (`application/problem+json`):
- `HttpException` → its status, mapped `code`, our own `title`/`detail` — **never** the exception's raw message for 400s from the JSON parser.
- Validation failures → `400 validation_failed` + `errors: [{ field, message }]` built from schema issues.
- Errors carrying a numeric `status` from Express/body-parser (e.g. 413) → that status.
- Anything else → `500 internal_error`, generic body, full error logged server-side.
- Auth `WWW-Authenticate` headers set by the guard are preserved; 401 body stays identical for every cause.
**Contract amendment question — request body larger than 100 KB:**
- **A. Add `413 payload_too_large` to API_DESIGN.md (recommended)** — honest status; notes max 10 000 chars fits well under 100 KB.
- B. Map it to `400 validation_failed`.

### 013f — Guardrail against unvalidated input (fact 1)
| Option | Notes |
|---|---|
| **A. Own decorators `@ValidBody(schema)` / `@ValidQuery(schema)` (schema is a required argument) + a test that fails if any controller parameter uses `@Body`/`@Query` without a schema** | The test reads Nest's route-argument metadata for every registered controller, so it also catches future routes and agent-written code. |
| B. Code review / CLAUDE.md rule only | Relies on remembering. |
| C. Per-parameter explicit pipe `@Body(new ZodPipe(schema))` | Also forces a schema, but bypasses Nest's built-in pipe and still allows a bare `@Body()` elsewhere. |
**Recommendation: A** (also a candidate for the `/.agent/` reusable capability, BBL-24).

### 013g — Cursor format
Opaque `base64url(JSON { "c": createdAt ISO, "i": id })`, decoded and validated with zod; anything malformed → 400. Query: `ownerId` AND (`createdAt` < c OR (`createdAt` = c AND `id` < i)), `ORDER BY createdAt DESC, id DESC`, fetch `limit + 1` to know whether `nextCursor` exists.
| Option | Notes |
|---|---|
| **A. Unsigned** | A tampered cursor can only move within the caller's own rows (query is still scoped by `ownerId`), so it can't leak data. |
| B. HMAC-signed | Detects tampering, needs a secret and key management; no privacy gain. |
**Recommendation: A.**

### 013h — Response mapping
Every query uses an explicit Prisma `select` of exactly the contract fields (`id, name, ownerId, createdAt, updatedAt`), so a future column (e.g. on `User` or `Collection`) can never leak into a response by accident.
**Recommendation:** yes.

### 013i — `name` / `q` filters
Prisma `contains` + `mode: 'insensitive'` (Postgres `ILIKE`). A test must show that `%` and `_` in the filter are matched literally, not as wildcards (to verify, not assume, that Prisma escapes them).

### 013j — CORS (ADR-003)
Contract lists it as not yet implemented.
- **A. Implement now in `main.ts`** (`origin: http://localhost:3000`, methods used by the API, `Authorization` + `Content-Type` headers) with a test — small and already decided.
- B. With frontend integration (BBL-19/20).
**Recommendation: A**, or B if you want BBL-13 strictly scoped to collections.

### 013k — Tests planned (e2e, real DB, two users A and B)
- Every endpoint: happy path; no token → 401 (Problem Details body, identical); **B's collection id used by A → 404 identical to a random UUID and to a malformed id**, for GET, PUT, PATCH, DELETE and `/collections/:id/bookmarks`; lists never contain B's rows.
- Validation: unknown field, `ownerId`/`id`/`createdAt` in body, empty/whitespace name, 201-char name, empty PATCH, `null` name, malformed JSON (no parser text in body), unknown query param, bad `limit`, tampered cursor, >100 KB body.
- Pagination: page sizes, `nextCursor` null on last page, no duplicates/gaps when a new collection is inserted between pages.
- Filters: case-insensitive `name`; `%` / `_` literal; `q` on nested bookmarks.
- Delete: empty → 204; non-empty → 409 + correct count, nothing deleted; `confirm=true` → 204 and bookmarks gone (cascade); `confirm=yes` → 400; B cannot delete A's.
- `Location` header on 201; `Content-Type: application/problem+json` on errors.
- **Guardrail test** (013f) and **mutation checks**: remove `ownerId` from one read and one write → a cross-user test must fail.
- Bookmarks for `/collections/:id/bookmarks` tests are inserted directly with Prisma (the `/bookmarks` endpoints are BBL-14).

### Implementation notes (found while building ADR-013)
- **Prisma `contains` does not escape LIKE wildcards.** 013i said "verify, don't assume". The test failed: `?name=%` returned every collection, `?name=_` matched any character. Not a cross-user leak (query still owner-scoped), but wrong results. Fixed with `containsText()` escaping `\`, `%`, `_`; tests include backslash cases; removing the escaping fails 4 tests.
- **CORS with `origin` as a string echoes that origin to every caller.** Browsers still block mismatches, but the test expecting no header for `https://evil.test` failed. Switched to an array so `cors` compares and omits the header on mismatch.
- **Flaky e2e (≈20% of runs) — root cause found, not retried away.** Symptoms varied: `401` for valid tokens, `404` for existing routes, `Parse Error: Expected HTTP/`, `socket hang up`. Isolated requests (900) never failed. First hypothesis (HTTP keep-alive socket reuse) was tested with `Connection: close` and **disproved** (5/20 failures). Second hypothesis: supertest given an unstarted server listens on a random port on `::` for every request; this Mac has 12 processes (IDE, Postman, Notion, Spotify…) listening on specific `127.0.0.1` ports in the ephemeral range, and a connection to `127.0.0.1:<port>` reaches them instead. Fix: `listenOnLoopback()` starts the app once on `127.0.0.1:0`. Result: 0/20 collections runs, 0/10 full e2e runs, 0/10 unit runs. Applied to all test files; also removed the scaffold's `supertest/types` import, fixing the long-standing tsc error.
- **404 body text is fixed**, not the exception message: `ParseUUIDPipe` says "uuid is expected", which would make a malformed id distinguishable from a not-yours id. Test compares the three 404 bodies for equality.
- **Mutation checks:** removing `ownerId` from `get()`, `update()`, `list()`; skipping the confirm check; removing LIKE escaping; bare `@Body()` on POST (guardrail test fails) — each makes tests fail. **Not caught: removing `ownerId` from the bookmark query inside `listBookmarks()`** — an equivalent mutant: the method first 404s on a collection that isn't the caller's, and the composite FK guarantees every bookmark in the caller's collection has the caller as owner. Kept as a redundant third layer; documented rather than tested with a contrived test.
- **Content-Type** of errors is `application/problem+json`; `Location` exposed via CORS for the SPA.

## ADR-014 — Implementation design for `/bookmarks` (BBL-14)
**Status.** Accepted — developer, 2026-09-17: all recommendations (014b `{ id, ownerId }`, 014c map P2003 → 400, 014d protocol-restricted URL, credentials in URLs allowed).
**Already decided (inputs).** Contract in `API_DESIGN.md` §3–§6 (ADR-012): fields per the brief; PUT omits → `notes`/`collectionId` null; PATCH partial, `null` clears; http/https URLs only; empty notes → null; `collectionId` not the caller's → `400` field error; `?collectionId=<uuid|none>`, `?q=` on title; not-yours filter → empty list. ADR-005a: app check **and** composite FK. ADR-013: explicit `ownerId` on every query, Problem Details, `@ValidBody`/`@ValidQuery`/`@IdParam`, `containsText`, contract-field `select`, cursor pagination — all reused as-is.

### Facts checked before proposing (2026-09-17)
1. **Plain `z.url()` accepts `javascript:alert(1)`, `data:text/html,…`, `file:///etc/passwd`, `ftp://…` and `http:example.com`.** `z.url({ protocol: /^https?$/ })` rejects all of them and still accepts `localhost`, IP addresses, IDN hosts, uppercase schemes and `user:pass@` URLs. Adding zod's domain regex would wrongly reject `http://localhost:3000`, `http://127.0.0.1` and `https://例子.测试`. `z.url()` also trims surrounding whitespace.
2. `Bookmark` has **no** compound unique on `(id, ownerId)` (only `Collection` does), but Prisma's `BookmarkWhereUniqueInput` accepts `id` together with extra filters such as `ownerId`.

### 014a — Module layout
`src/bookmarks/` (`bookmarks.schemas.ts`, `bookmarks.service.ts`, `bookmarks.controller.ts`, `bookmarks.module.ts`). Move `bookmarkSelect` / `BookmarkDto` out of `collections.service.ts` into `src/bookmarks/bookmark.select.ts` so both modules share one definition of the bookmark response.
**Recommendation:** yes.

### 014b — Single-row owner scoping for bookmarks
| Option | Notes |
|---|---|
| **A. `where: { id, ownerId }` in `findUnique` / `update` / `delete`** | Prisma's extended unique where; not found or not yours → `null` / `P2025` → 404, same as collections. No migration. The `ownerId` condition must be proven present by a mutation check (it's easy to drop silently). |
| B. Add `@@unique([id, ownerId])` to `Bookmark` and use `id_ownerId` like collections | Identical call shape to collections; costs a migration and a redundant index (`id` is already the primary key). |
**Recommendation: A.**

### 014c — Checking `collectionId` on POST / PUT / PATCH (ADR-005a, 012k)
When the body sets a non-null `collectionId`:
1. **App check:** `collection.findUnique({ where: { id_ownerId: { id: collectionId, ownerId } } })`; missing → `400` with `errors: [{ field: "collectionId", message: "collection not found" }]` — identical for "doesn't exist" and "someone else's".
2. **Write**, with the composite FK as backstop. If the collection is deleted between check and write, Postgres raises a foreign-key violation (Prisma `P2003`).

| Option for the `P2003` race | Notes |
|---|---|
| **A. Map `P2003` on the bookmark's collection FK to the same `400 collectionId` error** | Client sees the same answer as if the check had failed. Unit-tested with a stubbed Prisma error (the race can't be produced deterministically end to end). |
| B. Let it surface as `500` | Simpler, but a normal (if rare) user race looks like a server bug. |
**Recommendation: A.** Also: `PATCH` that doesn't touch `collectionId` skips the check.
**Note for the mutation check:** removing the app check alone will likely *not* fail e2e tests if A is implemented, because the FK then raises `P2003`, which maps to the same `400` — defense in depth makes that mutant equivalent from the API's view. The check stays for clear intent and to avoid relying on constraint errors; this will be documented honestly.

### 014d — URL validation (fact 1)
| Option | Notes |
|---|---|
| **A. `z.url({ protocol: /^https?$/ })`, max 2048, stored as given (after trim)** | Blocks script/data/file schemes; allows localhost/IP/IDN. |
| B. A + zod domain regex | Rejects valid `localhost`, IP and IDN URLs. |
| C. Plain `z.url()` | ❌ Accepts `javascript:` → stored XSS when the UI renders the link. |
**Recommendation: A.**
**Question — credentials in URLs** (`https://user:pass@host`): **A. allow (recommended)** — it's the owner's own private data and the contract says "stored as given"; B. reject with 400 to avoid storing secrets in plain text.

### 014e — Tests planned (e2e, real DB, users A and B; unit where noted)
- CRUD happy paths with exact contract keys, `Location`, trimming, `notes` whitespace → `null`.
- **Cross-user:** GET/PUT/PATCH/DELETE on B's bookmark → 404 identical to random and malformed ids, B's row verified untouched; list never contains B's rows.
- **Collection assignment:** POST/PUT/PATCH with B's `collectionId` → 400 identical to a random UUID (and nothing written); own collection → OK; move between own collections; PATCH `collectionId: null` uncategorises; PUT without `collectionId` uncategorises; malformed `collectionId` in body → 400.
- **P2003 mapping:** unit test with a stubbed Prisma error → 400 `collectionId`.
- **URL:** `javascript:`, `data:`, `file:`, `ftp:`, relative, scheme-less, `http:example.com`, 2049 chars → 400; `localhost`, IP, IDN, uppercase scheme → accepted.
- **Filters:** `collectionId=<own>`, `collectionId=none`, `collectionId=<B's>` → empty, malformed → 400, `q` case-insensitive and literal `%`; combined with pagination.
- **Validation:** `ownerId`/`id`/timestamps/unknown keys rejected; PATCH `{}`, `title: null`, `url: null` → 400; limits (title 500, notes 10 000).
- **Mutation checks:** drop `ownerId` from get/update/delete/list → tests fail; drop the app collection check → expected equivalent (see 014c), documented.

### Implementation notes (found while building ADR-014)
- **Probed before coding:** a violation of the composite FK through `@prisma/adapter-pg` is `P2003` with `meta.driverAdapterError.cause.constraint.index = "Bookmark_collectionId_ownerId_fkey"`; updates/deletes with `where: { id, ownerId }` for the wrong owner raise `P2025`; `findUnique` returns `null`. Only that named constraint is mapped to the `collectionId` 400; a unit test proves another FK violation is not mislabelled.
- **All 120 e2e + 64 unit tests passed on the first run**, so mutation checks were run before trusting them. Caught: removing `ownerId` from get/replace/patch/delete/list; `collectionId=none` ignored; PUT not nulling omitted fields; empty notes not nulled; **plain `z.url()` (6 failures)**; FK mapping removed or not checking the constraint name (unit tests).
- **Equivalent mutant, as predicted in 014c:** removing the app-level collection check changes no API response, because the composite FK raises `P2003`, which maps to the same 400. To show this is two real layers rather than one dead check, both were removed together → 3 e2e tests fail (the database still refused the cross-owner write; it surfaced as 500).
- `bookmarkSelect` moved to `src/bookmarks/bookmark.select.ts`, shared with the collections nested list.

---

> **Pre-approval (developer, 2026-09-17):** "let's finish up the backend, we can go with your recommendations. I will review the result once we are able to test full backend." ADR-015–017 below were therefore written as proposals with a recommendation and implemented without a separate decision round. Each lists the alternatives so the developer can overturn any of them during review. Every option was checked against the brief first.

## ADR-015 — Sharing: routes and behaviour (BBL-15)
**Status.** Accepted — pre-approved agent recommendation.
**Inputs (accepted earlier).** ADR-006a–g: read-only share to an existing user with a verified email, named by email, stored by user id; unknown/unverified → 404 (enumeration accepted); self-share → 400; recipients read only under `/shared/...`; owner routes never consult shares; recipients see name, bookmarks (incl. notes) and owner email, never other users' internal ids or other recipients.
**Brief check.** The brief's §3.3 leaves sharing open and defines resource shapes only for `/collections` and `/bookmarks`; those routes and shapes are unchanged. Shared routes are an extension.

### 015a — Routes
| Method & path | Who | Result |
|---|---|---|
| `POST /collections/:id/shares` `{ email }` | owner | `201` Share + `Location` |
| `GET /collections/:id/shares` | owner | `200` list of Share (cursor pagination) |
| `DELETE /collections/:id/shares/:shareId` | owner | `204` |
| `GET /shared/collections` | recipient | `200` list of SharedCollection |
| `GET /shared/collections/:id` | recipient | `200` SharedCollection |
| `GET /shared/collections/:id/bookmarks` | recipient | `200` list of SharedBookmark (`q`, cursor) |
*Alternatives considered:* share management under `/shares` (top-level) — rejected: shares only exist inside a collection, and nesting keeps the owner check identical to other collection routes.

### 015b — Response shapes
- **Share** (owner view): `{ id, collectionId, email, createdAt }` — `email` is the recipient's current stored email (the owner typed it). No recipient user id.
- **SharedCollection** (recipient view): `{ id, name, ownerEmail, sharedAt, createdAt, updatedAt }` — **no `ownerId`** (ADR-006e: never other users' internal ids). `ownerEmail` may be `null` if the owner's profile was never synced.
- **SharedBookmark**: `{ id, url, title, notes, collectionId, createdAt, updatedAt }` — **no `ownerId`**.
*Alternative:* reuse the brief's Collection/Bookmark shapes including `ownerId` — rejected because it contradicts accepted ADR-006e; the brief's shapes still apply unchanged to the owner routes.

### 015c — Status codes and rules
| Situation | Response |
|---|---|
| Collection doesn't exist / not the caller's / malformed id (owner routes) | `404 not_found` (checked **first**, before looking at the email) |
| `email` missing or not an email | `400 validation_failed` |
| No user with that email and `emailVerified = true` | `404 recipient_not_found` (ADR-006c) |
| More than one verified user with that email (possible: `User.email` isn't unique, e.g. two Auth0 connections) | `409 ambiguous_recipient` — fail closed rather than guess *(alternative: share with all matches)* |
| Recipient is the caller | `400 validation_failed`, field `email`, "cannot share a collection with yourself" |
| Already shared with that user | `409 already_shared` *(alternative: idempotent `200` with the existing share)* |
| Revoke a share id that isn't on this collection | `404 not_found` |
| Recipient route for a collection not shared with the caller (including the caller's **own** collection) | `404 not_found`, identical to random/malformed ids |
- Email compared **trimmed and lower-cased** (ADR-011f storage).
- Verification is checked at share time only (ADR-006g); stored emails may be up to 24 h stale (ADR-009).
- Recipient access is revoked immediately by deleting the share; collection deletion cascades shares.
- **Read-only is structural:** the shared controller has only `GET` handlers (enforced by a guardrail test), and owner routes never read `CollectionShare`, so a recipient's PUT/PATCH/DELETE on `/collections/:id` or `/bookmarks/:id` is a `404`.

### 015d — Where the exception lives
`src/shares/` for owner share management (owner-scoped like collections); `src/shared/` for recipient reads — **the only code that grants access via `CollectionShare`**. Every recipient query filters `shares: { some: { granteeUserId: callerId } }`.

### 015e — Tests
Share create (201, lower-cased match, Location), unknown email / unverified user → 404 `recipient_not_found`, ambiguous → 409, self → 400, duplicate → 409, non-owner (B's collection) → 404 before email lookup; list/revoke owner-only; recipient list/get/bookmarks; not-shared and own collection on `/shared` → identical 404; recipient cannot PUT/PATCH/DELETE the owner's collection or bookmarks (404) nor re-share (404); revoke removes access; deleting collection removes access; no `ownerId`/grantee ids in shared responses; guardrail: shared controller GET-only. Mutation checks on the grantee filter.

## ADR-016 — Seed data (BBL-16)
**Status.** Accepted — pre-approved agent recommendation. **Brief:** "Seed data for at least two distinct users."
- **Users:** the real Auth0 test user (`auth0|62e089faea483987422db6cc`, `candidate@test.com`, verified — observed in BBL-9) so logging in shows data; plus two seed-only users `seed|user-b` (`user-b@example.com`) and `seed|user-c` (`user-c@example.com`), both verified. *(Alternative: only fake users — the real login would see an empty app.)*
- **Data:** each user gets collections with bookmarks plus uncategorised bookmarks; `user-b` shares one collection with the test user, the test user shares one with `user-b`, so both sharing views have data.
- **Idempotent and non-destructive:** seed-only users are recreated from scratch each run; the real test user's data is added **only if that user has no collections yet**, so re-seeding never deletes what was created manually. *(Alternative: wipe everything — rejected, destroys manual testing data.)*
- **Run:** `npx prisma db seed` (configured in `prisma.config.ts`, `tsx prisma/seed.ts`). The seed logic is an exported function, tested twice in a row against the test DB.

## ADR-017 — Route-wide authentication sweep (BBL-18)
**Status.** Accepted — pre-approved agent recommendation.
A test enumerates every registered route (controllers via Nest's `DiscoveryService`, paths and methods from route metadata), calls each without a token and expects `401`. New routes are covered automatically. Complements the validation guardrail (ADR-013f).

### Implementation notes (ADR-015, ADR-017)
- All 17 sharing tests passed on the first run → mutation-checked before trusting. **Caught (13):** no grantee filter on shared list/get; own collections visible via `/shared`; skipping the 404 check before shared bookmarks; `ownerId` leaking into the recipient DTO; share create without ownership check, with unverified recipients, without self-check, with `take: 1` (ambiguity undetected); share list/revoke without owner filter; revoke without `collectionId` filter. **Equivalent (1):** removing the grantee filter from the shared *bookmark* query — the preceding `get()` already 404s for collections not shared with the caller; kept as a redundant layer (same pattern as ADR-013's `listBookmarks`).
- Owner share routes check collection ownership **before** looking up the email, so `recipient_not_found` is only observable on your own collections (test: someone else's collection returns the generic 404 for both valid and unknown emails).
- ADR-017 sweep: routes discovered from `@Controller`/`@Get` metadata (8 known routes asserted present so the sweep can't pass vacuously); every route → 401. Mutations: `@Public()` on `GET /me` → sweep reports `GET /me → 500`; a `@Delete` added to `SharedController` → GET-only test fails.
- `IdParam(name)` now accepts a parameter name (`:shareId`).

### Implementation notes (ADR-016)
- **Idempotency bug found by the test:** the second run lost a share. Recreating seed user B cascaded away the share the candidate had granted to the old B row, and the candidate block (skipped on re-runs) never recreated it. Fixed by upserting that share on every run.
- **Useless assertion caught in review:** the first "bookmark owner matches collection owner" check was a Prisma filter that always counted 0. Replaced with a SQL join, and proved it detects a planted mismatch (FK dropped inside a rolled-back transaction).
- Ran `npx prisma db seed` twice on the dev DB: identical counts (candidate 3 collections / 6 bookmarks; B 2 / 4; C 1 / 1).
- The Postman guide's separate `seed-user-b.sql` user was replaced by the seed (a second "user B" with a similar email could have made sharing ambiguous); `scripts/manual-test/print-seed-ids.sql` prints the ids.
- **Fresh-clone check:** cloned the repo into a scratch folder, then `npm ci` → build fails until `npx prisma generate` → then build, 64 unit and 140 e2e tests pass. README documents the generate step.

---

> The pre-approval above covered the backend only. Frontend decisions return to propose → developer decides → implement.

## ADR-018 — Frontend architecture (BBL-19 to BBL-22)
**Status.** Accepted — developer, 2026-09-17: all recommendations (018j refines ADR-007: duplicate check asks the API).
**Brief (§3.2), non-negotiable:** React + Vite + TypeScript (no Next.js); React Router ≥ 8; MUI ≥ 9; integrates with our API; pages `/collections` (list, view one, create, delete) and `/bookmarks` (list, view details, create, delete, filter by collection). Auth: Authorization Code + PKCE (S256), callback `http://localhost:3000/callback`, logout `http://localhost:3000`, scope `openid profile email`, audience `https://bbl-candidate-test-api`.
**Already decided:** frontend on port 3000 (ADR-003); API sends access token as Bearer (ADR-008); delete confirmation popup with bookmark count (ADR-005/005b); duplicate-name warning popup, case-insensitive (ADR-007).

### Facts checked (2026-09-17)
- Latest stable: Vite 8.3, React 19.3, React Router 8.4, MUI 9.4 (+ Emotion 11), `@auth0/auth0-react` / `@auth0/auth0-spa-js` 2.26, TanStack Query 5.103, MSW 2.15, Playwright 1.63. Peer dependencies are compatible (React Router needs React ≥ 19.2.7; Auth0 React accepts ^19.2.1).
- `@auth0/auth0-spa-js` 2.26 source: only `response_type: "code"` with `code_challenge_method: "S256"` (no implicit); validates ID token `iss`/`aud`/nonce; without refresh tokens, silent renewal uses a hidden iframe (`prompt=none`, `response_mode=web_message`), which needs the Auth0 app's *Allowed Web Origins* to include `http://localhost:3000` and third-party cookies — **unknown for this tenant; to verify during implementation**. BBL-9 showed no refresh token without `offline_access`.

### 018a — Scaffold
`npm create vite@9.2.1 frontend -- --template react-ts`, committed unmodified (like the backend), then pin versions exactly (ADR-001 policy). Vite dev server `port: 3000, strictPort: true`.
**Recommendation:** yes.

### 018b — React Router mode
| Option | Notes |
|---|---|
| **A. Data mode: `createBrowserRouter` + `RouterProvider`** | Plain SPA, route objects, nested layouts, `errorElement`s; works with any data library. |
| B. Declarative mode (`<BrowserRouter>` + `<Routes>`) | Simplest, but no route-level error boundaries/loaders. |
| C. Framework mode (React Router's Vite plugin, file routes, SSR-capable) | Closest to a "framework"; heavier, more to explain; not needed for a private SPA. |
**Recommendation: A.**

### 018c — Authentication library
| Option | Notes |
|---|---|
| **A. `@auth0/auth0-react`** | Official; PKCE S256 + code flow only (verified in source); handles the callback, token caching, `getAccessTokenSilently({ authorizationParams: { audience } })`, logout with `returnTo`. |
| B. `oidc-client-ts` + `react-oidc-context` | Generic OIDC, tenant-agnostic; more configuration; Auth0's `audience` must be passed as an extra param. |
| C. Hand-rolled PKCE (like `scripts/inspect-tokens.mjs`) | Maximum control and explainability; we'd own state/nonce/ID-token validation and renewal — easy to get subtly wrong. |
**Recommendation: A.**

### 018d — Token storage and session renewal
| Option | Notes |
|---|---|
| **A. In memory (SDK default), no refresh tokens** | Token never touches `localStorage` (not readable by injected scripts after a reload). On page reload the SDK tries silent renewal; if the tenant blocks it, the app redirects to Auth0, which returns immediately while the Auth0 session cookie is valid. |
| B. `localStorage` cache | Survives reloads without a redirect; any XSS can read the token. |
| C. Refresh tokens (`useRefreshTokens` + `offline_access`) | Smooth renewal without iframes, but requires refresh-token rotation to be enabled on a tenant we don't control; unverified. |
**Recommendation: A**, and verify silent renewal on this tenant; document what happens on reload.

### 018e — Server data
| Option | Notes |
|---|---|
| **A. TanStack Query + a small typed API client** | Caching, loading/error states, mutation → invalidate list; token obtained per request from the Auth0 hook. Widely known. |
| B. React Router loaders/actions | Built into the required router; loaders run outside React, so the Auth0 token getter must be passed in; revalidation after actions is automatic. |
| C. `fetch` in `useEffect` | No dependency; re-implements caching, races, and error states by hand. |
**Recommendation: A.**

### 018f — API client
Hand-written TypeScript types mirroring `API_DESIGN.md` (no OpenAPI to generate from); one `apiFetch` that adds `Authorization: Bearer`, parses Problem Details into a typed `ApiError { status, code, detail, errors, bookmarkCount }`, and on `401` sends the user to login. Base URL from `VITE_API_BASE_URL`; Auth0 domain/client id/audience from `VITE_*` env (public values, `.env.example` committed).
**Recommendation:** yes.

### 018g — Pages and routes
| Route | Content |
|---|---|
| `/` | redirect to `/collections` |
| `/callback` | Auth0 redirect target; shows "Signing in…" then returns to the page the user started from |
| `/collections` | list (paginated), create dialog, delete |
| `/collections/:id` | view one: name, rename, its bookmarks, delete |
| `/bookmarks` | list, **filter by collection** (incl. "Uncategorised") and title search, create dialog, delete |
| `/bookmarks/:id` | details, edit, move to collection, delete |
All routes except `/callback` require login (redirect to Auth0 otherwise). Shared-collection pages are BBL-23 (after this ADR).
**Question:** "view one" / "view details" as **routes (recommended — linkable, back button works)** or as dialogs/drawers on the list page?

### 018h — Filter state
`/bookmarks?collectionId=<id|none>&q=` kept in the **URL search params** (recommended — shareable, survives reload, back button) vs component state.

### 018i — Delete-collection confirmation flow (ADR-005/005b)
| Option | Notes |
|---|---|
| **A. Confirm, then let the API decide:** dialog "Delete *X*?" → `DELETE` → `204` done; `409` → dialog updates to "*X* contains **N** bookmarks. Delete them too?" → `DELETE ?confirm=true` | Exact count from the API; empty collections need one confirmation, non-empty two. No extra request. |
| B. Count first via `GET /collections/:id/bookmarks?limit=100`, one dialog | One dialog, but the count is "100+" for large collections and can be stale. |
**Recommendation: A.**

### 018j — Duplicate collection name warning (ADR-007)
The list is paginated, so "loaded collections" may not include the duplicate.
- **A. Before create/rename, call `GET /collections?name=<name>` and compare trimmed, case-insensitive for an exact match (recommended)** — accurate; one extra request only when saving. *Refines ADR-007's "compare against loaded collections".*
- B. Compare against loaded pages only, as ADR-007 says — can miss duplicates.

### 018k — Rendering user content safely
Bookmark URLs rendered as links only if the scheme is `http`/`https` (defence in depth over the API rule), with `target="_blank" rel="noopener noreferrer"`; everything else rendered as text through React (no `dangerouslySetInnerHTML`).
**Recommendation:** yes.

### 018l — UI kit usage
MUI 9 with `CssBaseline`, default theme plus a small palette, Emotion (MUI's default engine), `@mui/icons-material`. No other CSS framework.
**Recommendation:** yes.

### 018m — Frontend tests
| Option | Notes |
|---|---|
| **A. Vitest + React Testing Library + MSW (mocked API, mocked Auth0 hook)** for components and flows (delete dialog 204/409, duplicate warning, filters in URL, 401 → login, unsafe URL rendered as text); **plus a manual real-login checklist** | Fast, deterministic; auth mocked at the hook boundary. |
| B. A + Playwright against the real backend with a locally-signed token (test-only auth bypass) | End-to-end UI + API; needs a test-only way into the app, which must never ship. |
| C. Playwright with the real Auth0 login | Truest, but the agent must never type the password, and it depends on the tenant in CI. |
**Recommendation: A** now; decide B later if time allows.

### Implementation notes (ADR-018)
- **Scaffold had no `"strict": true`** in `tsconfig.app.json`; enabled before writing code.
- **Install scripts denied after reading them:** `browser-tabs-lock` (Auth0 SDK dependency) only prints a promotional message; `msw` copies a browser worker only when configured (tests use MSW in Node); `fsevents` is optional.
- **Checked APIs instead of assuming:** React Router 8 exports (`RouterProvider` from `react-router`); MUI icon is `DeleteOutlined` (`DeleteOutline` doesn't exist, caught by tsc); `getAccessTokenSilently` is typed `string | undefined`, so the client refuses to send `Bearer undefined`.
- **Lint `set-state-in-effect`:** form dialogs reset their fields in effects. Replaced with mounting dialogs only while open (`key` for per-item dialogs), initialising state from props.
- **Correction of a claim in commit `736fc77`.** That commit said `CollectionSelect` "would have uncategorised bookmarks whose collection is outside the first 100 on save". Mutation testing showed this was wrong: restoring the old coercion did not change the saved `collectionId` (the form keeps its own state; the select only displays it). The real defect was misleading UI: the edit form showed "No collection" for a bookmark that has one. The regression test now asserts what the user sees ("Current collection"), and fails against the old code.
- **Frontend tests (27):** API client (Bearer, query encoding, 204, Problem Details → `ApiError`, non-Problem bodies, 401 → login); `SafeLink` (http/https links with `rel="noopener noreferrer"`; `javascript:`/`data:`/garbage as text); `/collections` delete flow (empty → one confirm; 409 → exact count → `confirm=true`; cancel after 409 deletes nothing), duplicate warning (exact case/space-insensitive match warns, "Save anyway" creates; contains-only doesn't warn), not-found message; `/bookmarks` filters from/to URL, API field errors in the form, collection kept when outside loaded options, unsafe stored URL rendered as text; auth (unauthenticated → login with `returnTo` incl. query, no API calls; 401 → login; token requested for the API audience; logout `returnTo` origin).
- **Mutation checks (11):** always `confirm=true`; ignoring the 409; `contains` instead of exact duplicate match; skipping the duplicate check; any URL scheme as link; `collectionId` not written to the URL; select coercion (caught after the test fix); `returnTo` without query; token without audience; 401 not redirecting; logout without `returnTo`. All caught.
- **Real-login checklist passed (developer, 2026-09-17)** — `docs/FRONTEND_MANUAL_TESTING.md` sections A–E: PKCE authorize parameters, code exchange, Bearer access token, no tokens in browser storage, collections/bookmarks page actions from the brief, delete-with-count and duplicate flows, filters in URL, `javascript:` URL rejected, UI privacy smoke tests with seed ids, logout.
- **ADR-018d reload outcome (observed):** reloading a page **stays signed in** without a visible redirect, so the SDK's silent renewal (hidden iframe, `prompt=none`) works on this tenant from `http://localhost:3000`. Tokens remain in memory only. Caveat: this depends on the browser allowing Auth0's cookie in that iframe; a browser that blocks third-party cookies would fall back to a quick redirect through Auth0 (already handled by `RequireAuth`).

## ADR-019 — Sharing UI (BBL-23)
**Status.** **Proposed** — awaiting developer decision. Nothing implemented.
**Inputs.** API from ADR-015 (`/collections/:id/shares`, `/shared/collections`…); recipient data has `ownerEmail`, `sharedAt`, no `ownerId`; recipients are read-only (ADR-006f); patterns from ADR-018 (routes as pages, TanStack Query hooks, dialogs mounted only while open, components under `src/components/<area>/`).
**Brief check.** §3.3 leaves sharing to us; the two required pages are unchanged.

### 019a — Where recipients find shared collections
| Option | Notes |
|---|---|
| **A. New nav item "Shared with me" → `/shared` (list) and `/shared/:id` (collection + bookmarks)** | Mirrors the API split: owner pages never mix in shared data, just as owner routes never consult shares (ADR-006d). |
| B. Section at the bottom of `/collections` | Fewer pages, but mixes owned and read-only items on a page whose actions (delete, rename) don't apply to them. |
**Recommendation: A.**

### 019b — Where owners manage sharing
| Option | Notes |
|---|---|
| **A. "Share" button on `/collections/:id` → dialog: email field + list of current shares (email, date, revoke)** | Sharing happens in the context of one collection; no new route. |
| B. Separate page `/collections/:id/shares` | Linkable, but a whole page for one field and a short list. |
**Recommendation: A.** The share list inside the dialog uses the paginated API with "Load more".

### 019c — Messages for share errors
| API response | UI message |
|---|---|
| `400` field `email` (invalid) | field error under the email input |
| `400` "cannot share a collection with yourself" | field error: "You can't share a collection with yourself." |
| `404 recipient_not_found` | "No account with a verified email matches this address." (enumeration accepted, ADR-006c) |
| `409 already_shared` | "This collection is already shared with that person." |
| `409 ambiguous_recipient` | "More than one account uses this email, so it wasn't shared." |
| other | generic error text (never raw details) |
**Recommendation:** as above.

### 019d — Revoking
**A. Confirmation dialog ("Stop sharing with x@y? They lose access immediately.") (recommended)** vs B. immediate revoke with no confirmation.

### 019e — Read-only presentation for recipients
- `/shared`: collection name, "Shared by `ownerEmail`" (or "Shared by unknown owner" if null), shared date. No rename/delete.
- `/shared/:id`: name, owner email, a **"Read-only"** chip, bookmarks with title, safe URL link and **notes shown inline**. No edit/delete/add buttons, and titles don't link to `/bookmarks/:id` (that owner route would 404 for a recipient). Title search `q` available.
- A collection that isn't shared with you (or was revoked): "Not found. It may have been deleted, or it's no longer shared with you."
**Recommendation:** as above.

### 019f — Components
`src/components/shares/ShareDialog.tsx` (owner), `src/components/shared/SharedCollectionList.tsx`, `SharedBookmarkList.tsx` (recipient); pages `SharedCollectionsPage`, `SharedCollectionPage`; hooks `src/api/shares.ts`, `src/api/shared.ts`.

### 019g — Tests (MSW + mocked Auth0)
Share success clears the input and lists the share with a lower-cased email; each 019c error mapping; revoke asks for confirmation and removes the row; `/shared` shows the owner email and **no** rename/delete buttons; `/shared/:id` shows notes and the Read-only chip, **no** edit/delete/add buttons and no links to `/bookmarks/:id`; unsafe URL still text-only; not-shared → 404 message; nav contains "Shared with me". Mutation-check afterwards. Manual checklist additions for a real login (seed: B shares "Team reading list" with the candidate).
