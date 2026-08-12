CREATE UNIQUE INDEX "billing_line_tax_exemptions_billingLineTaxId_tenantId_key" ON "billing_line_tax_exemptions"("billingLineTaxId", "tenantId");
CREATE UNIQUE INDEX "payment_allocation_reversals_paymentAllocationId_tenantId_key" ON "payment_allocation_reversals"("paymentAllocationId", "tenantId");
