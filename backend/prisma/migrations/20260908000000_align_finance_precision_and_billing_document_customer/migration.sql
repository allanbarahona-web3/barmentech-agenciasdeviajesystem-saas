ALTER TABLE "account_receivables"
ALTER COLUMN "originalAmount" TYPE NUMERIC(19,5),
ALTER COLUMN "outstandingAmount" TYPE NUMERIC(19,5);

ALTER TABLE "payments"
ALTER COLUMN "receivedAmount" TYPE NUMERIC(19,5),
ALTER COLUMN "availableAmount" TYPE NUMERIC(19,5);

ALTER TABLE "payment_allocations"
ALTER COLUMN "amount" TYPE NUMERIC(19,5);

ALTER TABLE "billing_documents"
ADD COLUMN "customerId" TEXT;

CREATE UNIQUE INDEX "Client_id_tenantId_key"
ON "Client"("id", "tenantId");

CREATE INDEX "billing_documents_tenant_customer_idx"
ON "billing_documents"("tenantId", "customerId");

ALTER TABLE "billing_documents"
ADD CONSTRAINT "billing_documents_customer_tenant_fkey"
FOREIGN KEY ("customerId", "tenantId")
REFERENCES "Client"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;
