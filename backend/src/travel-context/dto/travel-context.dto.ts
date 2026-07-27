export enum TravelContextType {
  INTERNATIONAL = 'INTERNATIONAL',
  INTERNAL = 'INTERNAL',
}
export type TravelContextParticipantRole = 'HOLDER' | 'COMPANION' | 'MINOR';

export class TravelContextParticipantDto {
  clientId!: string;
  fullName!: string;
  participantRole!: TravelContextParticipantRole;
}

export class TravelContextDto {
  travelId!: string;
  travelType!: TravelContextType;
  displayName!: string;
  destination!: string;
  startDate!: Date;
  endDate!: Date;
  status!: string;
  participants!: TravelContextParticipantDto[];
}
