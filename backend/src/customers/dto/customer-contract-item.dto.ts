/**
 * CustomerContractItemDto
 * 
 * Lightweight contract information for customer profile.
 * Contains only essential contract details without payload or documents.
 */
export class CustomerContractItemDto {
  id!: string;
  contractNumber!: string;
  destination!: string;
  travelName!: string;
  status!: string;
  source!: string;
  participantCount!: number;
  createdAt!: Date;
  startDate!: Date | null;
  endDate!: Date | null;
  role!: 'HOLDER' | 'COMPANION' | 'MINOR';
  responsibleMinors?: Array<{
    clientId: string;
    fullName: string;
  }>;
  participants!: Array<{
    clientId: string;
    fullName: string;
    participationRole: 'HOLDER' | 'COMPANION' | 'MINOR';
  }>;
}
