# CLAUDE.md — agent rules for this repo

Personal bookmark manager (BBL Full-Stack take-home). Two services in one repo: `backend/` (API) and `frontend/` (web).
This file is the single source of truth a fresh agent session needs. Keep it current when decisions change.

## The invariant (non-negotiable)
**Every row belongs to exactly one owner. A user must never see, modify, or learn of the existence of another user's data** — with one explicit exception: a collection the owner has shared read-only (DECISIONS.md ADR-006), served only under `/shared/...`.
- Every Prisma query on owned data MUST filter by `ownerId` taken from the verified token — never from the request body, query, or params.
- Resource not found and resource owned by someone else MUST be indistinguishable: both return `404` with the same body.
- Never accept `ownerId` as client input. Strip/reject it.
- A `collectionId` supplied on a bookmark must be verified to belong to the caller before writing.
- Any change touching data access must come with a cross-user test (user A tries user B's resource).
- Owner routes (`/collections`, `/bookmarks`) never consult shares. Share-based reads live only in the shared module and are read-only; they match grantees by *verified* email only.
- Share creation must not reveal whether an email is registered (same response either way).
- IDs are UUIDs; a malformed id is a `404`, same as not-found.
- Deleting a collection cascades to its bookmarks and shares (ADR-005). `bookmark.ownerId` must equal its collection's `ownerId` — enforced by composite FK, don't remove it.

## Stack (pinned — do not substitute)
- Backend: Node + TypeScript, NestJS, Prisma, PostgreSQL (via `docker compose`).
- Frontend: React + Vite + TypeScript (no Next.js), React Router ≥ 8, MUI ≥ 9.
- Auth: Auth0 OIDC, Authorization Code + PKCE **S256**. No implicit flow. No password grant.
- Versions are pinned exactly (ADR-001): Prisma + @prisma/client + @prisma/adapter-pg `7.10.0`, TypeScript `6.0.x`. Never `npm i <pkg>@latest` without checking dist-tags.
- Backend is ESM (`"type": "module"`, NodeNext): relative imports need `.js` extensions. Tests use Vitest (Nest 12 default), not Jest.
- Prisma 7: config in `backend/prisma.config.ts`, client generated to `backend/src/generated/prisma` (gitignored), Postgres via `@prisma/adapter-pg`.
- Ports: frontend `3000` (fixed by Auth0 callback), backend `4000`.
- Decisions index: `DECISIONS.md`. Read it before changing delete/sharing/auth behaviour.

## Auth rules
- JWT verification: `algorithms: ['RS256']` pinned; verify `iss` exactly (`https://dev-yg.us.auth0.com/`, trailing slash), `aud`, `exp`/`nbf`; keys from JWKS selected by `kid`. See `docs/auth0/TENANT_FINDINGS.md`.
- Auth guard is global (deny by default). Public routes, if any, must be explicitly opted out and listed in `API_DESIGN.md`.
- Never log tokens.

## Conventions
- Status codes / error shape: follow `API_DESIGN.md` (source of truth). If code and doc disagree, stop and flag it.
- Decisions not dictated by the brief go in `DECISIONS.md` before implementing.
- Tests: every endpoint gets happy path + unauthenticated (401) + cross-user (404) + validation (400) cases.
- Small commits, one logical step each. Do not squash. Never commit `.env` or secrets.

## Commands
- DB: `docker compose up -d postgres` (dev DB `bookmarks`, test DB `bookmarks_test`).
- (backend/frontend commands added once scaffolded)
