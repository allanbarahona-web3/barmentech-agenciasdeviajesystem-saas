import type {
  TemporaryAdditionalServiceLine,
} from '@/lib/additional-services-temporary-store';
import { formatBusinessDate } from '@/shared/regional';
import { getSpanishCountryName } from '@/shared/countries';

const SERVICE_NAMES: Record<
  TemporaryAdditionalServiceLine['serviceType'],
  string
> = {
  BAGGAGE: 'Equipaje',
  LODGING: 'Hospedaje',
  ACCOMMODATION_TYPE: 'Acomodación',
  INSURANCE: 'Seguro',
  TRANSPORTATION: 'Transporte',
  TOUR: 'Tour',
  FLIGHT_TICKET: 'Boleto aéreo',
  SEAT_SELECTION: 'Selección de asiento',
  EVENT_TICKET: 'Boleto para evento',
  TRAVEL_EXTENSION: 'Extensión de viaje',
  TRIP_REDUCTION: 'Reducción de viaje',
  VISA_ASSISTANCE: 'Asistencia para Visas',
};

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

const BAGGAGE_NAMES = {
  CARRY_ON: 'Carry On',
  HAND_BAGGAGE: 'Equipaje de mano',
  CHECKED_BAGGAGE: 'Equipaje documentado',
};

const LODGING_NAMES = {
  HOTEL_WITH_BREAKFAST: 'Hotel con desayuno',
  HOTEL_WITHOUT_BREAKFAST: 'Hotel sin desayuno',
  HOSTEL: 'Hostal',
  AIRBNB: 'Airbnb',
};

const ACCOMMODATION_NAMES = {
  SINGLE: 'Habitación sencilla',
  DOUBLE: 'Habitación doble',
  TRIPLE: 'Habitación triple',
  QUADRUPLE: 'Habitación cuádruple',
};

const TRANSPORTATION_NAMES = {
  AIRPLANE: 'Avión',
  UBER: 'Uber',
  TAXI: 'Taxi',
  TRAIN: 'Tren',
  FERRY: 'Ferry',
  SHUTTLE_BUS: 'Buseta',
  PRIVATE_TRANSPORT: 'Transporte privado',
};

const SEAT_NAMES = {
  WINDOW: 'Ventana',
  AISLE: 'Pasillo',
  MIDDLE: 'Centro',
  EXIT_ROW: 'Fila de salida',
  FRONT_CABIN: 'Parte delantera de la cabina',
  EXTRA_LEGROOM: 'Espacio adicional para las piernas',
  NO_PREFERENCE: 'Sin preferencia',
  OTHER: 'Otra',
};

const VISA_TYPE_NAMES = {
  TOURISM: 'Turismo',
  BUSINESS: 'Negocios',
  STUDENT: 'Estudiante',
  WORK: 'Trabajo',
  TRANSIT: 'Tránsito',
  OTHER: 'Otro',
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
      if (line.coverage === 'USD_35000') return 'USD 35,000';
      if (line.coverage === 'USD_60000') return 'USD 60,000';
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
