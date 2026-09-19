# Adding users

The app has **no user-management screen by design**: identity lives in Auth0, and the API creates a
user row the first time someone signs in (ADR-007, ADR-011). So there are two ways to add users, and
two tools:

| Need | How | Can log in? |
|---|---|---|
| People who sign into the UI | **Sign in with Google** on the Auth0 screen — any Google account becomes a user | **Yes**, and its email arrives verified |
| Test data, share recipients, many users fast | `cd backend && npx tsx scripts/create-app-users.ts --count 5 --with-data` | No (their Auth0 identities are invented) |

The seeded users (`user-b@example.com`, `user-c@example.com`) are the second kind.

> **This tenant does not allow public sign-up.** `scripts/create-auth0-user.mjs` answers
> `public signup is disabled`. It is kept for tenants that allow it, and it now prints the alternatives.
> An earlier version of this document claimed sign-up was enabled — wrong: Auth0 validates the payload
> *before* checking that rule, so "missing password" and "connection not found" said nothing about it.

## Real logins: sign in with Google

The tenant has the `google-oauth2` connection enabled (verified: `/authorize?connection=google-oauth2`
redirects to Google's consent screen). Any Google account you own becomes a separate app user:

1. Open the app (or `node scripts/inspect-tokens.mjs --switch-account --connection google-oauth2` to go
   straight there) and choose **Continue with Google**.
2. Pick a Google account — a different one each time gives you a different user.
3. The app creates the `User` row on the first request. Google-issued emails are **already verified**, so
   the account can receive shares immediately.

Notes
- One Google account = one user; Gmail plus-addresses (`you+test1@gmail.com`) are *not* separate Google
  accounts, so they don't give you extra users.
- To be two people at once, use a normal window for one account and a private window for the other.
- If you need more real logins than you have Google accounts, ask BBL for extra test accounts — the brief
  invites questions when you are genuinely blocked.

### If a tenant ever allows password sign-up
`scripts/create-auth0-user.mjs --email "you+test{n}@gmail.com" --count 5` creates accounts through the
public sign-up endpoint; you type the password (never stored, logged, or passed on the command line),
and each address must click Auth0's verification link before it can receive shares (ADR-006b). On this
tenant it exits with `public signup is disabled` and prints the alternatives.

## Creating app users locally (no login)

```bash
cd backend
npx tsx scripts/create-app-users.ts --count 5                                   # five verified users
npx tsx scripts/create-app-users.ts --count 2 --prefix demo --with-data \
      --share-to candidate@test.com                                             # + data + shares to you
```
- Idempotent per `--prefix`: re-running updates instead of duplicating.
- `--with-data` gives each user a collection with two bookmarks plus one uncategorised bookmark.
- `--share-to <email>` shares each new collection with an existing **verified** user, so their
  "Shared with me" page has content; it refuses unknown or unverified recipients.
- Remove them again with, for example:
  `docker exec bbl-bookmarks-postgres psql -U bookmarks -d bookmarks -c "delete from \"User\" where \"auth0Sub\" like 'demo|%'"` (cascades to their data).
- Covered by `backend/test/create-app-users.e2e-spec.ts` (verified emails, idempotency, ownership, share rules).

## What the tenant allows (checked 2026-09-19)

| | |
|---|---|
| Password sign-up (`/dbconnections/signup`) | **Disabled** — `{"error":"public signup is disabled"}` |
| Google (`google-oauth2`) | **Enabled** — redirects to Google's consent screen |
| Provided account | `candidate@test.com` from the brief |

> The agent will not create accounts or type passwords; that stays with you.

**Email verification matters.** A share recipient must have a **verified** email (ADR-006b). A freshly
signed-up user has `email_verified: false` until they click the link Auth0 emails them, and until then
sharing to that address answers `404 recipient_not_found` — correct behaviour, not a bug. Local app
users (`create-app-users.ts`) are created verified, so they work as recipients immediately.

## Signing in as a different user

- **In the browser:** log out (the app's **Log out** button clears the Auth0 session too), then log in as the other account. To have both users side by side, use a normal window for one and a private window for the other.
- **For token-level checks:** `node scripts/inspect-tokens.mjs --switch-account` forces the Auth0 login screen even if a session exists, and prints who you signed in as (`sub`, `email`, `email_verified`).

## What to verify with two real users

Run the API and frontend (README), then:

- [ ] **Provisioning.** Sign in as user 2 → `GET /me` returns their own id and email; the app shows an empty account. Their row appears: `docker exec bbl-bookmarks-postgres psql -U bookmarks -d bookmarks -Atc 'select "auth0Sub", email, "emailVerified" from "User"'`.
- [ ] **Isolation.** As user 2, open a URL containing one of user 1's collection or bookmark ids → "Not found". `/collections` and `/bookmarks` show none of user 1's data, and searching for a word that only exists in user 1's data returns nothing.
- [ ] **Sharing, both directions.** As user 1, share a collection with user 2's email → user 2 sees it under **Shared with me**, read-only (no edit/delete buttons), with user 1's email as the owner. As user 2, try user 1's collection URL directly (owner route) → "Not found".
- [ ] **Revoke.** User 1 revokes → user 2's shared page immediately shows "no longer shared with you".
- [ ] **Unverified recipient.** If user 2 has not verified their email yet, sharing to them returns "No account with a verified email matches this address" — expected (ADR-006b/c).
- [ ] **Their data stays theirs.** Create a collection as user 2, then sign back in as user 1 and confirm it is invisible.

## Afterwards

- **Auth0 accounts** you create stay in the tenant; the repo's seed and tests never touch them.
- **Local app users** can be deleted by prefix (see above); deleting a user cascades to their collections,
  bookmarks and shares.
- `npx prisma db seed` leaves both kinds alone, except for its own `seed|…` users.
