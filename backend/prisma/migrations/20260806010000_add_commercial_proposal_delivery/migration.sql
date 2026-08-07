CREATE TYPE "CommercialProposalStatus" AS ENUM (
    'DRAFT',
    'PDF_GENERATED',
    'SENT',
    'APPROVED',
    'REJECTED',
    'EXPIRED'
);

ALTER TABLE "additional_service_orders"
ADD COLUMN "commercialStatus" "CommercialProposalStatus" DEFAULT 'DRAFT',
ADD COLUMN "proposalSentAt" TIMESTAMP(3),
ADD COLUMN "proposalSentToEmail" TEXT;
