# Adding users

The app has **no user-management screen by design**: identity lives in Auth0, and the API creates a
user row the first time someone signs in (ADR-007, ADR-011). So there are two ways to add users, and
two tools:

| Need | Tool | Can log in? |
|---|---|---|
| People who sign into the UI | `node scripts/create-auth0-user.mjs --email "you+test{n}@gmail.com" --count 3` | **Yes**, after verifying their email |
| Test data, share recipients, many users fast | `cd backend && npx tsx scripts/create-app-users.ts --count 5 --with-data` | No (their Auth0 identities are invented) |

The seeded users (`user-b@example.com`, `user-c@example.com`) are the second kind.

## Creating real Auth0 accounts

```bash
node scripts/create-auth0-user.mjs --email "you+test1@gmail.com"                      # one account
node scripts/create-auth0-user.mjs --email "you+test{n}@gmail.com" --count 5 \
                                   --name "Tester {n}"                                # five accounts
echo "$PASSWORD" | node scripts/create-auth0-user.mjs --email you+ci@gmail.com --password-stdin
```
- You type the password; the script never stores, logs or echoes it, and never takes it from the command line.
- Accounts are created in **Bangkok Bank's tenant** through its public sign-up endpoint. Use plus-addressed
  versions of an inbox you control, so you receive Auth0's verification mail.
- **Verify each address** before using it as a share recipient: an unverified email answers
  `404 recipient_not_found` (ADR-006b), which is correct behaviour.
- The app needs nothing else: signing in creates the `User` row.

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

## 1. Get a second Auth0 identity

The brief provides one account (`candidate@test.com`). To sign in as somebody else, in order of preference:

| Option | How | Notes |
|---|---|---|
| **Sign-up on the login page** | Open the app, and on the Auth0 screen look for **Sign up** / "Create an account" | Only works if the tenant's database connection allows sign-ups. An automated check was inconclusive (the page is JavaScript-rendered and `/u/signup` answers `400`), so look at the screen. |
| **Social login** | If the login screen offers Google/GitHub, use a second account you own | The email arrives already verified, which matters for sharing. |
| **Ask BBL for a second test account** | The brief invites questions when genuinely blocked | Cleanest: no extra accounts created in someone else's tenant. |
| **Neither is available** | Keep the current approach | Cross-user behaviour is already proved by the automated suites (locally signed tokens for two users) and by the seeded users; say so in the README rather than pretending otherwise. |

> The agent will not create the account or type a password — that is yours to do.

**Email verification matters.** A share recipient must have a **verified** email (ADR-006b). A freshly
signed-up user has `email_verified: false` until they click the link Auth0 emails them, and until then
sharing to that address answers `404 recipient_not_found` — which is correct behaviour, not a bug.

## 2. Sign in as the second user

- **In the browser:** log out (the app's **Log out** button clears the Auth0 session too), then log in as the other account. To have both users side by side, use a normal window for one and a private window for the other.
- **For token-level checks:** `node scripts/inspect-tokens.mjs --switch-account` forces the Auth0 login screen even if a session exists, and prints who you signed in as (`sub`, `email`, `email_verified`).

## 3. What to verify with two real users

Run the API and frontend (README), then:

- [ ] **Provisioning.** Sign in as user 2 → `GET /me` returns their own id and email; the app shows an empty account. Their row appears: `docker exec bbl-bookmarks-postgres psql -U bookmarks -d bookmarks -Atc 'select "auth0Sub", email, "emailVerified" from "User"'`.
- [ ] **Isolation.** As user 2, open a URL containing one of user 1's collection or bookmark ids → "Not found". `/collections` and `/bookmarks` show none of user 1's data, and searching for a word that only exists in user 1's data returns nothing.
- [ ] **Sharing, both directions.** As user 1, share a collection with user 2's email → user 2 sees it under **Shared with me**, read-only (no edit/delete buttons), with user 1's email as the owner. As user 2, try user 1's collection URL directly (owner route) → "Not found".
- [ ] **Revoke.** User 1 revokes → user 2's shared page immediately shows "no longer shared with you".
- [ ] **Unverified recipient.** If user 2 has not verified their email yet, sharing to them returns "No account with a verified email matches this address" — expected (ADR-006b/c).
- [ ] **Their data stays theirs.** Create a collection as user 2, then sign back in as user 1 and confirm it is invisible.

## 4. Afterwards

Nothing to clean up in the app: users are created by signing in, and the seed never deletes them. If
you created an account in the tenant, remember it exists — the repo's seed and tests do not know
about it, and `npx prisma db seed` will not touch it.
