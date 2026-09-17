-- Manual testing only (docs/API_MANUAL_TESTING.md step 4). Prints ids from the seed data
-- (npx prisma db seed) to paste into Postman collection variables.
SELECT 'bCollectionId=' || c.id FROM "Collection" c JOIN "User" u ON u.id = c."ownerId"
 WHERE u."auth0Sub" = 'seed|user-b' AND c.name = 'B private'
UNION ALL
SELECT 'bBookmarkId=' || b.id FROM "Bookmark" b JOIN "Collection" c ON c.id = b."collectionId" JOIN "User" u ON u.id = b."ownerId"
 WHERE u."auth0Sub" = 'seed|user-b' AND c.name = 'B private'
UNION ALL
SELECT 'sharedFromBCollectionId=' || c.id FROM "Collection" c JOIN "User" u ON u.id = c."ownerId"
 WHERE u."auth0Sub" = 'seed|user-b' AND c.name = 'Team reading list';
