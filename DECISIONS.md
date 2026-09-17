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
