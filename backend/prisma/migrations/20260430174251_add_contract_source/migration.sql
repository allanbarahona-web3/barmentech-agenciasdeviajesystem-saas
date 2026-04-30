/*
  Warnings:

  - Made the column `packageCode` on table `TravelPackage` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "ContractSource" AS ENUM ('SCHEDULED_TRIP', 'MIGRATION', 'CUSTOM_TRIP', 'QUOTE');

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "source" "ContractSource" NOT NULL DEFAULT 'SCHEDULED_TRIP';

-- AlterTable
ALTER TABLE "ContractDraft" ADD COLUMN     "source" "ContractSource" NOT NULL DEFAULT 'SCHEDULED_TRIP';

-- AlterTable
ALTER TABLE "TravelPackage" ALTER COLUMN "packageCode" SET NOT NULL;
