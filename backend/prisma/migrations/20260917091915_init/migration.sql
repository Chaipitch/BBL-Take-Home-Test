-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "auth0Sub" TEXT NOT NULL,
    "email" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "ownerId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" UUID NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "notes" VARCHAR(10000),
    "collectionId" UUID,
    "ownerId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionShare" (
    "id" UUID NOT NULL,
    "collectionId" UUID NOT NULL,
    "granteeEmail" VARCHAR(320) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_auth0Sub_key" ON "User"("auth0Sub");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "Collection_ownerId_createdAt_idx" ON "Collection"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_id_ownerId_key" ON "Collection"("id", "ownerId");

-- CreateIndex
CREATE INDEX "Bookmark_ownerId_createdAt_idx" ON "Bookmark"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Bookmark_ownerId_collectionId_idx" ON "Bookmark"("ownerId", "collectionId");

-- CreateIndex
CREATE INDEX "CollectionShare_granteeEmail_idx" ON "CollectionShare"("granteeEmail");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionShare_collectionId_granteeEmail_key" ON "CollectionShare"("collectionId", "granteeEmail");

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_collectionId_ownerId_fkey" FOREIGN KEY ("collectionId", "ownerId") REFERENCES "Collection"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionShare" ADD CONSTRAINT "CollectionShare_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
