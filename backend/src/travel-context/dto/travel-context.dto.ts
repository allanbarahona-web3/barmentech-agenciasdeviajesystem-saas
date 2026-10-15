export enum TravelContextType {
  INTERNATIONAL = 'INTERNATIONAL',
  INTERNAL = 'INTERNAL',
}
export type TravelContextParticipantRole = 'HOLDER' | 'COMPANION' | 'MINOR';

export class TravelContextParticipantContractSourceDto {
  contractId!: string;
  contractNumber!: string;
  status!: string;
  sourceRole!: TravelContextParticipantRole;
}

export class TravelContextParticipantDto {
  clientId!: string;
  fullName!: string;
  participantRole!: TravelContextParticipantRole;
  operationalNotes!: string[];
  contractSources!: TravelContextParticipantContractSourceDto[];
}

export class TravelContextDto {
  travelId!: string;
  travelType!: TravelContextType;
  displayName!: string;
  destination!: string;
  startDate!: Date;
  endDate!: Date;
  status!: string;
  contractNumber!: string | null;
  participants!: TravelContextParticipantDto[];
}
