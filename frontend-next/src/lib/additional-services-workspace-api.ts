import { apiGet } from './api-client';

export type ActiveTravelType = 'INTERNATIONAL' | 'INTERNAL';

export interface ActiveTravelSelection {
  travelId: string;
  travelType: ActiveTravelType;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
}

export type TravelParticipantRole = 'HOLDER' | 'COMPANION' | 'MINOR';

export interface TravelContextParticipant {
  clientId: string;
  fullName: string;
  participantRole: TravelParticipantRole;
  identification?: string | null;
}

export interface TravelContext {
  travelId: string;
  travelType: ActiveTravelType;
  displayName: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
  participants: TravelContextParticipant[];
}

interface ActiveInternationalTravelResponse {
  travelId: string;
  travelType: 'INTERNATIONAL';
  name: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  status: string;
}

interface ActiveInternalTravelResponse {
  travelId: string;
  travelType: 'INTERNAL';
  status: string;
  internalTrip: {
    name: string;
    destination: string;
    departureDate: string;
    returnDate: string;
    status?: string;
  };
}

export async function getClientActiveTravels(
  clientId: string,
): Promise<ActiveTravelSelection[]> {
  const [international, internal] = await Promise.all([
    apiGet<ActiveInternationalTravelResponse[]>(
      `/travel-packages/client/${encodeURIComponent(clientId)}/active`,
    ),
    apiGet<ActiveInternalTravelResponse[]>('/internal-bookings', {
      params: { clientId },
    }),
  ]);

  return [
    ...international.map((travel) => ({
      travelId: travel.travelId,
      travelType: travel.travelType,
      name: travel.name,
      destination: travel.destination,
      startDate: travel.departureDate,
      endDate: travel.returnDate,
      status: travel.status,
    })),
    ...internal.map((booking) => ({
      travelId: booking.travelId,
      travelType: booking.travelType,
      name: booking.internalTrip.name,
      destination: booking.internalTrip.destination,
      startDate: booking.internalTrip.departureDate,
      endDate: booking.internalTrip.returnDate,
      status: booking.internalTrip.status ?? booking.status,
    })),
  ].sort(
    (left, right) =>
      new Date(left.startDate).getTime() - new Date(right.startDate).getTime(),
  );
}

export function getTravelContext(
  travelType: ActiveTravelType,
  travelId: string,
): Promise<TravelContext> {
  return apiGet<TravelContext>(
    `/travel-context/${encodeURIComponent(travelType)}/${encodeURIComponent(
      travelId,
    )}`,
  );
}
