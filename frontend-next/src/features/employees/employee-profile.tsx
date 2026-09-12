import type { FormEvent, ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { IconBadge } from '@/components/ui/icon-badge';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SectionCard } from '@/components/patterns/section-card';
import { EmployeeDocumentsSection } from '@/features/employees/employee-documents-section';
import { EmployeeStatusBadge } from '@/features/employees/employee-status-badge';
import { EmployeeUserLinkActions, EmployeeUserLinkDetails } from '@/features/employees/employee-user-link';
import { calculateAge, type Employee, type EmployeeDocument } from '@/lib/employees-api';
import { formatBusinessDate } from '@/shared/regional';
import { BriefcaseBusiness, CalendarDays, CreditCard, Mail, MapPin, Phone, UserRound } from 'lucide-react';

type EmployeeProfileProps = {
  employee: Employee;
  error: string;
  success: string;
  selectedDocType: string;
  documentNotes: string;
  uploadingDoc: boolean;
  documentsByType: Record<string, EmployeeDocument[]>;
  onClose: () => void;
  onCreateSystemUser: () => void;
  onOpenUserLink: () => void;
  onUploadDocument: (event: FormEvent<HTMLFormElement>) => void;
  onSelectedDocTypeChange: (value: string) => void;
  onDocumentNotesChange: (value: string) => void;
  onViewDocument: (document: EmployeeDocument, allDocuments: EmployeeDocument[]) => void;
  onDeleteDocument: (documentId: string) => void;
};

type ProfileDetailProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

function ProfileDetail({ label, children, className }: ProfileDetailProps) {
  return (
    <div className={className}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

function EmployeeProfile({
  employee,
  error,
  success,
  selectedDocType,
  documentNotes,
  uploadingDoc,
  documentsByType,
  onClose,
  onCreateSystemUser,
  onOpenUserLink,
  onUploadDocument,
  onSelectedDocTypeChange,
  onDocumentNotesChange,
  onViewDocument,
  onDeleteDocument,
}: EmployeeProfileProps) {
  return (
    <Sheet open onOpenChange={(open) => {
      if (!open) onClose();
    }}>
      <SheetContent side="right" className="overflow-hidden p-0">
        <SheetHeader>
          <SheetTitle className="flex min-w-0 items-center gap-3">
            <IconBadge tone="primary"><UserRound aria-hidden="true" /></IconBadge>
            <span className="truncate">{employee.fullName}</span>
          </SheetTitle>
          <SheetDescription><span className="inline-flex items-center gap-1"><Mail aria-hidden="true" className="size-3.5" />{employee.email}</span></SheetDescription>
          <div className="mt-2"><EmployeeStatusBadge status={employee.status} /></div>
          <div className="mt-3 flex flex-wrap gap-2">
            <EmployeeUserLinkActions hasLinkedUser={Boolean(employee.userId)} onCreateSystemUser={onCreateSystemUser} onOpenUserLink={onOpenUserLink} />
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {success && <Alert variant="success"><AlertDescription>{success}</AlertDescription></Alert>}

          <EmployeeUserLinkDetails user={employee.user} />

          <SectionCard title={<span className="flex items-center gap-2"><IconBadge tone="info" size="sm"><UserRound aria-hidden="true" /></IconBadge>Información personal</span>}>
            <div className="grid gap-4 sm:grid-cols-2">
              <ProfileDetail label="Nombre completo">{employee.fullName}</ProfileDetail>
              <ProfileDetail label="Cédula">{employee.documentId}</ProfileDetail>
              {employee.dateOfBirth && <ProfileDetail label="Edad">{calculateAge(employee.dateOfBirth)} años</ProfileDetail>}
              <ProfileDetail label="Email">{employee.email}</ProfileDetail>
              {employee.phone && <ProfileDetail label="Teléfono"><span className="inline-flex items-center gap-1"><Phone aria-hidden="true" className="size-3.5 text-muted-foreground" />{employee.phone}</span></ProfileDetail>}
              {employee.address && <ProfileDetail className="sm:col-span-2" label="Dirección"><span className="inline-flex items-start gap-1"><MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />{employee.address}</span></ProfileDetail>}
            </div>
          </SectionCard>

          <SectionCard title={<span className="flex items-center gap-2"><IconBadge tone="primary" size="sm"><BriefcaseBusiness aria-hidden="true" /></IconBadge>Información laboral</span>}>
            <div className="grid gap-4 sm:grid-cols-2">
              <ProfileDetail label="Posición">{employee.position}</ProfileDetail>
              <ProfileDetail label="Tipo de empleado">
                {employee.employmentType === 'FULL_TIME' ? 'Tiempo Completo' : employee.employmentType === 'PART_TIME' ? 'Medio Tiempo' : employee.employmentType === 'TEMPORARY' ? 'Temporal' : 'Servicios Profesionales'}
              </ProfileDetail>
              {employee.department && <ProfileDetail label="Departamento">{employee.department}</ProfileDetail>}
              <ProfileDetail label="Fecha de ingreso"><span className="inline-flex items-center gap-1"><CalendarDays aria-hidden="true" className="size-3.5 text-muted-foreground" />{formatBusinessDate(String(employee.hireDate))}</span></ProfileDetail>
              <ProfileDetail label="Estado"><EmployeeStatusBadge status={employee.status} /></ProfileDetail>
              {employee.terminationDate && <ProfileDetail label="Fecha de terminación">{formatBusinessDate(String(employee.terminationDate))}</ProfileDetail>}
              <ProfileDetail label="Salario mensual"><span className="inline-flex items-center gap-1"><CreditCard aria-hidden="true" className="size-3.5 text-muted-foreground" />₡{Number(employee.monthlySalary).toLocaleString('es-CR')}</span></ProfileDetail>
              <ProfileDetail label="Salario diario">₡{Number(employee.dailySalary).toLocaleString('es-CR')}</ProfileDetail>
            </div>
          </SectionCard>

          <EmployeeDocumentsSection
            documents={employee.documents}
            documentsByType={documentsByType}
            selectedDocType={selectedDocType}
            documentNotes={documentNotes}
            uploadingDoc={uploadingDoc}
            onUploadDocument={onUploadDocument}
            onSelectedDocTypeChange={onSelectedDocTypeChange}
            onDocumentNotesChange={onDocumentNotesChange}
            onViewDocument={onViewDocument}
            onDeleteDocument={onDeleteDocument}
          />
        </div>

        <SheetFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export { EmployeeProfile, type EmployeeProfileProps };
