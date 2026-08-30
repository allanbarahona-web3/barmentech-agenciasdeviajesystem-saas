'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Download, LoaderCircle } from 'lucide-react';
import { LoadingSpinner } from '@/components/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getHomeRouteForRole, getStoredSession } from '@/lib/auth-api';
import {
  FiscalBillingApiError,
  downloadFiscalArtifact,
  generateAcceptedInvoicePdf,
  getAcceptedBillingInvoice,
  listFiscalArtifacts,
  type AcceptedBillingInvoice,
  type FiscalArtifactDownload,
  type FiscalArtifactListItem,
  type FiscalArtifactType,
} from '@/lib/fiscal-billing-api';
import { formatFiscalDecimal, formatFiscalMoney } from '@/lib/fiscal-money';
import styles from '../../fiscal-billing.module.css';

const DOCUMENT_TYPES: Record<string, string> = {
  '01': 'Factura electrónica',
  '04': 'Tiquete electrónico',
};

const IDENTIFICATION_TYPES: Record<string, string> = {
  '01': 'Cédula física',
  '02': 'Cédula jurídica',
  '03': 'DIMEX',
  '04': 'NITE',
};

function formatDate(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'No disponible';
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return 'No disponible';
  return new Intl.DateTimeFormat('es-CR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function paymentCondition(invoice: AcceptedBillingInvoice): string {
  if (invoice.paymentCondition.code === '01') return 'Contado';
  if (invoice.paymentCondition.code === '02') {
    return invoice.paymentCondition.creditTermDays
      ? `Crédito · ${invoice.paymentCondition.creditTermDays} días`
      : 'Crédito';
  }
  return 'No disponible';
}

function receiverIdentification(invoice: AcceptedBillingInvoice): string {
  const { identificationType, identificationNumber } = invoice.receiver;
  if (!identificationType || !identificationNumber) return 'No registrada';
  return `${IDENTIFICATION_TYPES[identificationType] ?? identificationType} · ${identificationNumber}`;
}

function taxDescription(line: AcceptedBillingInvoice['lines'][number], currency: string) {
  if (line.taxes.length === 0) return 'Sin impuesto';
  return line.taxes.map((tax) => (
    `${formatFiscalDecimal(tax.ratePercentage)}% · ${formatFiscalMoney(tax.netTaxAmount, currency)}`
  )).join(' / ');
}

function latestAvailableArtifact(
  artifacts: FiscalArtifactListItem[],
  artifactType: FiscalArtifactType,
): FiscalArtifactListItem | null {
  return artifacts
    .filter((artifact) => (
      artifact.artifactType === artifactType &&
      artifact.status === 'AVAILABLE' &&
      artifact.downloadAvailable
    ))
    .sort((left, right) => right.version - left.version)[0] ?? null;
}

function saveArtifact(download: FiscalArtifactDownload): void {
  const url = window.URL.createObjectURL(download.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = download.filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

export default function AcceptedInvoicePage() {
  const { billingDocumentId } = useParams<{ billingDocumentId: string }>();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [invoice, setInvoice] = useState<AcceptedBillingInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FiscalBillingApiError | null>(null);
  const [artifacts, setArtifacts] = useState<FiscalArtifactListItem[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(true);
  const [documentError, setDocumentError] = useState<FiscalBillingApiError | null>(null);
  const [documentAction, setDocumentAction] = useState<
    'GENERATING_PDF' | 'DOWNLOADING_PDF' | 'SIGNED_XML' | 'RESPONSE_XML' | null
  >(null);

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.user?.id) {
      router.replace('/');
      return;
    }
    const role = String(session.user.role ?? '').toUpperCase();
    if (role !== 'ADMIN' && role !== 'FACTURACION_COBROS') {
      router.replace(getHomeRouteForRole(role));
      return;
    }
    queueMicrotask(() => setAuthorized(true));
  }, [router]);

  useEffect(() => {
    if (!authorized) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void getAcceptedBillingInvoice(billingDocumentId, controller.signal)
      .then(setInvoice)
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setError(requestError instanceof FiscalBillingApiError
          ? requestError
          : new FiscalBillingApiError(
            'FISCAL_BILLING_REQUEST_FAILED',
            'No se pudo cargar la factura.',
          ));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [authorized, billingDocumentId]);

  useEffect(() => {
    if (!authorized) return;
    const controller = new AbortController();
    setArtifactsLoading(true);
    void listFiscalArtifacts(billingDocumentId, controller.signal)
      .then((available) => {
        setArtifacts(available);
        setDocumentError(null);
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setDocumentError(requestError instanceof FiscalBillingApiError
          ? requestError
          : new FiscalBillingApiError(
            'FISCAL_ARTIFACT_DOWNLOAD_FAILED',
            'No se pudieron consultar los documentos disponibles.',
          ));
      })
      .finally(() => {
        if (!controller.signal.aborted) setArtifactsLoading(false);
      });
    return () => controller.abort();
  }, [authorized, billingDocumentId]);

  async function downloadAvailableArtifact(
    artifact: FiscalArtifactListItem,
    action: 'SIGNED_XML' | 'RESPONSE_XML',
  ) {
    if (documentAction) return;
    setDocumentAction(action);
    setDocumentError(null);
    try {
      saveArtifact(await downloadFiscalArtifact(
        billingDocumentId,
        artifact.artifactType,
        artifact.version,
      ));
    } catch (requestError) {
      setDocumentError(requestError instanceof FiscalBillingApiError
        ? requestError
        : new FiscalBillingApiError(
          'FISCAL_ARTIFACT_DOWNLOAD_FAILED',
          'No se pudo descargar el documento.',
        ));
    } finally {
      setDocumentAction(null);
    }
  }

  async function generateAndDownloadPdf() {
    if (documentAction) return;
    setDocumentAction('GENERATING_PDF');
    setDocumentError(null);
    try {
      const artifact = await generateAcceptedInvoicePdf(billingDocumentId);
      setDocumentAction('DOWNLOADING_PDF');
      saveArtifact(await downloadFiscalArtifact(
        billingDocumentId,
        artifact.artifactType,
        artifact.version,
      ));
      setArtifacts((current) => [
        ...current.filter((item) => item.artifactType !== 'INTERNAL_PDF' || item.version !== artifact.version),
        { ...artifact, downloadAvailable: true },
      ]);
    } catch (requestError) {
      setDocumentError(requestError instanceof FiscalBillingApiError
        ? requestError
        : new FiscalBillingApiError(
          'BILLING_DOCUMENT_INVOICE_PDF_GENERATION_FAILED',
          'No se pudo preparar el PDF de la factura.',
        ));
    } finally {
      setDocumentAction(null);
    }
  }

  if (!authorized || loading) {
    return <main className="app-shell"><div className={styles.state}><LoadingSpinner message="Cargando factura…" /></div></main>;
  }

  if (error || !invoice) {
    return (
      <main className="app-shell">
        <div className={styles.state}>
          <div>
            <h1>No se pudo cargar la factura</h1>
            <p>{error?.message ?? 'La factura no está disponible.'}</p>
            {error && <p className={styles.errorCode}>Código: {error.code}</p>}
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>Intentar nuevamente</Button>{' '}
            <Button asChild variant="outline"><Link href="/fiscal-billing/sales-orders">Volver</Link></Button>
          </div>
        </div>
      </main>
    );
  }

  const money = (value: string) => formatFiscalMoney(value, invoice.currencyCode);
  const signedXml = latestAvailableArtifact(artifacts, 'SIGNED_FISCAL_XML');
  const responseXml = latestAvailableArtifact(artifacts, 'TAX_AUTHORITY_RESPONSE_XML');

  return (
    <main className="app-shell">
      <div className={styles.page}>
        <Link className={`${styles.backLink} ${styles.navigationButton}`} href="/fiscal-billing/sales-orders">
          <ArrowLeft aria-hidden="true" />Volver a Órdenes por facturar
        </Link>

        <header className={styles.header}>
          <p className={styles.eyebrow}>Factura fiscal</p>
          <h1 className={styles.title}>{invoice.fiscalNumber}</h1>
          <p className={styles.subtitle}>{DOCUMENT_TYPES[invoice.documentTypeCode] ?? `Documento ${invoice.documentTypeCode}`} · Emitida el {formatDate(invoice.issuedDate)}</p>
          <div className={styles.types}>
            <Badge variant="outline" className={styles.readyBadge}>Aceptada</Badge>
            <Badge variant="outline" className={styles.documentTypeBadge}>{invoice.currencyCode}</Badge>
          </div>
        </header>

        <div className={styles.grid}>
          <section className={`${styles.card} ${styles.section}`}>
            <h2>Receptor</h2>
            <dl className={styles.details}>
              <div><dt>Nombre</dt><dd>{invoice.receiver.name ?? 'No registrado'}</dd></div>
              <div><dt>Identificación</dt><dd>{receiverIdentification(invoice)}</dd></div>
              {invoice.receiver.email && <div><dt>Correo</dt><dd>{invoice.receiver.email}</dd></div>}
            </dl>
          </section>
          <section className={`${styles.card} ${styles.section}`}>
            <h2>Información de factura</h2>
            <dl className={styles.details}>
              <div><dt>Documento</dt><dd>{DOCUMENT_TYPES[invoice.documentTypeCode] ?? invoice.documentTypeCode}</dd></div>
              <div><dt>Fecha de emisión</dt><dd>{formatDate(invoice.issuedDate)}</dd></div>
              <div><dt>Condición</dt><dd>{paymentCondition(invoice)}</dd></div>
              {invoice.paymentCondition.dueDate && <div><dt>Fecha de vencimiento</dt><dd>{formatDate(invoice.paymentCondition.dueDate)}</dd></div>}
              <div><dt>Orden de venta</dt><dd>{invoice.salesOrder?.number ?? invoice.salesOrder?.id ?? 'No disponible'}</dd></div>
            </dl>
          </section>
        </div>

        <section className={`${styles.card} ${styles.sectionGap}`}>
          <div className={styles.cardHeading}><h2>Detalle</h2><span>{invoice.lines.length} {invoice.lines.length === 1 ? 'línea' : 'líneas'}</span></div>
          <div className={styles.desktopInvoiceTable}>
            <Table className={`${styles.table} ${styles.invoiceTable}`}>
              <TableHeader><TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead className={styles.numeric}>Cantidad</TableHead>
                <TableHead className={styles.numeric}>Precio unitario</TableHead>
                <TableHead className={styles.numeric}>Subtotal / Base</TableHead>
                <TableHead className={styles.numeric}>Impuestos</TableHead>
                <TableHead className={styles.numeric}>Total</TableHead>
              </TableRow></TableHeader>
              <TableBody>{invoice.lines.map((line) => (
                <TableRow key={line.lineNumber}>
                  <TableCell><strong className={styles.invoiceService}>{line.description}</strong><span className={styles.invoiceServiceMeta}>Unidad {line.unitOfMeasureCode}</span></TableCell>
                  <TableCell className={styles.numeric}>{formatFiscalDecimal(line.quantity)}</TableCell>
                  <TableCell className={styles.numeric}>{money(line.unitPrice)}</TableCell>
                  <TableCell className={styles.numeric}>{money(line.subtotal)}<span className={styles.invoiceServiceMeta}>Base {money(line.taxableBase)}</span></TableCell>
                  <TableCell className={styles.numeric}>{taxDescription(line, invoice.currencyCode)}</TableCell>
                  <TableCell className={styles.numeric}><strong>{money(line.lineTotal)}</strong></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
          <div className={`${styles.mobileInvoiceList} ${styles.section}`}>
            {invoice.lines.map((line) => (
              <article className={styles.line} key={line.lineNumber}>
                <div className={styles.lineHeader}><div><h3>{line.description}</h3><p>Unidad {line.unitOfMeasureCode}</p></div><strong>{money(line.lineTotal)}</strong></div>
                <div className={styles.profileGrid}>
                  <div><span>Cantidad</span><strong>{formatFiscalDecimal(line.quantity)}</strong></div>
                  <div><span>Precio unitario</span><strong>{money(line.unitPrice)}</strong></div>
                  <div><span>Subtotal</span><strong>{money(line.subtotal)}</strong></div>
                  <div><span>Base</span><strong>{money(line.taxableBase)}</strong></div>
                  <div><span>Impuestos</span><strong>{taxDescription(line, invoice.currencyCode)}</strong></div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={`${styles.card} ${styles.section} ${styles.sectionGap}`}>
          <div className={styles.totalsLayout}>
            <div><h2>Totales</h2><p className={styles.muted}>Importes del documento fiscal aceptado.</p></div>
            <dl className={styles.totalsSummary}>
              <div><dt>Subtotal</dt><dd>{money(invoice.totals.subtotal)}</dd></div>
              <div><dt>Total impuestos</dt><dd>{money(invoice.totals.totalTax)}</dd></div>
              <div className={styles.grandTotal}><dt>Total</dt><dd>{money(invoice.totals.total)}</dd></div>
            </dl>
          </div>
        </section>

        <section className={`${styles.card} ${styles.section} ${styles.sectionGap}`}>
          <h2>Documentos</h2>
          <p className={styles.muted}>Descargue los documentos disponibles de esta factura aceptada.</p>
          <div className={styles.workspaceActions}>
            <Button
              type="button"
              className={styles.primaryAction}
              disabled={documentAction !== null}
              onClick={() => void generateAndDownloadPdf()}
            >
              {documentAction === 'GENERATING_PDF' || documentAction === 'DOWNLOADING_PDF'
                ? <LoaderCircle className={styles.spin} aria-hidden="true" />
                : <Download aria-hidden="true" />}
              {documentAction === 'GENERATING_PDF'
                ? 'Generando PDF…'
                : documentAction === 'DOWNLOADING_PDF'
                  ? 'Descargando PDF…'
                  : 'Descargar PDF'}
            </Button>
            {signedXml && (
              <Button
                type="button"
                variant="outline"
                className={styles.secondaryAction}
                disabled={documentAction !== null}
                onClick={() => void downloadAvailableArtifact(signedXml, 'SIGNED_XML')}
              >
                {documentAction === 'SIGNED_XML' ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <Download aria-hidden="true" />}
                {documentAction === 'SIGNED_XML' ? 'Descargando…' : 'Descargar XML firmado'}
              </Button>
            )}
            {responseXml && (
              <Button
                type="button"
                variant="outline"
                className={styles.secondaryAction}
                disabled={documentAction !== null}
                onClick={() => void downloadAvailableArtifact(responseXml, 'RESPONSE_XML')}
              >
                {documentAction === 'RESPONSE_XML' ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <Download aria-hidden="true" />}
                {documentAction === 'RESPONSE_XML' ? 'Descargando…' : 'Descargar respuesta Hacienda'}
              </Button>
            )}
          </div>
          {artifactsLoading && <p className={styles.muted}>Consultando documentos disponibles…</p>}
          {!artifactsLoading && !signedXml && !responseXml && !documentError && (
            <p className={styles.muted}>Los documentos XML aparecerán cuando estén disponibles.</p>
          )}
          {documentError && (
            <div className={`${styles.statusAlert} ${styles.dangerAlert}`} role="alert">
              <strong>No se pudo completar la descarga</strong>
              <p>{documentError.message}</p>
            </div>
          )}
        </section>

        <div className={styles.workspaceActions}>
          <Button asChild variant="outline" className={styles.secondaryAction}>
            <Link href={`/fiscal-billing/documents/${encodeURIComponent(invoice.billingDocumentId)}`}>Detalles técnicos</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
