import type {
  AccommodationType,
  BaggageType,
  InsuranceCoverage,
  LodgingType,
  SeatPreference,
  TransportationType,
  VisaType,
} from '@/lib/additional-services-temporary-store';

export const SERVICE_NAMES: Record<string, string> = {
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

export const BAGGAGE_NAMES: Record<BaggageType, string> = {
  CARRY_ON: 'Carry On',
  HAND_BAGGAGE: 'Equipaje de mano',
  CHECKED_BAGGAGE: 'Equipaje documentado',
};

export const LODGING_NAMES: Record<LodgingType, string> = {
  HOTEL_WITH_BREAKFAST: 'Hotel con desayuno',
  HOTEL_WITHOUT_BREAKFAST: 'Hotel sin desayuno',
  HOSTEL: 'Hostal',
  AIRBNB: 'Airbnb',
};

export const ACCOMMODATION_NAMES: Record<AccommodationType, string> = {
  SINGLE: 'Habitación sencilla',
  DOUBLE: 'Habitación doble',
  TRIPLE: 'Habitación triple',
  QUADRUPLE: 'Habitación cuádruple',
};

export const INSURANCE_COVERAGE_NAMES: Record<
  Exclude<InsuranceCoverage, 'OTHER'>,
  string
> = {
  USD_35000: 'USD 35,000',
  USD_60000: 'USD 60,000',
};

export const TRANSPORTATION_NAMES: Record<TransportationType, string> = {
  AIRPLANE: 'Avión',
  UBER: 'Uber',
  TAXI: 'Taxi',
  TRAIN: 'Tren',
  FERRY: 'Ferry',
  SHUTTLE_BUS: 'Buseta',
  PRIVATE_TRANSPORT: 'Transporte privado',
};

export const SEAT_NAMES: Record<SeatPreference, string> = {
  WINDOW: 'Ventana',
  AISLE: 'Pasillo',
  MIDDLE: 'Centro',
  EXIT_ROW: 'Fila de salida',
  FRONT_CABIN: 'Parte delantera de la cabina',
  EXTRA_LEGROOM: 'Espacio adicional para las piernas',
  NO_PREFERENCE: 'Sin preferencia',
  OTHER: 'Otra',
};

export const VISA_TYPE_NAMES: Record<VisaType, string> = {
  TOURISM: 'Turismo',
  BUSINESS: 'Negocios',
  STUDENT: 'Estudiante',
  WORK: 'Trabajo',
  TRANSIT: 'Tránsito',
  OTHER: 'Otro',
};
