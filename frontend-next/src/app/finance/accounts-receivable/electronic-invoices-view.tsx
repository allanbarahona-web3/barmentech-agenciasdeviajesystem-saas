'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, Eye, Search } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  FinanceApiError,
  formatFinanceMoney,
  listElectronicInvoices,
  type ElectronicInvoiceFinancialStatus,
  type ElectronicInvoiceListItem,
  type ElectronicInvoicesPage,
  type ElectronicInvoiceTaxAuthorityStatus,
  type FinanceCurrency,
} from '@/lib/finance-api';
import {
  downloadFiscalArtifact,
  getAcceptedBillingInvoice,
  listFiscalArtifacts,
  type AcceptedBillingInvoice,
  type FiscalArtifactListItem,
  type FiscalArtifactType,
} from '@/lib/fiscal-billing-api';
import { formatBusinessDate } from '@/shared/regional';
import { useTenantDateTimeFormatter, useTenantRegional } from '@/shared/regional/tenant-regional-provider';
import styles from './accounts-receivable.module.css';
import { financeQuickDateRanges, type FinanceDatePreset } from './finance-date-ranges';

const PAGE_SIZE = 25;
const FISCAL_STATUS_OPTIONS: ElectronicInvoiceTaxAuthorityStatus[] = ['ACCEPTED', 'PROCESSING', 'NOT_SUBMITTED', 'REJECTED'];

function documentTypeLabel(type: string): string {
  if (type === '01') return 'Factura electrónica';
  if (type === '04') return 'Tiquete electrónico';
  return 'Documento electrónico';
}

function originLabel(invoice: ElectronicInvoiceListItem): string {
  if (invoice.originLabel) return invoice.originLabel;
  if (invoice.sourceType === 'SALES_ORDER') return 'Servicios adicionales';
  if (invoice.sourceType === 'CONTRACT_PAYMENT') return 'Contrato';
  return 'Otra fuente';
}

function financialStatusPresentation(status: ElectronicInvoiceFinancialStatus, sourceType: string | null): { label: string; variant: 'success' | 'warning' | 'destructive' | 'outline' } {
  if (sourceType === 'CONTRACT_PAYMENT') return { label: 'Pagada / aplicada', variant: 'success' };
  if (status === 'PAID') return { label: 'Pagada', variant: 'success' };
  if (status === 'PARTIALLY_PAID') return { label: 'Parcialmente pagada', variant: 'warning' };
  if (status === 'PENDING') return { label: 'Pendiente', variant: 'destructive' };
  if (status === 'CANCELLED') return { label: 'Anulada', variant: 'outline' };
  return { label: 'No aplica', variant: 'outline' };
}

function fiscalStatusPresentation(status: ElectronicInvoiceTaxAuthorityStatus): { label: string; variant: 'success' | 'warning' | 'destructive' | 'outline' } {
  if (status === 'ACCEPTED') return { label: 'Aceptada', variant: 'success' };
  if (status === 'PROCESSING') return { label: 'En proceso', variant: 'warning' };
  if (status === 'REJECTED') return { label: 'Rechazada', variant: 'destructive' };
  return { label: 'Pendiente', variant: 'outline' };
}

function latestArtifact(artifacts: FiscalArtifactListItem[], type: FiscalArtifactType): FiscalArtifactListItem | null {
  let result: FiscalArtifactListItem | null = null;
  for (const artifact of artifacts) {
    if (artifact.artifactType === type && artifact.downloadAvailable && (!result || artifact.version > result.version)) result = artifact;
  }
  return result;
}

function DetailFact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-1 text-sm text-foreground">{children}</dd></div>;
}

