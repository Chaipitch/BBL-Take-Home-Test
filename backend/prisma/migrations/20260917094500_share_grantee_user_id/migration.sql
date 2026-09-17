-- DropIndex
DROP INDEX "CollectionShare_collectionId_granteeEmail_key";

-- DropIndex
DROP INDEX "CollectionShare_granteeEmail_idx";

-- AlterTable
ALTER TABLE "CollectionShare" DROP COLUMN "granteeEmail",
ADD COLUMN     "granteeUserId" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "CollectionShare_granteeUserId_idx" ON "CollectionShare"("granteeUserId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionShare_collectionId_granteeUserId_key" ON "CollectionShare"("collectionId", "granteeUserId");

-- AddForeignKey
ALTER TABLE "CollectionShare" ADD CONSTRAINT "CollectionShare_granteeUserId_fkey" FOREIGN KEY ("granteeUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

