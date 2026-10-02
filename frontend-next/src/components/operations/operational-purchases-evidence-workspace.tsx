'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Pencil, Plus, Upload } from 'lucide-react';
import {
  deleteOperationalEvidence, getOperationalEvidenceAccess, getOperationalFulfillment,
  getOperationalRequirement, listOperationalEvidence, listOperationalPurchases, updateOperationalPurchase,
  uploadOperationalEvidence, operationsErrorMessage, type OperationalEvidence, type OperationalEvidenceType,
  type OperationalFulfillmentDetail, type OperationalPurchase, type OperationalRequirementDetail,
} from '@/lib/operations-api';
import { useTenantDateTimeFormatter } from '@/shared/regional/tenant-regional-provider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/patterns/form-field';
import { FormSheet } from '@/components/patterns/form-sheet';
import AttachmentViewer, { type Attachment } from '@/components/attachment-viewer';
import { OperationalPurchaseDrawer } from '@/components/operations/operational-purchase-drawer';

const evidenceLabels: Record<OperationalEvidenceType, string> = {
  SUPPLIER_QUOTE: 'Cotización del proveedor', BOOKING_CONFIRMATION: 'Confirmación de reserva', TICKET: 'Boleto',
  VOUCHER: 'Voucher', SUPPLIER_INVOICE: 'Factura del proveedor', RECEIPT: 'Recibo',
  INSURANCE_CERTIFICATE: 'Certificado de seguro', SCREENSHOT: 'Captura de pantalla', OTHER: 'Otro',
};
const fulfillmentLabels: Record<OperationalFulfillmentDetail['status'], string> = { DRAFT: 'Preparando', RESERVED: 'Reservado', PURCHASED: 'Comprado', CONFIRMED: 'Confirmado', CANCELLED: 'Cancelado' };
const allowedMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const maxEvidenceBytes = 10 * 1024 * 1024;
type PurchaseMetadataForm = { supplierReference: string; supplierInvoiceNumber: string; notes: string };

