-- CreateEnum
CREATE TYPE "TravelPackageType" AS ENUM ('INTERNATIONAL', 'MIGRATION');

-- AlterTable
ALTER TABLE "TravelPackage" ADD COLUMN     "travelType" "TravelPackageType" NOT NULL DEFAULT 'INTERNATIONAL';

-- CreateIndex
CREATE INDEX "TravelPackage_tenantId_travelType_idx" ON "TravelPackage"("tenantId", "travelType");
