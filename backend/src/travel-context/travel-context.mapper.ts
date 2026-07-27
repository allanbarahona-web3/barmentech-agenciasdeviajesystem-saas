import {
  TravelContextDto,
  TravelContextParticipantDto,
  TravelContextParticipantRole,
  TravelContextType,
} from './dto/travel-context.dto';

export interface TravelContextParticipantSource {
  clientId: string;
  role: TravelContextParticipantRole;
  client: {
    fullName: string;
  };
  operationalNotes?: string[];
}

export function mapTravelContextParticipants(
  participants: TravelContextParticipantSource[],
): TravelContextParticipantDto[] {
  return participants.map((participant) => ({
    clientId: participant.clientId,
    fullName: participant.client.fullName,
    participantRole: participant.role,
    operationalNotes: participant.operationalNotes ?? [],
  }));
}

export interface TravelContextSource {
  travelId: string;
  travelType: TravelContextType;
  displayName: string;
  destination: string;
  startDate: Date;
  endDate: Date;
  status: string;
  contractNumber?: string | null;
  participants: TravelContextParticipantSource[];
}

export function mapTravelContext(source: TravelContextSource): TravelContextDto {
  return {
    travelId: source.travelId,
    travelType: source.travelType,
    displayName: source.displayName,
    destination: source.destination,
    startDate: source.startDate,
    endDate: source.endDate,
    status: source.status,
    contractNumber: source.contractNumber ?? null,
    participants: mapTravelContextParticipants(source.participants),
  };
}
