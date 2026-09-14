'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { LoadingModal } from '@/components/loading-modal';
import { getCustomerProfile, updateCustomer, getCustomerDocumentDownloadUrl, uploadCustomerDocument, createCustomerNote, updateCustomerNote, deleteCustomerNote, type CustomerContractItem, type CustomerProfile, type UpdateCustomerDto, type CustomerDocumentCategory } from '@/lib/customers-api';
import { getStoredSession } from '@/lib/auth-api';
import { getCustomerFinancialSummary, type CustomerFinancialSummary } from '@/lib/finance-api';
import { formatFinanceMoneyDisplay } from '@/lib/finance-money-display';
import { ContractFinanceDrawer } from '@/features/contracts-finance/contract-finance-drawer';
import { CustomerAccountStatementModal } from '@/app/finance/accounts-receivable/customer-account-statement';
import { CustomerEditModal, CustomerDocumentUploadModal } from '@/features/customers/components';
import AttachmentViewer from '@/components/attachment-viewer';
import { getContractFiles } from '@/lib/contracts-api';
import { listCustomerOperationalNotes, createContractNoteForCustomer, updateContractNote, deleteContractNote, type ContractNote } from '@/lib/contract-notes-api';
import { formatBusinessDate } from '@/shared/regional';
import { getClientIdentificationTypeLabel, type ClientIdentificationType } from '@/features/customers/client-identification';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconBadge } from '@/components/ui/icon-badge';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/patterns/form-field';
import { PageHeader } from '@/components/patterns/page-header';
import { SectionCard } from '@/components/patterns/section-card';
import { ArrowLeft, ChevronDown, ClipboardList, Eye, FileText, FolderOpen, Info, Pencil, Plus, RefreshCw, StickyNote, Trash2, UserRound, WalletCards } from 'lucide-react';

