/*
  Warnings:

  - Made the column `paymentReference` on table `Contract` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Contract" ALTER COLUMN "paymentReference" SET NOT NULL;
