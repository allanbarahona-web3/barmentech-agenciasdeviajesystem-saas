-- DropIndex
DROP INDEX "Contract_status_idx";

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "htmlObjectKey" TEXT,
ADD COLUMN     "signaturePngObjectKey" TEXT,
ADD COLUMN     "viewedAt" TIMESTAMP(3);
