CREATE TABLE "tenant_billing_configurations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "billingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "externalRegistrationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "electronicIssuanceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "countryCode" VARCHAR(2) NOT NULL DEFAULT 'CR',
    "defaultCurrencyCode" VARCHAR(3) NOT NULL DEFAULT 'CRC',
    "fiscalTimezone" VARCHAR(100) NOT NULL DEFAULT 'America/Costa_Rica',
    "fiscalSchemaVersion" VARCHAR(20) NOT NULL DEFAULT '4.4',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenant_billing_configurations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiscal_issuers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "legalName" TEXT NOT NULL,
    "identificationTypeCode" VARCHAR(4) NOT NULL,
    "identificationNumber" VARCHAR(30) NOT NULL,
    "commercialName" TEXT,
    "countryCode" VARCHAR(2) NOT NULL DEFAULT 'CR',
    "email" TEXT NOT NULL,
    "phoneCountryCode" VARCHAR(4),
    "phoneNumber" VARCHAR(20),
    "provinceCode" VARCHAR(2) NOT NULL,
    "cantonCode" VARCHAR(2) NOT NULL,
    "districtCode" VARCHAR(2) NOT NULL,
    "neighborhoodCode" VARCHAR(2),
    "otherAddressDetails" TEXT NOT NULL,
    "defaultCurrencyCode" VARCHAR(3),
    "establishmentCode" VARCHAR(3),
    "terminalCode" VARCHAR(5),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fiscal_issuers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiscal_issuer_economic_activities" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fiscalIssuerId" TEXT NOT NULL,
    "economicActivityCode" VARCHAR(10) NOT NULL,
    "description" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fiscal_issuer_economic_activities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_billing_configurations_tenantId_key" ON "tenant_billing_configurations"("tenantId");
CREATE UNIQUE INDEX "fiscal_issuers_id_tenantId_key" ON "fiscal_issuers"("id", "tenantId");
CREATE INDEX "fiscal_issuers_tenantId_isActive_idx" ON "fiscal_issuers"("tenantId", "isActive");
CREATE INDEX "fiscal_issuers_tenantId_identificationNumber_idx" ON "fiscal_issuers"("tenantId", "identificationNumber");
CREATE UNIQUE INDEX "fiscal_issuers_one_active_per_tenant_key" ON "fiscal_issuers"("tenantId") WHERE "isActive" = true;
CREATE UNIQUE INDEX "fiscal_issuer_economic_activities_fiscalIssuerId_economicActivityCode_key" ON "fiscal_issuer_economic_activities"("fiscalIssuerId", "economicActivityCode");
CREATE INDEX "fiscal_issuer_economic_activities_tenantId_idx" ON "fiscal_issuer_economic_activities"("tenantId");
CREATE INDEX "fiscal_issuer_economic_activities_fiscalIssuerId_displayOrder_idx" ON "fiscal_issuer_economic_activities"("fiscalIssuerId", "displayOrder");
CREATE UNIQUE INDEX "fiscal_issuer_economic_activities_one_primary_per_issuer_key" ON "fiscal_issuer_economic_activities"("fiscalIssuerId") WHERE "isPrimary" = true;

ALTER TABLE "tenant_billing_configurations" ADD CONSTRAINT "tenant_billing_configurations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiscal_issuers" ADD CONSTRAINT "fiscal_issuers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiscal_issuer_economic_activities" ADD CONSTRAINT "fiscal_issuer_economic_activities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiscal_issuer_economic_activities" ADD CONSTRAINT "fiscal_issuer_economic_activities_fiscalIssuerId_tenantId_fkey" FOREIGN KEY ("fiscalIssuerId", "tenantId") REFERENCES "fiscal_issuers"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