export default function CustomerProfilePage() {
  const router = useRouter();
  const params = useParams();
  const customerId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [financialSummary, setFinancialSummary] = useState<CustomerFinancialSummary | null>(null);
  const [financialSummaryLoading, setFinancialSummaryLoading] = useState(true);
  const [financialSummaryError, setFinancialSummaryError] = useState<string | null>(null);
  const [statementCurrency, setStatementCurrency] = useState<CustomerFinancialSummary['currencies'][number]['currencyCode'] | null>(null);
  const [statementCurrencyPickerOpen, setStatementCurrencyPickerOpen] = useState(false);
  const [selectedFinancialContract, setSelectedFinancialContract] = useState<CustomerContractItem | null>(null);
  const [loadingModalOpen, setLoadingModalOpen] = useState(false);
  const [loadingModalState, setLoadingModalState] = useState<'loading' | 'success' | 'error'>('loading');
  const [loadingModalMessage, setLoadingModalMessage] = useState('');
  const [is404Error, setIs404Error] = useState(false);

  // User session for role check
  const session = getStoredSession();
  const isAdmin = session?.user?.role?.toUpperCase() === 'ADMIN';
  const canSendStatement = ['ADMIN', 'FACTURACION_COBROS'].includes(String(session?.user?.role ?? '').toUpperCase());

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
  const [operationalNoteToDelete, setOperationalNoteToDelete] = useState<ContractNote | null>(null);
  const [operationalNoteForm, setOperationalNoteForm] = useState({
    contractId: '',
    note: '',
  });

  // Contract viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerHtml, setViewerHtml] = useState('');
  const [busyContractId, setBusyContractId] = useState<string>('');
  const [expandedMinorResponsibilitiesContractId, setExpandedMinorResponsibilitiesContractId] = useState<string | null>(null);
  const minorResponsibilitiesRef = useRef<HTMLDivElement>(null);
  const [expandedParticipantsContractId, setExpandedParticipantsContractId] = useState<string | null>(null);
  const participantsDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadProfile();
  }, [customerId]);

  useEffect(() => {
    if (!customerId) return;
    const controller = new AbortController();
    setFinancialSummary(null);
    setFinancialSummaryLoading(true);
    setFinancialSummaryError(null);
    void getCustomerFinancialSummary(customerId, controller.signal)
      .then((summary) => {
        if (controller.signal.aborted) return;
        setFinancialSummary(summary);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setFinancialSummaryError(requestError instanceof Error ? requestError.message : 'No se pudo cargar el resumen financiero.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setFinancialSummaryLoading(false);
      });
    return () => controller.abort();
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

  useEffect(() => {
    if (!expandedMinorResponsibilitiesContractId) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (
        minorResponsibilitiesRef.current &&
        !minorResponsibilitiesRef.current.contains(event.target as Node)
      ) {
        setExpandedMinorResponsibilitiesContractId(null);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [expandedMinorResponsibilitiesContractId]);

  useEffect(() => {
    if (!expandedParticipantsContractId) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (
        participantsDropdownRef.current &&
        !participantsDropdownRef.current.contains(event.target as Node)
      ) {
        setExpandedParticipantsContractId(null);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [expandedParticipantsContractId]);

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

  function formatParticipationRole(role: 'HOLDER' | 'COMPANION' | 'MINOR') {
    if (role === 'HOLDER') return 'Titular';
    if (role === 'MINOR') return 'Menor';
    return 'Acompañante';
  }

  function getInitials(fullName: string) {
    return fullName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
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
        setLoadingModalState('loading');
        setLoadingModalMessage('Generando PDF...');
        setLoadingModalOpen(true);
        window.setTimeout(() => setLoadingModalOpen(false), 2000);
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
    const localDate = noteDate.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const localTime = noteDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    return (
      <article key={note.id} className="rounded-lg border border-border bg-background transition-colors hover:bg-muted/30">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          onClick={() => onToggle(isExpanded ? null : note.id)}
          aria-expanded={isExpanded}
        >
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">{localDate}</span>
              <span className="text-xs text-muted-foreground">{localTime}</span>
              <Badge variant="info">{note.createdByName}</Badge>
            </span>
            {!isExpanded ? <span className="mt-2 block truncate text-sm text-muted-foreground">{getFirstLinePreview(note.note)}</span> : null}
          </span>
          <ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
        {isExpanded ? (
          <div className="border-t border-border px-4 py-3">
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{note.note}</p>
            {showActions && isAdmin ? (
              <div className="mt-3 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => { setEditingNoteId(note.id); setEditingNoteText(note.note); }}><Pencil aria-hidden="true" />Editar</Button>
                <Button type="button" variant="destructive" size="sm" onClick={() => setNoteToDelete({ id: note.id, preview: getFirstLinePreview(note.note) })}><Trash2 aria-hidden="true" />Eliminar</Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </article>
    );
  }


  function handleEnterEditMode() {
    setEditModalOpen(true);
  }

  async function handleSaveEdit(formData: {
    fullName: string;
    idType: ClientIdentificationType;
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
        idType: formData.idType,
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

  function isCurrentDocument(document: object): boolean {
    return 'isCurrent' in document && (document as { isCurrent?: boolean }).isCurrent === true;
  }

  function getActivityBadgeVariant(status: string | null | undefined) {
    const normalizedStatus = status?.trim().toUpperCase();
    if (normalizedStatus === 'ACTIVE' || normalizedStatus === 'ACTIVA') return 'success' as const;
    if (normalizedStatus === 'INACTIVE' || normalizedStatus === 'INACTIVA' || normalizedStatus === 'ARCHIVED') return 'destructive' as const;
    return 'secondary' as const;
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

      await uploadCustomerDocument(customerId, uploadingDocCategory as CustomerDocumentCategory, file);
      
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

  async function handleDeleteOperationalNote() {
    if (!operationalNoteToDelete) return;

    try {
      setLoadingModalOpen(true);
      setLoadingModalState('loading');
      setLoadingModalMessage('Eliminando nota...');
      await deleteContractNote(operationalNoteToDelete.contractId, operationalNoteToDelete.id);
      await loadOperationalNotes();
      setLoadingModalState('success');
      setLoadingModalMessage('✅ Nota eliminada');
      setOperationalNoteToDelete(null);
      setTimeout(() => setLoadingModalOpen(false), 1500);
    } catch (err) {
      setLoadingModalState('error');
      setLoadingModalMessage(err instanceof Error ? err.message : 'Error al eliminar');
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

  const { customer, contracts, statistics, documents } = profile;
  const isMinor = profile.participationRole === 'MINOR';
  const hasMultipleFinancialCurrencies = (financialSummary?.currencies.length ?? 0) > 1;
  const financialMetrics = [
    { label: 'Total contratado', key: 'totalContracted' as const, icon: FileText, tone: 'primary' as const },
    { label: 'Total facturado', key: 'totalInvoiced' as const, icon: FileText, tone: 'info' as const },
    { label: 'Total pagado', key: 'totalPaid' as const, icon: WalletCards, tone: 'success' as const },
    { label: 'Saldo pendiente', key: 'outstanding' as const, icon: WalletCards, tone: 'warning' as const },
    { label: 'Saldo disponible', key: 'available' as const, icon: WalletCards, tone: 'success' as const },
  ];

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

      <PageHeader
        className="mb-6"
        eyebrow={isMinor ? 'Pasajero menor' : 'Perfil de cliente'}
        title={<span className="flex items-center gap-3"><IconBadge tone="primary"><UserRound aria-hidden="true" /></IconBadge>{customer.fullName}</span>}
        description={[customer.idNumber, customer.email].filter(Boolean).join(' · ')}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            {isMinor ? <Badge variant="warning">Bajo responsabilidad de un adulto</Badge> : null}
            {customer.customerStatus ? <Badge variant={getActivityBadgeVariant(customer.customerStatus)}>{customer.customerStatus}</Badge> : null}
          </div>
        }
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              <ArrowLeft aria-hidden="true" />
              Volver
            </Button>
            <Button type="button" onClick={handleEnterEditMode}>
              <Pencil aria-hidden="true" />
              Editar
            </Button>
          </>
        }
      />

      {isMinor && profile.responsibleAdult && (
        <SectionCard
          className="mb-6"
          title={<span className="flex items-center gap-2"><IconBadge tone="primary" size="sm"><UserRound aria-hidden="true" /></IconBadge>Adulto responsable</span>}
          actions={
            <Button type="button" variant="outline" size="sm" onClick={() => router.push(`/admin/customers/${encodeURIComponent(profile.responsibleAdult!.clientId)}`)}>
              Ver perfil
            </Button>
          }
        >
          <p className="font-medium text-foreground">{profile.responsibleAdult.fullName}</p>
          <p className="mt-1 text-sm text-muted-foreground">Rol de participación: {formatParticipationRole(profile.responsibleAdult.participationRole)}</p>
        </SectionCard>
      )}

      <div className="mb-6 grid gap-5 lg:grid-cols-3">
        {/* Section 1: Customer Information */}
        <SectionCard
          className="lg:col-span-1"
          title={<span className="flex items-center gap-2"><IconBadge tone="primary" size="sm"><UserRound aria-hidden="true" /></IconBadge>{isMinor ? 'Información del pasajero' : 'Información del cliente'}</span>}
          actions={<Button type="button" variant="outline" size="sm" onClick={handleEnterEditMode}><Pencil aria-hidden="true" />Editar</Button>}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="sm:col-span-2 lg:col-span-1"><p className="text-xs font-medium text-muted-foreground">Nombre completo</p><p className="mt-1 text-sm font-medium text-foreground">{customer.fullName}</p></div>
            <div><p className="text-xs font-medium text-muted-foreground">Cédula/ID</p><p className="mt-1 text-sm text-foreground">{customer.idNumber}</p></div>
            <div><p className="text-xs font-medium text-muted-foreground">Tipo de identificación</p><p className="mt-1 text-sm text-foreground">{getClientIdentificationTypeLabel(customer.idType)}</p></div>
            <div className="sm:col-span-2 lg:col-span-1"><p className="text-xs font-medium text-muted-foreground">Email</p><p className="mt-1 break-words text-sm text-foreground">{customer.email || '-'}</p></div>
            <div><p className="text-xs font-medium text-muted-foreground">Teléfono</p><p className="mt-1 text-sm text-foreground">{customer.phone || '-'}</p></div>
            <div><p className="text-xs font-medium text-muted-foreground">Estado civil</p><p className="mt-1 text-sm text-foreground">{customer.maritalStatus || '-'}</p></div>
            <div><p className="text-xs font-medium text-muted-foreground">Contacto de emergencia</p><p className="mt-1 text-sm text-foreground">{customer.emergencyContactName || '-'}</p></div>
            <div><p className="text-xs font-medium text-muted-foreground">Teléfono de emergencia</p><p className="mt-1 text-sm text-foreground">{customer.emergencyContactPhone || '-'}</p></div>
            <div><p className="text-xs font-medium text-muted-foreground">Cliente desde</p><p className="mt-1 text-sm text-foreground">{formatDate(customer.createdAt)}</p></div>
          </div>
        </SectionCard>

        {/* Section 2: Statistics */}
        <SectionCard className="lg:col-span-1" title={<span className="flex items-center gap-2"><IconBadge tone="info" size="sm"><ClipboardList aria-hidden="true" /></IconBadge>Estadísticas</span>}>
          <div className="grid gap-3">
            {[
              { label: 'Total contratos', value: statistics.totalContracts, icon: FileText, tone: 'primary' as const, onClick: () => scrollToSection(contractsRef) },
              { label: 'Documentos', value: statistics.totalDocuments, icon: FolderOpen, tone: 'info' as const, onClick: () => scrollToSection(documentsRef) },
              { label: 'Notas', value: statistics.totalNotes, icon: StickyNote, tone: 'primary' as const, onClick: () => scrollToSection(notesRef) },
            ].map(({ label, value, icon: Icon, tone, onClick }) => (
              <button key={label} type="button" onClick={onClick} className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <span><span className="block text-xs font-medium text-muted-foreground">{label}</span><span className="mt-1 block text-2xl font-semibold tracking-tight text-foreground">{value}</span></span>
                <IconBadge tone={tone}><Icon aria-hidden="true" /></IconBadge>
              </button>
            ))}
          </div>
        </SectionCard>

        {/* Section 3: Financial Summary */}
        {!isMinor && (
          <SectionCard className="lg:col-span-1" title={<span className="flex items-center gap-2"><IconBadge tone="primary" size="sm"><WalletCards aria-hidden="true" /></IconBadge>Resumen financiero</span>}>
            {financialSummaryLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Cargando resumen financiero…</p> : null}
            {financialSummaryError ? <Alert variant="destructive"><AlertTitle>No se pudo cargar el resumen financiero</AlertTitle><AlertDescription>{financialSummaryError}</AlertDescription></Alert> : null}
            {!financialSummaryLoading && !financialSummaryError && financialSummary?.currencies.length === 0 ? <div className="rounded-lg border border-dashed border-border bg-muted/40 px-5 py-8 text-center"><p className="text-sm font-medium text-foreground">No hay actividad financiera para este cliente.</p></div> : null}
            {!financialSummaryLoading && !financialSummaryError && financialSummary && financialSummary.currencies.length > 0 ? <div className="grid gap-3">
              {financialSummary.exchangeRateContext?.status === 'AVAILABLE' ? <p className="text-xs text-muted-foreground">Consolidado con TC {financialSummary.exchangeRateContext.source} del {formatBusinessDate(financialSummary.exchangeRateContext.effectiveDate)}</p> : null}
              {financialSummary.consolidated === null && financialSummary.exchangeRateContext?.status === 'MISSING' ? <p className="text-xs text-muted-foreground">Tipo de cambio del día no disponible</p> : null}
              {financialMetrics.map(({ label, key, icon: Icon, tone }) => {
                const singleCurrency = financialSummary.currencies[0];
                const primaryValue = financialSummary.consolidated?.[key] ?? (!hasMultipleFinancialCurrencies ? singleCurrency?.[key] : null);
                const primaryCurrency = financialSummary.consolidated ? financialSummary.baseCurrencyCode : singleCurrency?.currencyCode;
                return <div key={label} className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-4"><span><span className="block text-xs font-medium text-muted-foreground">{label}</span>{primaryValue && primaryCurrency ? <span className="mt-1 block text-lg font-semibold tracking-tight text-foreground">{formatFinanceMoneyDisplay(primaryValue, primaryCurrency)}</span> : <span className="mt-1 block text-lg font-semibold tracking-tight text-muted-foreground">—</span>}{hasMultipleFinancialCurrencies ? <span className="mt-1 block text-xs text-muted-foreground">{financialSummary.currencies.map((currency) => formatFinanceMoneyDisplay(currency[key], currency.currencyCode)).join(' · ')}</span> : null}</span><IconBadge tone={tone}><Icon aria-hidden="true" /></IconBadge></div>;
              })}
              <Button type="button" variant="outline" onClick={() => {
                if (financialSummary.currencies.length === 1) setStatementCurrency(financialSummary.currencies[0].currencyCode);
                else setStatementCurrencyPickerOpen(true);
              }}>Estado de cuenta</Button>
            </div> : null}
          </SectionCard>
        )}
      </div>

      {/* Notas Operativas Section - Full Width */}
      <SectionCard
        className="mb-6"
        title={<span className="flex items-center gap-2"><IconBadge tone="primary" size="sm"><ClipboardList aria-hidden="true" /></IconBadge>Notas operativas {operationalNotes.length > 0 && `(${operationalNotes.length})`}</span>}
        actions={contracts.filter(c => c.status !== 'DRAFT').length > 0 ? <Button type="button" size="sm" onClick={handleOpenCreateOperationalNote}><Plus aria-hidden="true" />Nueva nota operativa</Button> : undefined}
      >
        
        {loadingOperationalNotes ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando notas operativas…</p>
        ) : operationalNotes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/40 px-5 py-10 text-center">
            <IconBadge tone="primary" className="mx-auto"><ClipboardList aria-hidden="true" /></IconBadge>
            <p className="mt-3 text-sm font-semibold text-foreground">No existen notas operativas.</p>
            <p className="mx-auto mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Las notas operativas creadas desde el contrato estarán disponibles aquí para consulta, sin modificar el expediente permanente del cliente.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {operationalNotes.map((note) => (
              <article key={note.id} className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={note.passengerType === 'HOLDER' ? 'info' : note.passengerType === 'COMPANION' ? 'success' : 'warning'}>{note.passengerName}</Badge>
                      <span className="text-xs text-muted-foreground">{note.passengerType === 'HOLDER' ? 'Titular' : note.passengerType === 'COMPANION' ? 'Acompañante' : 'Menor'}</span>
                    </div>
                    {note.contract ? <p className="mt-2 text-sm text-muted-foreground"><span className="font-medium text-foreground">Contrato:</span> {note.contract.contractNumber} - {note.contract.destination}{note.contract.startDate && ` (${formatBusinessDate(note.contract.startDate.toString())})`}</p> : null}
                  </div>
                  <Badge variant={note.status === 'ACTIVE' ? 'success' : 'destructive'}>{note.status === 'ACTIVE' ? 'Activa' : 'Archivada'}</Badge>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">{note.note}</p>
                <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">Creada por: {note.createdByName} · {formatDate(note.createdAt.toString())}</p>
                  <div className="flex items-center gap-2">
                    {note.status === 'ACTIVE' ? <Button type="button" variant="outline" size="sm" onClick={() => handleOpenEditOperationalNote(note)}><Pencil aria-hidden="true" />Editar</Button> : null}
                    {isAdmin ? <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      title="Eliminar nota (solo Admin)"
                      onClick={() => setOperationalNoteToDelete(note)}
                    ><Trash2 aria-hidden="true" />Eliminar</Button> : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Section 4: Additional Profile Information */}
      {(customer.dateOfBirth || customer.nationality || customer.occupation || customer.address || 
        customer.city || customer.country || customer.postalCode || customer.secondaryEmail || 
        customer.secondaryPhone || customer.emergencyContactRelationship || customer.emergencyContactEmail || 
        customer.leadSource || customer.lastContactDate || customer.nextFollowUpDate || 
        customer.preferredLanguage || customer.tags || customer.bloodType || customer.allergies || 
        customer.medicalConditions || customer.medications) && (
        <SectionCard className="mb-6" title={<span className="flex items-center gap-2"><IconBadge tone="primary" size="sm"><UserRound aria-hidden="true" /></IconBadge>Información adicional del perfil</span>}>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
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
        </SectionCard>
      )}

      {/* Customer Documents Section */}
      <div ref={documentsRef} className="mb-6">
      <SectionCard
        title={<span className="flex items-center gap-2"><IconBadge tone="info" size="sm"><FolderOpen aria-hidden="true" /></IconBadge>Documentos ({documents.length})</span>}
        actions={<Button type="button" size="sm" onClick={() => setShowUploadModal(true)}><Plus aria-hidden="true" />Agregar documento</Button>}
      >

        {documents.length === 0 ? (
          <div className="grid min-h-48 place-items-center px-5 py-10 text-center">
            <div>
              <IconBadge tone="info" className="mx-auto"><FolderOpen aria-hidden="true" /></IconBadge>
              <h3 className="mt-3 text-sm font-semibold text-foreground">No hay documentos</h3>
              <p className="mt-1 text-sm text-muted-foreground">Este cliente aún no tiene documentos adjuntos.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
              {documents
                .sort((a, b) => {
                  // Sort by isCurrent first (current = true first)
                  const aIsCurrent = isCurrentDocument(a);
                  const bIsCurrent = isCurrentDocument(b);
                  if (aIsCurrent !== bIsCurrent) {
                    return bIsCurrent ? 1 : -1;
                  }
                  // Then sort by date (newest first)
                  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                })
                .map((doc) => (
                <div key={doc.id} className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="info">{getCategoryLabel(doc.category)}</Badge>
                      <Badge variant={isCurrentDocument(doc) ? 'success' : 'destructive'}>{isCurrentDocument(doc) ? 'Actual' : 'Histórico'}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(doc.createdAt)}</span>
                    </div>
                    <p className="truncate text-sm font-medium text-foreground">{doc.originalFileName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{doc.mimeType} · {(doc.size / 1024).toFixed(2)} KB</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => handleDownloadDocument(doc.id)}><Eye aria-hidden="true" />Ver</Button>
                    {isCurrentDocument(doc) && (
                      <Button type="button" size="sm" onClick={() => handleUpdateDocumentClick(doc.category)}><RefreshCw aria-hidden="true" />Actualizar</Button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </SectionCard>
      </div>

      {/* Section 5: Contracts */}
      <div ref={contractsRef} className="mb-6 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-ui-xs">
        <div className="border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <FileText aria-hidden="true" className="size-4 text-muted-foreground" />Contratos ({contracts.length})
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
            <table style={{ width: '100%', minWidth: '1180px', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
              <colgroup>
                <col style={{ width: isMinor ? '20%' : '18%' }} />
                <col style={{ width: isMinor ? '16%' : '15%' }} />
                <col style={{ width: isMinor ? '21%' : '19%' }} />
                <col style={{ width: isMinor ? '18%' : '17%' }} />
                <col style={{ width: isMinor ? '14%' : '13%' }} />
                <col style={{ width: isMinor ? '11%' : '10%' }} />
                {!isMinor && <col style={{ width: '8%' }} />}
              </colgroup>
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
                  <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Participantes
                  </th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Creado
                  </th>
                  {!isMinor && (
                    <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Acciones
                    </th>
                  )}
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
                          background: contract.role === 'HOLDER' ? '#dbeafe' : contract.role === 'MINOR' ? '#ede9fe' : '#fef3c7',
                          color: contract.role === 'HOLDER' ? '#1e40af' : contract.role === 'MINOR' ? '#6d28d9' : '#92400e',
                        }}
                      >
                        {formatParticipationRole(contract.role)}
                      </span>
                      {contract.responsibleMinors && contract.responsibleMinors.length > 0 && (
                        <div
                          ref={
                            expandedMinorResponsibilitiesContractId === contract.id
                              ? minorResponsibilitiesRef
                              : undefined
                          }
                          style={{
                            marginTop: '10px',
                            paddingTop: '10px',
                            borderTop: '1px solid #e5e7eb',
                            minWidth: '185px',
                          }}
                        >
                          <button
                            type="button"
                            aria-expanded={expandedMinorResponsibilitiesContractId === contract.id}
                            onClick={() =>
                              setExpandedMinorResponsibilitiesContractId((currentId) =>
                                currentId === contract.id ? null : contract.id
                              )
                            }
                            style={{
                              width: '100%',
                              padding: 0,
                              border: 'none',
                              background: 'transparent',
                              color: '#374151',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                              textAlign: 'left',
                              fontSize: '11px',
                              fontWeight: '700',
                              lineHeight: '1.35',
                            }}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              <span aria-hidden="true" style={{ color: '#ef4444', fontSize: '14px' }}>♥</span>
                              Responsable de pasajeros menores
                            </span>
                            <span
                              aria-hidden="true"
                              style={{
                                color: '#6b7280',
                                fontSize: '13px',
                                transform:
                                  expandedMinorResponsibilitiesContractId === contract.id
                                    ? 'rotate(180deg)'
                                    : 'rotate(0deg)',
                                transition: 'transform 0.2s ease',
                                flexShrink: 0,
                              }}
                            >
                              ⌄
                            </span>
                          </button>

                          {expandedMinorResponsibilitiesContractId === contract.id && (
                            <div
                              style={{
                                marginTop: '10px',
                                padding: '12px',
                                border: '1px solid #e5e7eb',
                                borderRadius: '10px',
                                background: 'white',
                                boxShadow: '0 8px 20px rgba(15, 23, 42, 0.12)',
                              }}
                            >
                              <div style={{ fontSize: '12px', fontWeight: '700', color: '#4b5563', marginBottom: '6px' }}>
                                Pasajeros menores ({contract.responsibleMinors.length})
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {contract.responsibleMinors.map((minor, index) => (
                                  <button
                                    key={minor.clientId}
                                    type="button"
                                    onClick={() => {
                                      setExpandedMinorResponsibilitiesContractId(null);
                                      router.push(`/admin/customers/${encodeURIComponent(minor.clientId)}`);
                                    }}
                                    aria-label={`Ver perfil de ${minor.fullName}`}
                                    style={{
                                      width: '100%',
                                      padding: '9px 4px',
                                      border: 'none',
                                      borderTop: index > 0 ? '1px solid #e5e7eb' : 'none',
                                      background: 'transparent',
                                      color: '#374151',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '9px',
                                      textAlign: 'left',
                                    }}
                                    onMouseEnter={(event) => (event.currentTarget.style.background = '#f9fafb')}
                                    onMouseLeave={(event) => (event.currentTarget.style.background = 'transparent')}
                                  >
                                    <span
                                      aria-hidden="true"
                                      style={{
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '50%',
                                        background: '#ede9fe',
                                        color: '#7c3aed',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                        fontSize: '10px',
                                        fontWeight: '800',
                                      }}
                                    >
                                      {getInitials(minor.fullName)}
                                    </span>
                                    <span
                                      style={{
                                        flex: 1,
                                        minWidth: 0,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        fontSize: '12px',
                                        fontWeight: '700',
                                      }}
                                    >
                                      {minor.fullName}
                                    </span>
                                    <span aria-hidden="true" style={{ color: '#6b7280', fontSize: '16px' }}>›</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: '#4b5563' }}>
                      {contract.travelName}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: '#6b7280' }}>
                      {contract.startDate && contract.endDate
                        ? `${formatBusinessDate(contract.startDate)} - ${formatBusinessDate(contract.endDate)}`
                        : 'Fechas no disponibles'}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: '#6b7280', textAlign: 'center', verticalAlign: 'top' }}>
                      {contract.participants.length > 0 ? (
                        <div
                          ref={
                            expandedParticipantsContractId === contract.id
                              ? participantsDropdownRef
                              : undefined
                          }
                          style={{
                            width: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            textAlign: 'left',
                          }}
                        >
                          <button
                            type="button"
                            aria-expanded={expandedParticipantsContractId === contract.id}
                            aria-label={`Ver ${contract.participantCount} participantes`}
                            onClick={() =>
                              setExpandedParticipantsContractId((currentId) =>
                                currentId === contract.id ? null : contract.id
                              )
                            }
                            style={{
                              margin: '0 auto',
                              padding: '4px 8px',
                              border: 'none',
                              borderRadius: '6px',
                              background: 'transparent',
                              color: '#4f46e5',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              fontSize: '14px',
                              fontWeight: '700',
                            }}
                            onMouseEnter={(event) => (event.currentTarget.style.background = '#eef2ff')}
                            onMouseLeave={(event) => (event.currentTarget.style.background = 'transparent')}
                          >
                            {contract.participantCount}
                            <span
                              aria-hidden="true"
                              style={{
                                color: '#6b7280',
                                fontSize: '12px',
                                transform:
                                  expandedParticipantsContractId === contract.id
                                    ? 'rotate(180deg)'
                                    : 'rotate(0deg)',
                                transition: 'transform 0.2s ease',
                              }}
                            >
                              ⌄
                            </span>
                          </button>

                          {expandedParticipantsContractId === contract.id && (
                            <div
                              style={{
                                marginTop: '8px',
                                width: '250px',
                                maxWidth: 'min(250px, 80vw)',
                                padding: '8px 12px',
                                border: '1px solid #e5e7eb',
                                borderRadius: '10px',
                                background: 'white',
                                boxShadow: '0 8px 20px rgba(15, 23, 42, 0.12)',
                              }}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {contract.participants.map((participant, index) => (
                                  <button
                                    key={`${contract.id}-${participant.clientId}`}
                                    type="button"
                                    onClick={() => {
                                      setExpandedParticipantsContractId(null);
                                      router.push(`/admin/customers/${encodeURIComponent(participant.clientId)}`);
                                    }}
                                    aria-label={`Ver perfil de ${participant.fullName}`}
                                    style={{
                                      width: '100%',
                                      padding: '9px 2px',
                                      border: 'none',
                                      borderTop: index > 0 ? '1px solid #e5e7eb' : 'none',
                                      background: 'transparent',
                                      color: '#374151',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      textAlign: 'left',
                                    }}
                                    onMouseEnter={(event) => (event.currentTarget.style.background = '#f9fafb')}
                                    onMouseLeave={(event) => (event.currentTarget.style.background = 'transparent')}
                                  >
                                    {participant.participationRole === 'MINOR' && (
                                      <span aria-hidden="true" style={{ fontSize: '16px', flexShrink: 0 }}>
                                        👶
                                      </span>
                                    )}
                                    <span
                                      style={{
                                        flexShrink: 0,
                                        fontSize: '11px',
                                        fontWeight: '700',
                                        color:
                                          participant.participationRole === 'HOLDER'
                                            ? '#1e40af'
                                            : participant.participationRole === 'MINOR'
                                              ? '#6d28d9'
                                              : '#92400e',
                                      }}
                                    >
                                      {formatParticipationRole(participant.participationRole)}:
                                    </span>
                                    <span
                                      style={{
                                        flex: 1,
                                        minWidth: 0,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        fontSize: '12px',
                                        fontWeight: '700',
                                        color: '#374151',
                                      }}
                                    >
                                      {participant.fullName}
                                    </span>
                                    <span aria-hidden="true" style={{ color: '#6b7280', fontSize: '16px' }}>›</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        contract.participantCount
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '13px', color: '#9ca3af' }}>
                      {formatDateTime(contract.createdAt)}
                    </td>
                    {!isMinor && (
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <button
                          type="button"
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
                          onClick={() => setSelectedFinancialContract(contract)}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#059669')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = '#10b981')}
                        >
                          Detalle financiero
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 6: Customer Notes */}
      <div ref={notesRef} className="mb-6">
      <SectionCard
        title={<span className="flex items-center gap-2"><IconBadge tone="primary" size="sm"><StickyNote aria-hidden="true" /></IconBadge>Notas del cliente ({profile.notes.length})</span>}
        actions={<Button type="button" size="sm" onClick={() => setShowAddNoteModal(true)}><Plus aria-hidden="true" />Agregar nota</Button>}
      >

        {profile.notes.length === 0 ? (
          <div className="grid min-h-48 place-items-center px-5 py-10 text-center">
            <div><IconBadge tone="primary" className="mx-auto"><StickyNote aria-hidden="true" /></IconBadge><h3 className="mt-3 text-sm font-semibold text-foreground">No hay notas del cliente.</h3><p className="mt-1 text-sm text-muted-foreground">Aún no se han agregado notas para este cliente.</p></div>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-3">
              {profile.notes
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 5)
                .map((note) => renderNote(note, expandedNoteId, setExpandedNoteId, true))}
            </div>
            
            {profile.notes.length > 5 && (
              <div className="pt-1 text-center">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAllNotesModal(true)}>
                  Ver todas las notas ({profile.notes.length})
                </Button>
              </div>
            )}
          </div>
        )}
      </SectionCard>
      </div>

      <CustomerEditModal
        isOpen={editModalOpen}
        customer={customer}
        presentation="foundation"
        onClose={() => setEditModalOpen(false)}
        onSave={handleSaveEdit}
      />

      <CustomerDocumentUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUpload={handleUploadDocument}
      />

      <Dialog open={showAddNoteModal} onOpenChange={(open) => { if (!open) { setShowAddNoteModal(false); setNewNoteText(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><StickyNote aria-hidden="true" className="size-5 text-primary" />Agregar nota del cliente</DialogTitle>
            <DialogDescription>Registra una nota en el perfil de este cliente.</DialogDescription>
          </DialogHeader>
          <div className="mt-5">
            <FormField htmlFor="customer-note-create" label="Nota">
              <Textarea id="customer-note-create" value={newNoteText} onChange={(event) => setNewNoteText(event.target.value)} placeholder="Escribe la nota aquí..." rows={8} />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setShowAddNoteModal(false); setNewNoteText(''); }}>Cancelar</Button>
            <Button type="button" onClick={handleCreateNote} disabled={!newNoteText.trim()}><StickyNote aria-hidden="true" />Guardar nota</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingNoteId)} onOpenChange={(open) => { if (!open) { setEditingNoteId(null); setEditingNoteText(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil aria-hidden="true" className="size-5 text-primary" />Editar nota del cliente</DialogTitle>
            <DialogDescription>Actualiza el contenido de la nota seleccionada.</DialogDescription>
          </DialogHeader>
          <div className="mt-5">
            <FormField htmlFor="customer-note-edit" label="Nota">
              <Textarea id="customer-note-edit" value={editingNoteText} onChange={(event) => setEditingNoteText(event.target.value)} placeholder="Escribe la nota aquí..." rows={8} />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setEditingNoteId(null); setEditingNoteText(''); }}>Cancelar</Button>
            <Button type="button" onClick={handleUpdateNote} disabled={!editingNoteText.trim()}><Pencil aria-hidden="true" />Guardar cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(noteToDelete)}
        onOpenChange={(open) => { if (!open) setNoteToDelete(null); }}
        variant="destructive"
        title="Eliminar nota del cliente"
        description={noteToDelete ? <span>¿Seguro que deseas eliminar esta nota? Esta acción no se puede deshacer.<span className="mt-2 block rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm italic text-destructive">&ldquo;{noteToDelete.preview}&rdquo;</span></span> : undefined}
        cancelLabel="Cancelar"
        confirmLabel="Eliminar"
        onConfirm={handleDeleteNote}
      />

      <Dialog open={showAllNotesModal} onOpenChange={(open) => { if (!open) { setShowAllNotesModal(false); setExpandedNoteIdInModal(null); } }}>
        <DialogContent className="max-w-4xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>Notas del cliente ({profile.notes.length})</DialogTitle>
            <DialogDescription>Historial completo de notas registradas para este cliente.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[65dvh] overflow-y-auto p-5">
            <div className="grid gap-3">
              {profile.notes
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((note) => renderNote(note, expandedNoteIdInModal, setExpandedNoteIdInModal, true))}
            </div>
          </div>
        </DialogContent>
      </Dialog>


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

      <Dialog open={showCreateOperationalNoteModal} onOpenChange={(open) => { if (!open) setShowCreateOperationalNoteModal(false); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ClipboardList aria-hidden="true" className="size-5 text-primary" />Nueva nota operativa</DialogTitle>
            <DialogDescription>Registra información operativa vinculada a uno de los contratos del cliente.</DialogDescription>
          </DialogHeader>
          <div className="mt-5 grid gap-5">
            <FormField htmlFor="operational-note-contract" label="Contrato" required>
              <Select id="operational-note-contract" value={operationalNoteForm.contractId} onChange={(event) => setOperationalNoteForm({ ...operationalNoteForm, contractId: event.target.value })}>
                <option value="">Seleccione un contrato</option>
                {contracts.filter(c => c.status !== 'DRAFT').map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.contractNumber} - {contract.travelName} ({formatParticipationRole(contract.role)})
                  </option>
                ))}
              </Select>
            </FormField>

            {operationalNoteForm.contractId ? (
              <Alert variant="info">
                <AlertTitle className="flex items-center gap-2"><Info aria-hidden="true" className="size-4" />Participación detectada</AlertTitle>
                <AlertDescription>
                  {(() => {
                    const contract = contracts.find(c => c.id === operationalNoteForm.contractId);
                    if (!contract) return null;
                    return <><strong>Rol:</strong> {formatParticipationRole(contract.role)}<br /><strong>Pasajero:</strong> {profile.customer.fullName}</>;
                  })()}
                  <span className="mt-2 block text-xs">La identidad del pasajero se determina automáticamente según su participación en el contrato.</span>
                </AlertDescription>
              </Alert>
            ) : null}

            <FormField htmlFor="operational-note-create" label="Nota" required>
              <Textarea id="operational-note-create" value={operationalNoteForm.note} onChange={(event) => setOperationalNoteForm({ ...operationalNoteForm, note: event.target.value })} rows={8} placeholder="Información operativa importante..." />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowCreateOperationalNoteModal(false)}>Cancelar</Button>
            <Button type="button" onClick={handleCreateOperationalNote}><ClipboardList aria-hidden="true" />Crear nota</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingOperationalNote)} onOpenChange={(open) => { if (!open) setEditingOperationalNote(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil aria-hidden="true" className="size-5 text-primary" />Editar nota operativa</DialogTitle>
            <DialogDescription>{editingOperationalNote ? `${editingOperationalNote.passengerName} - ${editingOperationalNote.contract?.contractNumber}` : 'Actualiza la nota operativa seleccionada.'}</DialogDescription>
          </DialogHeader>
          <div className="mt-5">
            <FormField htmlFor="operational-note-edit" label="Nota" required>
              <Textarea id="operational-note-edit" value={operationalNoteForm.note} onChange={(event) => setOperationalNoteForm({ ...operationalNoteForm, note: event.target.value })} rows={8} placeholder="Información operativa importante..." />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingOperationalNote(null)}>Cancelar</Button>
            <Button type="button" onClick={handleUpdateOperationalNote}><Pencil aria-hidden="true" />Guardar cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(operationalNoteToDelete)}
        onOpenChange={(open) => { if (!open) setOperationalNoteToDelete(null); }}
        variant="destructive"
        title="Eliminar nota operativa"
        description="¿Seguro que deseas eliminar esta nota operativa? Esta acción no se puede deshacer."
        cancelLabel="Cancelar"
        confirmLabel="Eliminar"
        onConfirm={handleDeleteOperationalNote}
      />

      <Dialog open={statementCurrencyPickerOpen} onOpenChange={setStatementCurrencyPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Estado de cuenta</DialogTitle>
            <DialogDescription>Seleccione la moneda para consultar el estado de cuenta.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {financialSummary?.currencies.map((currency) => (
              <Button
                key={currency.currencyCode}
                type="button"
                variant="outline"
                className="justify-between"
                onClick={() => {
                  setStatementCurrency(currency.currencyCode);
                  setStatementCurrencyPickerOpen(false);
                }}
              >
                {currency.currencyCode}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {statementCurrency ? <CustomerAccountStatementModal
        group={{
          customerId,
          currencyCode: statementCurrency,
          debtor: {
            displayName: customer.fullName,
            identificationType: customer.idType,
            identificationNumber: customer.idNumber,
          },
        }}
        canSend={canSendStatement}
        onClose={() => setStatementCurrency(null)}
      /> : null}

      {selectedFinancialContract ? <ContractFinanceDrawer
        contract={{
          contractId: selectedFinancialContract.id,
          contractNumber: selectedFinancialContract.contractNumber,
          travelLabel: selectedFinancialContract.travelName,
          travelContext: {
            source: selectedFinancialContract.source,
            destination: selectedFinancialContract.destination,
            travelPackageId: null,
            internalTripId: null,
            travelType: null,
          },
          startDate: selectedFinancialContract.startDate,
          endDate: selectedFinancialContract.endDate,
        }}
        canWrite={canSendStatement}
        onClose={() => setSelectedFinancialContract(null)}
        onReturnToCustomer={() => setSelectedFinancialContract(null)}
        onChanged={() => {
          void getCustomerFinancialSummary(customerId)
            .then((summary) => {
              setFinancialSummary(summary);
            })
            .catch((requestError) => setFinancialSummaryError(requestError instanceof Error ? requestError.message : 'No se pudo actualizar el resumen financiero.'));
        }}
      /> : null}

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
