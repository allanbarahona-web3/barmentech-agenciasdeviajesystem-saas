/*
  Warnings:

  - You are about to drop the column `ibanNumber` on the `CompanyBankAccount` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "CompanyBankAccount_ibanNumber_idx";

-- AlterTable
ALTER TABLE "CompanyBankAccount" DROP COLUMN "ibanNumber",
ADD COLUMN     "companyName" TEXT NOT NULL DEFAULT 'Viajes Alma Nova';

-- CreateIndex
CREATE INDEX "CompanyBankAccount_companyName_idx" ON "CompanyBankAccount"("companyName");
