-- AlterTable
ALTER TABLE "CompanyBankAccount" ADD COLUMN     "ibanNumber" TEXT;

-- CreateIndex
CREATE INDEX "CompanyBankAccount_ibanNumber_idx" ON "CompanyBankAccount"("ibanNumber");