export function OperationalPurchasesEvidenceWorkspace({ travelPackageId, requirementId, fulfillmentId, onBack }: { travelPackageId: string; requirementId: string; fulfillmentId: string; onBack: () => void }) {
  const formatDateTime = useTenantDateTimeFormatter();
  const [requirement, setRequirement] = useState<OperationalRequirementDetail | null>(null);
  const [fulfillment, setFulfillment] = useState<OperationalFulfillmentDetail | null>(null);
  const [purchases, setPurchases] = useState<{ items: OperationalPurchase[]; page: number; totalPages: number } | null>(null);
  const [evidence, setEvidence] = useState<{ items: OperationalEvidence[]; page: number; totalPages: number } | null>(null);
  const [purchasePage, setPurchasePage] = useState(1), [evidencePage, setEvidencePage] = useState(1);
  const [loadingContext, setLoadingContext] = useState(true), [loadingPurchases, setLoadingPurchases] = useState(true), [loadingEvidence, setLoadingEvidence] = useState(true);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [purchaseFormOpen, setPurchaseFormOpen] = useState(false), [purchaseSaving, setPurchaseSaving] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<OperationalPurchase | null>(null), [metadataForm, setMetadataForm] = useState<PurchaseMetadataForm>({ supplierReference: '', supplierInvoiceNumber: '', notes: '' });
  const [uploadOpen, setUploadOpen] = useState(false), [evidenceType, setEvidenceType] = useState<OperationalEvidenceType>('OTHER'), [purchaseForEvidence, setPurchaseForEvidence] = useState(''), [evidenceFile, setEvidenceFile] = useState<File | null>(null), [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OperationalEvidence | null>(null), [deleting, setDeleting] = useState(false);
  const [evidenceViewer, setEvidenceViewer] = useState<Attachment | null>(null);

  async function loadContext() {
    setLoadingContext(true);
    try {
      const [nextRequirement, nextFulfillment] = await Promise.all([
        getOperationalRequirement(travelPackageId, requirementId),
        getOperationalFulfillment(travelPackageId, requirementId, fulfillmentId),
      ]);
      setRequirement(nextRequirement); setFulfillment(nextFulfillment);
    } catch (reason) { setError(message(reason, 'No se pudo cargar el contexto de la gestión.')); }
    finally { setLoadingContext(false); }
  }
  async function loadPurchases() {
    setLoadingPurchases(true);
    try { const page = await listOperationalPurchases(travelPackageId, requirementId, fulfillmentId, purchasePage); setPurchases(page); }
    catch (reason) { setError(message(reason, 'No se pudieron cargar las compras.')); }
    finally { setLoadingPurchases(false); }
  }
  async function loadEvidence() {
    setLoadingEvidence(true);
    try { const page = await listOperationalEvidence(travelPackageId, requirementId, fulfillmentId, evidencePage); setEvidence(page); }
    catch (reason) { setError(message(reason, 'No se pudieron cargar los documentos.')); }
    finally { setLoadingEvidence(false); }
  }
  useEffect(() => { void loadContext(); }, [travelPackageId, requirementId, fulfillmentId]);
  useEffect(() => { void loadPurchases(); }, [travelPackageId, requirementId, fulfillmentId, purchasePage]);
  useEffect(() => { void loadEvidence(); }, [travelPackageId, requirementId, fulfillmentId, evidencePage]);

  const purchaseById = useMemo(() => new Map((purchases?.items ?? []).map((purchase) => [purchase.id, purchase])), [purchases]);
  const purchasesAllowed = Boolean(fulfillment && fulfillment.status !== 'CANCELLED' && requirement?.status !== 'CANCELLED' && requirement?.status !== 'NOT_APPLICABLE');
  function openPurchase() { if (!purchasesAllowed) return; setError(null); setNotice(null); setPurchaseFormOpen(true); }
  function openMetadataEdit(purchase: OperationalPurchase) { setError(null); setEditingPurchase(purchase); setMetadataForm({ supplierReference: purchase.supplierReference ?? '', supplierInvoiceNumber: purchase.supplierInvoiceNumber ?? '', notes: purchase.notes ?? '' }); }
  async function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingPurchase) return; setPurchaseSaving(true); setError(null);
    try {
      await updateOperationalPurchase(travelPackageId, requirementId, fulfillmentId, editingPurchase.id, { supplierReference: textOrNull(metadataForm.supplierReference), supplierInvoiceNumber: textOrNull(metadataForm.supplierInvoiceNumber), notes: textOrNull(metadataForm.notes) });
      setEditingPurchase(null); setNotice('Metadatos de compra actualizados.'); await loadPurchases();
    } catch (reason) { setError(message(reason, 'No se pudieron actualizar los metadatos de la compra.')); }
    finally { setPurchaseSaving(false); }
  }
  function openUpload() { setError(null); setNotice(null); setEvidenceType('OTHER'); setPurchaseForEvidence(''); setEvidenceFile(null); setUploadOpen(true); }
  function chooseFile(file: File | null) { if (!file) { setEvidenceFile(null); return; } const validation = validateFile(file); if (validation) { setEvidenceFile(null); setError(validation); return; } setError(null); setEvidenceFile(file); }
  async function uploadEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!evidenceFile) { setError('Seleccione un archivo.'); return; }
    const validation = validateFile(evidenceFile); if (validation) { setError(validation); return; }
    setUploading(true); setError(null);
    try {
      await uploadOperationalEvidence(travelPackageId, requirementId, fulfillmentId, { evidenceType, ...(purchaseForEvidence ? { operationalPurchaseId: purchaseForEvidence } : {}), file: evidenceFile });
      setUploadOpen(false); setEvidenceFile(null); setNotice('Documento subido.'); await loadEvidence();
    } catch (reason) { setError(message(reason, 'No se pudo subir el documento.')); }
    finally { setUploading(false); }
  }
  async function openEvidence(evidenceItem: OperationalEvidence) {
    setError(null);
    setEvidenceViewer({ id: evidenceItem.id, originalFileName: evidenceItem.originalFilename, mimeType: evidenceItem.mimeType });
  }
  async function resolveEvidenceUrl(attachment: Attachment, _signal: AbortSignal) { return (await getOperationalEvidenceAccess(travelPackageId, requirementId, fulfillmentId, attachment.id)).url; }
  async function deleteEvidence() {
    if (!deleteTarget) return; setDeleting(true); setError(null);
    try { await deleteOperationalEvidence(travelPackageId, requirementId, fulfillmentId, deleteTarget.id); setDeleteTarget(null); setNotice('Documento eliminado.'); await loadEvidence(); }
    catch (reason) { setError(message(reason, 'No se pudo eliminar el documento.')); }
    finally { setDeleting(false); }
  }

  return <section className="space-y-4" aria-label="Compras y documentos"><Button type="button" variant="link" className="px-0" onClick={onBack}>← Gestión del servicio</Button>
    <div><h1 className="text-xl font-semibold">Gestión del servicio</h1><p className="text-sm text-muted-foreground">Preparando → Reservado → Comprado → Confirmado. Registra la compra del proveedor y sus documentos para esta gestión.</p></div>
    {loadingContext ? <Card><CardContent className="py-6 text-sm text-muted-foreground">Cargando contexto de la gestión...</CardContent></Card> : fulfillment ? <Card><CardContent className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs text-muted-foreground">Contexto del servicio</p><p className="font-medium">{fulfillment.servicePurposeName}</p><p className="text-sm">{requirement?.description}</p></div><div><p className="text-xs text-muted-foreground">Gestión / estado</p><Badge variant={fulfillment.status === 'CONFIRMED' ? 'success' : fulfillment.status === 'CANCELLED' ? 'destructive' : 'outline'}>{fulfillmentLabels[fulfillment.status]}</Badge></div><div><p className="text-xs text-muted-foreground">Proveedor</p><p>{fulfillment.providerName ?? 'Sin proveedor'}</p></div><div><p className="text-xs text-muted-foreground">Pasajeros / referencias</p><p>{fulfillment.passengers.length} pasajeros</p><p className="text-sm">{[fulfillment.reservationCode, fulfillment.confirmationReference, fulfillment.voucherReference, fulfillment.ticketReference].filter(Boolean).join(' · ') || 'Sin referencias'}</p></div></CardContent></Card> : null}
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}{notice ? <Alert><AlertDescription>{notice}</AlertDescription></Alert> : null}
    <PurchasesPanel purchases={purchases} loading={loadingPurchases} formatDateTime={formatDateTime} soldValue={requirement?.soldValue} canCreate={purchasesAllowed} fulfillmentCancelled={fulfillment?.status === 'CANCELLED'} onCreate={openPurchase} onEdit={openMetadataEdit} onPage={setPurchasePage} />
    <EvidencePanel evidence={evidence} purchases={purchaseById} loading={loadingEvidence} formatDateTime={formatDateTime} onUpload={openUpload} onOpen={(item) => void openEvidence(item)} onDelete={setDeleteTarget} onPage={setEvidencePage} />
    <OperationalPurchaseDrawer open={purchaseFormOpen} onOpenChange={setPurchaseFormOpen} travelPackageId={travelPackageId} requirementId={requirementId} fulfillmentId={fulfillmentId} providerName={fulfillment?.providerName} soldValue={requirement?.soldValue} onCreated={async ({ evidenceUploadFailed }) => { setNotice(evidenceUploadFailed ? 'Compra registrada correctamente, pero no se pudo cargar el documento. Puedes reintentarlo desde Documentos.' : 'Compra registrada.'); await Promise.all([loadContext(), loadPurchases(), loadEvidence()]); }} />
    {editingPurchase ? <FormSheet open onOpenChange={(open) => !open && !purchaseSaving && setEditingPurchase(null)} title="Editar metadatos de compra" description="El proveedor, monto, moneda, impuesto y fecha de compra son inmutables." contentClassName="space-y-4" actions={<><Button type="button" variant="outline" disabled={purchaseSaving} onClick={() => setEditingPurchase(null)}>Cancelar</Button><Button type="submit" form="purchase-metadata-form" disabled={purchaseSaving}>{purchaseSaving ? 'Guardando...' : 'Guardar cambios'}</Button></>}><form id="purchase-metadata-form" className="grid gap-4" onSubmit={saveMetadata}><FormField htmlFor="edit-purchase-reference" label="Referencia del proveedor"><Input id="edit-purchase-reference" value={metadataForm.supplierReference} onChange={(event) => setMetadataForm((form) => ({ ...form, supplierReference: event.target.value }))} maxLength={500} /></FormField><FormField htmlFor="edit-purchase-invoice" label="Número de factura del proveedor"><Input id="edit-purchase-invoice" value={metadataForm.supplierInvoiceNumber} onChange={(event) => setMetadataForm((form) => ({ ...form, supplierInvoiceNumber: event.target.value }))} maxLength={191} /></FormField><FormField htmlFor="edit-purchase-notes" label="Notas"><Textarea id="edit-purchase-notes" value={metadataForm.notes} onChange={(event) => setMetadataForm((form) => ({ ...form, notes: event.target.value }))} maxLength={4000} /></FormField></form></FormSheet> : null}
    {uploadOpen ? <FormSheet open onOpenChange={(open) => !open && !uploading && setUploadOpen(false)} title="Subir documento" description="PDF, JPEG, PNG o WebP; máximo 10 MiB." contentClassName="space-y-4" actions={<><Button type="button" variant="outline" disabled={uploading} onClick={() => setUploadOpen(false)}>Cancelar</Button><Button type="submit" form="operational-evidence-form" disabled={uploading}>{uploading ? 'Subiendo...' : 'Subir documento'}</Button></>}><form id="operational-evidence-form" className="grid gap-4" onSubmit={uploadEvidence}><FormField htmlFor="evidence-type" label="Tipo de documento" required><Select id="evidence-type" value={evidenceType} onChange={(event) => setEvidenceType(event.target.value as OperationalEvidenceType)}>{Object.entries(evidenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FormField><FormField htmlFor="evidence-purchase" label="Compra vinculada"><Select id="evidence-purchase" value={purchaseForEvidence} onChange={(event) => setPurchaseForEvidence(event.target.value)}><option value="">Documento general de la gestión</option>{(purchases?.items ?? []).map((purchase) => <option key={purchase.id} value={purchase.id}>{purchase.providerName} · {purchase.amount} {purchase.currency}</option>)}</Select></FormField><FormField htmlFor="evidence-file" label="Archivo" required><Input id="evidence-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} required /></FormField></form></FormSheet> : null}
    <ConfirmDialog open={deleteTarget !== null} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)} title="¿Eliminar documento?" description="Se eliminarán el registro de evidencia y el archivo almacenado." confirmLabel="Eliminar documento" pendingLabel="Eliminando..." variant="destructive" isPending={deleting} onConfirm={() => void deleteEvidence()} />
    {evidenceViewer ? <AttachmentViewer attachments={[evidenceViewer]} resolveAttachmentUrl={resolveEvidenceUrl} onClose={() => setEvidenceViewer(null)} /> : null}
  </section>;
}

