# DECISIONS

Short ADRs for the calls the brief left open. Each one: **Context · Decision · Trade-off · Decided by · Steering** (how the agent was made to implement that decision instead of its default — a rule in `CLAUDE.md`, a test, or a mutant in `.agent/mutants/`).

**Process.** The agent proposes options with a recommendation; the developer decides; only then is it implemented. Two developer interventions shaped this, and a later blanket approval:

- **"Don't design on your own"** (2026-09-17). The agent had committed a schema containing unapproved sub-decisions (`5431329`). Those were reclassified as proposals (`e781d58`) and the rule went into `CLAUDE.md`. On review the developer **overrode** two of them (005b, 006c), which changed the schema (006g).
- **"Don't go against the brief"** (2026-09-17). The agent proposed omitting `ownerId` from responses although the brief's suggested shape includes it. Reverted (`b327dd6`); proposals are now checked against the brief first.
- For the remaining backend work and the bonuses the developer pre-approved the agent's recommendations ("go with your recommendations"); those ADRs still list the alternatives so they can be overturned.

| ADR | Decision | Decided by |
|---|---|---|
| [001](#adr-001--pin-dependency-versions) | Pin dependency versions exactly | Developer (agent rec.) |
| [002](#adr-002--drop-vendor-agent-skills) | Drop the agent skills `prisma init` installed | Developer (agent rec.) |
| [003](#adr-003--ports-and-cors) | Frontend 3000, API 4000, CORS allow-list | Developer (agent rec.) |
| [004](#adr-004--uuid-ids-and-malformed-ids) | UUID v4 ids; malformed id → 404 | Developer |
| [005](#adr-005--deleting-a-collection) | Delete cascades to bookmarks, with confirmation | Developer |
| [006](#adr-006--sharing-a-collection) | Read-only sharing to a verified user, by email | Developer |
| [007](#adr-007--schema-details) | User row per Auth0 `sub`; duplicate names allowed | Developer |
| [008](#adr-008--which-token-the-api-accepts) | API accepts the access token | Developer (agent rec.) |
| [009](#adr-009--where-email-comes-from) | Email from `/userinfo`, refreshed every 24 h | Developer (agent rec.) |
| [010](#adr-010--authentication-guard) | Global jose guard, RS256 only | Developer (agent rec.) |
| [011](#adr-011--user-provisioning-and-me) | Guard provisions the user; `GET /me` | Developer (agent rec.) |
| [012](#adr-012--api-contract) | Problem Details, zod, cursor paging, brief's shapes | Developer (agent rec.) |
| [013](#adr-013--collections-implementation) | Explicit owner scoping; validation guardrail | Developer (agent rec.) |
| [014](#adr-014--bookmarks-implementation) | `{ id, ownerId }` writes; http(s)-only URLs | Developer (agent rec.) |
| [015](#adr-015--sharing-api) | Owner `/shares`, recipient read-only `/shared` | Developer (pre-approved) |
| [016](#adr-016--seed-data) | Real test user + 2 seed users, idempotent | Developer (pre-approved) |
| [017](#adr-017--route-wide-auth-sweep) | Test: every route → 401 without a token | Developer (pre-approved) |
| [018](#adr-018--frontend-architecture) | React Router data mode, Auth0 SDK, TanStack Query | Developer (agent rec.) |
| [019](#adr-019--sharing-ui) | Share dialog + "Shared with me" pages | Developer (agent rec.) |
| [020](#adr-020--bonuses) | Docker, `/all` page, full-text search (no CI) | Developer (pre-approved) |

Everything "proved by" below is runnable: `npm test` / `npm run test:e2e` in `backend/`, `npm test` in `frontend/`, and `.agent/scripts/mutation-check.sh`. Where the agent's first attempt was wrong: `API_DESIGN.md` §9.

---

## ADR-001 — Pin dependency versions
**Context.** `prisma@latest` was an 8.0 release candidate while `@prisma/client@latest` was 7.10; `typescript@latest` (7.x) broke the Nest CLI and ts-jest.
**Decision.** Exact pins: Prisma / `@prisma/client` / `@prisma/adapter-pg` `7.10.0`, TypeScript `6.0.x`.
**Trade-off.** No automatic updates; bumps are deliberate.
**Steering.** `CLAUDE.md`: never `npm i <pkg>@latest` without checking dist-tags first.

## ADR-002 — Drop vendor agent skills
**Context.** `prisma init` silently downloaded 9 skills from `github.com/prisma/skills` into the repo, several for products we don't use.
**Decision.** Not committed. Agent context lives only in `CLAUDE.md` and `/.agent/`.
**Trade-off.** Agents lose vendor guidance; in exchange every instruction in this repo is one we wrote and reviewed.

## ADR-003 — Ports and CORS
**Context.** The Auth0 client fixes the callback to `http://localhost:3000`.
**Decision.** Frontend on 3000, API on 4000, CORS allow-list containing only `http://localhost:3000`.
**Trade-off.** CORS to configure and explain; in exchange dev mirrors a real deployment with separate origins. A Vite proxy was the alternative.
**Proved by.** `api-guardrails.e2e-spec.ts`: allowed origin passes, other origins get no header.

## ADR-004 — UUID ids, and malformed ids
**Context.** The invariant includes "must not learn of the existence of" another user's data.
**Decision.** UUID v4 primary keys. **004a:** a malformed path id returns `404`, identical to not-found and not-yours.
**Trade-off.** Sequential ids would leak activity volume; a `400` for a malformed id would be friendlier but distinguishable.
**Steering.** Fixed `detail` text in the error filter — `ParseUUIDPipe`'s own message ("uuid is expected") would have given it away.
**Proved by.** Collections and bookmarks e2e compare the three 404 bodies for equality.

## ADR-005 — Deleting a collection
**Context.** §3.3 "A user can delete a collection" — cascade, orphan the bookmarks, or block?
**Decision.** Deleting a collection deletes its bookmarks and shares. The UI confirms first and shows how many bookmarks will go.
- **005a** same-owner integrity enforced twice: a service lookup by `id + ownerId`, and a composite FK `Bookmark(collectionId, ownerId) → Collection(id, ownerId)`.
- **005b** the API guards too: a non-empty collection needs `?confirm=true`, else `409` with `bookmarkCount` — the developer **overrode** the agent's "no API flag".
**Trade-off.** Confirmed deletion is permanent (no undo); a bookmark added between the count and the delete is deleted too (accepted, documented).
**Proved by.** Delete tests (204 / 409 + count / `confirm=yes` → 400 / cascade) and the owner-scoping mutants.

## ADR-006 — Sharing a collection
**Context.** §3.3 "A user may want to share a collection with someone else" — in an app whose invariant is that nothing is shared.
**Decision.** One narrow exception: an owner shares **one collection, read-only**, with an **existing user whose email is verified**.
- **006a** recipient named by email · **006b** verified email required · **006c** no eligible recipient → `404 recipient_not_found` (developer **overrode** the agent's no-enumeration alternative)
- **006d** recipients read only under `/shared/...`; owner routes never consult shares · **006e** recipients see the name, the bookmarks (incl. notes) and the owner's email — never other users' ids or other recipients · **006f** owner-only management, no editing, no re-sharing, cascade on delete · **006g** the share stores the recipient's **user id**, resolved from the email at share time, so access follows the account
**Trade-off.** Any signed-in user can learn whether an email belongs to a verified account (accepted; no rate limiting). Verification is checked at share time only.
**Steering.** Invariant restated in `CLAUDE.md`; `SharedService` is the only code allowed to read `CollectionShare`.
**Proved by.** `sharing.e2e-spec.ts` (17 tests) and 4 sharing mutants.

## ADR-007 — Schema details
**Context.** The brief suggests fields but leaves identity, limits and duplicates open.
**Decision.** A `User` row per Auth0 `sub`, created on the first authenticated request. Length limits (name 200, url 2048, title 500, notes 10 000). **Duplicate collection names are allowed**, with a UI warning before saving (refined by ADR-018j: the check asks the API). Indexes on `(ownerId, createdAt)` and `(ownerId, collectionId)`. Separate `bookmarks_test` database.
**Trade-off.** Duplicate names can confuse; a unique constraint would have meant a 409 for a harmless case.

## ADR-008 — Which token the API accepts
**Context.** The brief deliberately doesn't say; the tenant issues both.
**Decision.** The **access token** for audience `https://bbl-candidate-test-api`.
**Rationale (the README one-liner).** Access tokens are issued *for* an API (`aud` = this API); ID tokens prove a login to the client app, not authorisation to call an API.
**Trade-off.** Access tokens carry no email, which forced ADR-009; the SPA must request the `audience`.
**Proved by.** A real login (`docs/auth0/TENANT_FINDINGS.md`): access token → 200, ID token → 401; unit tests reject an ID token's `aud`.

## ADR-009 — Where email comes from
**Context.** Sharing needs a verified email; the access token has none (observed, not assumed).
**Decision.** The API calls Auth0 `/userinfo` with the caller's verified token on first sign-in, and again when the stored profile is older than **24 h**.
**Trade-off.** Up to 24 h stale for sharing, plus a dependency on Auth0 at sign-in. Rejected: client-sent email (forgeable), a call per request (rate limits), tenant claims (not ours to change).
**Proved by.** `users.e2e-spec.ts`: synced once, not again within 24 h, again after 24 h.

## ADR-010 — Authentication guard
**Context.** OIDC on every route; this code is reviewed live at the on-site.
**Decision.** `jose`; a **global** guard (deny by default); checks (**010c**) `algorithms: ['RS256']`, exact issuer, `aud` *contains* the API, `sub` and `exp` required, 5 s clock tolerance; keys (**010d**) from the remote JWKS with jose's defaults, configured by required env vars.
- **010b** global rather than per-controller, so a forgotten route fails closed · **010e** `401` with `WWW-Authenticate` and an identical body for every cause; **`503`** when signing keys are unavailable · **010f** the guard yields identity only (amended by ADR-011: it now also resolves the DB user)
**Trade-off.** A generic 401 is less helpful to clients; the reason is logged, never returned.
**Steering.** Errors are classified by explicit code — mapping all jose errors to 401 would have reported an Auth0 outage as an invalid token.
**Proved by.** 26 guard tests (incl. `alg: none`, HS256 with the public key, PS256 against an alg-less JWKS) and `backend-auth.tsv` mutants.

## ADR-011 — User provisioning and `/me`
**Context.** `ownerId` must come from the token, and the brief requires a `/me` endpoint.
**Decision.** The guard resolves the DB user after verification (**011a**; `upsert` by `auth0Sub`, **011c**) and syncs the profile when never synced or older than 24 h (**011d**, new `profileSyncedAt`). Controllers receive `{ id, sub }` only (**011b**). Stored profile: email trimmed and lower-cased, nothing else kept (**011f**). `GET /me` → `{ id, email, emailVerified, name }` (**011g**). `AUTH_USERINFO_URI` and `DATABASE_URL` are required at startup (**011h**); DB tests migrate once then truncate per test (**011i**).
- **011e** `/userinfo` failures: first sign-in → create without email and retry later; stale refresh → keep stored values; Auth0 answering 401 → 401; `sub` mismatch → 401. **3 s timeout, no backoff** (developer's call).
**Trade-off.** During an Auth0 outage a never-synced user's requests wait up to 3 s each; a stale profile stays usable for sharing.
**Steering.** Controllers never receive an email, so none can trust one.
**Proved by.** `users.e2e-spec.ts`, including 10 parallel first requests creating exactly one row.

## ADR-012 — API contract
**Context.** The brief requires a documented contract; the agent had already produced endpoints faster than they could be reviewed.
**Decision.** Written in `API_DESIGN.md` before the endpoints: **RFC 9457 Problem Details** with a stable `code` (**012a**, status codes **012b**); validation with **zod** through Nest's `StandardSchemaValidationPipe` (**012c**); strict objects — unknown or server-owned fields → 400 (**012d**); trimmed strings, http(s)-only URLs, empty notes → null (**012e**); PUT replaces, PATCH is partial, empty PATCH → 400 (**012f**); **the brief's resource shapes exactly, including `ownerId`** (**012g**, after the developer's correction); `{ data, nextCursor }` keyset pagination, newest first (**012h**); filters `name`, `collectionId=<uuid|none>`, `q`; a bad `collectionId` on a write → 400 field error (**012k**), and the delete race is accepted (**012l**).
- **012i** a filter naming someone else's collection returns an empty page, identical to an own empty collection · **012m** no 415, no ETags, no Swagger
**Trade-off.** Cursor paging offers no "jump to page N"; a hand-written contract can drift from the code (mitigated by tests asserting the documented codes).
**Steering.** `CLAUDE.md`: if code and `API_DESIGN.md` disagree, stop and flag it.

## ADR-013 — Collections implementation
**Context.** How the contract is enforced in code, and how a reviewer can see it.
**Decision.** Layout `src/common` + `src/collections` (**013a**); thin controllers, all queries in services with **explicit `ownerId` in every query** (**013b**; rejected: an implicit Prisma extension, Postgres RLS); single-row reads and writes via the compound unique `id_ownerId`, so not-found and not-yours are the same result (**013c**); one global Problem Details filter; unsigned keyset cursor (**013g**); explicit `select` of contract fields (**013h**); escaped LIKE wildcards in filters (**013i**); CORS allow-list (**013j**).
- **013d** delete = find → count → delete; the race is accepted and documented · **013e** `413` added to the contract for bodies over 100 KB · **013f** input only through `@ValidBody`/`@ValidQuery`, plus a test that fails on a bare `@Body()`/`@Query()`, because Nest's pipe silently skips parameters without a schema
**Trade-off.** Owner filters are repeated in every query: repetitive, but visible to a reviewer and testable.
**Proved by.** 48 collections tests; mutants for owner scoping, the confirm flag, filter escaping and a bare `@Body()`.

## ADR-014 — Bookmarks implementation
**Context.** Same patterns as collections, plus the relation rule and user-supplied URLs.
**Decision.** Module `src/bookmarks` with a shared response shape (**014a**); owner scoping via `where: { id, ownerId }` (**014b**, no extra index needed). A `collectionId` must be one of the caller's collections: service check → `400` field error, with the composite FK as backstop; a `P2003` on that constraint maps to the same `400` (**014c**). URLs: `z.url({ protocol: /^https?$/ })`, max 2048 — plain `z.url()` accepts `javascript:` (**014d**). Credentials inside URLs are allowed (the owner's own data).
**Trade-off.** With two layers, removing either alone changes nothing observable (documented equivalent mutant; removing both fails 3 tests).
**Proved by.** 50 bookmarks tests plus unit tests for the FK race mapping.

## ADR-015 — Sharing API
**Context.** ADR-006 decided sharing exists; this is where it lives in the API.
**Decision.** Routes (**015a**) — owner: `POST/GET /collections/:id/shares`, `DELETE …/shares/:shareId`; recipient: read-only `GET /shared/collections`, `/:id`, `/:id/bookmarks`. Shapes (**015b**): recipient views carry `ownerEmail`, never `ownerId`. Rules (**015c**): ownership is checked **before** the email, so `recipient_not_found` can't be probed on someone else's collection; two verified accounts with one email → `409 ambiguous_recipient` (fail closed); sharing twice → `409 already_shared`. Module boundary (**015d**): owner management in `src/shares`, recipient reads in `src/shared`.
**Trade-off.** Recipient shapes deviate from the brief's resource fields — deliberate: the brief doesn't define shared routes, and ADR-006e forbids exposing other users' ids.
**Steering.** `SharedService` is the only code reading `CollectionShare`; the shared controller is GET-only, enforced by a test.

## ADR-016 — Seed data
**Context.** The brief requires seed data for at least two users, but the tenant has one real account.
**Decision.** `npx prisma db seed` creates the **real Auth0 test user** (so a real login shows data) plus `seed|user-b` and `seed|user-c`, with shares in both directions. Seed-only users are recreated on every run; the real user gets data only if they have none, so manual data survives.
**Trade-off.** Seeding a real tenant identity ties the seed to this tenant; fake users only would have shown an empty app after login.
**Proved by.** `seed.e2e-spec.ts`: at least two users, idempotent counts, manual data preserved.

## ADR-017 — Route-wide auth sweep
**Context.** "Auth is enforced" must be provable for routes that do not exist yet.
**Decision.** A test enumerates every registered route from Nest metadata and asserts `401` without a token, so new routes are covered automatically; a second test asserts the recipient controller is GET-only.
**Proved by.** Mutants: `@Public()` on `/me`, and a `@Delete` added to the shared controller, both fail it.

## ADR-018 — Frontend architecture
**Context.** The brief fixes the stack; everything below it was open.
**Decision.** Vite scaffold committed raw, then pinned; strict TypeScript, which the template omitted (**018a**); React Router 8 **data mode** (**018b**); `@auth0/auth0-react` — code + PKCE S256 only, verified in its source (**018c**); **tokens in memory, no refresh tokens** (**018d**); TanStack Query (**018e**); a typed client turning Problem Details into `ApiError` and sending a 401 back to login (**018f**); list and detail pages (**018g**); filters in the URL (**018h**); delete confirmed, then driven by the API's 409 count (**018i**); duplicate-name check asks the API (**018j**, refining ADR-007); only http(s) URLs rendered as links (**018k**); MUI 9 (**018l**); tests with Vitest + Testing Library + MSW and Auth0 mocked, plus a manual real-login checklist (**018m**).
**Trade-off.** In-memory tokens make a reload depend on silent renewal — **observed: it works on this tenant**; otherwise it is a quick redirect. Mocked auth in tests means the real login is only covered manually.
**Steering.** Structure fixed in `CLAUDE.md` at the developer's request: reusable UI under `src/components/<area>/`, screens in `src/pages/`, API access only through `src/api/`.

## ADR-019 — Sharing UI
**Context.** The sharing API exists; where it belongs in a UI whose other screens are strictly private.
**Decision.** Recipients get a **"Shared with me"** nav item with `/shared` and `/shared/:id` (**019a**); owners get a **Share** dialog on the collection page (**019b**: share by email, list recipients, revoke — with a confirmation, **019d**), with a specific message per API error (**019c**). Shared pages are read-only (**019e**): no write controls, notes inline, and no links to owner-only routes (which would 404 for them). Components under `components/shares` and `components/shared` (**019f**).
**Trade-off.** Two more pages instead of one merged list; in exchange no screen mixes owned and shared data.
**Proved by.** 14 tests and 10 mutants (incl. "revoke without confirmation", "titles link to owner pages").

## ADR-020 — Bonuses
**Context.** §3.4 lists four optional extras; they must not put the core at risk.
**Decision.** **020a Docker:** a Dockerfile per app behind a compose `app` profile; the API applies migrations on start. **020b `/all` page:** a read-only overview built on existing endpoints, so no new API surface. **020c Full-text search:** `?search=` over title **and** notes via `websearch_to_tsquery('english')` and a GIN expression index; `?q=` unchanged; newest-first order keeps paging correct. **CI: not done** (developer deferred it).
**Trade-off.** Vite inlines `VITE_*`, so the frontend image is environment-specific; the API image is 908 MB because it carries the Prisma CLI for migrations; `/all` costs one request per collection; search has no relevance ranking and is the only raw SQL in the app.
**Steering.** That raw query uses bound parameters only and carries `ownerId` like every other query; two mutants in `.agent/mutants/backend-privacy.tsv` fail if the owner or collection filter is dropped.
**Proved by.** The containers were run (migrations, 401, SPA deep links, CORS); 12 search tests including injection attempts; 4 `/all` tests.
