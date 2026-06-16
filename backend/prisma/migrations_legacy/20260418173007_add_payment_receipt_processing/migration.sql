-- AlterTable
ALTER TABLE "BillingPayment" ADD COLUMN     "destinationAccountId" TEXT,
ADD COLUMN     "destinationBank" TEXT,
ADD COLUMN     "originBank" TEXT,
ADD COLUMN     "paymentCode" TEXT,
ADD COLUMN     "receiptDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CompanyBankAccount" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "sinpeNumber" TEXT,
    "accountHolderName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReceiptImage" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "objectKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "extractedData" JSONB NOT NULL,
    "extractedAmount" DECIMAL(14,2),
    "extractedCurrency" TEXT,
    "extractedDate" TIMESTAMP(3),
    "extractedReference" TEXT,
    "extractedOriginBank" TEXT,
    "extractedDestinationBank" TEXT,
    "extractedDestinationAccount" TEXT,
    "extractedPayerName" TEXT,
    "extractedPaymentCode" TEXT,
    "extractedNotes" TEXT,
    "confidenceScore" DECIMAL(5,4),
    "processingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "processingError" TEXT,
    "processedAt" TIMESTAMP(3),
    "uploadedByUserId" TEXT NOT NULL,
    "uploadedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReceiptImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyBankAccount_accountNumber_key" ON "CompanyBankAccount"("accountNumber");

-- CreateIndex
CREATE INDEX "CompanyBankAccount_bankName_idx" ON "CompanyBankAccount"("bankName");

-- CreateIndex
CREATE INDEX "CompanyBankAccount_currency_idx" ON "CompanyBankAccount"("currency");

-- CreateIndex
CREATE INDEX "CompanyBankAccount_isActive_idx" ON "CompanyBankAccount"("isActive");

-- CreateIndex
CREATE INDEX "CompanyBankAccount_createdAt_idx" ON "CompanyBankAccount"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReceiptImage_paymentId_key" ON "PaymentReceiptImage"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReceiptImage_objectKey_key" ON "PaymentReceiptImage"("objectKey");

-- CreateIndex
CREATE INDEX "PaymentReceiptImage_paymentId_idx" ON "PaymentReceiptImage"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentReceiptImage_processingStatus_idx" ON "PaymentReceiptImage"("processingStatus");

-- CreateIndex
CREATE INDEX "PaymentReceiptImage_createdAt_idx" ON "PaymentReceiptImage"("createdAt");

-- CreateIndex
CREATE INDEX "BillingPayment_destinationAccountId_idx" ON "BillingPayment"("destinationAccountId");

-- CreateIndex
CREATE INDEX "BillingPayment_paymentCode_idx" ON "BillingPayment"("paymentCode");

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "CompanyBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReceiptImage" ADD CONSTRAINT "PaymentReceiptImage_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "BillingPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
