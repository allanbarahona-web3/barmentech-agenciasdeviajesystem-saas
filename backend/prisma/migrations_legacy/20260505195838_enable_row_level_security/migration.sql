-- ========================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- ========================================
-- Esta migración habilita RLS en todas las tablas multi-tenant
-- para prevenir fugas de datos entre tenants a nivel de base de datos.
-- 
-- Contexto: El tenantId se pasa en cada request usando:
-- SET LOCAL app.current_tenant_id = 'tenant-id-here';
--
-- Política: Solo puedes ver/modificar datos de tu tenant.
-- ========================================

-- ========================================
-- 1. HABILITAR RLS EN TABLAS MULTI-TENANT
-- ========================================

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContractNumber" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contract" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContractDraft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingInvoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingCreditNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingClientBalance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingAuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExchangeRate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompanyBankAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TravelPackage" ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 2. POLÍTICAS PARA TABLA: User
-- ========================================

CREATE POLICY "tenant_isolation_select" ON "User"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_insert" ON "User"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_update" ON "User"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_delete" ON "User"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ========================================
-- 3. POLÍTICAS PARA TABLA: ContractNumber
-- ========================================

CREATE POLICY "tenant_isolation_select" ON "ContractNumber"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_insert" ON "ContractNumber"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_update" ON "ContractNumber"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_delete" ON "ContractNumber"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ========================================
-- 4. POLÍTICAS PARA TABLA: Contract
-- ========================================

CREATE POLICY "tenant_isolation_select" ON "Contract"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_insert" ON "Contract"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_update" ON "Contract"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_delete" ON "Contract"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ========================================
-- 5. POLÍTICAS PARA TABLA: ContractDraft
-- ========================================

CREATE POLICY "tenant_isolation_select" ON "ContractDraft"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_insert" ON "ContractDraft"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_update" ON "ContractDraft"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_delete" ON "ContractDraft"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ========================================
-- 6. POLÍTICAS PARA TABLA: Client
-- ========================================

CREATE POLICY "tenant_isolation_select" ON "Client"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_insert" ON "Client"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_update" ON "Client"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_delete" ON "Client"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ========================================
-- 7. POLÍTICAS PARA TABLA: BillingInvoice
-- ========================================

CREATE POLICY "tenant_isolation_select" ON "BillingInvoice"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_insert" ON "BillingInvoice"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_update" ON "BillingInvoice"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_delete" ON "BillingInvoice"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ========================================
-- 8. POLÍTICAS PARA TABLA: BillingPayment
-- ========================================

CREATE POLICY "tenant_isolation_select" ON "BillingPayment"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_insert" ON "BillingPayment"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_update" ON "BillingPayment"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_delete" ON "BillingPayment"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ========================================
-- 9. POLÍTICAS PARA TABLA: BillingReceipt
-- ========================================

CREATE POLICY "tenant_isolation_select" ON "BillingReceipt"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_insert" ON "BillingReceipt"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_update" ON "BillingReceipt"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_delete" ON "BillingReceipt"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ========================================
-- 10. POLÍTICAS PARA TABLA: BillingCreditNote
-- ========================================

CREATE POLICY "tenant_isolation_select" ON "BillingCreditNote"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_insert" ON "BillingCreditNote"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_update" ON "BillingCreditNote"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_delete" ON "BillingCreditNote"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ========================================
-- 11. POLÍTICAS PARA TABLA: BillingClientBalance
-- ========================================

CREATE POLICY "tenant_isolation_select" ON "BillingClientBalance"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_insert" ON "BillingClientBalance"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_update" ON "BillingClientBalance"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_delete" ON "BillingClientBalance"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ========================================
-- 12. POLÍTICAS PARA TABLA: BillingAuditLog
-- ========================================

CREATE POLICY "tenant_isolation_select" ON "BillingAuditLog"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_insert" ON "BillingAuditLog"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_update" ON "BillingAuditLog"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_delete" ON "BillingAuditLog"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ========================================
-- 13. POLÍTICAS PARA TABLA: ExchangeRate
-- ========================================

CREATE POLICY "tenant_isolation_select" ON "ExchangeRate"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_insert" ON "ExchangeRate"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_update" ON "ExchangeRate"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_delete" ON "ExchangeRate"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ========================================
-- 14. POLÍTICAS PARA TABLA: CompanyBankAccount
-- ========================================

CREATE POLICY "tenant_isolation_select" ON "CompanyBankAccount"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_insert" ON "CompanyBankAccount"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_update" ON "CompanyBankAccount"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_delete" ON "CompanyBankAccount"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ========================================
-- 15. POLÍTICAS PARA TABLA: TravelPackage
-- ========================================

CREATE POLICY "tenant_isolation_select" ON "TravelPackage"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_insert" ON "TravelPackage"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_update" ON "TravelPackage"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_delete" ON "TravelPackage"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ========================================
-- 16. POLÍTICAS ESPECIALES PARA TENANT TABLE
-- ========================================
-- La tabla Tenant NO tiene tenantId (es la raíz del multi-tenant)
-- Permitimos SELECT a todos (necesario para resolver tenant por dominio)
-- Pero INSERT/UPDATE/DELETE requieren bypassar RLS (solo en seeds/migrations)

ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_select_tenants" ON "tenants"
  FOR SELECT
  USING (true);

-- Para INSERT/UPDATE/DELETE en tenants, usar: SET LOCAL row_security = off;
-- Esto se hará en el seed.ts cuando se necesite crear/modificar tenants

-- ========================================
-- NOTAS IMPORTANTES
-- ========================================
-- 
-- 1. Para que RLS funcione, DEBES setear el tenant_id en cada request:
--    await prisma.$executeRaw`SET LOCAL app.current_tenant_id = ${tenantId}`;
--
-- 2. Para operaciones de sistema (seeds, migrations) que necesiten bypasear RLS:
--    await prisma.$executeRaw`SET LOCAL row_security = off`;
--
-- 3. El setting es LOCAL (solo para la transacción actual), se limpia automáticamente
--
-- 4. Si olvidas setear app.current_tenant_id, las queries NO devolverán datos
--    (porque current_setting devolverá vacío y no hará match con ningún tenant_id)
--
-- 5. Para debugging, verificar RLS:
--    SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
--
-- 6. Para ver políticas activas:
--    SELECT * FROM pg_policies WHERE schemaname = 'public';
--
-- ========================================