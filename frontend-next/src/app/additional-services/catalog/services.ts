import {
  Armchair,
  BedDouble,
  Building2,
  Bus,
  CalendarMinus,
  CalendarPlus,
  Luggage,
  ShieldCheck,
  Ticket,
  Tickets,
  Stamp,
  type LucideIcon,
  Map,
} from 'lucide-react';

export interface AdditionalServiceCategory {
  slug: string;
  code: string;
  title: string;
  icon: LucideIcon;
  disabled?: boolean;
}

export const ADDITIONAL_SERVICE_CATEGORIES: AdditionalServiceCategory[] = [
  { slug: 'baggage', code: 'BAGGAGE', title: 'Equipaje', icon: Luggage },
  { slug: 'accommodation', code: 'LODGING', title: 'Hospedaje', icon: BedDouble },
  {
    slug: 'accommodation-type',
    code: 'ACCOMMODATION_TYPE',
    title: 'Acomodación',
    icon: Building2,
  },
  { slug: 'insurance', code: 'INSURANCE', title: 'Seguro', icon: ShieldCheck },
  { slug: 'transportation', code: 'TRANSPORTATION', title: 'Transporte', icon: Bus },
  { slug: 'tours', code: 'TOUR', title: 'Tours', icon: Map },
  { slug: 'tickets', code: 'FLIGHT_TICKET', title: 'Boletos aéreos', icon: Ticket },
  {
    slug: 'event-tickets',
    code: 'EVENT_TICKET',
    title: 'Boletos para eventos',
    icon: Tickets,
  },
  {
    slug: 'seat-selection',
    code: 'SEAT_SELECTION',
    title: 'Selección de asiento',
    icon: Armchair,
  },
  { slug: 'extend-trip', code: 'TRAVEL_EXTENSION', title: 'Extender viaje', icon: CalendarPlus },
  { slug: 'shorten-trip', code: 'TRIP_REDUCTION', title: 'Acortar viaje', icon: CalendarMinus },
  {
    slug: 'visa-assistance',
    code: 'VISA_ASSISTANCE',
    title: 'Asistencia para Visas',
    icon: Stamp,
  },
];

export function getAdditionalServiceCategory(slug: string) {
  return ADDITIONAL_SERVICE_CATEGORIES.find(
    (category) => category.slug === slug,
  );
}
