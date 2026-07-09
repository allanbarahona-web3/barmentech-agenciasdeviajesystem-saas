'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { LoadingModal } from '@/components/loading-modal';
import { getCustomerProfile, updateCustomer, getCustomerDocumentDownloadUrl, uploadCustomerDocument, type CustomerProfile, type UpdateCustomerDto } from '@/lib/customers-api';
import { CustomerForm, CustomerEditModal } from '@/features/customers/components';
import AttachmentViewer from '@/components/attachment-viewer';

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

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [attachmentViewerData, setAttachmentViewerData] = useState<{
    attachments: Array<{ id: string; originalFileName: string; url: string; mimeType: string }>;
    initialIndex: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingDocCategory, setUploadingDocCategory] = useState<string | null>(null);

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
    setEditModalOpen(true);
  }

  async function handleSaveEdit(formData: {
    fullName: string;
    idType: string;
    email: string;
    phone: string;
    maritalStatus: string;
    nationality: string;
    occupation: string;
    address: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
  }) {
    if (!profile) return;

    try {
      setLoadingModalOpen(true);
      setLoadingModalState('loading');
      setLoadingModalMessage('Guardando cambios...');

      const updateData: UpdateCustomerDto = {
        fullName: formData.fullName.trim() || undefined,
        idType: formData.idType.trim() || undefined,
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        maritalStatus: formData.maritalStatus.trim() || undefined,
        nationality: formData.nationality.trim() || undefined,
        occupation: formData.occupation.trim() || undefined,
        address: formData.address.trim() || undefined,
        emergencyContactName: formData.emergencyContactName.trim() || undefined,
        emergencyContactPhone: formData.emergencyContactPhone.trim() || undefined,
      };

      const updatedProfile = await updateCustomer(customerId, updateData);
      setProfile(updatedProfile);
      setEditModalOpen(false);

      setLoadingModalState('success');
      setLoadingModalMessage('✅ Cliente actualizado exitosamente');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error al actualizar cliente';
      setLoadingModalState('error');
      setLoadingModalMessage(errorMessage);
    }
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-CR', {
      style: 'currency',
      currency: 'CRC',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
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

  function getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
      ID_FRONT: 'Cédula (Frente)',
      ID_BACK: 'Cédula (Reverso)',
      PASSPORT: 'Pasaporte',
      PROFILE_PHOTO: 'Foto de Perfil',
      OTHER: 'Otro',
    };
    return labels[category] || category;
  }

  async function handleDownloadDocument(documentId: string) {
    try {
      setLoadingModalOpen(true);
      setLoadingModalState('loading');
      setLoadingModalMessage('Cargando documento...');

      const allDocuments = profile?.documents || [];
      
      // Get download URLs for all documents
      const attachments = await Promise.all(
        allDocuments.map(async (doc) => {
          const result = await getCustomerDocumentDownloadUrl(customerId, doc.id);
          return {
            id: doc.id,
            originalFileName: doc.originalFileName || 'documento.pdf',
            url: result.url,
            mimeType: doc.mimeType || 'application/pdf',
          };
        })
      );

      // Find the index of the clicked document
      const initialIndex = allDocuments.findIndex((doc) => doc.id === documentId);

      // Set viewer data to open the viewer
      setAttachmentViewerData({
        attachments,
        initialIndex: initialIndex >= 0 ? initialIndex : 0,
      });
      
      setLoadingModalOpen(false);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error al abrir documento';
      setLoadingModalState('error');
      setLoadingModalMessage(errorMessage);
    }
  }

  function handleUpdateDocumentClick(category: string) {
    setUploadingDocCategory(category);
    fileInputRef.current?.click();
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !uploadingDocCategory) return;

    try {
      setLoadingModalOpen(true);
      setLoadingModalState('loading');
      setLoadingModalMessage('Subiendo documento...');

      await uploadCustomerDocument(customerId, uploadingDocCategory as any, file);
      
      // Reload profile
      const updatedProfile = await getCustomerProfile(customerId);
      setProfile(updatedProfile);

      setLoadingModalState('success');
      setLoadingModalMessage('✅ Documento actualizado exitosamente');
      setTimeout(() => setLoadingModalOpen(false), 1500);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error al subir documento';
      setLoadingModalState('error');
      setLoadingModalMessage(errorMessage);
    } finally {
      setUploadingDocCategory(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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

  const { customer, contracts, financialSummary, statistics, documents } = profile;

  return (
    <main className="app-shell">
      {/* Hidden file input for document upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

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
        <CustomerForm
          customer={customer}
          isEditMode={false}
          editForm={{
            fullName: '',
            idType: '',
            email: '',
            phone: '',
            maritalStatus: '',
            nationality: '',
            occupation: '',
            address: '',
            emergencyContactName: '',
            emergencyContactPhone: '',
          }}
          onEditFormChange={() => {}}
          onEnterEditMode={handleEnterEditMode}
          onCancelEdit={() => {}}
          onSaveEdit={() => {}}
        />

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
            <div
              style={{
                padding: '16px',
                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                borderRadius: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)', fontWeight: '500', marginBottom: '4px' }}>
                  Documentos
                </div>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'white' }}>
                  {statistics.totalDocuments}
                </div>
              </div>
              <div style={{ fontSize: '40px' }}>📎</div>
            </div>
            <div
              style={{
                padding: '16px',
                background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                borderRadius: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)', fontWeight: '500', marginBottom: '4px' }}>
                  Notas
                </div>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'white' }}>
                  {statistics.totalNotes}
                </div>
              </div>
              <div style={{ fontSize: '40px' }}>📝</div>
            </div>
          </div>
        </div>

        {/* Section 3: Financial Summary */}
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937', marginBottom: '20px' }}>
            💰 Resumen Financiero
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Total Contracted */}
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
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)', fontWeight: '600', marginBottom: '4px' }}>
                  Total Contratado
                </div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'white' }}>
                  {formatCurrency(financialSummary.totalContractedAmount)}
                </div>
              </div>
              <div style={{ fontSize: '32px' }}>📝</div>
            </div>

            {/* Total Invoiced */}
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
                  Total Facturado
                </div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e3a8a' }}>
                  {formatCurrency(financialSummary.totalInvoicedAmount)}
                </div>
              </div>
              <div style={{ fontSize: '32px' }}>🧾</div>
            </div>

            {/* Total Paid */}
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
                  Total Pagado
                </div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#15803d' }}>
                  {formatCurrency(financialSummary.totalPaidAmount)}
                </div>
              </div>
              <div style={{ fontSize: '32px' }}>💳</div>
            </div>

            {/* Outstanding Balance */}
            <div
              style={{
                padding: '16px',
                background: financialSummary.outstandingBalance > 0 ? '#fef3c7' : '#f0fdf4',
                border: `2px solid ${financialSummary.outstandingBalance > 0 ? '#fcd34d' : '#86efac'}`,
                borderRadius: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', color: financialSummary.outstandingBalance > 0 ? '#92400e' : '#166534', fontWeight: '600', marginBottom: '4px' }}>
                  Saldo Pendiente
                </div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: financialSummary.outstandingBalance > 0 ? '#b45309' : '#15803d' }}>
                  {formatCurrency(financialSummary.outstandingBalance)}
                </div>
              </div>
              <div style={{ fontSize: '32px' }}>{financialSummary.outstandingBalance > 0 ? '⚠️' : '✅'}</div>
            </div>

            {/* Available Credit */}
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
                  Crédito Disponible
                </div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#b45309' }}>
                  {formatCurrency(financialSummary.availableCredit)}
                </div>
              </div>
              <div style={{ fontSize: '32px' }}>🏦</div>
            </div>

            {/* Last Payment */}
            {financialSummary.lastPaymentDate && (
              <div
                style={{
                  padding: '14px',
                  background: '#f9fafb',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                }}
              >
                <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', marginBottom: '4px' }}>
                  Último Pago
                </div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1f2937' }}>
                  {formatCurrency(financialSummary.lastPaymentAmount || 0)}
                </div>
                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                  {formatDate(financialSummary.lastPaymentDate)}
                </div>
              </div>
            )}

            {/* Last Contract */}
            {financialSummary.lastContractDate && (
              <div
                style={{
                  padding: '14px',
                  background: '#f9fafb',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                }}
              >
                <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', marginBottom: '4px' }}>
                  Último Contrato
                </div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1f2937' }}>
                  {financialSummary.lastContractNumber}
                </div>
                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                  {formatDate(financialSummary.lastContractDate)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section 4: Additional Profile Information */}
      {(customer.dateOfBirth || customer.nationality || customer.occupation || customer.address || 
        customer.city || customer.country || customer.postalCode || customer.secondaryEmail || 
        customer.secondaryPhone || customer.emergencyContactRelationship || customer.emergencyContactEmail || 
        customer.leadSource || customer.lastContactDate || customer.nextFollowUpDate || 
        customer.preferredLanguage || customer.tags || customer.bloodType || customer.allergies || 
        customer.medicalConditions || customer.medications) && (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '24px', marginBottom: '30px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937', marginBottom: '20px' }}>
            👤 Información Adicional del Perfil
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
            {/* Personal Information */}
            {(customer.dateOfBirth || customer.nationality || customer.occupation || customer.preferredLanguage || customer.bloodType) && (
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Información Personal
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {customer.dateOfBirth && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>Fecha de Nacimiento</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{formatDate(customer.dateOfBirth)}</div>
                    </div>
                  )}
                  {customer.nationality && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>Nacionalidad</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{customer.nationality}</div>
                    </div>
                  )}
                  {customer.occupation && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>Ocupación</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{customer.occupation}</div>
                    </div>
                  )}
                  {customer.preferredLanguage && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>Idioma Preferido</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{customer.preferredLanguage}</div>
                    </div>
                  )}
                  {customer.bloodType && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>Tipo de Sangre</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{customer.bloodType}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Contact Information */}
            {(customer.address || customer.city || customer.country || customer.postalCode || customer.secondaryEmail || customer.secondaryPhone) && (
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Información de Contacto
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {customer.address && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>Dirección</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{customer.address}</div>
                    </div>
                  )}
                  {customer.city && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>Ciudad</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{customer.city}</div>
                    </div>
                  )}
                  {customer.country && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>País</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{customer.country}</div>
                    </div>
                  )}
                  {customer.postalCode && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>Código Postal</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{customer.postalCode}</div>
                    </div>
                  )}
                  {customer.secondaryEmail && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>Email Secundario</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{customer.secondaryEmail}</div>
                    </div>
                  )}
                  {customer.secondaryPhone && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>Teléfono Secundario</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{customer.secondaryPhone}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Emergency Contact Additional */}
            {(customer.emergencyContactRelationship || customer.emergencyContactEmail) && (
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Contacto de Emergencia
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {customer.emergencyContactRelationship && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>Relación</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{customer.emergencyContactRelationship}</div>
                    </div>
                  )}
                  {customer.emergencyContactEmail && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>Email</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{customer.emergencyContactEmail}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CRM Information */}
            {(customer.leadSource || customer.customerStatus || customer.lastContactDate || customer.nextFollowUpDate || customer.tags) && (
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Información CRM
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {customer.leadSource && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>Fuente de Lead</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{customer.leadSource}</div>
                    </div>
                  )}
                  {customer.customerStatus && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>Estado del Cliente</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{customer.customerStatus}</div>
                    </div>
                  )}
                  {customer.lastContactDate && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>Último Contacto</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{formatDate(customer.lastContactDate)}</div>
                    </div>
                  )}
                  {customer.nextFollowUpDate && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>Próximo Seguimiento</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{formatDate(customer.nextFollowUpDate)}</div>
                    </div>
                  )}
                  {customer.tags && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>Etiquetas</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{customer.tags}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Medical Information */}
            {(customer.allergies || customer.medicalConditions || customer.medications) && (
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#6b7280', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Información Médica
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {customer.allergies && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>Alergias</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{customer.allergies}</div>
                    </div>
                  )}
                  {customer.medicalConditions && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>Condiciones Médicas</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{customer.medicalConditions}</div>
                    </div>
                  )}
                  {customer.medications && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>Medicamentos</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{customer.medications}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Customer Documents Section */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom: '30px' }}>
        <div style={{ padding: '20px 24px', borderBottom: '2px solid #e5e7eb' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937' }}>
            📎 Documentos ({documents.length})
          </h2>
        </div>

        {documents.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>📄</div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#4b5563', marginBottom: '8px' }}>
              No hay documentos
            </h3>
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>
              Este cliente aún no tiene documentos adjuntos
            </p>
          </div>
        ) : (
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'grid', gap: '16px' }}>
              {documents
                .sort((a, b) => {
                  // Sort by isCurrent first (current = true first)
                  const aIsCurrent = (a as any).isCurrent ?? false;
                  const bIsCurrent = (b as any).isCurrent ?? false;
                  if (aIsCurrent !== bIsCurrent) {
                    return bIsCurrent ? 1 : -1;
                  }
                  // Then sort by date (newest first)
                  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                })
                .map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    padding: '16px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#667eea';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(102,126,234,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span
                        style={{
                          padding: '4px 12px',
                          background: '#eff6ff',
                          color: '#1e40af',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                        }}
                      >
                        {getCategoryLabel(doc.category)}
                      </span>
                      <span
                        style={{
                          padding: '4px 12px',
                          background: (doc as any).isCurrent ? '#d1fae5' : '#f3f4f6',
                          color: (doc as any).isCurrent ? '#065f46' : '#6b7280',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                        }}
                      >
                        {(doc as any).isCurrent ? 'Current' : 'History'}
                      </span>
                      <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                        {formatDate(doc.createdAt)}
                      </span>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: '#1f2937', marginBottom: '4px' }}>
                      {doc.originalFileName}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      {doc.mimeType} • {(doc.size / 1024).toFixed(2)} KB
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleDownloadDocument(doc.id)}
                      style={{
                        padding: '8px 16px',
                        background: '#667eea',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '500',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#5568d3')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#667eea')}
                    >
                      🗂️ Ver
                    </button>
                    {(doc as any).isCurrent && (
                      <button
                        onClick={() => handleUpdateDocumentClick(doc.category)}
                        style={{
                          padding: '8px 16px',
                          background: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: '500',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#059669')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#10b981')}
                      >
                        ✏️ Actualizar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Section 5: Contracts */}
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

      <CustomerEditModal
        isOpen={editModalOpen}
        customer={customer}
        onClose={() => setEditModalOpen(false)}
        onSave={handleSaveEdit}
      />

      {attachmentViewerData && (
        <AttachmentViewer
          attachments={attachmentViewerData.attachments}
          initialIndex={attachmentViewerData.initialIndex}
          onClose={() => setAttachmentViewerData(null)}
        />
      )}

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
