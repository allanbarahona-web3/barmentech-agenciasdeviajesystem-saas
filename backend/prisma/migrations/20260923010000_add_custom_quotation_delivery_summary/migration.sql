-- CUSTOM-QUOTATION-DELIVERY-STATUS-BE-01: latest successful commercial proposal delivery summary.

ALTER TABLE "custom_quotation_versions"
  ADD COLUMN "deliverySentAt" TIMESTAMP(3),
  ADD COLUMN "deliveryRecipientEmail" TEXT;
