# BBL Bookmarks — Full-Stack take-home

Private read-later app: NestJS + Prisma + PostgreSQL API, React + Vite + MUI frontend, Auth0 (Authorization Code + PKCE).

**Bearer token:** the API accepts the Auth0 **access token** for audience `https://bbl-candidate-test-api`. Access tokens are issued *for* an API (`aud` = this API); ID tokens prove a login to the client app, not authorisation to call an API (ADR-008, verified with real tokens in `docs/auth0/TENANT_FINDINGS.md`).

## What to read first

| Document | What's in it |
|---|---|
| `API_DESIGN.md` | The API contract, how the privacy invariant is enforced per layer with the test that proves it, **how to verify the claims yourself**, and 8 places the agent's first attempt was wrong |
| `DECISIONS.md` | Every decision as a short ADR: options, what was chosen, what was traded away, **who decided**, and the corrections when the agent overstepped |
| `AI_WORKFLOW.md` | How the work was actually done with the agent, including failures, recovery and real token usage |
| `/.agent/README.md` | The three reusable capabilities (mutation check, privacy review, pre-commit hook) and what they caught |
| `/transcripts/` | The real session log, redacted, plus a readable Markdown version |
| `CLAUDE.md` | Rules a fresh agent session needs to produce on-spec code here |
| `docs/API_MANUAL_TESTING.md`, `docs/FRONTEND_MANUAL_TESTING.md` | Manual checks with a real Auth0 login (Postman collection, browser checklist) |
| `docs/SECOND_REAL_USER.md` | Adding users: a tool for real Auth0 accounts, and one for local app users (the app has no user-management screen — users appear on first sign-in) |

## Verification at a glance

| Check | Command | Result |
|---|---|---|
| Backend unit | `npm test --prefix backend` | 64 passing |
| Backend e2e (real Postgres, ≥2 users) | `npm run test:e2e --prefix backend` | 144 passing |
| Frontend | `npm test --prefix frontend` | 41 passing |
| Do the tests actually protect the rules? | `.agent/scripts/mutation-check.sh --file .agent/mutants/backend-auth.tsv` (and `backend-privacy.tsv`) | 5 + 9 mutants, 0 unexpected |
| Real Auth0 tokens against the running API | `node scripts/inspect-tokens.mjs --api http://localhost:4000/me` | access token 200, ID token 401, no token 401 |
| Manual API (71 requests) | `docs/API_MANUAL_TESTING.md` | not yet run by the developer |
| Manual frontend | `docs/FRONTEND_MANUAL_TESTING.md` | sections A–E passed 2026-09-17; F (sharing) pending |

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

### Users
There is no "create user" endpoint or screen: identity comes from Auth0 and a `User` row is created on
the first authenticated request (ADR-007, ADR-011). Two tools add users (`docs/SECOND_REAL_USER.md`):
`scripts/create-auth0-user.mjs` creates real Auth0 accounts that can log in (you type the password),
and `backend/scripts/create-app-users.ts` creates any number of local app users with verified emails
for data and sharing tests (they cannot log in).

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
| `/bookmarks` | list, filter by collection (incl. uncategorised), full-text search over titles and notes, create, delete; filters in the URL |
| `/bookmarks/:id` | details, edit, delete |
| `/all` | bonus: every collection with its bookmarks, plus uncategorised (read-only overview) |
| `/shared` | collections other people shared with you (read-only) |
| `/shared/:id` | a shared collection: owner email, Read-only chip, bookmarks with notes, title search |
| `/callback` | Auth0 redirect target |

Sharing as an owner: the **Share** button on `/collections/:id` opens a dialog to share by email and revoke access.

## Running it in containers (bonus)

```bash
docker compose --profile app up --build     # postgres + API (:4000) + nginx-served frontend (:3000)
docker compose stop api web                 # back to the local dev workflow
```
- The API container applies `prisma migrate deploy` on start; seeding stays a manual step (`npx prisma db seed`).
- **Vite inlines `VITE_*` at build time**, so the frontend image is built with `VITE_API_BASE_URL=http://localhost:4000` (a compose build arg). A different API URL means rebuilding the image, not just changing an environment variable.
- The default local workflow (`docker compose up -d postgres` + `npm run start:dev` / `npm run dev`) is unchanged; the app containers are behind the `app` profile.
- API image ~908 MB: it carries the Prisma CLI and query engines so the container can migrate itself. Moving migrations into a separate one-shot container would cut ~210 MB; not done, since the bonus is lightly weighted.
- Verified by running it: migrations applied, `GET /me` → 401 with `WWW-Authenticate` and `application/problem+json`, `/shared` deep link served by nginx, CORS allowing `http://localhost:3000`, and the built bundle pointing at the API.

## Completed vs skipped

**Completed**

| Brief | Where |
|---|---|
| §3.1 Backend: NestJS + TypeScript, OIDC on every route, Authorization Code + PKCE, both resources with get/list/create/PUT/PATCH/delete/filtering, `/me`, `GET /collections/:id/bookmarks`, SQL via Prisma, seed for ≥2 users | `backend/`, `API_DESIGN.md` |
| §3.2 Frontend: React + Vite + TS, React Router 8, MUI 9, `/collections` and `/bookmarks` with all listed actions | `frontend/` |
| §3.3 The under-specified requirement | Decided and shipped: cascade delete with confirmation (ADR-005/005b) and read-only sharing to a verified user (ADR-006, ADR-015), UI in ADR-019 |
| §3.4 Bonus: Dockerfiles for backend and frontend | `backend/Dockerfile`, `frontend/Dockerfile`, compose `app` profile |
| §3.4 Bonus: `/all` page | `frontend/src/pages/AllPage.tsx` |
| §3.4 Bonus: full-text search over titles and notes | `?search=` on `/bookmarks` (API + UI), GIN index |
| §5 Deliverables: agent rules file, `/.agent/`, `API_DESIGN.md`, `DECISIONS.md`, automated tests, `AI_WORKFLOW.md`, `/transcripts/`, README, real commit history | this repo (46+ commits, no squashing) |

**Skipped, and why**

| Not done | Why |
|---|---|
| **CI pipeline** (bonus §3.4) | Deferred by the developer for now. The checks a pipeline would run already exist as commands (`npm test`, `npm run test:e2e`, `npm run lint`, `tsc`, the mutation sets) and the pre-commit hook runs the fast ones. |

| **Rate limiting** on share creation | Account enumeration via `recipient_not_found` is an accepted, documented trade-off (ADR-006c). |
| **ETags / optimistic concurrency** | Last write wins (ADR-012m). |
| **OpenAPI/Swagger** | The contract is written by hand in `API_DESIGN.md` (ADR-012m). |
| **Refresh tokens** | Not requested; tokens live in memory and renew silently (ADR-018d), verified by a real login. |
| **Playwright end-to-end UI tests** | Frontend tests mock the API and Auth0; the real login path is covered by a manual checklist instead (ADR-018m). |

**Known trade-offs that are live in the code** — `DECISIONS.md` has the full list; the sharp ones are the
delete race (ADR-013d), account enumeration on share (ADR-006c), and three documented equivalent
mutants listed in `API_DESIGN.md` §8.
