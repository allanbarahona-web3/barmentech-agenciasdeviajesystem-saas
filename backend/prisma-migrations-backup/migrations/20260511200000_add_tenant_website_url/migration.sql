-- Add website_url to tenants table
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "website_url" TEXT;

COMMENT ON COLUMN "tenants"."website_url" IS 'Página web de la empresa (ej: https://viajesalmanova.com)';
