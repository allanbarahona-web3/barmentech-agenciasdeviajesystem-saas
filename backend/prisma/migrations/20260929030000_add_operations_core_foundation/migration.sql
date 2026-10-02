-- OPERATIONS-O2-DB: tenant-safe, source-independent Operations persistence foundation.
-- Operations source and service-purpose references intentionally remain neutral
-- scalar snapshots; no commercial-domain foreign keys are introduced here.

CREATE TYPE "OperationalRequirementStatus" AS ENUM (
    'PENDING', 'IN_PROGRESS', 'FULFILLED', 'CANCELLED', 'NOT_APPLICABLE'
);

CREATE TYPE "OperationalSoldValueScope" AS ENUM (
    'EXACT_SERVICE_LINE', 'ORDER_TOTAL', 'QUOTATION_TOTAL', 'CONTRACT_TOTAL',
    'PACKAGE_REFERENCE', 'NONE'
);

CREATE TYPE "OperationalFulfillmentStatus" AS ENUM (
    'DRAFT', 'RESERVED', 'PURCHASED', 'CONFIRMED', 'CANCELLED'
);

CREATE TYPE "OperationalEvidenceType" AS ENUM (
    'SUPPLIER_QUOTE', 'BOOKING_CONFIRMATION', 'TICKET', 'VOUCHER',
    'SUPPLIER_INVOICE', 'RECEIPT', 'INSURANCE_CERTIFICATE', 'SCREENSHOT', 'OTHER'
);

CREATE TABLE "operational_requirements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "travelPackageId" TEXT NOT NULL,
    "servicePurposeCode" VARCHAR(80) NOT NULL,
    "servicePurposeName" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "OperationalRequirementStatus" NOT NULL DEFAULT 'PENDING',
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "operationalDeadlineAt" TIMESTAMP(3),
    "assignedToUserId" TEXT,
    "assignedToName" TEXT,
    "sourceType" VARCHAR(80) NOT NULL,
    "sourceId" TEXT,
    "sourceLineId" TEXT,
    "sourceVersionId" TEXT,
    "sourceReference" TEXT,
    "sourceAcceptedAt" TIMESTAMP(3),
    "sourcePassengerGroupId" TEXT,
    "sourcePassengerGroupName" TEXT,
    "sourcePassengerGroupServiceCode" TEXT,
    "soldAmount" DECIMAL(19,5),
    "soldCurrency" VARCHAR(3),
    "soldValueScope" "OperationalSoldValueScope" NOT NULL DEFAULT 'NONE',
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operational_requirements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operational_requirements_purpose_code_nonempty_chk"
      CHECK (char_length(btrim("servicePurposeCode")) > 0),
    CONSTRAINT "operational_requirements_purpose_name_nonempty_chk"
      CHECK (char_length(btrim("servicePurposeName")) > 0),
    CONSTRAINT "operational_requirements_description_nonempty_chk"
      CHECK (char_length(btrim("description")) > 0),
    CONSTRAINT "operational_requirements_source_type_nonempty_chk"
      CHECK (char_length(btrim("sourceType")) > 0),
    CONSTRAINT "operational_requirements_sold_currency_length_chk"
      CHECK ("soldCurrency" IS NULL OR char_length("soldCurrency") = 3)
);

