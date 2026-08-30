'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { LoadingSpinner } from '@/components/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getHomeRouteForRole, getStoredSession } from '@/lib/auth-api';
import {
  FiscalBillingApiError,
  getAcceptedBillingInvoice,
  type AcceptedBillingInvoice,
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

export default function AcceptedInvoicePage() {
  const { billingDocumentId } = useParams<{ billingDocumentId: string }>();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [invoice, setInvoice] = useState<AcceptedBillingInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FiscalBillingApiError | null>(null);

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

        <div className={styles.workspaceActions}>
          <Button asChild variant="outline" className={styles.secondaryAction}>
            <Link href={`/fiscal-billing/documents/${encodeURIComponent(invoice.billingDocumentId)}`}>Detalles técnicos</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
