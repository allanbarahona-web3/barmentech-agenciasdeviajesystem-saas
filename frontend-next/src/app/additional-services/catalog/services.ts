import {
  BedDouble,
  Bus,
  CalendarMinus,
  CalendarPlus,
  Luggage,
  ShieldCheck,
  Ticket,
  type LucideIcon,
  Map,
} from 'lucide-react';

export interface AdditionalServiceCategory {
  slug: string;
  title: string;
  icon: LucideIcon;
}

export const ADDITIONAL_SERVICE_CATEGORIES: AdditionalServiceCategory[] = [
  { slug: 'baggage', title: 'Equipaje', icon: Luggage },
  { slug: 'accommodation', title: 'Hospedaje', icon: BedDouble },
  { slug: 'insurance', title: 'Seguro', icon: ShieldCheck },
  { slug: 'transportation', title: 'Transporte', icon: Bus },
  { slug: 'tours', title: 'Tours', icon: Map },
  { slug: 'tickets', title: 'Boletos', icon: Ticket },
  { slug: 'extend-trip', title: 'Extender viaje', icon: CalendarPlus },
  { slug: 'shorten-trip', title: 'Acortar viaje', icon: CalendarMinus },
];

export function getAdditionalServiceCategory(slug: string) {
  return ADDITIONAL_SERVICE_CATEGORIES.find(
    (category) => category.slug === slug,
  );
}
