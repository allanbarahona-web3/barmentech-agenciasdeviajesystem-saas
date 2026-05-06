/*
  Warnings:

  - The `role` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/

-- ========================================
-- PASO 1: Guardar roles existentes en tabla temporal
-- ========================================
CREATE TEMP TABLE user_roles_backup AS 
SELECT id, role FROM "User";

-- ========================================
-- PASO 2: Crear enum UserRole
-- ========================================
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'CONTADOR', 'FACTURACION_COBROS', 'VENTAS', 'OPERACIONES', 'AGENT');

-- ========================================
-- PASO 3: Actualizar Tenant con campos de suspensión
-- ========================================
ALTER TABLE "tenants" ADD COLUMN     "planExpiresAt" TIMESTAMP(3),
ADD COLUMN     "planType" TEXT DEFAULT 'FREE',
ADD COLUMN     "suspendReason" TEXT,
ADD COLUMN     "suspendedAt" TIMESTAMP(3);

-- ========================================
-- PASO 4: Convertir columna role de String a UserRole
-- ========================================
ALTER TABLE "User" DROP COLUMN "role",
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'AGENT';

-- Restaurar roles desde backup (mapear valores)
UPDATE "User" u
SET role = CASE 
  WHEN b.role = 'ADMIN' THEN 'ADMIN'::"UserRole"
  WHEN b.role = 'CONTADOR' THEN 'CONTADOR'::"UserRole"
  WHEN b.role = 'FACTURACION_COBROS' THEN 'FACTURACION_COBROS'::"UserRole"
  WHEN b.role = 'VENTAS' THEN 'VENTAS'::"UserRole"
  WHEN b.role = 'OPERACIONES' THEN 'OPERACIONES'::"UserRole"
  WHEN b.role = 'AGENT' THEN 'AGENT'::"UserRole"
  ELSE 'AGENT'::"UserRole"
END
FROM user_roles_backup b
WHERE u.id = b.id;

-- ========================================
-- PASO 5: Crear tabla ClientPortalUser
-- ========================================
CREATE TABLE "ClientPortalUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "clientId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "activeJti" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPortalUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalUser_email_key" ON "ClientPortalUser"("email");

-- CreateIndex
CREATE INDEX "ClientPortalUser_tenantId_idx" ON "ClientPortalUser"("tenantId");

-- CreateIndex
CREATE INDEX "ClientPortalUser_clientId_idx" ON "ClientPortalUser"("clientId");

-- CreateIndex
CREATE INDEX "ClientPortalUser_email_idx" ON "ClientPortalUser"("email");

-- AddForeignKey
ALTER TABLE "ClientPortalUser" ADD CONSTRAINT "ClientPortalUser_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalUser" ADD CONSTRAINT "ClientPortalUser_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ========================================
-- PASO 6: Habilitar RLS en ClientPortalUser
-- ========================================
ALTER TABLE "ClientPortalUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientPortalUser" FORCE ROW LEVEL SECURITY;

-- ========================================
-- PASO 7: Crear políticas RLS para ClientPortalUser
-- ========================================

-- Política SELECT: Cliente puede ver solo sus propios datos del tenant
CREATE POLICY client_portal_user_select_policy ON "ClientPortalUser"
  FOR SELECT USING (
    "tenantId" = current_setting('app.current_tenant_id', true)::text
  );

-- Política INSERT: Cliente puede crearse solo en su tenant
CREATE POLICY client_portal_user_insert_policy ON "ClientPortalUser"
  FOR INSERT WITH CHECK (
    "tenantId" = current_setting('app.current_tenant_id', true)::text
  );

-- Política UPDATE: Cliente puede actualizar solo sus propios datos
CREATE POLICY client_portal_user_update_policy ON "ClientPortalUser"
  FOR UPDATE USING (
    "tenantId" = current_setting('app.current_tenant_id', true)::text
  );

-- Política DELETE: Cliente puede eliminarse solo de su tenant
CREATE POLICY client_portal_user_delete_policy ON "ClientPortalUser"
  FOR DELETE USING (
    "tenantId" = current_setting('app.current_tenant_id', true)::text
  );
