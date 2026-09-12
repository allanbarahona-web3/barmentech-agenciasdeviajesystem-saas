'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AttachmentViewer from '@/components/attachment-viewer';
import { LoadingModal } from '@/components/loading-modal';
import { ConfirmModal } from '@/components/confirm-modal';
import { toLocalDateIso } from '@/shared/regional';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { IconBadge } from '@/components/ui/icon-badge';
import { PageHeader } from '@/components/patterns/page-header';
import { EmployeeEditor } from '@/features/employees/employee-editor';
import { EmployeeFilters } from '@/features/employees/employee-filters';
import { EmployeeProfile } from '@/features/employees/employee-profile';
import { EmployeeUserLink, type AvailableEmployeeUser } from '@/features/employees/employee-user-link';
import { EmployeesTable } from '@/features/employees/employees-table';
import { BriefcaseBusiness, CalendarDays, CircleUserRound, Plus, Users } from 'lucide-react';
import {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  uploadEmployeeDocument,
  deleteEmployeeDocument,
  getEmployeeDocumentUrl,
  getEmployeeStats,
  getAvailableEmployeeUsers,
  linkEmployeeUser,
  type Employee,
  type EmployeeDocument,
  type CreateEmployeeDto,
  type UpdateEmployeeDto,
  type EmployeeStats,
} from '@/lib/employees-api';

type ModalMode = 'create' | 'edit' | 'view' | null;

