CREATE TYPE "PaymentTermUnit" AS ENUM ('DAYS', 'MONTHS');

ALTER TABLE "additional_service_orders"
ADD COLUMN "paymentTermValue" INTEGER,
ADD COLUMN "paymentTermUnit" "PaymentTermUnit";
