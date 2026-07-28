-- CreateTable
CREATE TABLE "additional_service_catalogs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "additional_service_catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "supplierType" TEXT,
    "supplierCategory" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "additional_service_pricing_configurations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "additionalServiceCatalogId" TEXT NOT NULL,
    "marginType" "AdditionalServiceMarginType" NOT NULL,
    "marginValue" DECIMAL(14,4) NOT NULL,
    "taxPercentage" DECIMAL(7,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "additional_service_pricing_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "additional_service_catalogs_tenantId_code_key"
ON "additional_service_catalogs"("tenantId", "code");

-- CreateIndex
CREATE INDEX "additional_service_catalogs_tenantId_idx"
ON "additional_service_catalogs"("tenantId");

-- CreateIndex
CREATE INDEX "additional_service_catalogs_tenantId_isActive_idx"
ON "additional_service_catalogs"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "additional_service_catalogs_tenantId_displayOrder_idx"
ON "additional_service_catalogs"("tenantId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenantId_name_key"
ON "suppliers"("tenantId", "name");

-- CreateIndex
CREATE INDEX "suppliers_tenantId_idx"
ON "suppliers"("tenantId");

-- CreateIndex
CREATE INDEX "suppliers_tenantId_isActive_idx"
ON "suppliers"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "additional_service_pricing_configurations_tenantId_additionalServiceCatalogId_key"
ON "additional_service_pricing_configurations"("tenantId", "additionalServiceCatalogId");

-- CreateIndex
CREATE INDEX "additional_service_pricing_configurations_tenantId_idx"
ON "additional_service_pricing_configurations"("tenantId");

-- CreateIndex
CREATE INDEX "additional_service_pricing_configurations_tenantId_isActive_idx"
ON "additional_service_pricing_configurations"("tenantId", "isActive");

-- AddForeignKey
ALTER TABLE "additional_service_catalogs"
ADD CONSTRAINT "additional_service_catalogs_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers"
ADD CONSTRAINT "suppliers_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_service_pricing_configurations"
ADD CONSTRAINT "additional_service_pricing_configurations_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_service_pricing_configurations"
ADD CONSTRAINT "additional_service_pricing_configurations_additionalServiceCatalogId_fkey"
FOREIGN KEY ("additionalServiceCatalogId") REFERENCES "additional_service_catalogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
