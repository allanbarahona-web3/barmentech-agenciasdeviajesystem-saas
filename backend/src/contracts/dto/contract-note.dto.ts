export interface ContractNoteDto {
  id: string;
  contractId: string;
  passengerType: string;
  passengerIndex: number | null;
  passengerName: string;
  note: string;
  status: string;
  archivedAt: Date | null;
  createdByUserId: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  tenantId: string;
}
