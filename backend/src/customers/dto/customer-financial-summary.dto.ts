/**
 * CustomerFinancialSummaryDto
 * 
 * Financial summary counters for customer profile.
 * Contains only aggregate counts, not detailed records.
 */
export class CustomerFinancialSummaryDto {
  totalInvoices!: number;
  totalReceipts!: number;
  totalPayments!: number;
}