export default function EmployeesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stats, setStats] = useState<EmployeeStats | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [linkUserModalOpen, setLinkUserModalOpen] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<AvailableEmployeeUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [linkingUser, setLinkingUser] = useState(false);

  
  // LoadingModal states
  const [loadingModalOpen, setLoadingModalOpen] = useState(false);
  const [loadingModalState, setLoadingModalState] = useState<'loading' | 'success' | 'error'>('loading');
  const [loadingModalMessage, setLoadingModalMessage] = useState('');

  // Delete confirmation modal
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);

  // Filtros
  const [statusFilter, setStatusFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');

  // Form data
  const [formData, setFormData] = useState<CreateEmployeeDto>({
    fullName: '',
    documentId: '',
    dateOfBirth: '',
    email: '',
    phone: '',
    address: '',
    hireDate: '',
    employmentType: 'FULL_TIME',
    position: '',
    department: '',
    monthlySalary: 0,
    status: 'ACTIVO',
    terminationDate: '',
  });

  // Document upload
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<string>('');
  const [documentNotes, setDocumentNotes] = useState('');

  // Attachment viewer
  const [attachmentViewerData, setAttachmentViewerData] = useState<{
    attachments: Array<{ id: string; originalFileName: string; url: string; mimeType: string }>;
    initialIndex: number;
  } | null>(null);

  useEffect(() => {
    loadData();
  }, [statusFilter, searchFilter, positionFilter, departmentFilter]);

  async function loadData() {
    try {
      setLoading(true);
      const [employeesData, statsData] = await Promise.all([
        getEmployees({
          status: statusFilter || undefined,
          search: searchFilter || undefined,
          position: positionFilter || undefined,
          department: departmentFilter || undefined,
        }),
        getEmployeeStats(),
      ]);
      setEmployees(employeesData);
      setStats(statsData);
    } catch (err: any) {
      setError(err.message || 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }

  async function loadAvailableUsers() {
    try {
    const users = await getAvailableEmployeeUsers();
    setAvailableUsers(users);
  } catch (err: any) {
    setError(err.message || 'Error al cargar usuarios');
  }
}

  async function handleOpenModal(mode: ModalMode, employeeId?: string) {
    setModalMode(mode);
    setError('');
    setSuccess('');

    if (employeeId) {
      try {
        const emp = await getEmployee(employeeId);
        setSelectedEmployee(emp);

        if (mode === 'edit') {
          setFormData({
            fullName: emp.fullName,
            documentId: emp.documentId,
            dateOfBirth: emp.dateOfBirth ? toLocalDateIso(String(emp.dateOfBirth)) : '',
            email: emp.email,
            phone: emp.phone || '',
            address: emp.address || '',
            hireDate: toLocalDateIso(String(emp.hireDate)),
            employmentType: emp.employmentType,
            position: emp.position,
            department: emp.department || '',
            monthlySalary: Number(emp.monthlySalary),
            status: emp.status,
            terminationDate: emp.terminationDate ? toLocalDateIso(String(emp.terminationDate)) : '',
          });
        }

      } catch (err: any) {
        setError(err.message);
      }
    } else {
      setSelectedEmployee(null);
      setFormData({
        fullName: '',
        documentId: '',
        dateOfBirth: '',
        email: '',
        phone: '',
        address: '',
        hireDate: '',
        employmentType: 'FULL_TIME',
        position: '',
        department: '',
        monthlySalary: 0,
        status: 'ACTIVO',
        terminationDate: '',
      });
    }
  }

  function handleCloseModal() {
    setModalMode(null);
    setSelectedEmployee(null);
    setError('');
    setSuccess('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoadingModalOpen(true);
    setLoadingModalState('loading');
    setLoadingModalMessage(modalMode === 'create' ? 'Creando empleado...' : 'Guardando cambios...');

    try {

      if (modalMode === 'create') {
      const createData: CreateEmployeeDto = {
        ...formData,
      };

      if (!createData.terminationDate) {
       delete createData.terminationDate;
      }

      await createEmployee(createData);

      setLoadingModalState('success');
      setLoadingModalMessage('✅ Empleado creado exitosamente');



      } else if (modalMode === 'edit' && selectedEmployee) {
        const updateData: UpdateEmployeeDto = {};
        if (formData.fullName) updateData.fullName = formData.fullName;
        if (formData.documentId) updateData.documentId = formData.documentId;
        if (formData.dateOfBirth !== undefined) updateData.dateOfBirth = formData.dateOfBirth;
        if (formData.email) updateData.email = formData.email;
        if (formData.phone !== undefined) updateData.phone = formData.phone;
        if (formData.address !== undefined) updateData.address = formData.address;
        if (formData.hireDate) updateData.hireDate = formData.hireDate;
        if (formData.employmentType) updateData.employmentType = formData.employmentType;
        if (formData.position) updateData.position = formData.position;
        if (formData.department !== undefined) updateData.department = formData.department;
        if (formData.monthlySalary) updateData.monthlySalary = formData.monthlySalary;
        if (formData.status) updateData.status = formData.status;
        if (formData.terminationDate) {
          updateData.terminationDate = formData.terminationDate;
        } 

        await updateEmployee(selectedEmployee.id, updateData);
        setLoadingModalState('success');
        setLoadingModalMessage('✅ Empleado actualizado exitosamente');
      }

      await loadData();
      setTimeout(() => {
        setLoadingModalOpen(false);
        handleCloseModal();
      }, 1500);
    } catch (err: any) {
      setLoadingModalState('error');
      setLoadingModalMessage(err.message || 'Error al guardar empleado');
    }
  }

  async function handleUploadDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEmployee || !selectedDocType) return;

    const fileInput = document.getElementById('docFile') as HTMLInputElement;
    const file = fileInput?.files?.[0];
    if (!file) {
      setError('Selecciona un archivo');
      return;
    }

    setUploadingDoc(true);
    setError('');
    setSuccess('');
    setLoadingModalOpen(true);
    setLoadingModalState('loading');
    setLoadingModalMessage('📤 Subiendo documento...');

    try {
      await uploadEmployeeDocument(selectedEmployee.id, file, selectedDocType, documentNotes);
      setLoadingModalState('success');
      setLoadingModalMessage('✅ Documento subido exitosamente');
      setSelectedDocType('');
      setDocumentNotes('');
      fileInput.value = '';

      // Recargar empleado para mostrar nuevo documento
      const updated = await getEmployee(selectedEmployee.id);
      setSelectedEmployee(updated);
      setTimeout(() => setLoadingModalOpen(false), 1500);
    } catch (err: any) {
      setLoadingModalState('error');
      setLoadingModalMessage(err.message || 'Error al subir documento');
    } finally {
      setUploadingDoc(false);
    }
  }

  function handleDeleteDocument(docId: string) {
    setDocumentToDelete(docId);
    setDeleteConfirmOpen(true);
  }

  async function confirmDeleteDocument() {
    if (!documentToDelete) return;
    
    setDeleteConfirmOpen(false);
    setLoadingModalOpen(true);
    setLoadingModalState('loading');
    setLoadingModalMessage('🗑️ Eliminando documento...');

    try {
      await deleteEmployeeDocument(documentToDelete);
      setLoadingModalState('success');
      setLoadingModalMessage('✅ Documento eliminado exitosamente');

      if (selectedEmployee) {
        const updated = await getEmployee(selectedEmployee.id);
        setSelectedEmployee(updated);
      }
      
      setTimeout(() => {
        setLoadingModalOpen(false);
        setDocumentToDelete(null);
      }, 1500);
    } catch (err: any) {
      setLoadingModalState('error');
      setLoadingModalMessage(err.message || 'Error al eliminar documento');
      setDocumentToDelete(null);
    }
  }

  async function handleViewDocument(doc: EmployeeDocument, allDocs: EmployeeDocument[]) {
    try {
      const urlData = await getEmployeeDocumentUrl(doc.id);
      const attachments = await Promise.all(
        allDocs.map(async (d) => {
          const data = await getEmployeeDocumentUrl(d.id);
          return {
            id: d.id,
            originalFileName: d.fileName,
            url: data.url,
            mimeType: d.mimeType,
          };
        })
      );

      const initialIndex = allDocs.findIndex((d) => d.id === doc.id);
      setAttachmentViewerData({ attachments, initialIndex });
    } catch (err: any) {
      setError(err.message);
    }
  }

  // Agrupar documentos por tipo
  function getDocumentsByType(docs: EmployeeDocument[] | undefined) {
    if (!docs) return {};
    const grouped: Record<string, EmployeeDocument[]> = {};
    docs.forEach((doc) => {
      if (!grouped[doc.documentType]) {
        grouped[doc.documentType] = [];
      }
      grouped[doc.documentType].push(doc);
    });
    return grouped;
  }

  const docsByType = selectedEmployee ? getDocumentsByType(selectedEmployee.documents) : {};

  if (loading && employees.length === 0) {
    return (
      <main className="app-shell">
        <p>Cargando empleados...</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <PageHeader
        title={<span className="flex items-center gap-3"><IconBadge tone="primary"><Users aria-hidden="true" /></IconBadge>Gestión de empleados</span>}
        description="Administra tu equipo de trabajo y documentación laboral."
        meta={<Badge variant="info"><Users aria-hidden="true" />{employees.length} empleados</Badge>}
        actions={<Button type="button" onClick={() => handleOpenModal('create')}><Plus aria-hidden="true" />Nuevo empleado</Button>}
      />

      {stats && <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="flex items-center gap-4 p-5"><IconBadge tone="primary"><Users aria-hidden="true" /></IconBadge><div><p className="text-sm text-muted-foreground">Total empleados</p><p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{stats.total}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-5"><IconBadge tone="success"><CircleUserRound aria-hidden="true" /></IconBadge><div><p className="text-sm text-muted-foreground">Activos</p><p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{stats.activos}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-5"><IconBadge tone="warning"><CalendarDays aria-hidden="true" /></IconBadge><div><p className="text-sm text-muted-foreground">Suspendidos</p><p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{stats.suspendidos}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 p-5"><IconBadge tone="destructive"><BriefcaseBusiness aria-hidden="true" /></IconBadge><div><p className="text-sm text-muted-foreground">Inactivos</p><p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{stats.inactivos}</p></div></CardContent></Card>
      </section>}

      <EmployeeFilters status={statusFilter} search={searchFilter} position={positionFilter} department={departmentFilter} onStatusChange={setStatusFilter} onSearchChange={setSearchFilter} onPositionChange={setPositionFilter} onDepartmentChange={setDepartmentFilter} />

      {/* Lista de empleados */}
      <EmployeesTable
        employees={employees}
        onView={(employeeId) => handleOpenModal('view', employeeId)}
        onEdit={(employeeId) => handleOpenModal('edit', employeeId)}
      />

      {/* Modal Create/Edit */}
      {(modalMode === 'create' || modalMode === 'edit') && (
        <EmployeeEditor
          mode={modalMode}
          formData={formData}
          error={error}
          success={success}
          onFormDataChange={setFormData}
          onSubmit={handleSubmit}
          onClose={handleCloseModal}
        />
      )}

      {/* Modal View (con documentos) */}
      {modalMode === 'view' && selectedEmployee && (
        <EmployeeProfile
          employee={selectedEmployee}
          error={error}
          success={success}
          selectedDocType={selectedDocType}
          documentNotes={documentNotes}
          uploadingDoc={uploadingDoc}
          documentsByType={docsByType}
          onClose={handleCloseModal}
          onCreateSystemUser={() => {
            router.push(
              `/admin/users?createFrom=employee&name=${encodeURIComponent(selectedEmployee.fullName)}&email=${encodeURIComponent(selectedEmployee.email)}&employeeId=${selectedEmployee.id}`
            );
          }}
          onOpenUserLink={async () => {
            await loadAvailableUsers();
            setSelectedUserId('');
            setLinkUserModalOpen(true);
          }}
          onUploadDocument={handleUploadDocument}
          onSelectedDocTypeChange={setSelectedDocType}
          onDocumentNotesChange={setDocumentNotes}
          onViewDocument={handleViewDocument}
          onDeleteDocument={handleDeleteDocument}
        />
      )}

      <EmployeeUserLink
        isOpen={linkUserModalOpen}
        availableUsers={availableUsers}
        selectedUserId={selectedUserId}
        linkingUser={linkingUser}
        onSelectedUserIdChange={setSelectedUserId}
        onCancel={() => {
          setLinkUserModalOpen(false);
        }}
        onConfirm={async () => {
          if (!selectedEmployee || !selectedUserId) {
            return;
          }

          try {
            setLinkingUser(true);

            const updatedEmployee = await linkEmployeeUser(
              selectedEmployee.id,
              selectedUserId,
            );

            setSelectedEmployee(updatedEmployee);

            setLinkUserModalOpen(false);
            setSelectedUserId('');

            setSuccess('Usuario vinculado correctamente.');

            await loadData();
          } catch (err: any) {
            setError(err.message || 'Error al vincular usuario');
          } finally {
            setLinkingUser(false);
          }
        }}
      />

      {/* Attachment Viewer */}
      {attachmentViewerData && (
        <AttachmentViewer
          attachments={attachmentViewerData.attachments}
          initialIndex={attachmentViewerData.initialIndex}
          onClose={() => setAttachmentViewerData(null)}
        />
      )}

      {/* Loading Modal */}
      <LoadingModal
        isOpen={loadingModalOpen}
        state={loadingModalState}
        loadingMessage={loadingModalMessage}
        successMessage={loadingModalMessage}
        errorMessage={loadingModalMessage}
        onClose={() => setLoadingModalOpen(false)}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="🗑️ Eliminar Documento"
        message="¿Estás seguro de que deseas eliminar este documento? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
        confirmVariant="danger"
        onConfirm={confirmDeleteDocument}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setDocumentToDelete(null);
        }}
      />
    </main>
  );
}
