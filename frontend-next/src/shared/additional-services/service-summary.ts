import type {
  TemporaryAdditionalServiceLine,
} from '@/lib/additional-services-temporary-store';
import { formatBusinessDate } from '@/shared/regional';
import { getSpanishCountryName } from '@/shared/countries';
import {
  ACCOMMODATION_NAMES,
  BAGGAGE_NAMES,
  INSURANCE_COVERAGE_NAMES,
  LODGING_NAMES,
  SEAT_NAMES,
  SERVICE_NAMES,
  TRANSPORTATION_NAMES,
  VISA_TYPE_NAMES,
} from './commercial-service-labels';

const SERVICE_ROUTES: Record<
  TemporaryAdditionalServiceLine['serviceType'],
  string
> = {
  BAGGAGE: 'baggage',
  LODGING: 'accommodation',
  ACCOMMODATION_TYPE: 'accommodation-type',
  INSURANCE: 'insurance',
  TRANSPORTATION: 'transportation',
  TOUR: 'tours',
  FLIGHT_TICKET: 'tickets',
  SEAT_SELECTION: 'seat-selection',
  EVENT_TICKET: 'event-tickets',
  TRAVEL_EXTENSION: 'extend-trip',
  TRIP_REDUCTION: 'shorten-trip',
  VISA_ASSISTANCE: 'visa-assistance',
};

export function getAdditionalServiceName(
  line: TemporaryAdditionalServiceLine,
) {
  return SERVICE_NAMES[line.serviceType];
}

export function getAdditionalServiceFormRoute(
  line: TemporaryAdditionalServiceLine,
) {
  return `/additional-services/catalog/${SERVICE_ROUTES[line.serviceType]}`;
}

export function getAdditionalServiceSummary(
  line: TemporaryAdditionalServiceLine,
): string {
  switch (line.serviceType) {
    case 'BAGGAGE':
      return line.baggageTypes.map((type) => BAGGAGE_NAMES[type]).join(' · ');
    case 'LODGING':
      return LODGING_NAMES[line.lodgingType];
    case 'ACCOMMODATION_TYPE':
      return ACCOMMODATION_NAMES[line.accommodationType];
    case 'INSURANCE':
      if (line.coverage !== 'OTHER') {
        return INSURANCE_COVERAGE_NAMES[line.coverage];
      }
      return `USD ${(line.customCoverageAmount ?? 0).toLocaleString('en-US')}`;
    case 'TRANSPORTATION':
      return `${TRANSPORTATION_NAMES[line.transportationType]} · ${formatBusinessDate(line.serviceDate)}`;
    case 'TOUR':
      return `${line.tourName} · ${formatBusinessDate(line.serviceDate)}`;
    case 'FLIGHT_TICKET':
      return `${line.originAirport.iata} → ${line.destinationAirport.iata} · ${
        line.tripType === 'ROUND_TRIP' ? 'Ida y vuelta' : 'Solo ida'
      }`;
    case 'SEAT_SELECTION':
      return line.seatPreference === 'OTHER'
        ? line.otherPreferenceDescription ?? SEAT_NAMES.OTHER
        : SEAT_NAMES[line.seatPreference];
    case 'EVENT_TICKET':
      return `${line.eventName} · ${formatBusinessDate(line.serviceDate)}`;
    case 'TRAVEL_EXTENSION':
    case 'TRIP_REDUCTION':
      return `Regreso: ${formatBusinessDate(line.newReturnDate)}`;
    case 'VISA_ASSISTANCE':
      return `${getSpanishCountryName(line.destinationCountry) ?? line.destinationCountry} · ${VISA_TYPE_NAMES[line.visaType]}${
        line.expectedTravelDate
          ? ` · ${formatBusinessDate(line.expectedTravelDate)}`
          : ''
      }`;
  }
}
