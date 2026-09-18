-- COST-DB-01A: independent Cost Engine structural foundation.
-- The application runtime role must not be a superuser and must not have BYPASSRLS.

CREATE TYPE "CostingProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "CostCategoryOrigin" AS ENUM ('STANDARD', 'CUSTOM');
CREATE TYPE "CostComponentStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "costing_projects" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "baseCurrency" VARCHAR(3) NOT NULL,
    "status" "CostingProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "costing_projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cost_categories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "origin" "CostCategoryOrigin" NOT NULL DEFAULT 'CUSTOM',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cost_suppliers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cost_components" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "costingProjectId" TEXT NOT NULL,
    "costCategoryId" TEXT NOT NULL,
    "costSupplierId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CostComponentStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortPosition" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_components_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "costing_projects_id_tenant_key"
ON "costing_projects"("id", "tenantId");

CREATE INDEX "costing_projects_tenant_status_updated_idx"
ON "costing_projects"("tenantId", "status", "updatedAt", "id");

CREATE UNIQUE INDEX "cost_categories_tenant_code_key"
ON "cost_categories"("tenantId", "code");

CREATE UNIQUE INDEX "cost_categories_id_tenant_key"
ON "cost_categories"("id", "tenantId");

CREATE INDEX "cost_categories_tenant_active_idx"
ON "cost_categories"("tenantId", "isActive");

CREATE UNIQUE INDEX "cost_suppliers_tenant_name_key"
ON "cost_suppliers"("tenantId", "name");

CREATE UNIQUE INDEX "cost_suppliers_id_tenant_key"
ON "cost_suppliers"("id", "tenantId");

CREATE INDEX "cost_suppliers_tenant_active_idx"
ON "cost_suppliers"("tenantId", "isActive");

CREATE INDEX "cost_suppliers_tenant_name_idx"
ON "cost_suppliers"("tenantId", "name", "id");

CREATE UNIQUE INDEX "cost_components_id_tenant_key"
ON "cost_components"("id", "tenantId");

CREATE INDEX "cost_components_project_status_sort_idx"
ON "cost_components"("tenantId", "costingProjectId", "status", "sortPosition", "id");

CREATE INDEX "cost_components_project_category_idx"
ON "cost_components"("tenantId", "costingProjectId", "costCategoryId");

ALTER TABLE "costing_projects"
ADD CONSTRAINT "costing_projects_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cost_categories"
ADD CONSTRAINT "cost_categories_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cost_suppliers"
ADD CONSTRAINT "cost_suppliers_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cost_components"
ADD CONSTRAINT "cost_components_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cost_components"
ADD CONSTRAINT "cost_components_project_tenant_fkey"
FOREIGN KEY ("costingProjectId", "tenantId") REFERENCES "costing_projects"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cost_components"
ADD CONSTRAINT "cost_components_category_tenant_fkey"
FOREIGN KEY ("costCategoryId", "tenantId") REFERENCES "cost_categories"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cost_components"
ADD CONSTRAINT "cost_components_supplier_tenant_fkey"
FOREIGN KEY ("costSupplierId", "tenantId") REFERENCES "cost_suppliers"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "costing_projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "costing_projects" FORCE ROW LEVEL SECURITY;
ALTER TABLE "cost_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_categories" FORCE ROW LEVEL SECURITY;
ALTER TABLE "cost_suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_suppliers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "cost_components" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cost_components" FORCE ROW LEVEL SECURITY;

CREATE POLICY costing_projects_tenant_select ON "costing_projects"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY costing_projects_tenant_insert ON "costing_projects"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY costing_projects_tenant_update ON "costing_projects"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY costing_projects_tenant_delete ON "costing_projects"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY cost_categories_tenant_select ON "cost_categories"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY cost_categories_tenant_insert ON "cost_categories"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY cost_categories_tenant_update ON "cost_categories"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY cost_categories_tenant_delete ON "cost_categories"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY cost_suppliers_tenant_select ON "cost_suppliers"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY cost_suppliers_tenant_insert ON "cost_suppliers"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY cost_suppliers_tenant_update ON "cost_suppliers"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY cost_suppliers_tenant_delete ON "cost_suppliers"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY cost_components_tenant_select ON "cost_components"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY cost_components_tenant_insert ON "cost_components"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY cost_components_tenant_update ON "cost_components"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY cost_components_tenant_delete ON "cost_components"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
