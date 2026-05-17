-- Enable RLS on internal tourism tables
ALTER TABLE "internal_trips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "internal_tour_bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "internal_tour_invoices" ENABLE ROW LEVEL SECURITY;

-- ========================================
-- POLICIES FOR TABLE: internal_trips
-- ========================================

CREATE POLICY "tenant_isolation_select" ON "internal_trips"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_insert" ON "internal_trips"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_update" ON "internal_trips"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_delete" ON "internal_trips"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ========================================
-- POLICIES FOR TABLE: internal_tour_bookings
-- ========================================

CREATE POLICY "tenant_isolation_select" ON "internal_tour_bookings"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_insert" ON "internal_tour_bookings"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_update" ON "internal_tour_bookings"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_delete" ON "internal_tour_bookings"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ========================================
-- POLICIES FOR TABLE: internal_tour_invoices
-- ========================================

CREATE POLICY "tenant_isolation_select" ON "internal_tour_invoices"
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_insert" ON "internal_tour_invoices"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_update" ON "internal_tour_invoices"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_delete" ON "internal_tour_invoices"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
