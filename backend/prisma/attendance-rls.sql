-- ========================================
-- ATTENDANCE PHASE 1 - RLS POLICIES
-- ========================================
-- IMPORTANT:
-- This project uses app.current_tenant_id in RLS context.
-- Super admin (tenantId = null) bypass is handled in app layer by skipping
-- tenant context and using dedicated SUPER_ADMIN endpoints.

ALTER TABLE attendance_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_config FORCE ROW LEVEL SECURITY;

CREATE POLICY attendance_config_tenant_isolation_select ON attendance_config
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY attendance_config_tenant_isolation_insert ON attendance_config
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY attendance_config_tenant_isolation_update ON attendance_config
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY attendance_config_tenant_isolation_delete ON attendance_config
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

ALTER TABLE attendance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY attendance_entries_tenant_isolation_select ON attendance_entries
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY attendance_entries_tenant_isolation_insert ON attendance_entries
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY attendance_entries_tenant_isolation_update ON attendance_entries
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY attendance_entries_tenant_isolation_delete ON attendance_entries
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

ALTER TABLE attendance_daily_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_daily_summaries FORCE ROW LEVEL SECURITY;

CREATE POLICY attendance_summaries_tenant_isolation_select ON attendance_daily_summaries
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY attendance_summaries_tenant_isolation_insert ON attendance_daily_summaries
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY attendance_summaries_tenant_isolation_update ON attendance_daily_summaries
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY attendance_summaries_tenant_isolation_delete ON attendance_daily_summaries
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

ALTER TABLE attendance_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_corrections FORCE ROW LEVEL SECURITY;

CREATE POLICY attendance_corrections_tenant_isolation_select ON attendance_corrections
  FOR SELECT
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY attendance_corrections_tenant_isolation_insert ON attendance_corrections
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY attendance_corrections_tenant_isolation_update ON attendance_corrections
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY attendance_corrections_tenant_isolation_delete ON attendance_corrections
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
