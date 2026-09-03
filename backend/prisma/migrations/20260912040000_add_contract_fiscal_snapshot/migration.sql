CREATE TABLE "contract_fiscal_snapshots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "snapshotVersion" INTEGER NOT NULL DEFAULT 1,
    "currencyCode" "Currency" NOT NULL,
    "total" DECIMAL(19,5) NOT NULL,
    "paymentConditionType" "PaymentConditionType" NOT NULL,
    "paymentTermValue" INTEGER,
    "paymentTermUnit" "PaymentTermUnit",
    "customerId" TEXT NOT NULL,
    "receiverName" TEXT NOT NULL,
    "receiverIdentificationType" VARCHAR(4),
    "receiverIdentification" VARCHAR(30),
    "receiverEmail" TEXT,
    "source" "ContractSource" NOT NULL,
    "sourceReferenceId" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_fiscal_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contract_fiscal_snapshots_version_positive_chk"
      CHECK ("snapshotVersion" > 0),
    CONSTRAINT "contract_fiscal_snapshots_total_nonnegative_chk"
      CHECK ("total" >= 0),
    CONSTRAINT "contract_fiscal_snapshots_receiver_name_chk"
      CHECK (char_length(btrim("receiverName")) > 0),
    CONSTRAINT "contract_fiscal_snapshots_receiver_identity_chk"
      CHECK (
        ("receiverIdentificationType" IS NULL AND "receiverIdentification" IS NULL)
        OR (
          "receiverIdentificationType" IS NOT NULL
          AND char_length(btrim("receiverIdentificationType")) > 0
          AND "receiverIdentificationType" IN ('01', '02', '03', '04')
          AND "receiverIdentification" IS NOT NULL
          AND char_length(btrim("receiverIdentification")) > 0
        )
      ),
    CONSTRAINT "contract_fiscal_snapshots_receiver_email_chk"
      CHECK ("receiverEmail" IS NULL OR char_length(btrim("receiverEmail")) > 0),
    CONSTRAINT "contract_fiscal_snapshots_source_reference_chk"
      CHECK ("sourceReferenceId" IS NULL OR char_length(btrim("sourceReferenceId")) > 0),
    CONSTRAINT "contract_fiscal_snapshots_payment_condition_chk"
      CHECK (
        (
          "paymentConditionType" = 'CASH'
          AND "paymentTermValue" IS NULL
          AND "paymentTermUnit" IS NULL
        )
        OR (
          "paymentConditionType" = 'CREDIT'
          AND "paymentTermValue" IS NOT NULL
          AND "paymentTermValue" > 0
          AND "paymentTermUnit" = 'DAYS'
        )
      )
);

CREATE TABLE "contract_fiscal_snapshot_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contractFiscalSnapshotId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "fiscalItemCategory" "FiscalItemCategory" NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(19,5) NOT NULL,
    "grossAmount" DECIMAL(19,5) NOT NULL,
    "taxableBase" DECIMAL(19,5) NOT NULL,
    "cabysCode" VARCHAR(13) NOT NULL,
    "unitOfMeasureCode" VARCHAR(20) NOT NULL,
    "taxCode" VARCHAR(4) NOT NULL,
    "taxRateCode" VARCHAR(4) NOT NULL,
    "taxPercentage" DECIMAL(7,4) NOT NULL,
    "taxAmount" DECIMAL(19,5) NOT NULL,
    "lineSubtotal" DECIMAL(19,5) NOT NULL,
    "lineTotal" DECIMAL(19,5) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_fiscal_snapshot_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contract_fiscal_snapshot_lines_number_positive_chk"
      CHECK ("lineNumber" > 0),
    CONSTRAINT "contract_fiscal_snapshot_lines_description_chk"
      CHECK (char_length(btrim("description")) > 0),
    CONSTRAINT "contract_fiscal_snapshot_lines_quantity_positive_chk"
      CHECK ("quantity" > 0),
    CONSTRAINT "contract_fiscal_snapshot_lines_amounts_nonnegative_chk"
      CHECK (
        "unitPrice" >= 0
        AND "grossAmount" >= 0
        AND "taxableBase" >= 0
        AND "taxAmount" >= 0
        AND "lineSubtotal" >= 0
        AND "lineTotal" >= 0
      ),
    CONSTRAINT "contract_fiscal_snapshot_lines_tax_percentage_chk"
      CHECK ("taxPercentage" >= 0),
    CONSTRAINT "contract_fiscal_snapshot_lines_fiscal_values_chk"
      CHECK (
        char_length(btrim("cabysCode")) > 0
        AND char_length(btrim("unitOfMeasureCode")) > 0
        AND char_length(btrim("taxCode")) > 0
        AND char_length(btrim("taxRateCode")) > 0
      )
);

CREATE UNIQUE INDEX "contract_fiscal_snapshots_contract_tenant_key"
ON "contract_fiscal_snapshots"("contractId", "tenantId");

CREATE UNIQUE INDEX "contract_fiscal_snapshots_id_tenant_key"
ON "contract_fiscal_snapshots"("id", "tenantId");

CREATE INDEX "contract_fiscal_snapshots_tenant_source_idx"
ON "contract_fiscal_snapshots"("tenantId", "source", "sourceReferenceId");

CREATE INDEX "contract_fiscal_snapshots_tenant_created_idx"
ON "contract_fiscal_snapshots"("tenantId", "createdAt");

CREATE UNIQUE INDEX "contract_fiscal_snapshot_lines_tenant_snapshot_line_key"
ON "contract_fiscal_snapshot_lines"("tenantId", "contractFiscalSnapshotId", "lineNumber");

CREATE UNIQUE INDEX "contract_fiscal_snapshot_lines_id_tenant_key"
ON "contract_fiscal_snapshot_lines"("id", "tenantId");

ALTER TABLE "contract_fiscal_snapshots"
ADD CONSTRAINT "contract_fiscal_snapshots_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_fiscal_snapshots"
ADD CONSTRAINT "contract_fiscal_snapshots_contract_tenant_fkey"
FOREIGN KEY ("contractId", "tenantId") REFERENCES "Contract"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contract_fiscal_snapshots"
ADD CONSTRAINT "contract_fiscal_snapshots_customer_tenant_fkey"
FOREIGN KEY ("customerId", "tenantId") REFERENCES "Client"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contract_fiscal_snapshot_lines"
ADD CONSTRAINT "contract_fiscal_snapshot_lines_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contract_fiscal_snapshot_lines"
ADD CONSTRAINT "contract_fiscal_snapshot_lines_snapshot_tenant_fkey"
FOREIGN KEY ("contractFiscalSnapshotId", "tenantId")
REFERENCES "contract_fiscal_snapshots"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;