CREATE TABLE "operational_requirement_passengers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "travelPackageId" TEXT NOT NULL,
    "operationalRequirementId" TEXT NOT NULL,
    "travelPackageParticipantId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operational_requirement_passengers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "operational_fulfillments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "travelPackageId" TEXT NOT NULL,
    "operationalRequirementId" TEXT NOT NULL,
    "servicePurposeCode" VARCHAR(80) NOT NULL,
    "servicePurposeName" VARCHAR(160) NOT NULL,
    "providerName" TEXT,
    "providerReference" TEXT,
    "reservationCode" TEXT,
    "confirmationReference" TEXT,
    "voucherReference" TEXT,
    "ticketReference" TEXT,
    "serviceStartAt" TIMESTAMP(3),
    "serviceEndAt" TIMESTAMP(3),
    "detailPayload" JSONB,
    "detailVersion" INTEGER,
    "status" "OperationalFulfillmentStatus" NOT NULL DEFAULT 'DRAFT',
    "assignedToUserId" TEXT,
    "assignedToName" TEXT,
    "confirmationNotes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operational_fulfillments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operational_fulfillments_purpose_code_nonempty_chk"
      CHECK (char_length(btrim("servicePurposeCode")) > 0),
    CONSTRAINT "operational_fulfillments_purpose_name_nonempty_chk"
      CHECK (char_length(btrim("servicePurposeName")) > 0),
    CONSTRAINT "operational_fulfillments_detail_version_chk"
      CHECK (
        ("detailPayload" IS NULL AND "detailVersion" IS NULL)
        OR ("detailPayload" IS NOT NULL AND "detailVersion" IS NOT NULL AND "detailVersion" > 0)
      )
);

CREATE TABLE "operational_fulfillment_passengers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "travelPackageId" TEXT NOT NULL,
    "operationalFulfillmentId" TEXT NOT NULL,
    "travelPackageParticipantId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operational_fulfillment_passengers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "operational_purchases" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "travelPackageId" TEXT NOT NULL,
    "operationalFulfillmentId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "supplierReference" TEXT,
    "amount" DECIMAL(19,5) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "taxAmount" DECIMAL(19,5),
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "supplierInvoiceNumber" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operational_purchases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operational_purchases_provider_name_nonempty_chk"
      CHECK (char_length(btrim("providerName")) > 0),
    CONSTRAINT "operational_purchases_currency_length_chk"
      CHECK (char_length("currency") = 3)
);

CREATE TABLE "operational_evidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "travelPackageId" TEXT NOT NULL,
    "operationalFulfillmentId" TEXT,
    "operationalPurchaseId" TEXT,
    "evidenceType" "OperationalEvidenceType" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "contentHash" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "uploadedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operational_evidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operational_evidence_parent_required_chk"
      CHECK ("operationalFulfillmentId" IS NOT NULL OR "operationalPurchaseId" IS NOT NULL),
    -- Purchase evidence carries the purchase's owning fulfillment as well, so
    -- one composite FK proves the complete Operations hierarchy.
    CONSTRAINT "operational_evidence_purchase_fulfillment_required_chk"
      CHECK ("operationalPurchaseId" IS NULL OR "operationalFulfillmentId" IS NOT NULL),
    CONSTRAINT "operational_evidence_byte_size_positive_chk"
      CHECK ("byteSize" > 0)
);

CREATE UNIQUE INDEX "operational_requirements_id_tenant_travel_key"
ON "operational_requirements"("id", "tenantId", "travelPackageId");

CREATE INDEX "operational_requirements_travel_status_deadline_idx"
ON "operational_requirements"("tenantId", "travelPackageId", "status", "operationalDeadlineAt", "id");

CREATE INDEX "operational_requirements_travel_purpose_status_idx"
ON "operational_requirements"("tenantId", "travelPackageId", "servicePurposeCode", "status", "id");

CREATE INDEX "operational_requirements_assignee_status_deadline_idx"
ON "operational_requirements"("tenantId", "assignedToUserId", "status", "operationalDeadlineAt", "id");

CREATE UNIQUE INDEX "orp_tenant_requirement_participant_key"
ON "operational_requirement_passengers"("tenantId", "operationalRequirementId", "travelPackageParticipantId");

CREATE INDEX "orp_tenant_travel_participant_requirement_idx"
ON "operational_requirement_passengers"("tenantId", "travelPackageId", "travelPackageParticipantId", "operationalRequirementId");

CREATE UNIQUE INDEX "operational_fulfillments_id_tenant_travel_key"
ON "operational_fulfillments"("id", "tenantId", "travelPackageId");

