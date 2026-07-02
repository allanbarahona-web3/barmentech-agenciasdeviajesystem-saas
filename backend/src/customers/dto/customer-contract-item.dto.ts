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
  status!: string;
  source!: string;
  participantCount!: number;
  createdAt!: Date;
}
