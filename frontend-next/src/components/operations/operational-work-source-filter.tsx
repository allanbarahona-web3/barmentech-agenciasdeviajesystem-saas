import { type OperationalWorkSourceCategory } from '@/lib/operations-api';
import { Select } from '@/components/ui/select';

const options: ReadonlyArray<{ value: OperationalWorkSourceCategory; label: string }> = [
  { value: 'ALL', label: 'Todos' },
  { value: 'BASE_TRIP', label: 'Base del viaje' },
  { value: 'ADDITIONAL_SERVICES', label: 'Servicios adicionales' },
];

export function OperationalWorkSourceFilter({ value, onChange }: { value: OperationalWorkSourceCategory; onChange: (value: OperationalWorkSourceCategory) => void }) {
  return <label className="flex min-w-52 flex-col gap-1 text-sm"><span className="font-medium">Origen del trabajo</span><Select value={value} onChange={(event) => onChange(event.target.value as OperationalWorkSourceCategory)} aria-label="Filtrar por origen del trabajo">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></label>;
}
