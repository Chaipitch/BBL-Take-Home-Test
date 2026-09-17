# DECISIONS

Short ADRs for calls the brief left open.

**Process.** The agent does not make design decisions. It writes a *Proposed* ADR (options + recommendation), the developer decides, and only then is it *Accepted* and implemented. Each ADR records who decided.

> **Correction logged 2026-09-17.** In commit `5431329` the agent implemented several sub-decisions it had not been asked to make (marked **Proposed — already in code** below). The developer stopped it and introduced the propose → decide → implement rule above (now in `CLAUDE.md`). Any Proposed item rejected below will be changed in a follow-up commit.

| ADR | Topic | Status |
|---|---|---|
| 001 | Pin dependency versions | Proposed — already in code |
| 002 | Remove agent skills installed by `prisma init` | Proposed — already applied |
| 003 | Ports 3000 / 4000 | Proposed — only in docs |
| 004 | UUID v4 ids | **Accepted** (developer) |
| 004a | Malformed id → 404 | Proposed — only in docs |
| 005 | Delete collection → delete its bookmarks, with UI confirmation | **Accepted** (developer) |
| 005a | Enforce same-owner via composite FK | Proposed — already in code |
| 006 | Read-only sharing to another registered user | **Accepted** (developer) |
| 006a–f | Sharing details | Proposed — partly in code |
| 007 | Schema field details (user table, lengths, indexes) | Proposed — already in code |

---

## ADR-001 — Pin dependency versions
**Status.** Proposed — already in code.
**Context.** On 2026-09-17: `prisma@latest = 8.0.0-rc.15` (release candidate) but `@prisma/client@latest = 7.10.0`; installing both "latest" gives mismatched majors. `typescript@latest = 7.0.2`, but `ts-jest` peers `<7` and `@nestjs/cli` 12 ships `~6.0.2`.
**Options.** (a) Pin exact stable versions: Prisma 7.10.0 ×3, TypeScript 6.0.x. (b) Use `^` ranges on stable majors. (c) Use latest including Prisma 8 RC.
**Recommendation.** (a) — reproducible for graders; bump deliberately.

## ADR-002 — Agent skills installed by `prisma init`
**Status.** Proposed — already applied (files moved out of repo, not deleted; restorable).
**Context.** `prisma init` downloaded 9 skills from `github.com/prisma/skills` into `backend/.agents` and symlinked them into `.claude/skills` and `.windsurf/skills`. Some cover products we don't use (MongoDB, Prisma Postgres cloud, Compute).
**Options.** (a) Don't commit them; keep agent context only in `CLAUDE.md` + `/.agent/`. (b) Commit only the relevant ones (e.g. `prisma-client-api`, `prisma-cli`). (c) Commit all.
**Recommendation.** (a) or (b). (b) is defensible if you want the agent to have Prisma 7 docs; they'd then count as reviewed agent config.

## ADR-003 — Ports
**Status.** Proposed — only in docs.
**Context.** Auth0 callback/logout URLs are fixed to `http://localhost:3000`, so the SPA must serve on 3000.
**Options.** (a) Frontend 3000, backend 4000, CORS allows only `http://localhost:3000`. (b) Frontend 3000 with Vite proxying `/api` to the backend — same origin, no CORS.
**Recommendation.** (a) is simpler to reason about; (b) avoids CORS entirely. Your call.

## ADR-004 — Resource ids are UUID v4
**Status.** Accepted — developer, 2026-09-17.
**Why.** Sequential ids would leak other users' activity volume, conflicting with "must not learn of the existence of".

### ADR-004a — Malformed id response
**Status.** Proposed.
**Options.** (a) `404` — same as not-found, so the id's shape reveals nothing. (b) `400 Bad Request` — more conventional and helpful to API clients.
**Recommendation.** (a); the leak from (b) is tiny, but (a) keeps one rule: "can't access it → 404".

## ADR-005 — Deleting a collection deletes its bookmarks
**Status.** Accepted — developer, 2026-09-17.
**Decision.** The frontend shows a confirmation popup; if the user proceeds, the collection and all bookmarks inside it are deleted (DB `ON DELETE CASCADE`).
**Trade-off.** A confirmed action destroys data; no undo.
**Open follow-ups (need decision).** Should the popup show the number of bookmarks to be deleted? Should the API require an explicit confirmation (e.g. `?deleteBookmarks=true`), since API clients bypass the popup? Agent recommendation: show the count; no API flag.

### ADR-005a — Enforce "bookmark's collection belongs to the same owner"
**Status.** Proposed — already in code.
**Options.** (a) Composite FK `Bookmark(collectionId, ownerId) → Collection(id, ownerId)`: the database rejects a cross-owner reference even if app code has a bug. (b) Application check only (look up the collection by id + ownerId before writing).
**Recommendation.** (a) **and** (b): the app check gives a clean 404; the FK is a backstop. Verified manually with a raw SQL probe (cross-owner insert rejected, uncategorised allowed, cascade works); an automated test is still to be written.

## ADR-006 — Sharing a collection
**Status.** Accepted — developer, 2026-09-17.
**Decision.** An owner can share a collection **read-only** with **another registered user**.

The sub-decisions below are **Proposed** (the `CollectionShare` table in commit `5431329` assumes a–c):

- **006a — How the recipient is identified.** (a) By email. (b) By an internal user id (requires a way to find users → enumeration). *Recommend (a).*
- **006b — Email must be verified.** Only match a signed-in user whose Auth0 `email_verified` is true. Without this, anyone able to register an account with your address receives your shares. *Recommend yes.* Needs checking whether this tenant exposes `email_verified` to the API.
- **006c — Recipient not registered yet.** (a) Return the same success response and store the share as pending until that user signs in — no enumeration, but the owner can't tell. (b) Return `404` "user not found" — clearer UX, but reveals which emails have accounts. *Recommend (a).* Note: (a) slightly stretches "registered user"; (b) matches it literally.
- **006d — Where shared data is served.** (a) Separate read-only routes (`/shared/collections`, `/shared/collections/:id/bookmarks`), owner routes never look at shares. (b) Mix into `GET /collections` with a `?scope=shared` filter. *Recommend (a)*: the exception to the privacy rule lives in one auditable place.
- **006e — What the recipient sees.** Collection name + its bookmarks (url, title, notes) + the owner's email. Not internal user ids, not other recipients. Are notes included? *Recommend yes (they're part of the bookmark).*
- **006f — Rules.** Owner can list and revoke shares; can't share with own email (`400`); recipient can't edit or re-share; deleting the collection removes its shares.

## ADR-007 — Schema field details
**Status.** Proposed — already in code.
- **User table.** Create a `User` row on the first authenticated request, keyed by Auth0 `sub`; store `email`, `emailVerified`, `name`. Alternative: no user table, use `sub` directly as `ownerId` (simpler, but sharing needs email lookup anyway).
- **Length limits.** Collection name 200, url 2048, title 500, notes 10 000, email 320. Alternative: unlimited `text` with validation only in DTOs.
- **Duplicate collection names** per user: currently *allowed*. Alternative: unique per owner → `409`.
- **Indexes** on `(ownerId, createdAt)` and `(ownerId, collectionId)` for owner-scoped listing/filtering.
- **Separate test database** `bookmarks_test` (in docker-compose, commit `4d24bbb`).
