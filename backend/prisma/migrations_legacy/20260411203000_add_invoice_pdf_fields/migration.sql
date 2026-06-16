-- AlterTable
ALTER TABLE "BillingInvoice"
ADD COLUMN "objectKeyPdf" TEXT,
ADD COLUMN "pdfFileName" TEXT,
ADD COLUMN "pdfMimeType" TEXT,
ADD COLUMN "pdfSize" INTEGER;
