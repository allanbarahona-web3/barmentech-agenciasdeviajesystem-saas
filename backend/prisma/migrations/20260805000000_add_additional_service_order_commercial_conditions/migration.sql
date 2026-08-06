CREATE TYPE "PaymentConditionType" AS ENUM ('CASH', 'CREDIT', 'DEPOSIT');

ALTER TABLE "additional_service_orders"
ADD COLUMN "paymentConditionType" "PaymentConditionType",
ADD COLUMN "paymentTerm" TEXT,
ADD COLUMN "quotationValidUntil" TIMESTAMP(3),
ADD COLUMN "commercialObservations" TEXT;
