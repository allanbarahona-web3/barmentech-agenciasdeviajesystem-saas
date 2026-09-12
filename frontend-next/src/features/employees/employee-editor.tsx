import type { FormEvent } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/patterns/form-field';
import { FormSheet } from '@/components/patterns/form-sheet';
import type { CreateEmployeeDto } from '@/lib/employees-api';

type EmployeeEditorProps = {
  mode: 'create' | 'edit';
  formData: CreateEmployeeDto;
  error: string;
  success: string;
  onFormDataChange: (formData: CreateEmployeeDto) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
};

function EmployeeEditor({
  mode,
  formData,
  error,
  success,
  onFormDataChange,
  onSubmit,
  onClose,
}: EmployeeEditorProps) {
  const isCreate = mode === 'create';
  const formId = 'employee-editor-form';

  return (
    <FormSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={isCreate ? 'Nuevo empleado' : 'Editar empleado'}
      description={isCreate ? 'Registra la información laboral del nuevo empleado.' : 'Actualiza la información laboral del empleado.'}
      actions={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form={formId}>{isCreate ? 'Crear empleado' : 'Guardar cambios'}</Button>
        </>
      )}
    >
      <form id={formId} onSubmit={onSubmit} className="grid gap-4">
        {isCreate && (
          <Alert variant="info">
            <AlertTitle>Documentos después de la creación</AlertTitle>
            <AlertDescription>Los documentos del empleado se pueden cargar después de crearlo, desde Ver detalles.</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert variant="success">
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField className="sm:col-span-2" htmlFor="employee-full-name" label="Nombre Completo" required>
            <Input id="employee-full-name" type="text" required value={formData.fullName} onChange={(event) => onFormDataChange({ ...formData, fullName: event.target.value })} />
          </FormField>

          <FormField htmlFor="employee-document-id" label="Cédula" required>
            <Input id="employee-document-id" type="text" required value={formData.documentId} onChange={(event) => onFormDataChange({ ...formData, documentId: event.target.value })} />
          </FormField>

          <FormField htmlFor="employee-date-of-birth" label="Fecha de Nacimiento">
            <Input id="employee-date-of-birth" type="date" value={formData.dateOfBirth} onChange={(event) => onFormDataChange({ ...formData, dateOfBirth: event.target.value })} />
          </FormField>

          <FormField className="sm:col-span-2" htmlFor="employee-email" label="Email" required>
            <Input id="employee-email" type="email" required value={formData.email} onChange={(event) => onFormDataChange({ ...formData, email: event.target.value })} />
          </FormField>

          <FormField htmlFor="employee-phone" label="Teléfono">
            <Input id="employee-phone" type="text" value={formData.phone} onChange={(event) => onFormDataChange({ ...formData, phone: event.target.value })} />
          </FormField>

          <FormField htmlFor="employee-hire-date" label="Fecha de Ingreso" required>
            <Input id="employee-hire-date" type="date" required value={formData.hireDate} onChange={(event) => onFormDataChange({ ...formData, hireDate: event.target.value })} />
          </FormField>

          <FormField className="sm:col-span-2" htmlFor="employee-employment-type" label="Tipo de Empleado" required>
            <Select
              id="employee-employment-type"
              value={formData.employmentType}
              onChange={(event) => onFormDataChange({ ...formData, employmentType: event.target.value as CreateEmployeeDto['employmentType'] })}
            >
              <option value="FULL_TIME">Tiempo Completo</option>
              <option value="PART_TIME">Medio Tiempo</option>
              <option value="TEMPORARY">Temporal</option>
              <option value="CONTRACTOR">Servicios Profesionales</option>
            </Select>
          </FormField>

          <FormField className="sm:col-span-2" htmlFor="employee-address" label="Dirección">
            <Textarea id="employee-address" rows={2} value={formData.address} onChange={(event) => onFormDataChange({ ...formData, address: event.target.value })} />
          </FormField>

          <FormField htmlFor="employee-position" label="Posición" required>
            <Input id="employee-position" type="text" required value={formData.position} placeholder="Ej: Agente Senior" onChange={(event) => onFormDataChange({ ...formData, position: event.target.value })} />
          </FormField>

          <FormField htmlFor="employee-department" label="Departamento">
            <Input id="employee-department" type="text" value={formData.department} placeholder="Ej: Ventas" onChange={(event) => onFormDataChange({ ...formData, department: event.target.value })} />
          </FormField>

          <FormField htmlFor="employee-monthly-salary" label="Salario Mensual (₡)" required description="Salario en colones costarricenses">
            <Input id="employee-monthly-salary" type="number" required min="0" step="0.01" value={formData.monthlySalary || ''} placeholder="Ej: 500000" onChange={(event) => onFormDataChange({ ...formData, monthlySalary: Number(event.target.value) })} />
          </FormField>

          <FormField htmlFor="employee-status" label="Estado">
            <Select id="employee-status" value={formData.status} onChange={(event) => onFormDataChange({ ...formData, status: event.target.value as CreateEmployeeDto['status'] })}>
              <option value="ACTIVO">Activo</option>
              <option value="SUSPENDIDO">Suspendido</option>
              <option value="INACTIVO">Inactivo</option>
              <option value="TERMINADO">Terminado</option>
            </Select>
          </FormField>

          {formData.status === 'TERMINADO' && (
            <FormField htmlFor="employee-termination-date" label="Fecha de Terminación">
              <Input id="employee-termination-date" type="date" value={formData.terminationDate || ''} onChange={(event) => onFormDataChange({ ...formData, terminationDate: event.target.value })} />
            </FormField>
          )}
        </div>
      </form>
    </FormSheet>
  );
}

export { EmployeeEditor, type EmployeeEditorProps };
