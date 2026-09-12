import { IconBadge } from '@/components/ui/icon-badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/patterns/form-field';
import { SectionCard } from '@/components/patterns/section-card';
import { Search } from 'lucide-react';

type EmployeeFiltersProps = {
  status: string;
  search: string;
  position: string;
  department: string;
  onStatusChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onPositionChange: (value: string) => void;
  onDepartmentChange: (value: string) => void;
};

function EmployeeFilters({ status, search, position, department, onStatusChange, onSearchChange, onPositionChange, onDepartmentChange }: EmployeeFiltersProps) {
  return <SectionCard title={<span className="flex items-center gap-2"><IconBadge tone="info" size="sm"><Search aria-hidden="true" /></IconBadge>Filtros de búsqueda</span>} contentClassName="pt-4">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-12">
      <FormField className="xl:col-span-2" htmlFor="employee-filter-status" label="Estado"><Select id="employee-filter-status" value={status} onChange={(event) => onStatusChange(event.target.value)}><option value="">Todos</option><option value="ACTIVO">Activo</option><option value="SUSPENDIDO">Suspendido</option><option value="INACTIVO">Inactivo</option><option value="TERMINADO">Terminado</option></Select></FormField>
      <FormField className="xl:col-span-4" htmlFor="employee-filter-search" label="Buscar"><Input id="employee-filter-search" type="text" placeholder="Nombre, cédula o email..." value={search} onChange={(event) => onSearchChange(event.target.value)} /></FormField>
      <FormField className="xl:col-span-3" htmlFor="employee-filter-position" label="Posición"><Input id="employee-filter-position" type="text" placeholder="Ej: Agente Senior" value={position} onChange={(event) => onPositionChange(event.target.value)} /></FormField>
      <FormField className="xl:col-span-3" htmlFor="employee-filter-department" label="Departamento"><Input id="employee-filter-department" type="text" placeholder="Ej: Ventas" value={department} onChange={(event) => onDepartmentChange(event.target.value)} /></FormField>
    </div>
  </SectionCard>;
}

export { EmployeeFilters, type EmployeeFiltersProps };
