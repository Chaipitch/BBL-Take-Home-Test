# API manual testing with Postman

Manual, end-to-end check of the running API with a **real Auth0 login**. It complements the automated suites (`npm test`, `npm run test:e2e`), which use locally signed tokens.

Files:
- `docs/postman/BBL-Bookmarks.postman_collection.json`: 71 requests in 8 folders, each with Postman tests (green/red results).
- `docs/postman/BBL-Bookmarks.local.postman_environment.json`: `baseUrl`, Auth0 domain, client id, audience (no secrets).
- `scripts/manual-test/print-seed-ids.sql`: prints seed ids (user B's private collection and bookmark, and the collection B shares with you).

> ⚠️ Postman stores the OAuth token inside the collection. **Never commit a re-exported copy** of the collection after you've fetched a token.

---

## 1. Start the API

```bash
docker compose up -d postgres
cd backend
npx prisma migrate deploy
npm run start:dev
```

The API listens on `http://localhost:4000`. Quick check: `curl -i http://localhost:4000/me` → `401` with `WWW-Authenticate: Bearer`.

## 2. Import into Postman

1. **Import** → select both files in `docs/postman/`.
2. Top-right environment selector → **BBL Bookmarks — local**.

## 3. Get a real access token (Authorization Code + PKCE)

1. Open the collection **BBL Bookmarks API — manual tests** → **Authorization** tab.
2. Check these values (the import should have filled them; fix any that differ):

| Field | Value |
|---|---|
| Auth Type | OAuth 2.0 |
| Add auth data to | Request Headers |
| Header Prefix | `Bearer` |
| Grant type | **Authorization Code (With PKCE)** |
| Callback URL | `http://localhost:3000/callback` |
| Authorize using browser | **unchecked** (Postman's own window catches the callback; the Auth0 app only allows `localhost:3000/callback`) |
| Auth URL | `{{auth0Domain}}/authorize` |
| Access Token URL | `{{auth0Domain}}/oauth/token` |
| Client ID | `{{auth0ClientId}}` |
| Client Secret | *(empty)* |
| Code Challenge Method | **SHA-256** |
| Scope | `openid profile email` |
| Client Authentication | Send client credentials in body |
| Advanced → Auth Request → `audience` | `{{auth0Audience}}` (send in URL) |

3. Click **Get New Access Token** and log in as the test user from the brief (`candidate@test.com`).
4. In the token dialog, click **Use Token**. Under **Use Token Type**, choose **Access token**, not ID token (ADR-008).

**Check the token you got, locally.** Don't paste tokens into websites. Copy the access token from Postman's token dialog, then:
```bash
pbpaste | node -e 'let t="";process.stdin.on("data",d=>t+=d).on("end",()=>{const [h,p]=t.trim().split(".");console.log(JSON.parse(Buffer.from(h,"base64url")),JSON.parse(Buffer.from(p,"base64url")))})'
```
Expect:
- header `alg: RS256`
- `aud` is a **list** containing `https://bbl-candidate-test-api`

If `aud` is missing or the token isn't a JWT, the `audience` parameter wasn't sent → every API call returns 401.

## 4. Seed data and ids for the privacy and sharing checks

The Auth0 tenant has one real user, so the seed adds two seed-only users (B and C) plus data for the real test user, including shares in both directions (ADR-016). It never deletes your own data.

```bash
cd backend && npx prisma db seed && cd ..
docker exec -i bbl-bookmarks-postgres psql -U bookmarks -d bookmarks -At < scripts/manual-test/print-seed-ids.sql
```

The second command prints three lines, for example:
```
bCollectionId=5f1421de-…
bBookmarkId=81e8f320-…
sharedFromBCollectionId=32df484a-…
```
In Postman, open the collection → **Variables** tab and paste each into the **Current value** of the variable with the same name.

## 5. Run the requests

**Option A, all at once:** right-click the collection → **Run collection** → keep the order → **Run**. Every request should be green.
**Option B, one by one:** run folders 0 → 7 in order. Later requests use ids saved by earlier ones (`collectionId`, `bookmarkId`, …).

| Folder | What it proves | Expected |
|---|---|---|
| **0. Sign-in check** | Real token accepted; user created; profile synced from Auth0 `/userinfo` | `GET /me` 200, `candidate@test.com`, `emailVerified: true`; saves `myUserId` |
| **1. Authentication failures** | Global guard; same generic body for every cause | No token → 401 `WWW-Authenticate: Bearer`; bad token → 401 `Bearer error="invalid_token"`; both Problem Details `unauthorized` |
| **2. Collections** | CRUD, filters, pagination, validation, existence hiding | POST 201 + `Location`, trimmed name, `ownerId` = you · list / `name` filter (case-insensitive, `%` literal) · `limit=1` then `cursor` returns a different item · GET/PUT/PATCH 200 · random UUID and `not-a-uuid` → **identical 404** · `ownerId` in body, blank name, `{}` PATCH, unknown query param, bad cursor → 400 |
| **3. Bookmarks** | CRUD, filters, collection rules, URL safety | POST 201, blank notes → `null` · filters `collectionId=<mine>`, `none`, `q` · PATCH move between collections, `null` clears · PUT nulls omitted fields · `javascript:` URL → 400 · random `collectionId` → 400 `collection not found` · random id → 404 |
| **4. Collection bookmarks + delete rules** | Nested list; ADR-005/005b | Nested list 200 · delete non-empty without confirm → **409** + `bookmarkCount` · `confirm=yes` → 400 · `confirm=true` → 204 · its bookmark → 404 (cascade) · empty collection → 204 |
| **5. Cross-user privacy** | Brief §3 invariant with a second real row | Every GET/PUT/PATCH/DELETE on B's collection or bookmark → **404 with the same body** as a random id · `?collectionId=<B's>` → `{data: [], nextCursor: null}` · `?q=secret` doesn't return B's bookmark · POST into B's collection → **400 `collection not found`**, the same as a random id |
| **7. Sharing** | ADR-006, ADR-015 | Share your collection with user C (`USER-C@Example.com` matched lower-cased) → 201 · again → 409 `already_shared` · unknown email → 404 `recipient_not_found` · yourself → 400 · on B's collection → generic 404 · list shares · `/shared/collections` shows B's "Team reading list" with `ownerEmail`, **no `ownerId`** · its bookmarks, no `ownerId` · your own or B's unshared collection via `/shared` → 404 · PATCH B's shared collection → 404 (read-only) · revoke → 204, again → 404 |
| **6. Error handling + CORS** | Problem Details edge cases; CORS allow-list | Malformed JSON → 400 with no parser text · 150 KB body → **413** `payload_too_large` · preflight from `http://localhost:3000` → allowed · from another origin → no `Access-Control-Allow-Origin` |

**Also confirm by hand (not scriptable in Postman):** after folder 5, B's data is untouched:
```bash
docker exec bbl-bookmarks-postgres psql -U bookmarks -d bookmarks -c "select c.name, b.title from \"Collection\" c join \"Bookmark\" b on b.\"collectionId\" = c.id join \"User\" u on u.id = c.\"ownerId\" where u.\"auth0Sub\" = 'seed|user-b' order by c.name"
```
Expected: `B private | Only B can see this` and the two "Team reading list" bookmarks, with no `hijacked` names or titles.

## 6. Clean up / reset

Folders 4 and 7 delete what the run created. To restore the seed-only users' data (B and C), run the seed again; it's idempotent and keeps your own data:
```bash
cd backend && npx prisma db seed
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Every request 401 `invalid_token` | Token is an **ID token** (Use Token Type) or was requested **without `audience`**. Get a new token (step 3). |
| 401 after ~2 hours | Access tokens live 2 h and no refresh token is issued. Get a new token. |
| Auth0 error "Callback URL mismatch" | "Authorize using browser" is checked (Postman then uses its own callback). Uncheck it; callback must be `http://localhost:3000/callback`. |
| `GET /me` 503 | API couldn't fetch Auth0 signing keys (network). Check internet access and retry. |
| Folder 5 or 7 requests fail (e.g. 200 instead of 404) | Seed id variables are empty, so the URL becomes `/collections/`. Run step 4 and paste the ids. |
| Folder 7 share with user C → 404 `recipient_not_found` | Seed not run on this database. Run step 4. |
| Folder 2 "limit=1" test fails (no cursor) | You have only one collection; run the two POST requests first (Run collection does this). |
| 413 test returns 400 | Body wasn't JSON; the request's pre-request script builds a 150 KB name, so run it inside the collection, not copied out. |

## How this collection was checked (and what wasn't)

- **Checked by the agent:** both JSON files parse; every Postman test script passes `node --check`; each of the 71 requests was sent to the running API without a token and got **401** (the route exists; an unknown route returns 404) or, for the CORS requests, the expected preflight behaviour. `npx prisma db seed` and `print-seed-ids.sql` were run against the dev database.
- **Not checked by the agent:** the Postman app itself (import, OAuth dialog, Collection Runner). The OAuth field names in the collection file follow Postman's v2.1 format, so if the Authorization tab looks different after import, set the values from the table in step 3.
