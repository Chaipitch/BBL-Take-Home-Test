# CLAUDE.md — agent rules for this repo

## Working rule: the developer decides design
Do not make design decisions. For any choice with a real alternative (schema, API shape, status codes, auth, security behaviour, versions, tooling), write the options + a recommendation, ask, and wait. Record it in `DECISIONS.md` as *Proposed*; implement only after the developer marks it *Accepted*. Mechanical work that follows an accepted decision is fine. Anything below labelled *(provisional — not yet decided)* is a proposal, not a rule.

Personal bookmark manager (BBL Full-Stack take-home). Two services in one repo: `backend/` (API) and `frontend/` (web).
This file is the single source of truth a fresh agent session needs. Keep it current when decisions change.

## The invariant (non-negotiable)
**Every row belongs to exactly one owner. A user must never see, modify, or learn of the existence of another user's data** — with one explicit exception: a collection the owner has shared read-only (DECISIONS.md ADR-006), served only under `/shared/...`.
- Every Prisma query on owned data MUST filter by `ownerId` taken from the verified token — never from the request body, query, or params.
- Resource not found and resource owned by someone else MUST be indistinguishable: both return `404` with the same body.
- Never accept `ownerId` as client input. Strip/reject it.
- A `collectionId` supplied on a bookmark must be verified to belong to the caller before writing.
- Any change touching data access must come with a cross-user test (user A tries user B's resource).
- Owner routes (`/collections`, `/bookmarks`) never consult shares. Share-based reads live only under `/shared/...` and are read-only (ADR-006d/f).
- Shares link to the recipient's **user id** (ADR-006g). A recipient must be an existing user with a verified email; otherwise `404` (ADR-006b/c — account enumeration is an accepted, documented trade-off). Self-share → `400`.
- IDs are UUIDs; a malformed id is a `404`, same as not-found (ADR-004a).
- Deleting a collection cascades to its bookmarks and shares (ADR-005). Non-empty collection without `?confirm=true` → `409` with bookmark count, nothing deleted (ADR-005b).
- Duplicate collection names are allowed by the API; the frontend warns (client-side, trimmed, case-insensitive) — ADR-007.
- `bookmark.ownerId` must equal its collection's `ownerId`: check in app code (look up collection by id + caller's ownerId) **and** keep the composite FK — never remove it (ADR-005a).

## Stack (pinned — do not substitute)
- Backend: Node + TypeScript, NestJS, Prisma, PostgreSQL (via `docker compose`).
- Frontend: React + Vite + TypeScript (no Next.js), React Router ≥ 8, MUI ≥ 9.
- Auth: Auth0 OIDC, Authorization Code + PKCE **S256**. No implicit flow. No password grant.
- Versions are pinned exactly (ADR-001): Prisma + @prisma/client + @prisma/adapter-pg `7.10.0`, TypeScript `6.0.x`. Never `npm i <pkg>@latest` without checking dist-tags.
- Backend is ESM (`"type": "module"`, NodeNext): relative imports need `.js` extensions. Tests use Vitest (Nest 12 default), not Jest.
- Prisma 7: config in `backend/prisma.config.ts`, client generated to `backend/src/generated/prisma` (gitignored), Postgres via `@prisma/adapter-pg`.
- Ports: frontend `3000` (fixed by Auth0 callback), backend `4000`; API CORS allows only `http://localhost:3000` (ADR-003).
- Decisions index: `DECISIONS.md`. Read it before changing delete/sharing/auth behaviour.

## Auth rules
- Bearer credential is the Auth0 **access token** for audience `https://bbl-candidate-test-api` (ADR-008), confirmed by token inspection (BBL-9). Never accept ID tokens as API credentials.
- JWT verification lives only in `backend/src/auth/token-verifier.ts` (jose, ADR-010): `algorithms: ['RS256']`, exact `iss`, `aud` contains the API audience, `requiredClaims: ['sub','exp']`, 5 s clock tolerance, remote JWKS with jose defaults. Don't add a second verification path.
- Error classification is by explicit jose error code: token errors → 401 (`WWW-Authenticate: Bearer error="invalid_token"`), JWKS unavailable (`ERR_JWKS_TIMEOUT`, `ERR_JOSE_GENERIC`, `ERR_JWKS_INVALID`, fetch `TypeError`) → 503. Never map all jose errors to 401.
- `AuthGuard` is global (`APP_GUARD`), deny by default. `@Public()` exists but no route may use it without a developer decision; list any in `API_DESIGN.md`. Controllers get identity only via `@CurrentUser()` → `{ sub, scope }`.
- Config: `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URI` are required; app refuses to start without them.
- Auth test rule: tests sign tokens with local keys through the real `AuthModule` (override only `AUTH_CONFIG` and `JWKS_KEY_SOURCE`). Build test token payloads as one object — `SignJWT` setters (`setIssuer`, `setAudience`, `setExpirationTime`…) overwrite claims passed to the constructor. After adding a negative test, prove it fails when the check it guards is removed.
- Observed token facts (BBL-9): access token is RS256 JWT, `aud` is an **array** (check it *contains* the API audience), no email claims, 2 h lifetime, no refresh token.
- Email/email_verified come only from Auth0 `/userinfo` (called server-side with the verified access token), stored on `User`, refreshed when older than 24 h (ADR-009). Never trust email sent by the client.
- Never log tokens.

## Conventions
- Status codes / error shape: follow `API_DESIGN.md` (source of truth). If code and doc disagree, stop and flag it.
- Decisions not dictated by the brief go in `DECISIONS.md` before implementing.
- Tests: every endpoint gets happy path + unauthenticated (401) + cross-user (404) + validation (400) cases.
- Small commits, one logical step each. Do not squash. Never commit `.env` or secrets.

## Commands
- DB: `docker compose up -d postgres` (dev DB `bookmarks`, test DB `bookmarks_test`).
- Backend (in `backend/`): `npm run start:dev` (port 4000) · `npm test` (unit, Vitest) · `npm run test:e2e` · `npm run build` · `npm run lint`.
- Token inspection (developer logs in): `node scripts/inspect-tokens.mjs`.
