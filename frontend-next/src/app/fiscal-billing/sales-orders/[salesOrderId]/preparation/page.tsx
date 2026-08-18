'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { LoadingSpinner } from '@/components/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FiscalBillingApiError,
  fiscalBillingIssueMessage,
  getFiscalPreparation,
  type FiscalBillingIssue,
  type FiscalPreparation,
  type FiscalPreparationLine,
} from '@/lib/fiscal-billing-api';
import styles from '../../../fiscal-billing.module.css';

function formatDecimal(value: string) {
  const [whole = '0', fraction] = value.split('.');
  const sign = whole.startsWith('-') ? '-' : '';
  const digits = sign ? whole.slice(1) : whole;
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${(fraction ?? '').padEnd(2, '0').slice(0, 2)}`;
}

function money(value: string, currency: string) {
  return `${currency} ${formatDecimal(value)}`;
}

function paymentCondition(preparation: FiscalPreparation) {
  const condition = preparation.paymentCondition;
  if (condition.type === 'CASH') return 'Contado';
  if (condition.type === 'CREDIT') {
    if (condition.termValue && condition.termUnit) {
      const unit = condition.termUnit === 'DAYS'
        ? (condition.termValue === 1 ? 'día' : 'días')
        : (condition.termValue === 1 ? 'mes' : 'meses');
      return `Crédito · ${condition.termValue} ${unit}`;
    }
    return 'Crédito';
  }
  return 'No especificada';
}

function readinessLabel(status: FiscalPreparationLine['fiscalReadiness']['status']) {
  return { READY: 'Lista', MISSING: 'Faltante', INACTIVE: 'Inactiva', INVALID: 'Inválida' }[status];
}

function Issue({ issue }: { issue: FiscalBillingIssue }) {
  return (
    <div className={`${styles.issue} ${issue.blocking ? styles.issueBlocking : styles.issueInfo}`}>
      <strong>{fiscalBillingIssueMessage(issue.code)}</strong>
      <p>{issue.blocking ? 'Este problema bloquea la preparación del borrador.' : 'Información para completar en una etapa posterior.'}</p>
      <p className={styles.errorCode}>Código: {issue.code}{issue.lineId ? ` · Línea: ${issue.lineId}` : ''}</p>
    </div>
  );
}

function Line({ line, currency }: { line: FiscalPreparationLine; currency: string }) {
  const profile = line.fiscalReadiness.profile;
  const ready = line.fiscalReadiness.status === 'READY';
  return (
    <article className={styles.line}>
      <div className={styles.lineHeader}>
        <div><h3>{line.serviceName}</h3><p>{line.serviceCode}</p></div>
        <Badge className={ready ? styles.readyBadge : styles.errorBadge} variant="outline">{readinessLabel(line.fiscalReadiness.status)}</Badge>
      </div>
      <div className={styles.profileGrid}>
        <div><span>Subtotal</span><strong>{money(line.subtotal, currency)}</strong></div>
        <div><span>IVA comercial</span><strong>{line.vatPercentage}% · {money(line.vatAmount, currency)}</strong></div>
        <div><span>Total</span><strong>{money(line.total, currency)}</strong></div>
        <div><span>CABYS</span><strong>{profile?.cabysCode ?? 'No disponible'}</strong></div>
        <div><span>Unidad</span><strong>{profile?.unitOfMeasureCode ?? 'No disponible'}</strong></div>
        <div><span>Impuesto</span><strong>{profile?.taxCode ?? 'No disponible'}</strong></div>
        <div><span>Tarifa</span><strong>{profile?.taxRateCode ?? 'No disponible'}</strong></div>
        <div><span>Porcentaje fiscal</span><strong>{profile?.taxPercentage ? `${profile.taxPercentage}%` : 'No disponible'}</strong></div>
      </div>
      {line.commercialNotes && <p className={styles.notes}><strong>Notas:</strong> {line.commercialNotes}</p>}
      {line.fiscalReadiness.issues.length > 0 && <p className={styles.notes}>Validaciones: {line.fiscalReadiness.issues.map(fiscalBillingIssueMessage).join(' ')}</p>}
    </article>
  );
}

export default function FiscalPreparationPage() {
  const params = useParams<{ salesOrderId: string }>();
  const [preparation, setPreparation] = useState<FiscalPreparation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FiscalBillingApiError | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void reload;
    void getFiscalPreparation(params.salesOrderId, controller.signal)
      .then(setPreparation)
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        setError(requestError instanceof FiscalBillingApiError
          ? requestError
          : new FiscalBillingApiError('FISCAL_BILLING_REQUEST_FAILED', 'No se pudo cargar la preparación fiscal.'));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [params.salesOrderId, reload]);

  if (loading) return <main className="app-shell"><div className={styles.state}><LoadingSpinner message="Validando la preparación fiscal…" /></div></main>;
  if (error || !preparation) return (
    <main className="app-shell"><div className={styles.state}><div>
      <h1>No se pudo cargar la preparación</h1><p>{error?.message ?? 'La preparación no está disponible.'}</p>
      {error && <p className={styles.errorCode}>Código: {error.code}</p>}
      <Button variant="outline" onClick={() => { setLoading(true); setError(null); setReload((value) => value + 1); }}>Intentar nuevamente</Button>{' '}
      <Button asChild variant="outline"><Link href="/fiscal-billing/sales-orders">Volver</Link></Button>
    </div></div></main>
  );

  const blockingIssues = preparation.issues.filter((issue) => issue.blocking);
  const informationalIssues = preparation.issues.filter((issue) => !issue.blocking);
  const configuration = preparation.billingConfiguration;

  return (
    <main className="app-shell"><div className={styles.page}>
      <Link className={styles.backLink} href="/fiscal-billing/sales-orders"><ArrowLeft aria-hidden="true" />Volver a Órdenes por facturar</Link>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Preparación fiscal · Solo lectura</p>
        <h1 className={styles.title}>{preparation.source.number}</h1>
        <p className={styles.subtitle}>Revise la información comercial y la disponibilidad de sus datos fiscales.</p>
      </header>

      <div className={styles.grid}>
        <section className={`${styles.card} ${styles.section}`}><h2>Orden y cliente</h2><dl className={styles.details}>
          <div><dt>Estado</dt><dd>{preparation.source.status}</dd></div><div><dt>Origen</dt><dd>{preparation.source.sourceType}</dd></div>
          <div><dt>Cliente</dt><dd>{preparation.customer.name}</dd></div><div><dt>Correo</dt><dd>{preparation.customer.email ?? 'No registrado'}</dd></div>
          <div><dt>Moneda</dt><dd>{preparation.currency}</dd></div><div><dt>Condición comercial</dt><dd>{paymentCondition(preparation)}</dd></div>
        </dl></section>
        <section className={`${styles.card} ${styles.section}`}><h2>Totales validados</h2><dl className={styles.details}>
          <div><dt>Subtotal comercial</dt><dd>{money(preparation.totals.commercialSubtotal, preparation.currency)}</dd></div>
          <div><dt>IVA comercial</dt><dd>{money(preparation.totals.commercialVat, preparation.currency)}</dd></div>
          <div><dt>Total comercial</dt><dd>{money(preparation.totals.commercialTotal, preparation.currency)}</dd></div>
          <div><dt>Subtotal calculado</dt><dd>{money(preparation.totals.calculatedSubtotal, preparation.currency)}</dd></div>
          <div><dt>IVA calculado</dt><dd>{money(preparation.totals.calculatedVat, preparation.currency)}</dd></div>
          <div><dt>Total calculado</dt><dd>{money(preparation.totals.calculatedTotal, preparation.currency)}</dd></div>
        </dl></section>
      </div>

      <section className={`${styles.card} ${styles.section} ${styles.sectionGap}`}><h2>Líneas y perfiles fiscales</h2><div className={styles.lineList}>
        {preparation.lines.map((line) => <Line key={line.id} line={line} currency={preparation.currency} />)}
      </div></section>

      <div className={styles.grid}>
        <section className={`${styles.card} ${styles.section}`}><h2>Configuración de facturación</h2><dl className={styles.details}>
          <div><dt>Configuración encontrada</dt><dd>{configuration.found ? 'Sí' : 'No'}</dd></div>
          <div><dt>Facturación habilitada</dt><dd>{configuration.billingEnabled ? 'Sí' : 'No'}</dd></div>
          <div><dt>Proveedor electrónico habilitado</dt><dd>{configuration.electronicProviderEnabled ? 'Sí' : 'No'}</dd></div>
          {configuration.found && <><div><dt>País</dt><dd>{configuration.countryCode}</dd></div><div><dt>Esquema</dt><dd>{configuration.schemaVersion}</dd></div></>}
        </dl></section>
        <section className={`${styles.card} ${styles.section}`}><h2>Tipos de documento admitidos</h2><div className={styles.types}>
          {preparation.documentTypeChoices.map((type) => <Badge className={styles.documentTypeBadge} key={type.code} variant="outline">{type.code} · {type.label}</Badge>)}
        </div><p className={styles.muted}>Acción indicada por el backend: {preparation.nextAction}</p></section>
      </div>

      <section className={`${styles.card} ${styles.section} ${styles.sectionGap}`}><h2>Emisores activos</h2>
        {preparation.issuerChoices.length === 0 ? <p className={styles.muted}>No hay emisores activos disponibles.</p> : <div className={styles.issuerList}>{preparation.issuerChoices.map((issuer) => (
          <article className={styles.issuer} key={issuer.id}><div className={styles.issuerHeader}><div><h3>{issuer.displayName}</h3><p>{issuer.legalName} · {issuer.identificationTypeCode} {issuer.identificationNumber}</p></div></div>
            <div className={styles.types}>{issuer.economicActivities.map((activity) => <Badge key={activity.economicActivityCode} variant="outline">{activity.economicActivityCode} · {activity.description ?? 'Sin descripción'}{activity.isPrimary ? ' · Principal' : ''}</Badge>)}</div>
          </article>
        ))}</div>}
      </section>

      {preparation.existingPrimaryDocument && <section className={`${styles.card} ${styles.section} ${styles.sectionGap}`}><h2>Documento fiscal existente</h2><dl className={styles.details}>
        <div><dt>Número interno</dt><dd>{preparation.existingPrimaryDocument.internalNumber}</dd></div><div><dt>Estado</dt><dd>{preparation.existingPrimaryDocument.lifecycleStatus}</dd></div><div><dt>Tipo</dt><dd>{preparation.existingPrimaryDocument.documentTypeCode}</dd></div>
      </dl></section>}

      {blockingIssues.length > 0 && <section className={`${styles.card} ${styles.section} ${styles.sectionGap}`}><h2>Problemas que requieren corrección</h2><div className={styles.issueList}>{blockingIssues.map((issue, index) => <Issue key={`${issue.code}-${issue.lineId ?? index}`} issue={issue} />)}</div></section>}
      {informationalIssues.length > 0 && <section className={`${styles.card} ${styles.section} ${styles.sectionGap}`}><h2>Información pendiente</h2><div className={styles.issueList}>{informationalIssues.map((issue, index) => <Issue key={`${issue.code}-${index}`} issue={issue} />)}</div></section>}
      {preparation.canCreateDraft && <div className={styles.readiness}>La orden está lista para preparar el borrador fiscal.</div>}
      {preparation.commercialObservations && <section className={`${styles.card} ${styles.section}`}><h2>Observaciones comerciales</h2><p className={styles.muted}>{preparation.commercialObservations}</p></section>}
    </div></main>
  );
}
