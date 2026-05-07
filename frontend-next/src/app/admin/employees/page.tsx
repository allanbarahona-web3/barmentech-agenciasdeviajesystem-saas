'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AttachmentViewer from '@/components/attachment-viewer';
import {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  uploadEmployeeDocument,
  deleteEmployeeDocument,
  getEmployeeDocumentUrl,
  getEmployeeStats,
  calculateAge,
  DOCUMENT_TYPE_LABELS,
  type Employee,
  type EmployeeDocument,
  type CreateEmployeeDto,
  type UpdateEmployeeDto,
  type EmployeeStats,
} from '@/lib/employees-api';

type ModalMode = 'create' | 'edit' | 'view' | null;

const DOCUMENT_TYPES = [
  'CONTRATO',
  'CEDULA_FRONTAL',
  'CEDULA_TRASERA',
  'PASAPORTE',
  'LICENCIA',
  'INCAPACIDAD',
  'CERTIFICADO',
  'OTRO',
] as const;

export default function EmployeesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stats, setStats] = useState<EmployeeStats | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
    position: '',
    department: '',
    monthlySalary: 0,
    status: 'ACTIVO',
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
            dateOfBirth: emp.dateOfBirth
              ? new Date(emp.dateOfBirth).toISOString().split('T')[0]
              : '',
            email: emp.email,
            phone: emp.phone || '',
            address: emp.address || '',
            hireDate: new Date(emp.hireDate).toISOString().split('T')[0],
            position: emp.position,
            department: emp.department || '',
            monthlySalary: Number(emp.monthlySalary),
            status: emp.status,
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
        position: '',
        department: '',
        monthlySalary: 0,
        status: 'ACTIVO',
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

    try {
      if (modalMode === 'create') {
        await createEmployee(formData);
        setSuccess('Empleado creado exitosamente');
      } else if (modalMode === 'edit' && selectedEmployee) {
        const updateData: UpdateEmployeeDto = {};
        if (formData.fullName) updateData.fullName = formData.fullName;
        if (formData.documentId) updateData.documentId = formData.documentId;
        if (formData.dateOfBirth !== undefined) updateData.dateOfBirth = formData.dateOfBirth;
        if (formData.email) updateData.email = formData.email;
        if (formData.phone !== undefined) updateData.phone = formData.phone;
        if (formData.address !== undefined) updateData.address = formData.address;
        if (formData.hireDate) updateData.hireDate = formData.hireDate;
        if (formData.position) updateData.position = formData.position;
        if (formData.department !== undefined) updateData.department = formData.department;
        if (formData.monthlySalary) updateData.monthlySalary = formData.monthlySalary;
        if (formData.status) updateData.status = formData.status;

        await updateEmployee(selectedEmployee.id, updateData);
        setSuccess('Empleado actualizado exitosamente');
      }

      await loadData();
      setTimeout(() => {
        handleCloseModal();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Error al guardar empleado');
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

    try {
      await uploadEmployeeDocument(selectedEmployee.id, file, selectedDocType, documentNotes);
      setSuccess('Documento subido exitosamente');
      setSelectedDocType('');
      setDocumentNotes('');
      fileInput.value = '';

      // Recargar empleado para mostrar nuevo documento
      const updated = await getEmployee(selectedEmployee.id);
      setSelectedEmployee(updated);
    } catch (err: any) {
      setError(err.message || 'Error al subir documento');
    } finally {
      setUploadingDoc(false);
    }
  }

  async function handleDeleteDocument(docId: string) {
    if (!confirm('¿Eliminar este documento?')) return;

    try {
      await deleteEmployeeDocument(docId);
      setSuccess('Documento eliminado');

      if (selectedEmployee) {
        const updated = await getEmployee(selectedEmployee.id);
        setSelectedEmployee(updated);
      }
    } catch (err: any) {
      setError(err.message);
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
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Cargando empleados...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto', background: '#f9fafb', minHeight: '100vh' }}>
      {/* Header con gradiente */}
      <div
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '30px',
          borderRadius: '12px',
          marginBottom: '30px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'white', marginBottom: '8px' }}>
              🧑‍💼 Gestión de Empleados
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '14px' }}>
              Administra tu equipo de trabajo y documentación laboral
            </p>
          </div>
          <button
            onClick={() => handleOpenModal('create')}
            style={{
              padding: '12px 24px',
              background: 'white',
              color: '#667eea',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '15px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'transform 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            ➕ Nuevo Empleado
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '20px',
            marginBottom: '30px',
          }}
        >
          <div
            style={{
              padding: '24px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '12px',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              color: 'white',
            }}
          >
            <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '10px', fontWeight: '500' }}>👥 Total Empleados</div>
            <div style={{ fontSize: '36px', fontWeight: 'bold' }}>{stats.total}</div>
          </div>
          <div
            style={{
              padding: '24px',
              background: 'white',
              borderRadius: '12px',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              borderLeft: '4px solid #10b981',
            }}
          >
            <div style={{ fontSize: '14px', color: '#666', marginBottom: '10px', fontWeight: '500' }}>✅ Activos</div>
            <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#10b981' }}>{stats.activos}</div>
          </div>
          <div
            style={{
              padding: '24px',
              background: 'white',
              borderRadius: '12px',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              borderLeft: '4px solid #f59e0b',
            }}
          >
            <div style={{ fontSize: '14px', color: '#666', marginBottom: '10px', fontWeight: '500' }}>⏸️ Suspendidos</div>
            <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#f59e0b' }}>{stats.suspendidos}</div>
          </div>
          <div
            style={{
              padding: '24px',
              background: 'white',
              borderRadius: '12px',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              borderLeft: '4px solid #ef4444',
            }}
          >
            <div style={{ fontSize: '14px', color: '#666', marginBottom: '10px', fontWeight: '500' }}>❌ Inactivos</div>
            <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#ef4444' }}>{stats.inactivos}</div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div
        style={{
          background: 'white',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '25px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        }}
      >
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '15px', color: '#374151' }}>🔍 Filtros de Búsqueda</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>Estado</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            >
              <option value="">Todos</option>
              <option value="ACTIVO">Activo</option>
              <option value="SUSPENDIDO">Suspendido</option>
              <option value="INACTIVO">Inactivo</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>Buscar</label>
            <input
              type="text"
              placeholder="Nombre, cédula o email..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>Posición</label>
            <input
              type="text"
              placeholder="Ej: Agente Senior"
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>Departamento</label>
            <input
              type="text"
              placeholder="Ej: Ventas"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
          </div>
        </div>
      </div>

      {/* Lista de empleados */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '2px solid #e5e7eb' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>📋 Lista de Empleados</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'linear-gradient(to right, #f9fafb, #f3f4f6)', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nombre</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cédula</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Posición</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Departamento</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Estado</th>
              <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '50px', textAlign: 'center' }}>
                  <div style={{ fontSize: '48px', marginBottom: '15px' }}>👥</div>
                  <p style={{ color: '#9ca3af', fontSize: '15px' }}>No hay empleados registrados</p>
                </td>
              </tr>
            ) : (
              employees.map((emp) => (
                <tr 
                  key={emp.id} 
                  style={{ borderBottom: '1px solid #f3f4f6', transition: 'background 0.2s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                >
                  <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: '500', color: '#1f2937' }}>{emp.fullName}</td>
                  <td style={{ padding: '14px 16px', fontSize: '14px', color: '#4b5563' }}>{emp.documentId}</td>
                  <td style={{ padding: '14px 16px', fontSize: '14px', color: '#4b5563' }}>{emp.position}</td>
                  <td style={{ padding: '14px 16px', fontSize: '14px', color: '#6b7280' }}>{emp.department || '-'}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <span
                      style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '600',
                        background:
                          emp.status === 'ACTIVO'
                            ? '#d1fae5'
                            : emp.status === 'SUSPENDIDO'
                            ? '#fef3c7'
                            : '#fee2e2',
                        color:
                          emp.status === 'ACTIVO'
                            ? '#065f46'
                            : emp.status === 'SUSPENDIDO'
                            ? '#92400e'
                            : '#991b1b',
                      }}
                    >
                      {emp.status}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      <button
                        onClick={() => handleOpenModal('view', emp.id)}
                        style={{
                          padding: '7px 14px',
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: '500',
                          transition: 'transform 0.2s, box-shadow 0.2s',
                          boxShadow: '0 2px 4px rgba(102, 126, 234, 0.3)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 4px 8px rgba(102, 126, 234, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 2px 4px rgba(102, 126, 234, 0.3)';
                        }}
                      >
                        👁️ Ver
                      </button>
                      <button
                        onClick={() => handleOpenModal('edit', emp.id)}
                        style={{
                          padding: '7px 14px',
                          background: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: '500',
                          transition: 'transform 0.2s, box-shadow 0.2s',
                          boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 2px 4px rgba(16, 185, 129, 0.3)';
                        }}
                      >
                        ✏️ Editar
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Create/Edit */}
      {(modalMode === 'create' || modalMode === 'edit') && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={handleCloseModal}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '30px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '10px', color: '#1f2937' }}>
              {modalMode === 'create' ? '➕ Nuevo Empleado' : '✏️ Editar Empleado'}
            </h2>
            {modalMode === 'create' && (
              <div
                style={{
                  padding: '12px',
                  background: '#dbeafe',
                  borderLeft: '4px solid #3b82f6',
                  borderRadius: '6px',
                  marginBottom: '20px',
                  fontSize: '13px',
                  color: '#1e40af',
                }}
              >
                ℹ️ Los documentos del empleado se pueden cargar después de crearlo, en la opción "Ver Detalles".
              </div>
            )}

            {error && (
              <div
                style={{
                  padding: '12px',
                  background: '#fee2e2',
                  color: '#991b1b',
                  borderRadius: '6px',
                  marginBottom: '15px',
                  fontSize: '14px',
                }}
              >
                {error}
              </div>
            )}

            {success && (
              <div
                style={{
                  padding: '12px',
                  background: '#d1fae5',
                  color: '#065f46',
                  borderRadius: '6px',
                  marginBottom: '15px',
                  fontSize: '14px',
                }}
              >
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gap: '15px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                      Cédula *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.documentId}
                      onChange={(e) => setFormData({ ...formData, documentId: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                      Fecha de Nacimiento
                    </label>
                    <input
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>Teléfono</label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                      Fecha de Ingreso *
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.hireDate}
                      onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>Dirección</label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    rows={2}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      resize: 'vertical',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                      Posición *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                      placeholder="Ej: Agente Senior"
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                      Departamento
                    </label>
                    <input
                      type="text"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      placeholder="Ej: Ventas"
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                      💰 Salario Mensual (₡) *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={formData.monthlySalary || ''}
                      onChange={(e) => setFormData({ ...formData, monthlySalary: Number(e.target.value) })}
                      placeholder="Ej: 500000"
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                    <span style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', display: 'block' }}>
                      Salario en colones costarricenses
                    </span>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>Estado</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    >
                      <option value="ACTIVO">Activo</option>
                      <option value="SUSPENDIDO">Suspendido</option>
                      <option value="INACTIVO">Inactivo</option>
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#e5e7eb',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '14px',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '14px',
                  }}
                >
                  {modalMode === 'create' ? 'Crear Empleado' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal View (con documentos) */}
      {modalMode === 'view' && selectedEmployee && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={handleCloseModal}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '30px',
              maxWidth: '900px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>👤 Perfil del Empleado</h2>
              <button
                onClick={handleCloseModal}
                style={{
                  padding: '8px 16px',
                  background: '#e5e7eb',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Cerrar
              </button>
            </div>

            {error && (
              <div
                style={{
                  padding: '12px',
                  background: '#fee2e2',
                  color: '#991b1b',
                  borderRadius: '6px',
                  marginBottom: '15px',
                  fontSize: '14px',
                }}
              >
                {error}
              </div>
            )}

            {success && (
              <div
                style={{
                  padding: '12px',
                  background: '#d1fae5',
                  color: '#065f46',
                  borderRadius: '6px',
                  marginBottom: '15px',
                  fontSize: '14px',
                }}
              >
                {success}
              </div>
            )}

            {/* Información Personal */}
            <div
              style={{
                background: '#f9fafb',
                padding: '20px',
                borderRadius: '8px',
                marginBottom: '20px',
              }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '15px', color: '#374151' }}>
                📋 Información Personal
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', fontSize: '14px' }}>
                <div>
                  <strong>Nombre:</strong> {selectedEmployee.fullName}
                </div>
                <div>
                  <strong>Cédula:</strong> {selectedEmployee.documentId}
                </div>
                {selectedEmployee.dateOfBirth && (
                  <div>
                    <strong>Edad:</strong> {calculateAge(selectedEmployee.dateOfBirth)} años
                  </div>
                )}
                <div>
                  <strong>Email:</strong> {selectedEmployee.email}
                </div>
                {selectedEmployee.phone && (
                  <div>
                    <strong>Teléfono:</strong> {selectedEmployee.phone}
                  </div>
                )}
                {selectedEmployee.address && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <strong>Dirección:</strong> {selectedEmployee.address}
                  </div>
                )}
              </div>
            </div>

            {/* Información Laboral */}
            <div
              style={{
                background: '#f9fafb',
                padding: '20px',
                borderRadius: '8px',
                marginBottom: '20px',
              }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '15px', color: '#374151' }}>
                💼 Información Laboral
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', fontSize: '14px' }}>
                <div>
                  <strong>Posición:</strong> {selectedEmployee.position}
                </div>
                {selectedEmployee.department && (
                  <div>
                    <strong>Departamento:</strong> {selectedEmployee.department}
                  </div>
                )}
                <div>
                  <strong>Fecha de Ingreso:</strong>{' '}
                  {new Date(selectedEmployee.hireDate).toLocaleDateString('es-CR')}
                </div>
                <div>
                  <strong>Estado:</strong>{' '}
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: '600',
                      background:
                        selectedEmployee.status === 'ACTIVO'
                          ? '#d1fae5'
                          : selectedEmployee.status === 'SUSPENDIDO'
                          ? '#fef3c7'
                          : '#fee2e2',
                      color:
                        selectedEmployee.status === 'ACTIVO'
                          ? '#065f46'
                          : selectedEmployee.status === 'SUSPENDIDO'
                          ? '#92400e'
                          : '#991b1b',
                    }}
                  >
                    {selectedEmployee.status}
                  </span>
                </div>
                <div>
                  <strong>Salario Mensual:</strong> ₡{Number(selectedEmployee.monthlySalary).toLocaleString('es-CR')}
                </div>
                <div>
                  <strong>Salario Diario:</strong> ₡{Number(selectedEmployee.dailySalary).toLocaleString('es-CR')}
                </div>
              </div>
            </div>

            {/* Documentos */}
            <div style={{ marginTop: '25px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '15px', color: '#374151' }}>
                📎 Documentos
              </h3>

              {/* Upload Form */}
              <form
                onSubmit={handleUploadDocument}
                style={{
                  background: '#f9fafb',
                  padding: '20px',
                  borderRadius: '8px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '10px', alignItems: 'end' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '500' }}>
                      Tipo de Documento
                    </label>
                    <select
                      value={selectedDocType}
                      onChange={(e) => setSelectedDocType(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '13px',
                      }}
                    >
                      <option value="">Seleccionar...</option>
                      {DOCUMENT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {DOCUMENT_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '500' }}>
                      Archivo
                    </label>
                    <input
                      id="docFile"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      required
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '13px',
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={uploadingDoc}
                    style={{
                      padding: '10px 20px',
                      background: uploadingDoc ? '#9ca3af' : '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: uploadingDoc ? 'not-allowed' : 'pointer',
                      fontSize: '13px',
                      fontWeight: '600',
                    }}
                  >
                    {uploadingDoc ? 'Subiendo...' : 'Subir'}
                  </button>
                </div>
                <div style={{ marginTop: '10px' }}>
                  <input
                    type="text"
                    placeholder="Notas (opcional)"
                    value={documentNotes}
                    onChange={(e) => setDocumentNotes(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '13px',
                    }}
                  />
                </div>
              </form>

              {/* Documentos agrupados por tipo */}
              <div style={{ display: 'grid', gap: '15px' }}>
                {DOCUMENT_TYPES.map((type) => {
                  const docs = docsByType[type] || [];
                  if (docs.length === 0) return null;

                  return (
                    <div
                      key={type}
                      style={{
                        background: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '15px',
                      }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px', color: '#374151' }}>
                        {DOCUMENT_TYPE_LABELS[type]}
                      </div>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {docs.map((doc) => (
                          <div
                            key={doc.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '10px',
                              background: '#f9fafb',
                              borderRadius: '6px',
                              fontSize: '13px',
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: '500', marginBottom: '2px' }}>{doc.fileName}</div>
                              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                Subido: {new Date(doc.uploadedAt).toLocaleDateString('es-CR')} por {doc.uploadedByName}
                              </div>
                              {doc.notes && (
                                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                  📝 {doc.notes}
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => handleViewDocument(doc, selectedEmployee.documents || [])}
                                style={{
                                  padding: '6px 12px',
                                  background: '#667eea',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '5px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                }}
                              >
                                👁️ Ver
                              </button>
                              <button
                                onClick={() => handleDeleteDocument(doc.id)}
                                style={{
                                  padding: '6px 12px',
                                  background: '#ef4444',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '5px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                }}
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {Object.keys(docsByType).length === 0 && (
                  <div
                    style={{
                      padding: '40px',
                      textAlign: 'center',
                      color: '#9ca3af',
                      background: '#f9fafb',
                      borderRadius: '8px',
                    }}
                  >
                    No hay documentos cargados. Usa el formulario de arriba para subir documentos.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Attachment Viewer */}
      {attachmentViewerData && (
        <AttachmentViewer
          attachments={attachmentViewerData.attachments}
          initialIndex={attachmentViewerData.initialIndex}
          onClose={() => setAttachmentViewerData(null)}
        />
      )}
    </div>
  );
}
