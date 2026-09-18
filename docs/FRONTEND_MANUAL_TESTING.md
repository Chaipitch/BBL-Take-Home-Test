# Frontend manual testing (real Auth0 login)

> **Last run: 2026-09-17 by the developer: sections A–E passed. Section F (sharing) added 2026-09-18, not yet run.**

Automated frontend tests (`cd frontend && npm test`) mock Auth0 at the hook boundary (ADR-018m). This checklist covers what they can't: the real login, tokens, and the full stack.

## Start

```bash
docker compose up -d postgres
cd backend && npx prisma db seed && npm run start:dev        # terminal 1, http://localhost:4000
cd frontend && npm ci && cp .env.example .env && npm run dev  # terminal 2, http://localhost:3000
```

Open **http://localhost:3000** in a normal browser window with DevTools → **Network** open ("Preserve log" on).

## Checklist

### A. Login (Authorization Code + PKCE)
- [ ] Opening `/` redirects to `dev-yg.us.auth0.com/authorize`. In that request's URL:
  - `response_type=code` (not `token` / `id_token`)
  - `code_challenge_method=S256` and a `code_challenge`
  - `audience=https://bbl-candidate-test-api`
  - `redirect_uri=http://localhost:3000/callback`
  - `scope=openid profile email`
- [ ] Log in as the test user from the brief. You land on `/collections`. No token appears in the address bar at any point.
- [ ] Network → `POST …/oauth/token`: the request body has `grant_type=authorization_code` and `code_verifier`.
- [ ] Network → any `localhost:4000` request: `Authorization: Bearer eyJ…` (the **access** token).
- [ ] App bar shows `candidate@test.com`.
- [ ] Application tab → Local Storage / Session Storage for `localhost:3000`: **no tokens** (ADR-018d: memory only).

### B. Collections (brief §3.2)
- [ ] List shows seeded collections: Backend, Security, Empty collection.
- [ ] **Create** "Reading" → opens its page.
- [ ] **Create** "reading " again → warning "A collection named “Reading” already exists…" → **Save anyway** works (ADR-007/018j).
- [ ] **View one**: open Backend → shows its 3 bookmarks; **Rename** works.
- [ ] **Delete** "Empty collection" → one confirmation → gone.
- [ ] **Delete** Backend → first dialog → **second dialog says it contains 3 bookmarks** → confirm → collection and its bookmarks gone (check `/bookmarks`) (ADR-005b/018i).

### C. Bookmarks (brief §3.2)
- [ ] List shows bookmarks with collection chips; each URL opens in a new tab.
- [ ] **Filter by collection**: choose Security → only its bookmarks; URL becomes `?collectionId=…`. Choose **Uncategorised** → `?collectionId=none`.
- [ ] Search "owasp" + Enter → `?q=owasp`; reload the page → filters are kept.
- [ ] **Create** with URL `javascript:alert(1)` → the form shows a URL error from the API; nothing is created.
- [ ] **Create** a valid bookmark in a collection → appears in the list.
- [ ] **View details** → shows URL, collection link, notes, dates; **Edit** → change title and collection → saved.
- [ ] **Delete** → confirmation → gone.

### D. Session behaviour (ADR-018d, to record the result)
- [ ] **Reload** any page. Result is one of:
  - stays signed in without visiting Auth0 (silent renewal via iframe works on this tenant), or
  - quick redirect through Auth0 and back to the same page (silent renewal blocked; session cookie still valid).

  Write down which one happened. It decides what `DECISIONS.md` says about reloads.

  **Recorded 2026-09-17 (developer): stayed signed in; silent renewal works on this tenant.**
- [ ] **Log out** → Auth0 logout → back at `http://localhost:3000` → immediately asked to log in again.

### E. Privacy smoke test through the UI
- [ ] Open `http://localhost:3000/collections/<bCollectionId>` (from `scripts/manual-test/print-seed-ids.sql`) → "Not found. It may have been deleted, or it is not yours."
- [ ] `http://localhost:3000/bookmarks/<bBookmarkId>` → same message.
- [ ] `http://localhost:3000/bookmarks?collectionId=<bCollectionId>` → "No bookmarks match these filters."

### F. Sharing (BBL-23; seed gives user B a collection shared with you)
- [ ] Nav shows **Shared with me** → `/shared` lists "Team reading list", "Shared by user-b@example.com".
- [ ] Open it: **Read-only** chip, owner email, bookmarks with notes shown inline, **no** Edit/Delete/Rename/Share/Add buttons, and bookmark titles are not links to `/bookmarks/:id`.
- [ ] Search inside it (e.g. "twelve") filters and the URL gets `?q=`.
- [ ] Open one of your own collections → **Share** → enter `user-c@example.com` → it appears under "Shared with"; entering it again → "already shared with that person"; `nobody@example.com` → "No account with a verified email matches this address."; your own address → "You can't share a collection with yourself."
- [ ] **Stop sharing** asks for confirmation, then the row disappears.
- [ ] Optional cross-check: `docker exec bbl-bookmarks-postgres psql -U bookmarks -d bookmarks -c 'select count(*) from "CollectionShare"'` changes as expected.
