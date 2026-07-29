-- CreateEnum
CREATE TYPE "AdditionalServiceExchangeRateType" AS ENUM ('SELL');

-- RenameColumn
ALTER TABLE "additional_service_orders"
RENAME COLUMN "currency" TO "quotationCurrency";

-- AlterTable
ALTER TABLE "additional_service_order_lines"
ADD COLUMN "quotationCurrency" "AdditionalServiceCurrency",
ADD COLUMN "supplierCostInQuotationCurrency" DECIMAL(18,4),
ADD COLUMN "exchangeRateId" TEXT,
ADD COLUMN "exchangeRateDate" DATE,
ADD COLUMN "exchangeRateSource" TEXT,
ADD COLUMN "exchangeRateBuyRate" DECIMAL(18,8),
ADD COLUMN "exchangeRateSellRate" DECIMAL(18,8),
ADD COLUMN "exchangeRateType" "AdditionalServiceExchangeRateType",
ADD COLUMN "appliedExchangeRate" DECIMAL(18,8);

-- Backfill snapshots created before quotation-currency support.
UPDATE "additional_service_order_lines" AS line
SET
  "quotationCurrency" = orders."quotationCurrency",
  "supplierCostInQuotationCurrency" = line."supplierCost",
  "appliedExchangeRate" = 1
FROM "additional_service_orders" AS orders
WHERE orders."id" = line."orderId";

-- Enforce required snapshot values after backfill.
ALTER TABLE "additional_service_order_lines"
ALTER COLUMN "quotationCurrency" SET NOT NULL,
ALTER COLUMN "supplierCostInQuotationCurrency" SET NOT NULL,
ALTER COLUMN "appliedExchangeRate" SET NOT NULL;

-- CreateIndex
CREATE INDEX "additional_service_order_lines_exchangeRateId_idx"
ON "additional_service_order_lines"("exchangeRateId");

-- AddForeignKey
ALTER TABLE "additional_service_order_lines"
ADD CONSTRAINT "additional_service_order_lines_exchangeRateId_fkey"
FOREIGN KEY ("exchangeRateId")
REFERENCES "ExchangeRate"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
