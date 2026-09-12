import { DataTableShell } from '@/components/patterns/data-table-shell';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmployeeStatusBadge } from '@/features/employees/employee-status-badge';
import type { Employee } from '@/lib/employees-api';
import { Eye, Pencil, Users } from 'lucide-react';

type EmployeesTableProps = {
  employees: Employee[];
  onView: (employeeId: string) => void;
  onEdit: (employeeId: string) => void;
};

function EmployeesTable({ employees, onView, onEdit }: EmployeesTableProps) {
  return (
    <DataTableShell
      toolbar={(
        <div>
          <h2 className="text-base font-semibold">Lista de empleados</h2>
          <p className="mt-1 text-sm text-muted-foreground">Consulta y administra la información laboral de tu equipo.</p>
        </div>
      )}
      state={employees.length === 0 ? (
        <div>
          <Users aria-hidden="true" className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="font-medium text-foreground">No hay empleados registrados.</p>
        </div>
      ) : null}
    >
      <Table className="min-w-[860px] table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[25%]">Nombre</TableHead>
            <TableHead className="w-[14%]">Cédula</TableHead>
            <TableHead className="w-[20%]">Posición</TableHead>
            <TableHead className="w-[17%]">Departamento</TableHead>
            <TableHead className="w-[12%] whitespace-nowrap">Estado</TableHead>
            <TableHead className="w-[12%] whitespace-nowrap text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.map((employee) => (
            <TableRow key={employee.id}>
              <TableCell className="truncate">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto max-w-full justify-start p-0 text-left font-medium text-foreground hover:bg-transparent hover:text-primary"
                  title={employee.fullName}
                  onClick={() => onView(employee.id)}
                >
                  <span className="truncate">{employee.fullName}</span>
                </Button>
              </TableCell>
              <TableCell className="truncate text-muted-foreground" title={employee.documentId}>{employee.documentId}</TableCell>
              <TableCell className="truncate text-muted-foreground" title={employee.position}>{employee.position}</TableCell>
              <TableCell className="truncate text-muted-foreground" title={employee.department || '-'}>{employee.department || '-'}</TableCell>
              <TableCell className="whitespace-nowrap"><EmployeeStatusBadge status={employee.status} /></TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button type="button" variant="ghost" size="icon" aria-label={`Ver perfil de ${employee.fullName}`} title="Ver" onClick={() => onView(employee.id)}>
                    <Eye aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Editar a ${employee.fullName}`} title="Editar" onClick={() => onEdit(employee.id)}>
                    <Pencil aria-hidden="true" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DataTableShell>
  );
}

export { EmployeesTable, type EmployeesTableProps };
