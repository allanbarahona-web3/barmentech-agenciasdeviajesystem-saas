CREATE TYPE "Currency" AS ENUM ('USD', 'CRC');

CREATE TABLE "sales_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "currency" "Currency" NOT NULL,
    "commercialSubtotal" DECIMAL(18,4) NOT NULL,
    "totalVat" DECIMAL(18,4) NOT NULL,
    "total" DECIMAL(18,4) NOT NULL,
    "paymentConditionType" "PaymentConditionType",
    "paymentTermValue" INTEGER,
    "paymentTermUnit" "PaymentTermUnit",
    "commercialObservations" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_order_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "serviceDetailsVersion" INTEGER,
    "serviceDetails" JSONB,
    "commercialNotes" TEXT,
    "subtotal" DECIMAL(18,4) NOT NULL,
    "vatPercentage" DECIMAL(7,4) NOT NULL,
    "vatAmount" DECIMAL(18,4) NOT NULL,
    "total" DECIMAL(18,4) NOT NULL,
    "participants" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sales_orders_tenantId_orderNumber_key" ON "sales_orders"("tenantId", "orderNumber");
CREATE UNIQUE INDEX "sales_orders_tenantId_sourceType_sourceId_key" ON "sales_orders"("tenantId", "sourceType", "sourceId");
CREATE UNIQUE INDEX "sales_orders_id_tenantId_key" ON "sales_orders"("id", "tenantId");
CREATE INDEX "sales_orders_tenantId_idx" ON "sales_orders"("tenantId");
CREATE INDEX "sales_orders_customerId_idx" ON "sales_orders"("customerId");
CREATE INDEX "sales_order_lines_tenantId_idx" ON "sales_order_lines"("tenantId");
CREATE INDEX "sales_order_lines_salesOrderId_idx" ON "sales_order_lines"("salesOrderId");

ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_salesOrderId_tenantId_fkey" FOREIGN KEY ("salesOrderId", "tenantId") REFERENCES "sales_orders"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
