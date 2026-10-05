-- Immutable source context is optional so existing OperationalRequirements
-- remain valid until a future materializer begins storing new snapshots.
ALTER TABLE "operational_requirements"
ADD COLUMN "sourceSnapshot" JSONB;