function ElectronicInvoiceDetail({ invoice, detail, artifacts, loading, error, downloading, onClose, onDownload }: {
  invoice: ElectronicInvoiceListItem;
  detail: AcceptedBillingInvoice | null;
  artifacts: FiscalArtifactListItem[];
  loading: boolean;
  error: string | null;
  downloading: string | null;
  onClose: () => void;
  onDownload: (artifact: FiscalArtifactListItem) => Promise<void>;
}) {
  const formatTenantDateTime = useTenantDateTimeFormatter();
  const financial = financialStatusPresentation(invoice.financialStatus, invoice.sourceType);
  const fiscal = fiscalStatusPresentation(invoice.taxAuthorityStatus);
  const pdf = latestArtifact(artifacts, 'INTERNAL_PDF');
  const xml = latestArtifact(artifacts, 'SIGNED_FISCAL_XML');
  const haciendaResponse = latestArtifact(artifacts, 'TAX_AUTHORITY_RESPONSE_XML');
  const artifactButton = (artifact: FiscalArtifactListItem | null, label: string) => artifact ? <Button key={artifact.artifactType} type="button" variant="outline" disabled={downloading === `${artifact.artifactType}-${artifact.version}`} onClick={() => void onDownload(artifact)}><Download aria-hidden="true" />{downloading === `${artifact.artifactType}-${artifact.version}` ? 'Descargando…' : label}</Button> : null;

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Detalle de factura electrónica</DialogTitle>
        <DialogDescription>Consulta fiscal y financiera de solo lectura.</DialogDescription>
      </DialogHeader>
      {loading ? <div className="py-10 text-center text-sm text-muted-foreground">Cargando factura electrónica…</div> : error ? <Alert variant="destructive"><AlertTitle>No se pudo cargar el detalle</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : <div className="grid gap-5">
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-medium text-muted-foreground">Factura</p><p className="mt-1 font-semibold text-foreground">{invoice.fiscalNumber ?? invoice.sourceReference ?? 'Número fiscal no disponible'}</p><p className="mt-1 text-xs text-muted-foreground">{documentTypeLabel(invoice.documentType)}</p></div><Badge variant={fiscal.variant}>{fiscal.label}</Badge></div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <DetailFact label="Fecha de emisión">{invoice.issuedAt ? formatTenantDateTime(invoice.issuedAt) : detail ? formatBusinessDate(detail.issuedDate) : 'No disponible'}</DetailFact>
            <DetailFact label="Cliente">{invoice.customerDisplayName ?? detail?.receiver.name ?? 'No disponible'}</DetailFact>
            <DetailFact label="Identificación">{invoice.customerIdentification ?? detail?.receiver.identificationNumber ?? 'No disponible'}</DetailFact>
            <DetailFact label="Origen">{originLabel(invoice)}</DetailFact>
            <DetailFact label="Referencia de origen">{invoice.sourceReference ?? 'No disponible'}</DetailFact>
            <DetailFact label="Moneda">{invoice.currencyCode}</DetailFact>
            <DetailFact label="Total">{formatFinanceMoney(invoice.total, invoice.currencyCode)}</DetailFact>
            <DetailFact label="Estado financiero"><Badge variant={financial.variant}>{financial.label}</Badge></DetailFact>
            <DetailFact label="Estado fiscal"><Badge variant={fiscal.variant}>{fiscal.label}</Badge></DetailFact>
          </dl>
        </section>
        <section className="rounded-lg border border-border bg-card p-4"><h3 className="text-sm font-semibold text-foreground">Archivos</h3><p className="mt-1 text-sm text-muted-foreground">Descargue los artefactos fiscales disponibles sin regenerarlos.</p><div className="mt-4 flex flex-wrap gap-2">{artifactButton(pdf, 'Ver / descargar PDF')}{artifactButton(xml, 'Descargar XML')}{artifactButton(haciendaResponse, 'Respuesta Hacienda')}{!pdf && !xml && !haciendaResponse ? <p className="text-sm text-muted-foreground">No hay archivos disponibles.</p> : null}</div></section>
        <div className="flex justify-end"><Button type="button" variant="outline" onClick={onClose}>Cerrar</Button></div>
      </div>}
    </DialogContent>
  </Dialog>;
}

