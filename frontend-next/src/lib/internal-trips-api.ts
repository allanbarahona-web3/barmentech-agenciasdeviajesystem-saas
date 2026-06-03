import { resolveApiBase } from './runtime-config';
import { getStoredToken } from './auth-api';

export interface CreateInternalTripInput {
  name: string;
  destination: string;
  description?: string;
  departureDate: string;
  returnDate: string;
  departureTime?: string;
  returnTime?: string;
  capacity: number;
  price: number;
  minReservation?: number;
  currency: string;
  transportType: 'AIR' | 'BUS' | 'PRIVATE' | 'CRUISE' | 'WALKING' | 'MIXED';
  itinerary: string;
}

export interface InternalTripDetail {
  id: string;
  tripCode: string;
  name: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  capacity: number;
  occupiedSlots: number;
  price: number | string;
  minReservation?: number | string | null;
  currency: string;
  status: string;
}

export async function createInternalTrip(data: CreateInternalTripInput) {
  const apiBase = resolveApiBase();
  const token = getStoredToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch(`${apiBase}/internal-trips`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `Error creating trip: ${response.statusText}`);
  }

  return response.json();
}

export async function getInternalTripById(id: string): Promise<InternalTripDetail> {
  const apiBase = resolveApiBase();
  const token = getStoredToken();

  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await fetch(`${apiBase}/internal-trips/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `Error fetching trip: ${response.statusText}`);
  }

  return response.json();
}
