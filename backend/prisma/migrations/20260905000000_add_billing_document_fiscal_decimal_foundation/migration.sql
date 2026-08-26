ALTER TABLE "billing_documents"
ADD COLUMN "fiscalCalculationPolicyVersion" VARCHAR(100),
ALTER COLUMN "grossSubtotal" TYPE DECIMAL(19,5)
USING "grossSubtotal"::DECIMAL(19,5),
ALTER COLUMN "discountTotal" TYPE DECIMAL(19,5)
USING "discountTotal"::DECIMAL(19,5),
ALTER COLUMN "taxableTotal" TYPE DECIMAL(19,5)
USING "taxableTotal"::DECIMAL(19,5),
ALTER COLUMN "exemptTotal" TYPE DECIMAL(19,5)
USING "exemptTotal"::DECIMAL(19,5),
ALTER COLUMN "exoneratedTotal" TYPE DECIMAL(19,5)
USING "exoneratedTotal"::DECIMAL(19,5),
ALTER COLUMN "grossTaxTotal" TYPE DECIMAL(19,5)
USING "grossTaxTotal"::DECIMAL(19,5),
ALTER COLUMN "exoneratedTaxTotal" TYPE DECIMAL(19,5)
USING "exoneratedTaxTotal"::DECIMAL(19,5),
ALTER COLUMN "netTaxTotal" TYPE DECIMAL(19,5)
USING "netTaxTotal"::DECIMAL(19,5),
ALTER COLUMN "total" TYPE DECIMAL(19,5)
USING "total"::DECIMAL(19,5);

ALTER TABLE "billing_document_lines"
ALTER COLUMN "unitPrice" TYPE DECIMAL(19,5)
USING "unitPrice"::DECIMAL(19,5),
ALTER COLUMN "grossAmount" TYPE DECIMAL(19,5)
USING "grossAmount"::DECIMAL(19,5),
ALTER COLUMN "discountAmount" TYPE DECIMAL(19,5)
USING "discountAmount"::DECIMAL(19,5),
ALTER COLUMN "taxableBase" TYPE DECIMAL(19,5)
USING "taxableBase"::DECIMAL(19,5),
ALTER COLUMN "taxAmount" TYPE DECIMAL(19,5)
USING "taxAmount"::DECIMAL(19,5),
ALTER COLUMN "exoneratedTaxAmount" TYPE DECIMAL(19,5)
USING "exoneratedTaxAmount"::DECIMAL(19,5),
ALTER COLUMN "netTaxAmount" TYPE DECIMAL(19,5)
USING "netTaxAmount"::DECIMAL(19,5),
ALTER COLUMN "lineSubtotal" TYPE DECIMAL(19,5)
USING "lineSubtotal"::DECIMAL(19,5),
ALTER COLUMN "lineTotal" TYPE DECIMAL(19,5)
USING "lineTotal"::DECIMAL(19,5);

ALTER TABLE "billing_line_taxes"
ALTER COLUMN "taxableBase" TYPE DECIMAL(19,5)
USING "taxableBase"::DECIMAL(19,5),
ALTER COLUMN "taxAmount" TYPE DECIMAL(19,5)
USING "taxAmount"::DECIMAL(19,5),
ALTER COLUMN "netTaxAmount" TYPE DECIMAL(19,5)
USING "netTaxAmount"::DECIMAL(19,5);

ALTER TABLE "billing_line_tax_exemptions"
ALTER COLUMN "exemptedAmount" TYPE DECIMAL(19,5)
USING "exemptedAmount"::DECIMAL(19,5);

ALTER TABLE "billing_document_payment_methods"
ALTER COLUMN "declaredAmount" TYPE DECIMAL(19,5)
USING "declaredAmount"::DECIMAL(19,5);

ALTER TABLE "billing_documents"
ADD CONSTRAINT "billing_docs_fiscal_calc_policy_version_chk"
CHECK (
    "fiscalCalculationPolicyVersion" IS NULL
    OR (
        char_length("fiscalCalculationPolicyVersion") BETWEEN 1 AND 100
        AND "fiscalCalculationPolicyVersion" = btrim("fiscalCalculationPolicyVersion")
    )
);
