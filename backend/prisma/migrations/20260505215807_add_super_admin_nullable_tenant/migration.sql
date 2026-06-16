-- Support SUPER_ADMIN users without tenant assignment

ALTER TABLE "User"
ALTER COLUMN "tenantId" DROP NOT NULL;
