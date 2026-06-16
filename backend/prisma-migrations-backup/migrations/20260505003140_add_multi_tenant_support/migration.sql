/*
  Warnings:

  - A unique constraint covering the columns `[date,tenantId]` on the table `ExchangeRate` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `tenantId` to the `BillingAuditLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `BillingClientBalance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `BillingCreditNote` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `BillingInvoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `BillingPayment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `BillingReceipt` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `CompanyBankAccount` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `Contract` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `ContractDraft` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `ContractNumber` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `ExchangeRate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `TravelPackage` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "ExchangeRate_date_key";

-- AlterTable
ALTER TABLE "BillingAuditLog" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "BillingClientBalance" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "BillingCreditNote" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "BillingInvoice" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "BillingPayment" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "BillingReceipt" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "CompanyBankAccount" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ContractDraft" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ContractNumber" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ExchangeRate" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "TravelPackage" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tenantId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subdomain" TEXT,
    "contractPrefix" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_name_key" ON "tenants"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_subdomain_key" ON "tenants"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_contractPrefix_key" ON "tenants"("contractPrefix");

-- CreateIndex
CREATE INDEX "BillingAuditLog_tenantId_idx" ON "BillingAuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "BillingClientBalance_tenantId_idx" ON "BillingClientBalance"("tenantId");

-- CreateIndex
CREATE INDEX "BillingCreditNote_tenantId_idx" ON "BillingCreditNote"("tenantId");

-- CreateIndex
CREATE INDEX "BillingInvoice_tenantId_idx" ON "BillingInvoice"("tenantId");

-- CreateIndex
CREATE INDEX "BillingPayment_tenantId_idx" ON "BillingPayment"("tenantId");

-- CreateIndex
CREATE INDEX "BillingReceipt_tenantId_idx" ON "BillingReceipt"("tenantId");

-- CreateIndex
CREATE INDEX "Client_tenantId_idx" ON "Client"("tenantId");

-- CreateIndex
CREATE INDEX "CompanyBankAccount_tenantId_idx" ON "CompanyBankAccount"("tenantId");

-- CreateIndex
CREATE INDEX "Contract_tenantId_idx" ON "Contract"("tenantId");

-- CreateIndex
CREATE INDEX "ContractDraft_tenantId_idx" ON "ContractDraft"("tenantId");

-- CreateIndex
CREATE INDEX "ContractNumber_tenantId_idx" ON "ContractNumber"("tenantId");

-- CreateIndex
CREATE INDEX "ExchangeRate_tenantId_idx" ON "ExchangeRate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_date_tenantId_key" ON "ExchangeRate"("date", "tenantId");

-- CreateIndex
CREATE INDEX "TravelPackage_tenantId_idx" ON "TravelPackage"("tenantId");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractNumber" ADD CONSTRAINT "ContractNumber_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDraft" ADD CONSTRAINT "ContractDraft_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingReceipt" ADD CONSTRAINT "BillingReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCreditNote" ADD CONSTRAINT "BillingCreditNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingClientBalance" ADD CONSTRAINT "BillingClientBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAuditLog" ADD CONSTRAINT "BillingAuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyBankAccount" ADD CONSTRAINT "CompanyBankAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelPackage" ADD CONSTRAINT "TravelPackage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
