ALTER TABLE "contract_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contract_notes" FORCE ROW LEVEL SECURITY;

CREATE POLICY contract_notes_tenant_select
ON "contract_notes"
FOR SELECT USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY contract_notes_tenant_insert
ON "contract_notes"
FOR INSERT WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY contract_notes_tenant_update
ON "contract_notes"
FOR UPDATE
USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY contract_notes_tenant_delete
ON "contract_notes"
FOR DELETE USING ("tenantId" = current_setting('app.current_tenant_id', true)::text);
