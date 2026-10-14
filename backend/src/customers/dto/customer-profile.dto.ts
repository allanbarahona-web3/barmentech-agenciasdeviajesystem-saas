import { CustomerInfoDto } from "./customer-info.dto";
import { CustomerContractItemDto } from "./customer-contract-item.dto";
import { CustomerStatisticsDto } from "./customer-statistics.dto";

/**
 * CustomerProfileDto
 * 
 * Complete customer profile aggregation response.
 * Combines customer data, contracts, statistics, documents, and notes.
 */
export class CustomerProfileDto {
  customer!: CustomerInfoDto;
  contracts!: CustomerContractItemDto[];
  statistics!: CustomerStatisticsDto;
  documents!: any[];
  notes!: any[];
  participationRole?: "MINOR";
  currentTrip?: {
    id: string | null;
    name: string;
    destination: string;
    startDate: Date | null;
    endDate: Date | null;
  };
  currentContract?: CustomerContractItemDto;
  responsibleAdult?: {
    clientId: string;
    fullName: string;
    participationRole: "HOLDER" | "COMPANION";
  } | null;
}
