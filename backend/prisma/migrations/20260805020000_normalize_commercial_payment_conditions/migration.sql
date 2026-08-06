UPDATE "additional_service_orders"
SET
  "paymentTermValue" = CASE
    WHEN BTRIM("paymentTerm") ~* '^[0-9]+[[:space:]]+(día|días|mes|meses)$'
      THEN SUBSTRING(BTRIM("paymentTerm") FROM '^([0-9]+)')::INTEGER
    ELSE NULL
  END,
  "paymentTermUnit" = CASE
    WHEN BTRIM("paymentTerm") ~* '^[0-9]+[[:space:]]+(día|días)$'
      THEN 'DAYS'::"PaymentTermUnit"
    WHEN BTRIM("paymentTerm") ~* '^[0-9]+[[:space:]]+(mes|meses)$'
      THEN 'MONTHS'::"PaymentTermUnit"
    ELSE NULL
  END
WHERE "paymentConditionType" = 'CREDIT';

UPDATE "additional_service_orders"
SET
  "paymentTermValue" = NULL,
  "paymentTermUnit" = NULL
WHERE "paymentConditionType" = 'CASH';

ALTER TABLE "additional_service_orders"
DROP COLUMN "paymentTerm";

ALTER TYPE "PaymentConditionType" RENAME TO "PaymentConditionType_old";

CREATE TYPE "PaymentConditionType" AS ENUM ('CASH', 'CREDIT');

ALTER TABLE "additional_service_orders"
ALTER COLUMN "paymentConditionType" TYPE "PaymentConditionType"
USING ("paymentConditionType"::TEXT::"PaymentConditionType");

DROP TYPE "PaymentConditionType_old";
