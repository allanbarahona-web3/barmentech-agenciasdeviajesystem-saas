-- LEAD-FOUNDATION-DB-01: tenant-safe pre-sale commercial identity foundation.

CREATE TYPE "LeadStatus" AS ENUM ('OPEN', 'CONVERTED');

CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "companyName" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'OPEN',
    "convertedCustomerId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leads_full_name_nonempty_chk"
      CHECK (char_length(btrim("fullName")) > 0),
    CONSTRAINT "leads_email_nonempty_chk"
      CHECK (char_length(btrim("email")) > 0),
    CONSTRAINT "leads_conversion_coherence_chk" CHECK (
      (
        "status" = 'OPEN'
        AND "convertedCustomerId" IS NULL
        AND "convertedAt" IS NULL
      )
      OR (
        "status" = 'CONVERTED'
        AND "convertedCustomerId" IS NOT NULL
        AND "convertedAt" IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX "leads_id_tenant_key"
ON "leads"("id", "tenantId");

CREATE INDEX "leads_tenant_status_created_idx"
ON "leads"("tenantId", "status", "createdAt" DESC, "id" DESC);

CREATE INDEX "leads_tenant_email_idx"
ON "leads"("tenantId", "email");

CREATE INDEX "leads_tenant_converted_customer_idx"
ON "leads"("tenantId", "convertedCustomerId");

ALTER TABLE "leads"
ADD CONSTRAINT "leads_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "leads"
ADD CONSTRAINT "leads_converted_customer_tenant_fkey"
FOREIGN KEY ("convertedCustomerId", "tenantId") REFERENCES "Client"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leads" FORCE ROW LEVEL SECURITY;

CREATE POLICY leads_tenant_select ON "leads"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY leads_tenant_insert ON "leads"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY leads_tenant_update ON "leads"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY leads_tenant_delete ON "leads"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
