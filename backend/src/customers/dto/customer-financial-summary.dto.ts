/**
 * CustomerFinancialSummaryDto
 * 
 * Real financial summary for customer profile.
 * Aggregates data from Billing module and Contracts module.
 * 
 * This DTO does NOT own financial calculations.
 * It merely presents aggregated data from authoritative sources.
 */
export class CustomerFinancialSummaryDto {
  // Monetary amounts
  totalContractedAmount!: number;
  totalInvoicedAmount!: number;
  totalPaidAmount!: number;
  outstandingBalance!: number;
  availableCredit!: number;

  // Last payment info
  lastPaymentDate!: string | null;
  lastPaymentAmount!: number | null;

  // Last contract info
  lastContractDate!: string | null;
  lastContractNumber!: string | null;

  // Record counts (kept for backward compatibility)
  totalInvoices!: number;
  totalReceipts!: number;
  totalPayments!: number;
}