CREATE INDEX "operational_fulfillments_travel_requirement_status_created_idx"
ON "operational_fulfillments"("tenantId", "travelPackageId", "operationalRequirementId", "status", "createdAt", "id");

CREATE UNIQUE INDEX "ofp_tenant_fulfillment_participant_key"
ON "operational_fulfillment_passengers"("tenantId", "operationalFulfillmentId", "travelPackageParticipantId");

CREATE INDEX "ofp_tenant_travel_participant_fulfillment_idx"
ON "operational_fulfillment_passengers"("tenantId", "travelPackageId", "travelPackageParticipantId", "operationalFulfillmentId");

CREATE UNIQUE INDEX "operational_purchases_id_tenant_travel_key"
ON "operational_purchases"("id", "tenantId", "travelPackageId");

CREATE UNIQUE INDEX "operational_purchases_id_tenant_travel_fulfillment_key"
ON "operational_purchases"("id", "tenantId", "travelPackageId", "operationalFulfillmentId");

CREATE INDEX "operational_purchases_fulfillment_purchased_idx"
ON "operational_purchases"("tenantId", "operationalFulfillmentId", "purchasedAt", "id");

CREATE INDEX "operational_purchases_travel_purchased_idx"
ON "operational_purchases"("tenantId", "travelPackageId", "purchasedAt", "id");

CREATE UNIQUE INDEX "operational_evidence_object_key_key"
ON "operational_evidence"("objectKey");

CREATE INDEX "operational_evidence_fulfillment_created_idx"
ON "operational_evidence"("tenantId", "operationalFulfillmentId", "createdAt", "id");

CREATE INDEX "operational_evidence_purchase_created_idx"
ON "operational_evidence"("tenantId", "operationalPurchaseId", "createdAt", "id");

