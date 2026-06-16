/*
  Warnings:

  - A unique constraint covering the columns `[paymentReference]` on the table `Contract` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "paymentReference" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Contract_paymentReference_key" ON "Contract"("paymentReference");
