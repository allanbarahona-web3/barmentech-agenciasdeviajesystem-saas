CREATE TYPE "PriceTaxTreatment" AS ENUM ('TAX_INCLUDED', 'TAX_EXCLUDED');

ALTER TABLE "Contract"
ADD COLUMN "commercialTotal" DECIMAL(19,5),
ADD COLUMN "commercialCurrency" "Currency",
ADD COLUMN "paymentConditionType" "PaymentConditionType",
ADD COLUMN "paymentDueDate" DATE,
ADD COLUMN "commercialTaxTreatment" "PriceTaxTreatment",
ADD CONSTRAINT "Contract_commercial_total_nonnegative_chk"
  CHECK ("commercialTotal" >= 0),
ADD CONSTRAINT "Contract_commercial_terms_coherence_chk"
  CHECK (
    (
      "commercialTotal" IS NULL
      AND "commercialCurrency" IS NULL
      AND "paymentConditionType" IS NULL
      AND "paymentDueDate" IS NULL
      AND "commercialTaxTreatment" IS NULL
    )
    OR (
      "commercialTotal" IS NOT NULL
      AND "commercialCurrency" IS NOT NULL
      AND "paymentConditionType" IS NOT NULL
      AND "commercialTaxTreatment" IS NOT NULL
      AND (
        (
          "paymentConditionType" = 'CASH'
          AND "paymentDueDate" IS NULL
        )
        OR (
          "paymentConditionType" = 'CREDIT'
          AND "paymentDueDate" IS NOT NULL
        )
      )
    )
  );
