-- Manual testing only (docs/API_MANUAL_TESTING.md): the Auth0 tenant has one test user, so a second
-- user "B" with one collection and one bookmark is inserted directly. Prints the ids to paste into
-- Postman. Safe to re-run (the user is reused; a new collection/bookmark is added each time).
WITH u AS (
  INSERT INTO "User" (id, "auth0Sub", email, "emailVerified", name, "profileSyncedAt", "updatedAt")
  VALUES (gen_random_uuid(), 'manual-test|user-b', 'user-b@example.com', true, 'User B', now(), now())
  ON CONFLICT ("auth0Sub") DO UPDATE SET "updatedAt" = now()
  RETURNING id
), c AS (
  INSERT INTO "Collection" (id, name, "ownerId", "updatedAt")
  SELECT gen_random_uuid(), 'B private collection', id, now() FROM u
  RETURNING id, "ownerId"
), b AS (
  INSERT INTO "Bookmark" (id, url, title, notes, "collectionId", "ownerId", "updatedAt")
  SELECT gen_random_uuid(), 'https://example.com/b-secret', 'B secret bookmark', 'only B may see this', id, "ownerId", now() FROM c
  RETURNING id, "collectionId"
)
SELECT 'bCollectionId=' || "collectionId" || E'\nbBookmarkId=' || id FROM b;
