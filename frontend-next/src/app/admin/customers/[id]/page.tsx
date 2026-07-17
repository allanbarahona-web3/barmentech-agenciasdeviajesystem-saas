'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { LoadingModal } from '@/components/loading-modal';
import { getCustomerProfile, updateCustomer, getCustomerDocumentDownloadUrl, uploadCustomerDocument, createCustomerNote, updateCustomerNote, deleteCustomerNote, type CustomerProfile, type UpdateCustomerDto, type CustomerDocumentCategory } from '@/lib/customers-api';
import { getStoredSession } from '@/lib/auth-api';
import { CustomerForm, CustomerEditModal, CustomerDocumentUploadModal } from '@/features/customers/components';
import AttachmentViewer from '@/components/attachment-viewer';
import { getContractFiles } from '@/lib/contracts-api';
import { listCustomerOperationalNotes, createContractNoteForCustomer, updateContractNote, deleteContractNote, type ContractNote } from '@/lib/contract-notes-api';
import { formatBusinessDate } from '@/shared/regional';

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

  // User session for role check
  const session = getStoredSession();
  const isAdmin = session?.user?.role?.toUpperCase() === 'ADMIN';

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [attachmentViewerData, setAttachmentViewerData] = useState<{
    attachments: Array<{ id: string; originalFileName: string; url: string; mimeType: string }>;
    initialIndex: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingDocCategory, setUploadingDocCategory] = useState<string | null>(null);
  
  // Document upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  
  // Section refs for navigation
  const contractsRef = useRef<HTMLDivElement>(null);
  const documentsRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<HTMLDivElement>(null);
  
  // Customer notes state
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [showAllNotesModal, setShowAllNotesModal] = useState(false);
  const [expandedNoteIdInModal, setExpandedNoteIdInModal] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [noteToDelete, setNoteToDelete] = useState<{ id: string; preview: string } | null>(null);

  // Operational notes state (from contracts)
  const [operationalNotes, setOperationalNotes] = useState<ContractNote[]>([]);
  const [loadingOperationalNotes, setLoadingOperationalNotes] = useState(false);
  const [showCreateOperationalNoteModal, setShowCreateOperationalNoteModal] = useState(false);
  const [editingOperationalNote, setEditingOperationalNote] = useState<ContractNote | null>(null);
  const [operationalNoteForm, setOperationalNoteForm] = useState({
    contractId: '',
    note: '',
  });

  // Contract viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerHtml, setViewerHtml] = useState('');
  const [busyContractId, setBusyContractId] = useState<string>('');

  useEffect(() => {
    loadProfile();
  }, [customerId]);

  useEffect(() => {
    if (customerId) {
      loadOperationalNotes();
    }
  }, [customerId]);

  useEffect(() => {
    if (!viewerOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeViewer();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewerOpen]);

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

  async function loadOperationalNotes() {
    try {
      setLoadingOperationalNotes(true);
      const notes = await listCustomerOperationalNotes(customerId);
      setOperationalNotes(notes);
    } catch (err: unknown) {
      console.error('Error al cargar notas operativas:', err);
      // Silently fail - operational notes are not critical
      setOperationalNotes([]);
    } finally {
      setLoadingOperationalNotes(false);
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

  const closeViewer = () => {
    setViewerOpen(false);
    setViewerHtml('');
  };

  const openContractPdf = async (contractId: string) => {
    setBusyContractId(contractId);
    try {
      const files = await getContractFiles(contractId);
      const url = files.signedPdf?.url || files.pdf?.url || '';
      if (!url) {
        setLoadingModalState('error');
        setLoadingModalMessage('No hay contrato disponible.');
        setLoadingModalOpen(true);
      } else {
        setViewerHtml(`<iframe src="${url}" title="Contrato" class="viewer-iframe"></iframe>`);
        setViewerOpen(true);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'No se pudo abrir el contrato.';
      setLoadingModalState('error');
      setLoadingModalMessage(errorMessage);
      setLoadingModalOpen(true);
    } finally {
      setBusyContractId('');
    }
  };

  const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth' });
  };

  function getFirstLinePreview(text: string): string {
    const firstLine = text.split('\n')[0].trim();
    return firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;
  }

  function renderNote(
    note: { id: string; note: string; createdAt: string; createdByName: string },
    expandedId: string | null,
    onToggle: (id: string | null) => void,
    showActions = false
  ) {
    const isExpanded = expandedId === note.id;
    const noteDate = new Date(note.createdAt);
    const localDate = noteDate.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const localTime = noteDate.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <div
        key={note.id}
        style={{
          border: '2px solid #e5e7eb',
          borderRadius: '10px',
          overflow: 'hidden',
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
        <div style={{ padding: '16px' }}>
          <div 
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', cursor: 'pointer' }}
            onClick={() => onToggle(isExpanded ? null : note.id)}
          >
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1 }}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937' }}>
                {localDate}
              </span>
              <span style={{ fontSize: '14px', color: '#6b7280' }}>
                {localTime}
              </span>
              <span
                style={{
                  padding: '4px 10px',
                  background: '#eff6ff',
                  color: '#1e40af',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '600',
                }}
              >
                {note.createdByName}
              </span>
            </div>
            <span style={{ fontSize: '18px', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              ▼
            </span>
          </div>
          
          {!isExpanded && (
            <div 
              style={{ fontSize: '14px', color: '#4b5563', marginTop: '8px', cursor: 'pointer' }}
              onClick={() => onToggle(isExpanded ? null : note.id)}
            >
              {getFirstLinePreview(note.note)}
            </div>
          )}
          
          {isExpanded && (
            <>
              <div style={{ 
                fontSize: '14px', 
                color: '#1f2937', 
                marginTop: '12px',
                padding: '12px',
                background: '#f9fafb',
                borderRadius: '8px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {note.note}
              </div>
              
              {showActions && isAdmin && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingNoteId(note.id);
                      setEditingNoteText(note.note);
                    }}
                    style={{
                      padding: '6px 14px',
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '500',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#2563eb')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#3b82f6')}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setNoteToDelete({ id: note.id, preview: getFirstLinePreview(note.note) });
                    }}
                    style={{
                      padding: '6px 14px',
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '500',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#dc2626')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#ef4444')}
                  >
                    🗑️ Delete
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
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

  function formatCurrency(amount: number, currency?: string): string {
    // Use the currency from financialSummary, default to USD
    const currencyCode = currency || financialSummary?.currency || 'USD';
    
    return new Intl.NumberFormat('es-CR', {
      style: 'currency',
      currency: currencyCode,
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

  async function handleUploadDocument(category: CustomerDocumentCategory, file: File) {
    try {
      setLoadingModalOpen(true);
      setLoadingModalState('loading');
      setLoadingModalMessage('Subiendo documento...');

      await uploadCustomerDocument(customerId, category, file);
      
      // Reload profile
      const updatedProfile = await getCustomerProfile(customerId);
      setProfile(updatedProfile);

      setLoadingModalState('success');
      setLoadingModalMessage('✅ Documento agregado exitosamente');
      setTimeout(() => setLoadingModalOpen(false), 1500);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error al subir documento';
      setLoadingModalState('error');
      setLoadingModalMessage(errorMessage);
      throw err; // Re-throw so modal can show error
    }
  }

  async function handleCreateNote() {
    const trimmedNote = newNoteText.trim();
    
    if (!trimmedNote) {
      setLoadingModalState('error');
      setLoadingModalMessage('La nota no puede estar vacía');
      setLoadingModalOpen(true);
      return;
    }

    try {
      setLoadingModalOpen(true);
      setLoadingModalState('loading');
      setLoadingModalMessage('Guardando nota...');

      await createCustomerNote(customerId, trimmedNote);
      
      // Reload profile
      const updatedProfile = await getCustomerProfile(customerId);
      setProfile(updatedProfile);

      setLoadingModalState('success');
      setLoadingModalMessage('✅ Nota creada exitosamente');
      setShowAddNoteModal(false);
      setNewNoteText('');
      setTimeout(() => setLoadingModalOpen(false), 1500);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error al crear nota';
      setLoadingModalState('error');
      setLoadingModalMessage(errorMessage);
    }
  }

  async function handleUpdateNote() {
    if (!editingNoteId) return;
    
    const trimmedNote = editingNoteText.trim();
    
    if (!trimmedNote) {
      setLoadingModalState('error');
      setLoadingModalMessage('La nota no puede estar vacía');
      setLoadingModalOpen(true);
      return;
    }

    try {
      setLoadingModalOpen(true);
      setLoadingModalState('loading');
      setLoadingModalMessage('Actualizando nota...');

      await updateCustomerNote(customerId, editingNoteId, trimmedNote);
      
      // Reload profile
      const updatedProfile = await getCustomerProfile(customerId);
      setProfile(updatedProfile);

      setLoadingModalState('success');
      setLoadingModalMessage('✅ Nota actualizada exitosamente');
      setEditingNoteId(null);
      setEditingNoteText('');
      setTimeout(() => setLoadingModalOpen(false), 1500);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error al actualizar nota';
      setLoadingModalState('error');
      setLoadingModalMessage(errorMessage);
    }
  }

  async function handleDeleteNote() {
    if (!noteToDelete) return;

    try {
      setLoadingModalOpen(true);
      setLoadingModalState('loading');
      setLoadingModalMessage('Eliminando nota...');

      await deleteCustomerNote(customerId, noteToDelete.id);
      
      // Reload profile
      const updatedProfile = await getCustomerProfile(customerId);
      setProfile(updatedProfile);

      setLoadingModalState('success');
      setLoadingModalMessage('✅ Nota eliminada exitosamente');
      setNoteToDelete(null);
      setTimeout(() => setLoadingModalOpen(false), 1500);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error al eliminar nota';
      setLoadingModalState('error');
      setLoadingModalMessage(errorMessage);
    }
  }

  // Operational Notes handlers
  function handleOpenCreateOperationalNote() {
    const activeContracts = contracts.filter(c => c.status !== 'DRAFT');
    
    // Reset form
    const initialForm = {
      contractId: activeContracts.length === 1 ? activeContracts[0].id : '',
      note: '',
    };

    setOperationalNoteForm(initialForm);
    setShowCreateOperationalNoteModal(true);
  }

  async function handleCreateOperationalNote() {
    if (!operationalNoteForm.contractId || !operationalNoteForm.note.trim()) {
      setLoadingModalState('error');
      setLoadingModalMessage('Por favor complete todos los campos requeridos');
      setLoadingModalOpen(true);
      return;
    }

    try {
      setLoadingModalOpen(true);
      setLoadingModalState('loading');
      setLoadingModalMessage('Creando nota operativa...');

      await createContractNoteForCustomer(operationalNoteForm.contractId, {
        customerId: customerId,
        note: operationalNoteForm.note,
      });

      await loadOperationalNotes();

      setLoadingModalState('success');
      setLoadingModalMessage('✅ Nota operativa creada');
      setShowCreateOperationalNoteModal(false);
      setTimeout(() => setLoadingModalOpen(false), 1500);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error al crear nota';
      setLoadingModalState('error');
      setLoadingModalMessage(errorMessage);
    }
  }

  function handleOpenEditOperationalNote(note: ContractNote) {
    setEditingOperationalNote(note);
    setOperationalNoteForm({
      contractId: note.contractId,
      note: note.note,
    });
  }

  async function handleUpdateOperationalNote() {
    if (!editingOperationalNote || !operationalNoteForm.note.trim()) {
      setLoadingModalState('error');
      setLoadingModalMessage('La nota no puede estar vacía');
      setLoadingModalOpen(true);
      return;
    }

    try {
      setLoadingModalOpen(true);
      setLoadingModalState('loading');
      setLoadingModalMessage('Actualizando nota...');

      await updateContractNote(editingOperationalNote.contractId, editingOperationalNote.id, {
        note: operationalNoteForm.note,
      });

      await loadOperationalNotes();

      setLoadingModalState('success');
      setLoadingModalMessage('✅ Nota actualizada');
      setEditingOperationalNote(null);
      setTimeout(() => setLoadingModalOpen(false), 1500);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error al actualizar nota';
      setLoadingModalState('error');
      setLoadingModalMessage(errorMessage);
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
              onClick={() => scrollToSection(contractsRef)}
              style={{
                padding: '16px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
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
              onClick={() => scrollToSection(documentsRef)}
              style={{
                padding: '16px',
                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                borderRadius: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 172, 254, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
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
              onClick={() => scrollToSection(notesRef)}
              style={{
                padding: '16px',
                background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                borderRadius: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(67, 233, 123, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
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
                  {formatCurrency(financialSummary.totalContractedAmount, financialSummary.currency)}
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
                  {formatCurrency(financialSummary.totalInvoicedAmount, financialSummary.currency)}
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
                  {formatCurrency(financialSummary.totalPaidAmount, financialSummary.currency)}
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
                  {formatCurrency(financialSummary.outstandingBalance, financialSummary.currency)}
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
                  {formatCurrency(financialSummary.availableCredit, financialSummary.currency)}
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
                  {formatCurrency(financialSummary.lastPaymentAmount || 0, financialSummary.currency)}
                </div>
                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                  {formatBusinessDate(financialSummary.lastPaymentDate)}
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
                  {formatBusinessDate(financialSummary.lastContractDate)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notas Operativas Section - Full Width */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '24px', marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937', margin: 0 }}>
            📋 Notas Operativas {operationalNotes.length > 0 && `(${operationalNotes.length})`}
          </h2>
          {contracts.filter(c => c.status !== 'DRAFT').length > 0 && (
            <button
              onClick={handleOpenCreateOperationalNote}
              style={{
                padding: '10px 20px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'all 0.2s',
                boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)';
              }}
            >
              ➕ Nueva Nota Operativa
            </button>
          )}
        </div>
        
        {loadingOperationalNotes ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
            Cargando notas operativas...
          </div>
        ) : operationalNotes.length === 0 ? (
          <div style={{ padding: '24px', background: '#f9fafb', borderRadius: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
            <p style={{ fontSize: '16px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>
              No existen notas operativas.
            </p>
            <p style={{ fontSize: '14px', color: '#6b7280', lineHeight: '1.6', marginBottom: '8px' }}>
              Las notas operativas serán creadas desde el contrato y estarán disponibles aquí para su consulta.
            </p>
            <p style={{ fontSize: '14px', color: '#6b7280', lineHeight: '1.6' }}>
              Estas notas permiten comunicar información importante a Facturación y Operaciones sin modificar el expediente permanente del cliente.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {operationalNotes.map((note) => (
              <div
                key={note.id}
                style={{
                  padding: '20px',
                  background: '#f9fafb',
                  border: '2px solid #e5e7eb',
                  borderRadius: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                      <div
                        style={{
                          padding: '4px 12px',
                          background: note.passengerType === 'HOLDER' ? '#dbeafe' : note.passengerType === 'COMPANION' ? '#d1fae5' : '#fed7aa',
                          color: note.passengerType === 'HOLDER' ? '#1e40af' : note.passengerType === 'COMPANION' ? '#065f46' : '#9a3412',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                        }}
                      >
                        {note.passengerName}
                      </div>
                      <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                        {note.passengerType === 'HOLDER' ? 'Titular' : note.passengerType === 'COMPANION' ? 'Acompañante' : 'Menor'}
                      </span>
                    </div>
                    {note.contract && (
                      <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
                        <strong>Contrato:</strong> {note.contract.contractNumber} - {note.contract.destination}
                        {note.contract.startDate && ` (${formatBusinessDate(note.contract.startDate.toString())})`}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: '14px', color: '#374151', marginBottom: '12px', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                  {note.note}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                    Creada por: {note.createdByName} • {formatDate(note.createdAt.toString())}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        padding: '4px 8px',
                        background: note.status === 'ACTIVE' ? '#d1fae5' : '#f3f4f6',
                        color: note.status === 'ACTIVE' ? '#065f46' : '#6b7280',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600',
                      }}
                    >
                      {note.status === 'ACTIVE' ? 'ACTIVA' : 'ARCHIVADA'}
                    </div>
                    {note.status === 'ACTIVE' && (
                      <button
                        onClick={() => handleOpenEditOperationalNote(note)}
                        style={{
                          padding: '4px 8px',
                          background: '#dbeafe',
                          color: '#1e40af',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#93c5fd';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#dbeafe';
                        }}
                        title="Editar nota"
                      >
                        ✏️ Editar
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={async () => {
                          if (confirm('¿Está seguro de eliminar esta nota operativa?')) {
                            try {
                              setLoadingModalOpen(true);
                              setLoadingModalState('loading');
                              setLoadingModalMessage('Eliminando nota...');
                              await deleteContractNote(note.contractId, note.id);
                              await loadOperationalNotes();
                              setLoadingModalState('success');
                              setLoadingModalMessage('✅ Nota eliminada');
                              setTimeout(() => setLoadingModalOpen(false), 1500);
                            } catch (err) {
                              setLoadingModalState('error');
                              setLoadingModalMessage(err instanceof Error ? err.message : 'Error al eliminar');
                            }
                          }
                        }}
                        style={{
                          padding: '4px 8px',
                          background: '#fee2e2',
                          color: '#991b1b',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#fca5a5';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#fee2e2';
                        }}
                        title="Eliminar nota (solo Admin)"
                      >
                        🗑️ Eliminar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{formatBusinessDate(customer.dateOfBirth)}</div>
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
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{formatBusinessDate(customer.lastContactDate)}</div>
                    </div>
                  )}
                  {customer.nextFollowUpDate && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '2px' }}>Próximo Seguimiento</div>
                      <div style={{ fontSize: '14px', color: '#1f2937', fontWeight: '500' }}>{formatBusinessDate(customer.nextFollowUpDate)}</div>
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
      <div ref={documentsRef} style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom: '30px' }}>
        <div style={{ padding: '20px 24px', borderBottom: '2px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937' }}>
            📎 Documentos ({documents.length})
          </h2>
          <button
            onClick={() => setShowUploadModal(true)}
            style={{
              padding: '10px 20px',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#5568d3')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#667eea')}
          >
            ➕ Agregar Documento
          </button>
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
      <div ref={contractsRef} style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom: '30px' }}>
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
                    Participación
                  </th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Nombre del Viaje
                  </th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Fechas del Viaje
                  </th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Participantes
                  </th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Creado
                  </th>
                  <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Acciones
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
                      <button
                        onClick={() => openContractPdf(contract.id)}
                        disabled={busyContractId === contract.id}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#667eea',
                          textDecoration: 'underline',
                          cursor: busyContractId === contract.id ? 'wait' : 'pointer',
                          fontSize: '14px',
                          fontWeight: '500',
                          padding: 0,
                          opacity: busyContractId === contract.id ? 0.6 : 1,
                        }}
                      >
                        {contract.contractNumber}
                      </button>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px' }}>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          background: contract.role === 'HOLDER' ? '#dbeafe' : '#fef3c7',
                          color: contract.role === 'HOLDER' ? '#1e40af' : '#92400e',
                        }}
                      >
                        {contract.role === 'HOLDER' ? 'Titular' : 'Acompañante'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: '#4b5563' }}>
                      {contract.travelName}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: '#6b7280' }}>
                      {contract.startDate && contract.endDate
                        ? `${formatBusinessDate(contract.startDate)} - ${formatBusinessDate(contract.endDate)}`
                        : 'Fechas no disponibles'}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: '#6b7280', textAlign: 'center' }}>
                      {contract.participantCount}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#9ca3af' }}>
                      {formatDateTime(contract.createdAt)}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <Link
                        href={`/billing/${encodeURIComponent(contract.id)}`}
                        style={{
                          display: 'inline-block',
                          padding: '6px 12px',
                          background: '#10b981',
                          color: 'white',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          textDecoration: 'none',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#059669')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#10b981')}
                      >
                        Open Account
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 6: Customer Notes */}
      <div ref={notesRef} style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom: '30px' }}>
        <div style={{ padding: '20px 24px', borderBottom: '2px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937' }}>
            📝 Customer Notes ({profile.notes.length})
          </h2>
          <button
            onClick={() => setShowAddNoteModal(true)}
            style={{
              padding: '10px 20px',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#5568d3')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#667eea')}
          >
            ➕ Add Note
          </button>
        </div>

        {profile.notes.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>📝</div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#4b5563', marginBottom: '8px' }}>
              No customer notes available.
            </h3>
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>
              No notes have been added for this customer yet.
            </p>
          </div>
        ) : (
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {profile.notes
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 5)
                .map((note) => renderNote(note, expandedNoteId, setExpandedNoteId, true))}
            </div>
            
            {profile.notes.length > 5 && (
              <div style={{ marginTop: '16px', textAlign: 'center' }}>
                <button
                  onClick={() => setShowAllNotesModal(true)}
                  style={{
                    padding: '10px 20px',
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#5568d3')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#667eea')}
                >
                  View All Notes ({profile.notes.length})
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <CustomerEditModal
        isOpen={editModalOpen}
        customer={customer}
        onClose={() => setEditModalOpen(false)}
        onSave={handleSaveEdit}
      />

      <CustomerDocumentUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUpload={handleUploadDocument}
      />

      {/* Add Note Modal */}
      {showAddNoteModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => {
            setShowAddNoteModal(false);
            setNewNoteText('');
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '24px',
              width: '90%',
              maxWidth: '600px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937', marginBottom: '20px' }}>
              Add Customer Note
            </h2>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                Note
              </label>
              <textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="Enter your note here..."
                rows={8}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  outline: 'none',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowAddNoteModal(false);
                  setNewNoteText('');
                }}
                style={{
                  padding: '10px 20px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#e5e7eb')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#f3f4f6')}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNote}
                disabled={!newNoteText.trim()}
                style={{
                  padding: '10px 20px',
                  background: newNoteText.trim() ? '#667eea' : '#d1d5db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: newNoteText.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (newNoteText.trim()) {
                    e.currentTarget.style.background = '#5568d3';
                  }
                }}
                onMouseLeave={(e) => {
                  if (newNoteText.trim()) {
                    e.currentTarget.style.background = '#667eea';
                  }
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Note Modal */}
      {editingNoteId && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => {
            setEditingNoteId(null);
            setEditingNoteText('');
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '24px',
              width: '90%',
              maxWidth: '600px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937', marginBottom: '20px' }}>
              Edit Customer Note
            </h2>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                Note
              </label>
              <textarea
                value={editingNoteText}
                onChange={(e) => setEditingNoteText(e.target.value)}
                placeholder="Enter your note here..."
                rows={8}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  outline: 'none',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setEditingNoteId(null);
                  setEditingNoteText('');
                }}
                style={{
                  padding: '10px 20px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#e5e7eb')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#f3f4f6')}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateNote}
                disabled={!editingNoteText.trim()}
                style={{
                  padding: '10px 20px',
                  background: editingNoteText.trim() ? '#3b82f6' : '#d1d5db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: editingNoteText.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (editingNoteText.trim()) {
                    e.currentTarget.style.background = '#2563eb';
                  }
                }}
                onMouseLeave={(e) => {
                  if (editingNoteText.trim()) {
                    e.currentTarget.style.background = '#3b82f6';
                  }
                }}
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Note Confirmation Modal */}
      {noteToDelete && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setNoteToDelete(null)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '24px',
              width: '90%',
              maxWidth: '500px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937', marginBottom: '16px' }}>
              Delete Customer Note
            </h2>
            
            <p style={{ fontSize: '14px', color: '#4b5563', marginBottom: '12px' }}>
              Are you sure you want to delete this note? This action cannot be undone.
            </p>
            
            <div style={{ 
              padding: '12px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              marginBottom: '20px',
            }}>
              <p style={{ fontSize: '13px', color: '#991b1b', margin: 0, fontStyle: 'italic' }}>
                "{noteToDelete.preview}"
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setNoteToDelete(null)}
                style={{
                  padding: '10px 20px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#e5e7eb')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#f3f4f6')}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteNote}
                style={{
                  padding: '10px 20px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#dc2626')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#ef4444')}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View All Notes Modal */}
      {showAllNotesModal && profile && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
          onClick={() => {
            setShowAllNotesModal(false);
            setExpandedNoteIdInModal(null);
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '900px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '24px', borderBottom: '2px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937', margin: 0 }}>
                All Customer Notes ({profile.notes.length})
              </h2>
              <button
                onClick={() => {
                  setShowAllNotesModal(false);
                  setExpandedNoteIdInModal(null);
                }}
                style={{
                  padding: '8px 16px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#e5e7eb')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#f3f4f6')}
              >
                Close
              </button>
            </div>
            
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {profile.notes
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map((note) => renderNote(note, expandedNoteIdInModal, setExpandedNoteIdInModal, true))}
              </div>
            </div>
          </div>
        </div>
      )}

      {attachmentViewerData && (
        <AttachmentViewer
          attachments={attachmentViewerData.attachments}
          initialIndex={attachmentViewerData.initialIndex}
          onClose={() => setAttachmentViewerData(null)}
        />
      )}

      {viewerOpen && (
        <section className="viewer-modal" onClick={closeViewer}>
          <div className="viewer-panel" onClick={(event) => event.stopPropagation()}>
            <div className="viewer-head">
              <h2>Contrato</h2>
              <button 
                type="button" 
                className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0" 
                onClick={closeViewer}
              >
                Cerrar
              </button>
            </div>
            <div className="viewer-body">
              <div dangerouslySetInnerHTML={{ __html: viewerHtml }} />
            </div>
          </div>
        </section>
      )}

      {/* Create Operational Note Modal */}
      {showCreateOperationalNoteModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
          onClick={() => setShowCreateOperationalNoteModal(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '24px', borderBottom: '2px solid #e5e7eb' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937', margin: 0 }}>
                📋 Nueva Nota Operativa
              </h2>
            </div>
            
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Contract Selection */}
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                    Contrato *
                  </label>
                  <select
                    value={operationalNoteForm.contractId}
                    onChange={(e) => setOperationalNoteForm({ ...operationalNoteForm, contractId: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      color: '#1f2937',
                    }}
                  >
                    <option value="">Seleccione un contrato</option>
                    {contracts.filter(c => c.status !== 'DRAFT').map((contract) => (
                      <option key={contract.id} value={contract.id}>
                        {contract.contractNumber} - {contract.travelName} ({contract.role === 'HOLDER' ? 'Titular' : 'Acompañante'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Participation Info (Read-only) */}
                {operationalNoteForm.contractId && (
                  <div style={{
                    padding: '12px 16px',
                    background: '#f0f9ff',
                    border: '2px solid #bae6fd',
                    borderRadius: '8px',
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#0369a1', marginBottom: '4px' }}>
                      ℹ️ Participación detectada
                    </div>
                    <div style={{ fontSize: '14px', color: '#075985' }}>
                      {(() => {
                        const contract = contracts.find(c => c.id === operationalNoteForm.contractId);
                        if (!contract) return null;
                        return (
                          <>
                            <strong>Rol:</strong> {contract.role === 'HOLDER' ? 'Titular' : 'Acompañante'}
                            <br />
                            <strong>Pasajero:</strong> {profile.customer.fullName}
                          </>
                        );
                      })()}
                    </div>
                    <div style={{ fontSize: '12px', color: '#0284c7', marginTop: '8px', fontStyle: 'italic' }}>
                      La identidad del pasajero se determina automáticamente según su participación en el contrato.
                    </div>
                  </div>
                )}

                {/* Note Text */}
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                    Nota *
                  </label>
                  <textarea
                    value={operationalNoteForm.note}
                    onChange={(e) => setOperationalNoteForm({ ...operationalNoteForm, note: e.target.value })}
                    rows={8}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      color: '#1f2937',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                    }}
                    placeholder="Información operativa importante..."
                  />
                </div>
              </div>
            </div>

            <div style={{ padding: '20px 24px', borderTop: '2px solid #e5e7eb', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCreateOperationalNoteModal(false)}
                style={{
                  padding: '10px 20px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#e5e7eb')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#f3f4f6')}
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateOperationalNote}
                style={{
                  padding: '10px 20px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                Crear Nota
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Operational Note Modal */}
      {editingOperationalNote && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
          onClick={() => setEditingOperationalNote(null)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '24px', borderBottom: '2px solid #e5e7eb' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937', margin: 0 }}>
                ✏️ Editar Nota Operativa
              </h2>
              <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px', marginBottom: 0 }}>
                {editingOperationalNote.passengerName} - {editingOperationalNote.contract?.contractNumber}
              </p>
            </div>
            
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                  Nota *
                </label>
                <textarea
                  value={operationalNoteForm.note}
                  onChange={(e) => setOperationalNoteForm({ ...operationalNoteForm, note: e.target.value })}
                  rows={8}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: '#1f2937',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                  }}
                  placeholder="Información operativa importante..."
                />
              </div>
            </div>

            <div style={{ padding: '20px 24px', borderTop: '2px solid #e5e7eb', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditingOperationalNote(null)}
                style={{
                  padding: '10px 20px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#e5e7eb')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#f3f4f6')}
              >
                Cancelar
              </button>
              <button
                onClick={handleUpdateOperationalNote}
                style={{
                  padding: '10px 20px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#2563eb')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#3b82f6')}
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
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
