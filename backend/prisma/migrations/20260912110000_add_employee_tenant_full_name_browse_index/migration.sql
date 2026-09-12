-- CreateIndex
CREATE INDEX "employees_tenantId_fullName_id_idx" ON "employees"("tenantId", "fullName", "id");