function PurchasesPanel({ purchases, loading, formatDateTime, soldValue, canCreate, fulfillmentCancelled, onCreate, onEdit, onPage }: { purchases: { items: OperationalPurchase[]; page: number; totalPages: number } | null; loading: boolean; formatDateTime: (value: string) => string; soldValue: OperationalRequirementDetail['soldValue'] | undefined; canCreate: boolean; fulfillmentCancelled: boolean; onCreate: () => void; onEdit: (purchase: OperationalPurchase) => void; onPage: (page: number) => void }) {
  const exactSoldValue = soldValue?.scope === 'EXACT_SERVICE_LINE' && soldValue.amount && soldValue.currency ? `${soldValue.currency} ${soldValue.amount}` : null;
  return <div className="space-y-3"><div className="flex items-end justify-between"><div><h2 className="text-xl font-semibold">Compras</h2><p className="text-sm text-muted-foreground">Compromisos de proveedor registrados para esta gestión.</p>{exactSoldValue ? <p className="mt-1 text-sm"><span className="text-muted-foreground">Vendido:</span> {exactSoldValue}</p> : null}</div><Button type="button" onClick={onCreate} disabled={!canCreate}><Plus aria-hidden="true" />Registrar compra</Button></div>{fulfillmentCancelled ? <p className="text-sm text-muted-foreground">La gestión está cancelada; se conserva el historial, pero no admite nuevas compras.</p> : null}{loading ? <Card><CardContent className="py-8 text-sm text-muted-foreground">Cargando compras...</CardContent></Card> : !purchases?.items.length ? <Card><CardContent className="py-10 text-center"><p>No hay compras registradas para esta gestión.</p>{canCreate ? <Button type="button" className="mt-4" onClick={onCreate}>Registrar compra</Button> : null}</CardContent></Card> : <Card><CardContent className="overflow-x-auto p-0"><Table className="min-w-[900px]"><TableHeader><TableRow><TableHead>Proveedor</TableHead><TableHead>Comprado</TableHead><TableHead>Impuesto</TableHead><TableHead>Fecha de compra</TableHead><TableHead>Referencia / factura</TableHead><TableHead>Notas</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>{purchases.items.map((purchase) => <TableRow key={purchase.id}><TableCell>{purchase.providerName}</TableCell><TableCell className="font-medium">{purchase.amount} {purchase.currency}</TableCell><TableCell>{purchase.taxAmount ? `${purchase.taxAmount} ${purchase.currency}` : '—'}</TableCell><TableCell>{formatDateTime(purchase.purchasedAt)}</TableCell><TableCell>{purchase.supplierReference ?? '—'}{purchase.supplierInvoiceNumber ? <p className="text-xs text-muted-foreground">Factura: {purchase.supplierInvoiceNumber}</p> : null}</TableCell><TableCell className="max-w-56 whitespace-normal">{purchase.notes ?? '—'}</TableCell><TableCell><Button type="button" size="sm" variant="outline" onClick={() => onEdit(purchase)}><Pencil aria-hidden="true" />Editar metadatos</Button></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}{purchases && purchases.totalPages > 1 ? <Pagination page={purchases.page} totalPages={purchases.totalPages} onPage={onPage} /> : null}</div>;
}

function EvidencePanel({ evidence, purchases, loading, formatDateTime, onUpload, onOpen, onDelete, onPage }: { evidence: { items: OperationalEvidence[]; page: number; totalPages: number } | null; purchases: Map<string, OperationalPurchase>; loading: boolean; formatDateTime: (value: string) => string; onUpload: () => void; onOpen: (evidence: OperationalEvidence) => void; onDelete: (evidence: OperationalEvidence) => void; onPage: (page: number) => void }) {
  return <div className="space-y-3"><div className="flex items-end justify-between"><div><h2 className="text-xl font-semibold">Documentos</h2><p className="text-sm text-muted-foreground">Evidencia de la gestión o de una compra vinculada.</p></div><Button type="button" onClick={onUpload}><Upload aria-hidden="true" />Subir documento</Button></div>{loading ? <Card><CardContent className="py-8 text-sm text-muted-foreground">Cargando documentos...</CardContent></Card> : !evidence?.items.length ? <Card><CardContent className="py-10 text-center"><p>No hay documentos asociados.</p><Button type="button" className="mt-4" onClick={onUpload}>Subir documento</Button></CardContent></Card> : <Card><CardContent className="overflow-x-auto p-0"><Table className="min-w-[820px]"><TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Archivo</TableHead><TableHead>Tamaño</TableHead><TableHead>Compra vinculada</TableHead><TableHead>Subido</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>{evidence.items.map((item) => { const purchase = item.purchaseId ? purchases.get(item.purchaseId) : null; return <TableRow key={item.id}><TableCell><Badge variant="outline">{evidenceLabels[item.evidenceType]}</Badge></TableCell><TableCell><div className="font-medium">{item.originalFilename}</div><span className="text-xs text-muted-foreground">{friendlyMime(item.mimeType)}</span></TableCell><TableCell>{formatBytes(item.byteSize)}</TableCell><TableCell>{item.purchaseId ? purchase ? `${purchase.providerName} · ${purchase.amount} ${purchase.currency}` : 'Compra vinculada' : 'Gestión'}</TableCell><TableCell>{formatDateTime(item.createdAt)}</TableCell><TableCell><div className="flex gap-1"><Button type="button" size="sm" variant="outline" onClick={() => onOpen(item)}><FileText aria-hidden="true" />Abrir</Button><Button type="button" size="sm" variant="outline" onClick={() => onDelete(item)}>Eliminar</Button></div></TableCell></TableRow>; })}</TableBody></Table></CardContent></Card>}{evidence && evidence.totalPages > 1 ? <Pagination page={evidence.page} totalPages={evidence.totalPages} onPage={onPage} /> : null}</div>;
}

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) { return <div className="flex justify-between"><Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft aria-hidden="true" />Anterior</Button><Button type="button" size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Siguiente<ChevronRight aria-hidden="true" /></Button></div>; }
function textOrNull(value: string) { return value.trim() || null; }
function validateFile(file: File) { if (file.size < 1) return 'El archivo está vacío.'; if (!allowedMimeTypes.has(file.type)) return 'Solo se permiten archivos PDF, JPEG, PNG o WebP.'; if (file.size > maxEvidenceBytes) return 'El archivo no puede superar 10 MiB.'; return null; }
function formatBytes(bytes: number) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`; }
function friendlyMime(mimeType: string) { return mimeType === 'application/pdf' ? 'PDF' : mimeType === 'image/jpeg' ? 'JPEG' : mimeType === 'image/png' ? 'PNG' : mimeType === 'image/webp' ? 'WebP' : mimeType; }
function message(reason: unknown, fallback: string) { const value = reason instanceof Error ? reason.message : ''; if (value.includes('FINANCIAL_ELIGIBILITY_BLOCKED')) return 'Esta compra no puede registrarse porque la fuente comercial aún no está habilitada financieramente.'; if (value.includes('FINANCIAL_ELIGIBILITY_UNAVAILABLE')) return 'No existe información financiera suficiente para autorizar esta compra.'; if (value.includes('FULFILLMENT_CANCELLED')) return 'La gestión está cancelada y no admite nuevas compras.'; if (value.includes('STORAGE_DELETE_FAILED')) return 'El registro se eliminó, pero no se pudo eliminar el archivo almacenado. Intente nuevamente o contacte soporte.'; if (value.includes('FILE_TOO_LARGE')) return 'El archivo no puede superar 10 MiB.'; if (value.includes('FILE_INVALID')) return 'El archivo no es válido para evidencia operativa.'; return operationsErrorMessage(reason, fallback); }
