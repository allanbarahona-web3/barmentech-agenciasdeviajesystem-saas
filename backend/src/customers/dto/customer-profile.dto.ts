import { CustomerInfoDto } from "./customer-info.dto";
import { CustomerContractItemDto } from "./customer-contract-item.dto";
import { CustomerFinancialSummaryDto } from "./customer-financial-summary.dto";
import { CustomerStatisticsDto } from "./customer-statistics.dto";

/**
 * CustomerProfileDto
 * 
 * Complete customer profile aggregation response.
 * Combines customer data, contracts, financial summary, statistics, documents, and notes.
 */
export class CustomerProfileDto {
  customer!: CustomerInfoDto;
  contracts!: CustomerContractItemDto[];
  financialSummary!: CustomerFinancialSummaryDto;
  statistics!: CustomerStatisticsDto;
  documents!: any[];
  notes!: any[];
}
