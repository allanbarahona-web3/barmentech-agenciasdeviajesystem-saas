'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { LoadingModal } from '@/components/loading-modal';
import { getCustomerProfile, updateCustomer, type CustomerProfile, type UpdateCustomerDto } from '@/lib/customers-api';

export default function CustomerProfilePage() {
  const router = useRouter();
  const params = useParams();
  const customerId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loadingModalOpen, setLoadingModalOpen] = useState(false);
  const [loadingModalState, setLoadingModalState] = useState<'loading' | 'success' | 'error'>('loading');
  const [loadingModalMessage, setLoadingModalMessage] = useState('');
  const [is404Error, setIs404Error] = useState(false);

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
  });

  useEffect(() => {
    loadProfile();
  }, [customerId]);

  async function loadProfile() {
    try {
      setLoading(true);
      setLoadingModalOpen(true);
      setLoadingModalState('loading');
      setLoadingModalMessage('Cargando perfil del cliente...');
      setIs404Error(false);

      const data = await getCustomerProfile(customerId);
      setProfile(data);
      setLoadingModalOpen(false);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar el perfil del cliente';
      setLoadingModalState('error');
      setLoadingModalMessage(errorMessage);
      
      // Check if it's a 404/not found error
      const is404 = errorMessage.includes('404') || errorMessage.toLowerCase().includes('not found');
      setIs404Error(is404);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function formatDateTime(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function handleEnterEditMode() {
    if (!profile) return;
    setEditForm({
      fullName: profile.customer.fullName,
      email: profile.customer.email,
      phone: profile.customer.phone || '',
      emergencyContactName: profile.customer.emergencyContactName || '',
      emergencyContactPhone: profile.customer.emergencyContactPhone || '',
    });
    setIsEditMode(true);
  }

  function handleCancelEdit() {
    setIsEditMode(false);
  }

  async function handleSaveEdit() {
    if (!profile) return;

    try {
      setLoadingModalOpen(true);
      setLoadingModalState('loading');
      setLoadingModalMessage('Guardando cambios...');

      const updateData: UpdateCustomerDto = {
        fullName: editForm.fullName.trim() || undefined,
        email: editForm.email.trim() || undefined,
        phone: editForm.phone.trim() || undefined,
        emergencyContactName: editForm.emergencyContactName.trim() || undefined,
        emergencyContactPhone: editForm.emergencyContactPhone.trim() || undefined,
      };

      const updatedProfile = await updateCustomer(customerId, updateData);
      setProfile(updatedProfile);
      setIsEditMode(false);

      setLoadingModalState('success');
      setLoadingModalMessage('✅ Cliente actualizado exitosamente');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error al actualizar cliente';
      setLoadingModalState('error');
      setLoadingModalMessage(errorMessage);
    }
  }

  function getStatusBadgeStyle(status: string) {
    const statusUpper = status.toUpperCase();
    switch (statusUpper) {
      case 'DRAFT':
        return { background: '#fef3c7', color: '#92400e' };
      case 'READY_FOR_SIGNATURE':
        return { background: '#dbeafe', color: '#1e40af' };
      case 'SIGNED':
        return { background: '#d1fae5', color: '#065f46' };
      case 'ARCHIVED':
        return { background: '#e5e7eb', color: '#4b5563' };
      case 'CANCELLED':
        return { background: '#fee2e2', color: '#991b1b' };
      default:
        return { background: '#f3f4f6', color: '#6b7280' };
    }
  }

  if (loading || !profile) {
    return (
      <>
        <main className="app-shell" style={{ padding: '20px' }}>
          <p style={{ textAlign: 'center', color: '#6b7280' }}>Cargando...</p>
        </main>
        <LoadingModal
          isOpen={loadingModalOpen}
          state={loadingModalState}
          loadingMessage={loadingModalMessage}
          errorMessage={loadingModalMessage}
          onClose={() => {
            setLoadingModalOpen(false);
            if (loadingModalState === 'error' && is404Error) {
              router.push('/admin/customers');
            }
          }}
        />
      </>
    );
  }

  const { customer, contracts, financialSummary, statistics } = profile;

  return (
    <main className="app-shell">
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '30px',
          borderRadius: '12px',
          marginBottom: '30px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'white', marginBottom: '8px' }}>
              {customer.fullName}
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '14px' }}>
              {customer.idNumber} • {customer.email}
            </p>
          </div>
          <button
            onClick={() => router.back()}
            style={{
              padding: '10px 20px',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              backdropFilter: 'blur(10px)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.3)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
          >
            ← Volver
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '30px' }}>
        {/* Section 1: Customer Information */}
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937' }}>
              📋 Información del Cliente
            </h2>
            {!isEditMode ? (
              <button
                onClick={handleEnterEditMode}
                style={{
                  padding: '6px 14px',
                  background: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#5568d3')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#667eea')}
              >
                ✏️ Editar
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleCancelEdit}
                  style={{
                    padding: '6px 14px',
                    background: '#e5e7eb',
                    color: '#4b5563',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '500',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#d1d5db')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#e5e7eb')}
                >
                  ✖️ Cancelar
                </button>
                <button
                  onClick={handleSaveEdit}
                  style={{
                    padding: '6px 14px',
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '500',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#059669')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#10b981')}
                >
                  💾 Guardar
                </button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Full Name - Editable */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Nombre Completo
              </div>
              {isEditMode ? (
                <input
                  type="text"
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '15px',
                    color: '#1f2937',
                    fontWeight: '500',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
                />
              ) : (
                <div style={{ fontSize: '15px', color: '#1f2937', fontWeight: '500' }}>
                  {customer.fullName}
                </div>
              )}
            </div>
            {/* ID Number - Read Only */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Cédula/ID
              </div>
              <div style={{ fontSize: '15px', color: '#1f2937', fontWeight: '500' }}>
                {customer.idNumber}
              </div>
            </div>
            {/* Email - Editable */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Email
              </div>
              {isEditMode ? (
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '15px',
                    color: '#1f2937',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
                />
              ) : (
                <div style={{ fontSize: '15px', color: '#1f2937' }}>
                  {customer.email}
                </div>
              )}
            </div>
            {/* Phone - Editable */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Teléfono
              </div>
              {isEditMode ? (
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '15px',
                    color: '#1f2937',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
                />
              ) : (
                <div style={{ fontSize: '15px', color: '#1f2937' }}>
                  {customer.phone || '-'}
                </div>
              )}
            </div>
            {/* Emergency Contact - Editable */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Contacto de Emergencia
              </div>
              {isEditMode ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Nombre"
                    value={editForm.emergencyContactName}
                    onChange={(e) => setEditForm({ ...editForm, emergencyContactName: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '15px',
                      color: '#1f2937',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
                  />
                  <input
                    type="text"
                    placeholder="Teléfono"
                    value={editForm.emergencyContactPhone}
                    onChange={(e) => setEditForm({ ...editForm, emergencyContactPhone: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '15px',
                      color: '#1f2937',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
                  />
                </div>
              ) : (
                <div style={{ fontSize: '15px', color: '#1f2937' }}>
                  {customer.emergencyContactName || '-'}
                  {customer.emergencyContactName && customer.emergencyContactPhone && (
                    <span style={{ color: '#6b7280', marginLeft: '8px' }}>
                      ({customer.emergencyContactPhone})
                    </span>
                  )}
                </div>
              )}
            </div>
            {/* Created At - Read Only */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Cliente Desde
              </div>
              <div style={{ fontSize: '15px', color: '#1f2937' }}>
                {formatDate(customer.createdAt)}
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Statistics */}
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937', marginBottom: '20px' }}>
            📊 Estadísticas
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                padding: '16px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)', fontWeight: '500', marginBottom: '4px' }}>
                  Total Contratos
                </div>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'white' }}>
                  {statistics.totalContracts}
                </div>
              </div>
              <div style={{ fontSize: '40px' }}>📝</div>
            </div>
            <div
              style={{
                padding: '16px',
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                borderRadius: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)', fontWeight: '500', marginBottom: '4px' }}>
                  Total Viajes
                </div>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'white' }}>
                  {statistics.totalTravels}
                </div>
              </div>
              <div style={{ fontSize: '40px' }}>✈️</div>
            </div>
          </div>
        </div>

        {/* Section 3: Financial Summary */}
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937', marginBottom: '20px' }}>
            💰 Resumen Financiero
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                padding: '16px',
                background: '#f0fdf4',
                border: '2px solid #86efac',
                borderRadius: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', color: '#166534', fontWeight: '600', marginBottom: '4px' }}>
                  Total Facturas
                </div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#15803d' }}>
                  {financialSummary.totalInvoices}
                </div>
              </div>
              <div style={{ fontSize: '32px' }}>🧾</div>
            </div>
            <div
              style={{
                padding: '16px',
                background: '#eff6ff',
                border: '2px solid #93c5fd',
                borderRadius: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', color: '#1e40af', fontWeight: '600', marginBottom: '4px' }}>
                  Total Recibos
                </div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e3a8a' }}>
                  {financialSummary.totalReceipts}
                </div>
              </div>
              <div style={{ fontSize: '32px' }}>📄</div>
            </div>
            <div
              style={{
                padding: '16px',
                background: '#fef3c7',
                border: '2px solid #fcd34d',
                borderRadius: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', color: '#92400e', fontWeight: '600', marginBottom: '4px' }}>
                  Total Pagos
                </div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#b45309' }}>
                  {financialSummary.totalPayments}
                </div>
              </div>
              <div style={{ fontSize: '32px' }}>💳</div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: Contracts */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom: '30px' }}>
        <div style={{ padding: '20px 24px', borderBottom: '2px solid #e5e7eb' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937' }}>
            📄 Contratos ({contracts.length})
          </h2>
        </div>

        {contracts.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>📄</div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#4b5563', marginBottom: '8px' }}>
              No hay contratos
            </h3>
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>
              Este cliente aún no tiene contratos registrados
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'linear-gradient(to right, #f9fafb, #f3f4f6)', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Contrato
                  </th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Destino
                  </th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Estado
                  </th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Origen
                  </th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Participantes
                  </th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Creado
                  </th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((contract) => (
                  <tr
                    key={contract.id}
                    style={{
                      borderBottom: '1px solid #f3f4f6',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                  >
                    <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: '500', color: '#1f2937' }}>
                      {contract.contractNumber}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: '#4b5563' }}>
                      {contract.destination}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '600',
                          ...getStatusBadgeStyle(contract.status),
                        }}
                      >
                        {contract.status}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: '#6b7280' }}>
                      {contract.source}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: '#6b7280', textAlign: 'center' }}>
                      {contract.participantCount}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#9ca3af' }}>
                      {formatDateTime(contract.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <LoadingModal
        isOpen={loadingModalOpen}
        state={loadingModalState}
        loadingMessage={loadingModalMessage}
        errorMessage={loadingModalMessage}
        onClose={() => {
          setLoadingModalOpen(false);
          if (loadingModalState === 'error') {
            router.push('/admin/customers');
          }
        }}
      />
    </main>
  );
}
