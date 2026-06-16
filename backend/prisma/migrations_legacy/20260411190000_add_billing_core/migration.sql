-- CreateTable
CREATE TABLE "BillingInvoice" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CRC',
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "verifiedAmount" DECIMAL(14,2) NOT NULL,
    "pendingAmount" DECIMAL(14,2) NOT NULL,
    "balanceAmount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FACTURA_EMITIDA',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BillingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CRC',
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ABONO_REPORTADO',
    "bankReference" TEXT,
    "payerName" TEXT,
    "notes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedByUserId" TEXT,
    "verifiedByName" TEXT,
    "rejectionReason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPaymentAttachment" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingPaymentAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingReceipt" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedByUserId" TEXT NOT NULL,
    "issuedByName" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedByName" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentToEmail" TEXT,
    "objectKeyPdf" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECIBO_PENDIENTE_VERIFICACION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingCreditNote" (
    "id" TEXT NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NC_EMITIDA',
    "sourceDocumentType" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedByUserId" TEXT NOT NULL,
    "issuedByName" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "appliedByUserId" TEXT,
    "appliedByName" TEXT,
    "objectKeyPdf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingCreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingClientBalance" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "availableCreditAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CRC',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BillingClientBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAuditLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "sourceIp" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_contractId_key" ON "BillingInvoice"("contractId");
CREATE UNIQUE INDEX "BillingInvoice_contractNumber_key" ON "BillingInvoice"("contractNumber");
CREATE UNIQUE INDEX "BillingInvoice_invoiceNumber_key" ON "BillingInvoice"("invoiceNumber");
CREATE INDEX "BillingInvoice_clientId_idx" ON "BillingInvoice"("clientId");
CREATE INDEX "BillingInvoice_status_idx" ON "BillingInvoice"("status");
CREATE INDEX "BillingInvoice_createdAt_idx" ON "BillingInvoice"("createdAt");

CREATE INDEX "BillingPayment_invoiceId_idx" ON "BillingPayment"("invoiceId");
CREATE INDEX "BillingPayment_contractId_idx" ON "BillingPayment"("contractId");
CREATE INDEX "BillingPayment_status_idx" ON "BillingPayment"("status");
CREATE INDEX "BillingPayment_reportedAt_idx" ON "BillingPayment"("reportedAt");

CREATE UNIQUE INDEX "BillingPaymentAttachment_objectKey_key" ON "BillingPaymentAttachment"("objectKey");
CREATE INDEX "BillingPaymentAttachment_paymentId_idx" ON "BillingPaymentAttachment"("paymentId");
CREATE INDEX "BillingPaymentAttachment_createdAt_idx" ON "BillingPaymentAttachment"("createdAt");

CREATE UNIQUE INDEX "BillingReceipt_paymentId_key" ON "BillingReceipt"("paymentId");
CREATE UNIQUE INDEX "BillingReceipt_receiptNumber_key" ON "BillingReceipt"("receiptNumber");
CREATE INDEX "BillingReceipt_invoiceId_idx" ON "BillingReceipt"("invoiceId");
CREATE INDEX "BillingReceipt_contractId_idx" ON "BillingReceipt"("contractId");
CREATE INDEX "BillingReceipt_status_idx" ON "BillingReceipt"("status");
CREATE INDEX "BillingReceipt_issuedAt_idx" ON "BillingReceipt"("issuedAt");

CREATE UNIQUE INDEX "BillingCreditNote_creditNoteNumber_key" ON "BillingCreditNote"("creditNoteNumber");
CREATE INDEX "BillingCreditNote_invoiceId_idx" ON "BillingCreditNote"("invoiceId");
CREATE INDEX "BillingCreditNote_contractId_idx" ON "BillingCreditNote"("contractId");
CREATE INDEX "BillingCreditNote_status_idx" ON "BillingCreditNote"("status");
CREATE INDEX "BillingCreditNote_issuedAt_idx" ON "BillingCreditNote"("issuedAt");

CREATE UNIQUE INDEX "BillingClientBalance_clientId_key" ON "BillingClientBalance"("clientId");

CREATE INDEX "BillingAuditLog_entityType_entityId_idx" ON "BillingAuditLog"("entityType", "entityId");
CREATE INDEX "BillingAuditLog_actorUserId_idx" ON "BillingAuditLog"("actorUserId");
CREATE INDEX "BillingAuditLog_createdAt_idx" ON "BillingAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BillingPaymentAttachment" ADD CONSTRAINT "BillingPaymentAttachment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "BillingPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BillingReceipt" ADD CONSTRAINT "BillingReceipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "BillingPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingReceipt" ADD CONSTRAINT "BillingReceipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingReceipt" ADD CONSTRAINT "BillingReceipt_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BillingCreditNote" ADD CONSTRAINT "BillingCreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingCreditNote" ADD CONSTRAINT "BillingCreditNote_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BillingClientBalance" ADD CONSTRAINT "BillingClientBalance_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