export function ElectronicInvoicesView() {
  const formatTenantDateTime = useTenantDateTimeFormatter();
  const { timeZone } = useTenantRegional();
  const [page, setPage] = useState(1);
  const [datePreset, setDatePreset] = useState<FinanceDatePreset>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [currency, setCurrency] = useState<FinanceCurrency | ''>('');
  const [documentType, setDocumentType] = useState('');
  const [source, setSource] = useState('');
  const [fiscalReference, setFiscalReference] = useState('');
  const [taxAuthorityStatus, setTaxAuthorityStatus] = useState<ElectronicInvoiceTaxAuthorityStatus>('ACCEPTED');
  const [result, setResult] = useState<ElectronicInvoicesPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FinanceApiError | null>(null);
  const [retry, setRetry] = useState(0);
  const [openedInvoice, setOpenedInvoice] = useState<ElectronicInvoiceListItem | null>(null);
  const [detail, setDetail] = useState<AcceptedBillingInvoice | null>(null);
  const [artifacts, setArtifacts] = useState<FiscalArtifactListItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const quickRanges = useMemo(() => financeQuickDateRanges(timeZone), [timeZone]);
  const load = useCallback(async (signal: AbortSignal) => {
    void retry;
    setLoading(true); setError(null);
    try {
      const response = await listElectronicInvoices({ page, pageSize: PAGE_SIZE, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, customerSearch: customerSearch.trim() || undefined, currency: currency || undefined, documentType: documentType || undefined, source: source || undefined, fiscalReference: fiscalReference.trim() || undefined, taxAuthorityStatus }, signal);
      setResult(response);
      if (response.totalPages > 0 && page > response.totalPages) setPage(response.totalPages);
    } catch (requestError) {
      if (!signal.aborted) setError(requestError instanceof FinanceApiError ? requestError : new FinanceApiError('FINANCE_REQUEST_FAILED', 'No se pudieron cargar las facturas electrónicas.'));
    } finally { if (!signal.aborted) setLoading(false); }
  }, [currency, customerSearch, dateFrom, dateTo, documentType, fiscalReference, page, retry, source, taxAuthorityStatus]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const summary = useMemo(() => {
    if (!result || result.total === 0) return '0 facturas';
    const first = (result.page - 1) * result.pageSize + 1;
    const last = Math.min(result.page * result.pageSize, result.total);
    return `${first}–${last} de ${result.total} facturas`;
  }, [result]);
  const hasFilters = Boolean(dateFrom || dateTo || customerSearch || currency || documentType || source || fiscalReference || taxAuthorityStatus !== 'ACCEPTED');

  function updatePageOne(action: () => void) { action(); setPage(1); }
  function applyDatePreset(value: FinanceDatePreset) {
    setDatePreset(value);
    if (value === '' || value === 'CUSTOM') { if (value === '') { setDateFrom(''); setDateTo(''); } setPage(1); return; }
    const range = quickRanges[value]; setDateFrom(range.dateFrom); setDateTo(range.dateTo); setPage(1);
  }
  function clearFilters() {
    setDatePreset(''); setDateFrom(''); setDateTo(''); setCustomerSearch(''); setCurrency(''); setDocumentType(''); setSource(''); setFiscalReference(''); setTaxAuthorityStatus('ACCEPTED'); setPage(1);
  }
  async function openDetail(invoice: ElectronicInvoiceListItem) {
    setOpenedInvoice(invoice); setDetail(null); setArtifacts([]); setDetailLoading(true); setDetailError(null);
    try {
      const [loadedDetail, loadedArtifacts] = await Promise.all([getAcceptedBillingInvoice(invoice.billingDocumentId), listFiscalArtifacts(invoice.billingDocumentId)]);
      setDetail(loadedDetail); setArtifacts(loadedArtifacts);
    } catch (requestError) { setDetailError(requestError instanceof Error ? requestError.message : 'No se pudo cargar la factura electrónica.'); }
    finally { setDetailLoading(false); }
  }
  async function downloadArtifact(artifact: FiscalArtifactListItem) {
    if (!openedInvoice) return;
    const actionId = `${artifact.artifactType}-${artifact.version}`;
    setDownloading(actionId); setDetailError(null);
    try {
      const file = await downloadFiscalArtifact(openedInvoice.billingDocumentId, artifact.artifactType, artifact.version);
      const url = URL.createObjectURL(file.blob); const link = document.createElement('a');
      link.href = url; link.download = file.filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (requestError) { setDetailError(requestError instanceof Error ? requestError.message : 'No se pudo descargar el archivo fiscal.'); }
    finally { setDownloading(null); }
  }

  return <>
    <section className={styles.paymentFilters} aria-label="Filtros de facturas electrónicas">
      <div className={styles.field}><label htmlFor="invoice-date-preset">Fecha</label><select id="invoice-date-preset" className={styles.select} value={datePreset} onChange={(event) => applyDatePreset(event.target.value as FinanceDatePreset)}><option value="">Todas</option><option value="TODAY">Hoy</option><option value="LAST_7_DAYS">Últimos 7 días</option><option value="LAST_15_DAYS">Últimos 15 días</option><option value="LAST_MONTH">Último mes</option><option value="PREVIOUS_MONTH">Mes anterior</option><option value="CUSTOM">Personalizado</option></select></div>
      {datePreset === 'CUSTOM' ? <><div className={styles.field}><label htmlFor="invoice-date-from">Desde</label><input id="invoice-date-from" className={styles.input} type="date" value={dateFrom} onChange={(event) => updatePageOne(() => setDateFrom(event.target.value))} /></div><div className={styles.field}><label htmlFor="invoice-date-to">Hasta</label><input id="invoice-date-to" className={styles.input} type="date" value={dateTo} onChange={(event) => updatePageOne(() => setDateTo(event.target.value))} /></div></> : null}
      <div className={styles.field}><label htmlFor="invoice-customer-search">Cliente / identificación</label><input id="invoice-customer-search" className={styles.input} value={customerSearch} onChange={(event) => updatePageOne(() => setCustomerSearch(event.target.value))} /></div>
      <div className={styles.field}><label htmlFor="invoice-currency">Moneda</label><select id="invoice-currency" className={styles.select} value={currency} onChange={(event) => updatePageOne(() => setCurrency(event.target.value as FinanceCurrency | ''))}><option value="">Todas</option><option value="CRC">CRC</option><option value="USD">USD</option></select></div>
      <div className={styles.field}><label htmlFor="invoice-document-type">Tipo de documento</label><select id="invoice-document-type" className={styles.select} value={documentType} onChange={(event) => updatePageOne(() => setDocumentType(event.target.value))}><option value="">Todos</option><option value="01">Factura electrónica</option><option value="04">Tiquete electrónico</option></select></div>
      <div className={styles.field}><label htmlFor="invoice-source">Origen</label><select id="invoice-source" className={styles.select} value={source} onChange={(event) => updatePageOne(() => setSource(event.target.value))}><option value="">Todos</option><option value="SALES_ORDER">Servicios adicionales</option><option value="CONTRACT_PAYMENT">Contrato</option></select></div>
      <div className={styles.field}><label htmlFor="invoice-fiscal-reference">Referencia fiscal</label><input id="invoice-fiscal-reference" className={styles.input} value={fiscalReference} onChange={(event) => updatePageOne(() => setFiscalReference(event.target.value))} /></div>
      <div className={styles.field}><label htmlFor="invoice-fiscal-status">Estado fiscal</label><select id="invoice-fiscal-status" className={styles.select} value={taxAuthorityStatus} onChange={(event) => updatePageOne(() => setTaxAuthorityStatus(event.target.value as ElectronicInvoiceTaxAuthorityStatus))}>{FISCAL_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{fiscalStatusPresentation(option).label}</option>)}</select></div>
      {hasFilters ? <Button className={styles.secondaryAction} type="button" variant="outline" onClick={clearFilters}>Limpiar filtros</Button> : null}
    </section>
    <section className={styles.tableCard}>
      <div className={styles.tableHeading}><div><h2>Facturas electrónicas</h2><p>Documentos fiscales emitidos y aceptados por Hacienda.</p></div><span>{loading ? 'Cargando…' : summary}</span></div>
      {error ? <div className={styles.state}><div><span className={styles.stateIcon}><AlertCircle aria-hidden="true" /></span><h3 className={styles.error}>No se pudieron cargar las facturas electrónicas</h3><p>{error.message}</p><Button className={styles.secondaryAction} variant="outline" type="button" onClick={() => setRetry((value) => value + 1)}>Intentar nuevamente</Button></div></div> : !loading && (!result || result.items.length === 0) ? <div className={styles.state}><div><span className={styles.stateIcon}><Search aria-hidden="true" /></span><h3>No se encontraron facturas electrónicas</h3><p>No hay documentos bajo los filtros seleccionados.</p></div></div> : <Table className={styles.electronicInvoiceTable}><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Cliente / identificación</TableHead><TableHead>Factura</TableHead><TableHead>Origen</TableHead><TableHead>Total</TableHead><TableHead>Estado financiero</TableHead><TableHead>Estado fiscal</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader><TableBody>{loading ? Array.from({ length: 5 }, (_, row) => <TableRow key={row}>{Array.from({ length: 8 }, (_, cell) => <TableCell key={cell}><span className={styles.skeleton} /></TableCell>)}</TableRow>) : result?.items.map((invoice) => { const financial = financialStatusPresentation(invoice.financialStatus, invoice.sourceType); const fiscal = fiscalStatusPresentation(invoice.taxAuthorityStatus); return <TableRow key={invoice.billingDocumentId}><TableCell>{invoice.issuedAt ? formatTenantDateTime(invoice.issuedAt) : 'No disponible'}</TableCell><TableCell><div className={styles.stack}><strong className={styles.reference}>{invoice.customerDisplayName ?? 'Cliente no disponible'}</strong><small className={styles.tableSubtext}>{invoice.customerIdentification ?? 'Sin identificación'}</small></div></TableCell><TableCell><div className={styles.stack}><strong className={styles.reference}>{invoice.fiscalNumber ?? 'Número no disponible'}</strong><small className={styles.tableSubtext}>{documentTypeLabel(invoice.documentType)}</small></div></TableCell><TableCell>{originLabel(invoice)}</TableCell><TableCell className={styles.numeric}>{formatFinanceMoney(invoice.total, invoice.currencyCode)}</TableCell><TableCell><Badge variant={financial.variant}>{financial.label}</Badge></TableCell><TableCell><Badge variant={fiscal.variant}>{fiscal.label}</Badge></TableCell><TableCell><Button className={styles.secondaryAction} size="sm" type="button" variant="outline" onClick={() => void openDetail(invoice)}><Eye aria-hidden="true" />Detalle</Button></TableCell></TableRow>; })}</TableBody></Table>}
      {!loading && !error && result && result.totalPages > 1 ? <nav className={styles.pagination}><p>Página {result.page} de {result.totalPages} · {summary}</p><div className={styles.paginationActions}><Button className={styles.secondaryAction} disabled={result.page <= 1} variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</Button><Button className={styles.secondaryAction} disabled={result.page >= result.totalPages} variant="outline" onClick={() => setPage((value) => Math.min(result.totalPages, value + 1))}>Siguiente</Button></div></nav> : null}
    </section>
    {openedInvoice ? <ElectronicInvoiceDetail invoice={openedInvoice} detail={detail} artifacts={artifacts} loading={detailLoading} error={detailError} downloading={downloading} onClose={() => setOpenedInvoice(null)} onDownload={downloadArtifact} /> : null}
  </>;
}