ALTER TABLE "operational_requirements"
ADD CONSTRAINT "operational_requirements_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operational_requirements"
ADD CONSTRAINT "operational_requirements_travel_tenant_fkey"
FOREIGN KEY ("travelPackageId", "tenantId") REFERENCES "TravelPackage"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_requirement_passengers"
ADD CONSTRAINT "operational_requirement_passengers_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operational_requirement_passengers"
ADD CONSTRAINT "orp_requirement_tenant_travel_fkey"
FOREIGN KEY ("operationalRequirementId", "tenantId", "travelPackageId")
REFERENCES "operational_requirements"("id", "tenantId", "travelPackageId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_requirement_passengers"
ADD CONSTRAINT "orp_participant_tenant_travel_fkey"
FOREIGN KEY ("travelPackageParticipantId", "tenantId", "travelPackageId")
REFERENCES "travel_package_participants"("id", "tenantId", "travelPackageId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_fulfillments"
ADD CONSTRAINT "operational_fulfillments_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operational_fulfillments"
ADD CONSTRAINT "operational_fulfillments_travel_tenant_fkey"
FOREIGN KEY ("travelPackageId", "tenantId") REFERENCES "TravelPackage"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_fulfillments"
ADD CONSTRAINT "operational_fulfillments_requirement_tenant_travel_fkey"
FOREIGN KEY ("operationalRequirementId", "tenantId", "travelPackageId")
REFERENCES "operational_requirements"("id", "tenantId", "travelPackageId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_fulfillment_passengers"
ADD CONSTRAINT "operational_fulfillment_passengers_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operational_fulfillment_passengers"
ADD CONSTRAINT "ofp_fulfillment_tenant_travel_fkey"
FOREIGN KEY ("operationalFulfillmentId", "tenantId", "travelPackageId")
REFERENCES "operational_fulfillments"("id", "tenantId", "travelPackageId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_fulfillment_passengers"
ADD CONSTRAINT "ofp_participant_tenant_travel_fkey"
FOREIGN KEY ("travelPackageParticipantId", "tenantId", "travelPackageId")
REFERENCES "travel_package_participants"("id", "tenantId", "travelPackageId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_purchases"
ADD CONSTRAINT "operational_purchases_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operational_purchases"
ADD CONSTRAINT "operational_purchases_travel_tenant_fkey"
FOREIGN KEY ("travelPackageId", "tenantId") REFERENCES "TravelPackage"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_purchases"
ADD CONSTRAINT "operational_purchases_fulfillment_tenant_travel_fkey"
FOREIGN KEY ("operationalFulfillmentId", "tenantId", "travelPackageId")
REFERENCES "operational_fulfillments"("id", "tenantId", "travelPackageId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_evidence"
ADD CONSTRAINT "operational_evidence_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "operational_evidence"
ADD CONSTRAINT "operational_evidence_travel_tenant_fkey"
FOREIGN KEY ("travelPackageId", "tenantId") REFERENCES "TravelPackage"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_evidence"
ADD CONSTRAINT "operational_evidence_fulfillment_tenant_travel_fkey"
FOREIGN KEY ("operationalFulfillmentId", "tenantId", "travelPackageId")
REFERENCES "operational_fulfillments"("id", "tenantId", "travelPackageId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_evidence"
ADD CONSTRAINT "operational_evidence_purchase_fulfillment_tenant_travel_fkey"
FOREIGN KEY ("operationalPurchaseId", "tenantId", "travelPackageId", "operationalFulfillmentId")
REFERENCES "operational_purchases"("id", "tenantId", "travelPackageId", "operationalFulfillmentId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_requirements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "operational_requirements" FORCE ROW LEVEL SECURITY;
ALTER TABLE "operational_requirement_passengers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "operational_requirement_passengers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "operational_fulfillments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "operational_fulfillments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "operational_fulfillment_passengers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "operational_fulfillment_passengers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "operational_purchases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "operational_purchases" FORCE ROW LEVEL SECURITY;
ALTER TABLE "operational_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "operational_evidence" FORCE ROW LEVEL SECURITY;

CREATE POLICY operational_requirements_tenant_select ON "operational_requirements"
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY operational_requirements_tenant_insert ON "operational_requirements"
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY operational_requirements_tenant_update ON "operational_requirements"
  FOR UPDATE USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY operational_requirements_tenant_delete ON "operational_requirements"
  FOR DELETE USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY operational_requirement_passengers_tenant_select ON "operational_requirement_passengers"
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY operational_requirement_passengers_tenant_insert ON "operational_requirement_passengers"
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY operational_requirement_passengers_tenant_update ON "operational_requirement_passengers"
  FOR UPDATE USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY operational_requirement_passengers_tenant_delete ON "operational_requirement_passengers"
  FOR DELETE USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY operational_fulfillments_tenant_select ON "operational_fulfillments"
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY operational_fulfillments_tenant_insert ON "operational_fulfillments"
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY operational_fulfillments_tenant_update ON "operational_fulfillments"
  FOR UPDATE USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY operational_fulfillments_tenant_delete ON "operational_fulfillments"
  FOR DELETE USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY operational_fulfillment_passengers_tenant_select ON "operational_fulfillment_passengers"
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY operational_fulfillment_passengers_tenant_insert ON "operational_fulfillment_passengers"
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY operational_fulfillment_passengers_tenant_update ON "operational_fulfillment_passengers"
  FOR UPDATE USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY operational_fulfillment_passengers_tenant_delete ON "operational_fulfillment_passengers"
  FOR DELETE USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY operational_purchases_tenant_select ON "operational_purchases"
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY operational_purchases_tenant_insert ON "operational_purchases"
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY operational_purchases_tenant_update ON "operational_purchases"
  FOR UPDATE USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY operational_purchases_tenant_delete ON "operational_purchases"
  FOR DELETE USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY operational_evidence_tenant_select ON "operational_evidence"
  FOR SELECT USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY operational_evidence_tenant_insert ON "operational_evidence"
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY operational_evidence_tenant_update ON "operational_evidence"
  FOR UPDATE USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);
CREATE POLICY operational_evidence_tenant_delete ON "operational_evidence"
  FOR DELETE USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
