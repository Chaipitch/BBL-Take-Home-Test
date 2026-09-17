# BBL Bookmarks — Full-Stack take-home

Private read-later app: NestJS + Prisma + PostgreSQL API, React + Vite + MUI frontend, Auth0 (Authorization Code + PKCE).

**Bearer token:** the API accepts the Auth0 **access token** for audience `https://bbl-candidate-test-api`. Access tokens are issued *for* an API (`aud` = this API); ID tokens prove a login to the client app, not authorisation to call an API (ADR-008, verified with real tokens in `docs/auth0/TENANT_FINDINGS.md`).

Key documents: `API_DESIGN.md` (contract and how privacy is enforced) · `DECISIONS.md` (ADRs) · `CLAUDE.md` (agent rules) · `docs/API_MANUAL_TESTING.md` (Postman).

## Prerequisites
- Node ≥ 22.18 and npm (developed on Node 26)
- Docker (PostgreSQL 17 via `docker compose`)
- Internet access (Auth0 signing keys and `/userinfo`)

## Backend

### Setup and run
```bash
docker compose up -d postgres          # dev DB "bookmarks" + test DB "bookmarks_test"
cd backend
npm ci
cp .env.example .env                   # local, non-secret values; Auth0 settings are the tenant's public config
npx prisma generate                    # client is generated into src/generated (gitignored) — required before build/tests
npx prisma migrate deploy
npx prisma db seed                     # 3 users incl. the real Auth0 test user; safe to re-run
npm run start:dev                      # http://localhost:4000
```
Quick check: `curl -i http://localhost:4000/me` → `401` with `WWW-Authenticate: Bearer`.

### Tests
```bash
cd backend
npm test            # unit (no database): token verification, /userinfo client, error mapping
npm run test:e2e    # needs `docker compose up -d postgres`; uses bookmarks_test only (refuses any other DB), truncates it per test
npm run lint
npm run build
```
- e2e tests run the real `AppModule` (guard, validation, services, Prisma, Postgres) with two or more users. Only the Auth0 signing keys (local test JWKS) and `/userinfo` are faked. See `API_DESIGN.md` §7 for which test proves which privacy rule.
- Real Auth0 tokens were checked separately against the running API (`scripts/inspect-tokens.mjs`, results in `docs/auth0/TENANT_FINDINGS.md`).
- Manual end-to-end testing with a real login: `docs/API_MANUAL_TESTING.md` (Postman collection in `docs/postman/`).

### Seed data
`npx prisma db seed` (ADR-016):
- `candidate@test.com` (the real Auth0 test user, so logging in shows data): 3 collections, 6 bookmarks. It gets seed data only if it has no collections yet, so re-seeding never touches manually created data.
- `user-b@example.com`, `user-c@example.com`: seed-only users (cannot log in), recreated on every run.
- Shares: B shares "Team reading list" with the candidate; the candidate shares "Security" with B.

### API overview
| Area | Routes |
|---|---|
| Me | `GET /me` |
| Collections | `GET/POST /collections`, `GET/PUT/PATCH/DELETE /collections/:id` (`?confirm=true` for non-empty), `GET /collections/:id/bookmarks` |
| Bookmarks | `GET/POST /bookmarks` (`?collectionId=<uuid\|none>&q=`), `GET/PUT/PATCH/DELETE /bookmarks/:id` |
| Sharing (owner) | `GET/POST /collections/:id/shares`, `DELETE /collections/:id/shares/:shareId` |
| Sharing (recipient, read-only) | `GET /shared/collections`, `GET /shared/collections/:id`, `GET /shared/collections/:id/bookmarks` |
Full contract, status codes and error format: `API_DESIGN.md`.

## Frontend
React 19 + Vite 8 + TypeScript, React Router 8 (data mode), MUI 9, `@auth0/auth0-react` (Authorization Code + PKCE S256, tokens in memory), TanStack Query (ADR-018).

### Setup and run
```bash
cd frontend
npm ci
cp .env.example .env     # public config: API base URL, Auth0 domain, client id, audience
npm run dev              # http://localhost:3000 (port fixed by the Auth0 callback URL)
```
Needs the backend running on `http://localhost:4000`.

### Tests
```bash
cd frontend
npm test          # Vitest + Testing Library + MSW; Auth0 mocked at the hook boundary
npm run lint
npm run build     # tsc -b + vite build
```
Real login and full-stack checks: `docs/FRONTEND_MANUAL_TESTING.md`.

### Pages
| Route | Brief §3.2 |
|---|---|
| `/collections` | list, create (duplicate-name warning), delete (confirmation shows the bookmark count) |
| `/collections/:id` | view one: its bookmarks, rename, add bookmark, delete |
| `/bookmarks` | list, filter by collection (incl. uncategorised) and title, create, delete; filters in the URL |
| `/bookmarks/:id` | details, edit, delete |
| `/callback` | Auth0 redirect target |

## Status
| Area | State |
|---|---|
| Auth0 tenant inspection, real-token verification | done |
| Backend API: auth guard, `/me`, collections, bookmarks, sharing, seed | done: 64 unit + 144 e2e tests |
| Postman manual test collection | done (not yet run by the developer) |
| Frontend: login, collections and bookmarks pages | done: 27 tests; real-login checklist not yet run |
| Frontend: shared collections UI (BBL-23) | not started |
| `/.agent/` capability, `AI_WORKFLOW.md`, transcripts | not started |
| Bonus (Docker, CI, `/all`, full-text search) | not started |

### Skipped / deliberately not done (backend)
- **Rate limiting** on share creation: account enumeration via `recipient_not_found` is an accepted trade-off (ADR-006c).
- **ETags / optimistic concurrency:** last write wins (ADR-012m).
- **OpenAPI/Swagger:** contract is written by hand in `API_DESIGN.md` (ADR-012m).
- **Delete race:** a bookmark added in the milliseconds between the count and the delete of its collection is deleted too (ADR-013d).
