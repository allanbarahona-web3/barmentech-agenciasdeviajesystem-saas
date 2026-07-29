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
  title: string;
  icon: LucideIcon;
  disabled?: boolean;
}

export const ADDITIONAL_SERVICE_CATEGORIES: AdditionalServiceCategory[] = [
  { slug: 'baggage', title: 'Equipaje', icon: Luggage },
  { slug: 'accommodation', title: 'Hospedaje', icon: BedDouble },
  {
    slug: 'accommodation-type',
    title: 'Acomodación',
    icon: Building2,
  },
  { slug: 'insurance', title: 'Seguro', icon: ShieldCheck },
  { slug: 'transportation', title: 'Transporte', icon: Bus },
  { slug: 'tours', title: 'Tours', icon: Map },
  { slug: 'tickets', title: 'Boletos aéreos', icon: Ticket },
  {
    slug: 'event-tickets',
    title: 'Boletos para eventos',
    icon: Tickets,
  },
  {
    slug: 'seat-selection',
    title: 'Selección de asiento',
    icon: Armchair,
  },
  { slug: 'extend-trip', title: 'Extender viaje', icon: CalendarPlus },
  { slug: 'shorten-trip', title: 'Acortar viaje', icon: CalendarMinus },
  {
    slug: 'visa-assistance',
    title: 'Asistencia para Visas',
    icon: Stamp,
  },
];

export function getAdditionalServiceCategory(slug: string) {
  return ADDITIONAL_SERVICE_CATEGORIES.find(
    (category) => category.slug === slug,
  );
}
