'use client';

import { formatTenantDateTimeInput, tenantDateTimeInputToUtc } from '@/shared/regional';
import { useTenantDateTimeFormatter, useTenantRegional } from '@/shared/regional/tenant-regional-provider';
import { FormField } from '@/components/patterns/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export type OperationalServiceDetailPayload = Record<string, string | number>;
type Field = { key: string; label: string; kind?: 'datetime' | 'number' | 'textarea' };

const fields: Record<string, readonly Field[]> = {
  AIRFARE: [
    { key: 'bookingLocator', label: 'Localizador / PNR' }, { key: 'airlineConfirmationNumber', label: 'Confirmación de aerolínea' },
    { key: 'eTicketNumber', label: 'Número de e-ticket' }, { key: 'ticketNumber', label: 'Número de boleto alterno' },
    { key: 'flightNumber', label: 'Número de vuelo' }, { key: 'departureAirport', label: 'Aeropuerto de salida' }, { key: 'arrivalAirport', label: 'Aeropuerto de llegada' },
    { key: 'departureAt', label: 'Salida', kind: 'datetime' }, { key: 'arrivalAt', label: 'Llegada', kind: 'datetime' }, { key: 'seat', label: 'Asiento' },
    { key: 'baggageNotes', label: 'Notas de equipaje', kind: 'textarea' }, { key: 'boardingReference', label: 'Referencia de abordaje' },
    { key: 'terminal', label: 'Terminal' }, { key: 'gate', label: 'Puerta' }, { key: 'boardingInstructions', label: 'Instrucciones de abordaje', kind: 'textarea' }, { key: 'serviceInstructions', label: 'Instrucciones del servicio', kind: 'textarea' },
  ],
  LODGING: [
    { key: 'propertyName', label: 'Nombre del alojamiento' }, { key: 'propertyAddress', label: 'Dirección', kind: 'textarea' }, { key: 'roomCount', label: 'Cantidad de habitaciones', kind: 'number' },
    { key: 'roomType', label: 'Tipo de habitación' }, { key: 'occupancy', label: 'Ocupación' }, { key: 'checkInAt', label: 'Check-in', kind: 'datetime' }, { key: 'checkOutAt', label: 'Check-out', kind: 'datetime' },
    { key: 'bookingInstructions', label: 'Instrucciones de reserva', kind: 'textarea' }, { key: 'accessInstructions', label: 'Instrucciones de acceso', kind: 'textarea' }, { key: 'contactName', label: 'Contacto' }, { key: 'contactPhone', label: 'Teléfono de contacto' },
  ],
  TOUR_ACTIVITY: [
    { key: 'activityName', label: 'Actividad' }, { key: 'meetingPoint', label: 'Punto de encuentro', kind: 'textarea' }, { key: 'pickupLocation', label: 'Lugar de recogida', kind: 'textarea' },
    { key: 'startAt', label: 'Inicio', kind: 'datetime' }, { key: 'endAt', label: 'Fin', kind: 'datetime' }, { key: 'participantCount', label: 'Participantes', kind: 'number' }, { key: 'operatorContact', label: 'Contacto del operador' }, { key: 'instructions', label: 'Instrucciones', kind: 'textarea' },
  ],
  TRANSPORTATION: [
    { key: 'pickupLocation', label: 'Lugar de recogida', kind: 'textarea' }, { key: 'dropoffLocation', label: 'Lugar de destino', kind: 'textarea' }, { key: 'pickupAt', label: 'Recogida', kind: 'datetime' }, { key: 'expectedDropoffAt', label: 'Llegada estimada', kind: 'datetime' },
    { key: 'vehicleType', label: 'Tipo de vehículo' }, { key: 'driverName', label: 'Conductor' }, { key: 'driverPhone', label: 'Teléfono del conductor' }, { key: 'operatorContact', label: 'Contacto del operador' }, { key: 'serviceInstructions', label: 'Instrucciones del servicio', kind: 'textarea' },
  ],
  GENERIC: [],
};

/** One Operations-owned v1 editor for every source; source type never selects fields. */
export function OperationalServiceDetailFields({ servicePurposeCode, detailVersion, value, onChange, readOnly = false, idPrefix = 'service-detail' }: { servicePurposeCode: string | null | undefined; detailVersion?: number | null; value: OperationalServiceDetailPayload; onChange?: (value: OperationalServiceDetailPayload) => void; readOnly?: boolean; idPrefix?: string }) {
  const { timeZone } = useTenantRegional();
  const formatDateTime = useTenantDateTimeFormatter();
  const purpose = operationalDetailPurpose(servicePurposeCode);
  const purposeFields = fields[purpose];
  if (purposeFields.length === 0) return readOnly ? <p className="text-sm text-muted-foreground">No hay detalles específicos para este servicio.</p> : null;
  const update = (field: Field, raw: string) => {
    const next = { ...value };
    if (!raw) delete next[field.key];
    else if (field.kind === 'number') next[field.key] = Number(raw);
    else if (field.kind === 'datetime') next[field.key] = tenantDateTimeInputToUtc(raw, timeZone) ?? raw;
    else next[field.key] = raw;
    onChange?.(next);
  };
  if (readOnly) return <dl className="grid gap-3 text-sm sm:grid-cols-2">{purposeFields.map((field) => value[field.key] === undefined ? null : <div key={field.key}><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{field.label}</dt><dd className="mt-1">{field.kind === 'datetime' ? formatDateTime(String(value[field.key])) : String(value[field.key])}</dd></div>)}</dl>;
  return <section className="space-y-4 border-t pt-4"><div><h3 className="font-medium">Detalles del servicio</h3><p className="text-sm text-muted-foreground">Información operativa específica (versión {detailVersion ?? 1}); no modifica la compra ni sus montos.</p></div><div className="grid gap-4 sm:grid-cols-2">{purposeFields.map((field) => <FormField key={field.key} htmlFor={`${idPrefix}-${field.key}`} label={field.label} className={field.kind === 'textarea' ? 'sm:col-span-2' : undefined}>{field.kind === 'textarea' ? <Textarea id={`${idPrefix}-${field.key}`} value={String(value[field.key] ?? '')} onChange={(event) => update(field, event.target.value)} maxLength={4000} /> : <Input id={`${idPrefix}-${field.key}`} type={field.kind === 'datetime' ? 'datetime-local' : field.kind === 'number' ? 'number' : 'text'} min={field.kind === 'number' ? 1 : undefined} value={field.kind === 'datetime' && value[field.key] ? formatTenantDateTimeInput(String(value[field.key]), timeZone) : String(value[field.key] ?? '')} onChange={(event) => update(field, event.target.value)} />}</FormField>)}</div></section>;
}

/** Historical CUSTOM_QUOTATION and unsupported purposes intentionally use GENERIC, with no raw JSON editor. */
export function operationalDetailPurpose(value: string | null | undefined) { return value === 'AIRFARE' || value === 'LODGING' || value === 'TOUR_ACTIVITY' || value === 'TRANSPORTATION' ? value : 'GENERIC'; }

export function typedOperationalDetail(value: Record<string, unknown> | null | undefined, servicePurposeCode: string | null | undefined): OperationalServiceDetailPayload {
  const allowed = new Set(fields[operationalDetailPurpose(servicePurposeCode)].map((field) => field.key));
  return Object.fromEntries(Object.entries(value ?? {}).filter(([key, item]) => allowed.has(key) && (typeof item === 'string' || typeof item === 'number'))) as OperationalServiceDetailPayload;
}
