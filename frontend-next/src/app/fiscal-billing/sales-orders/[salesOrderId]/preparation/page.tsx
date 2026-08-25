'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { LoadingSpinner } from '@/components/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/confirm-modal';
import { getHomeRouteForRole, getStoredSession } from '@/lib/auth-api';
import {
  createOrResumeBillingDraft,
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

const RECEIVER_TYPES=[['01','Cédula física'],['02','Cédula jurídica'],['03','DIMEX'],['04','NITE/NIT']] as const;
const PAYMENT_METHODS=[['01','Efectivo'],['02','Tarjeta'],['03','Cheque'],['04','Transferencia/depósito bancario'],['05','Recaudado por terceros'],['06','SINPE Móvil'],['07','Plataforma digital'],['99','Otros']] as const;
type DocumentType='01'|'04';type ReceiverType='01'|'02'|'03'|'04';

export default function FiscalPreparationPage() {
  const params = useParams<{ salesOrderId: string }>();
  const router=useRouter();
  const [authorized,setAuthorized]=useState(false);
  const [preparation, setPreparation] = useState<FiscalPreparation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FiscalBillingApiError | null>(null);
  const [reload, setReload] = useState(0);
  const [issuerId,setIssuerId]=useState('');const [documentType,setDocumentType]=useState<DocumentType>('01');
  const [receiverType,setReceiverType]=useState<ReceiverType|''>('');const [receiverNumber,setReceiverNumber]=useState('');
  const [paymentMethods,setPaymentMethods]=useState<string[]>(['04']);const [formError,setFormError]=useState('');
  const [confirming,setConfirming]=useState(false);const [saving,setSaving]=useState(false);const submitGuard=useRef(false);

  useEffect(()=>{const session=getStoredSession();if(!session?.user?.id){router.replace('/');return;}const role=String(session.user.role??'').toUpperCase();if(role!== 'ADMIN'&&role!=='FACTURACION_COBROS'){router.replace(getHomeRouteForRole(role));return;}setAuthorized(true);},[router]);

  useEffect(() => {
    if(!authorized)return;const controller = new AbortController();
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
  }, [authorized,params.salesOrderId, reload]);

  useEffect(()=>{if(preparation?.issuerChoices.length===1&&!issuerId)setIssuerId(preparation.issuerChoices[0].id);},[issuerId,preparation]);

  const togglePayment=(code:string)=>{setPaymentMethods(current=>current.includes(code)?current.filter(value=>value!==code):current.length<4?[...current,code]:current);};
  const validateForm=()=>{if(!issuerId)return 'Seleccione un emisor fiscal.';if(!preparation?.documentTypeChoices.some(choice=>choice.code===documentType))return 'Seleccione un tipo de documento admitido.';const normalizedReceiver=receiverNumber.trim(),hasType=receiverType!=='',hasNumber=normalizedReceiver!=='';if(documentType==='01'&&(!hasType||!hasNumber))return 'La factura electrónica requiere la identificación completa del receptor.';if(documentType==='04'&&hasType!==hasNumber)return 'Complete ambos campos de identificación o deje ambos vacíos.';if(hasNumber&&(!/^[0-9 -]+$/.test(normalizedReceiver)||normalizedReceiver.length>30))return 'Use únicamente dígitos, espacios o guiones en la identificación.';if(paymentMethods.length<1||paymentMethods.length>4||new Set(paymentMethods).size!==paymentMethods.length)return 'Seleccione entre uno y cuatro métodos de pago sin duplicados.';return '';};
  const requestConfirmation=()=>{const message=validateForm();setFormError(message);if(!message)setConfirming(true);};
  const createDraft=async()=>{if(submitGuard.current)return;const message=validateForm();if(message){setFormError(message);setConfirming(false);return;}submitGuard.current=true;setSaving(true);setFormError('');try{const identity=receiverType&&receiverNumber.trim()?{receiverIdentificationTypeCode:receiverType,receiverIdentificationNumber:receiverNumber.trim()}:{};const workspace=await createOrResumeBillingDraft(params.salesOrderId,{fiscalIssuerId:issuerId,documentTypeCode:documentType,...identity,paymentMethodCodes:paymentMethods});setConfirming(false);router.push(`/fiscal-billing/documents/${encodeURIComponent(workspace.id)}`);}catch(requestError){setConfirming(false);setFormError(requestError instanceof FiscalBillingApiError?requestError.message:'No se pudo crear el borrador fiscal.');}finally{submitGuard.current=false;setSaving(false);}};

  if (!authorized||loading) return <main className="app-shell"><div className={styles.state}><LoadingSpinner message="Validando la preparación fiscal…" /></div></main>;
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
      </dl><Button asChild><Link href={`/fiscal-billing/documents/${encodeURIComponent(preparation.existingPrimaryDocument.id)}`}>{preparation.nextAction==='RESUME'?'Continuar borrador':'Ver documento'}</Link></Button></section>}

      {blockingIssues.length > 0 && <section className={`${styles.card} ${styles.section} ${styles.sectionGap}`}><h2>Problemas que requieren corrección</h2><div className={styles.issueList}>{blockingIssues.map((issue, index) => <Issue key={`${issue.code}-${issue.lineId ?? index}`} issue={issue} />)}</div></section>}
      {informationalIssues.length > 0 && <section className={`${styles.card} ${styles.section} ${styles.sectionGap}`}><h2>Información pendiente</h2><div className={styles.issueList}>{informationalIssues.map((issue, index) => <Issue key={`${issue.code}-${index}`} issue={issue} />)}</div></section>}
      {preparation.canCreateDraft && <div className={styles.readiness}>La orden está lista para preparar el borrador fiscal.</div>}
      {preparation.nextAction==='CREATE'&&preparation.canCreateDraft&&!preparation.existingPrimaryDocument&&<section className={`${styles.card} ${styles.section} ${styles.sectionGap}`}><h2>Datos para el borrador fiscal</h2><div className={styles.formGrid}>
        <label><span>Emisor fiscal</span><select value={issuerId} onChange={event=>setIssuerId(event.target.value)}><option value="">Seleccione…</option>{preparation.issuerChoices.map(issuer=><option key={issuer.id} value={issuer.id}>{issuer.displayName} · {issuer.legalName}</option>)}</select></label>
        <label><span>Tipo de documento</span><select value={documentType} onChange={event=>{const value=event.target.value;if(value==='01'||value==='04')setDocumentType(value);}}>{preparation.documentTypeChoices.filter(choice=>choice.code==='01'||choice.code==='04').map(choice=><option key={choice.code} value={choice.code}>{choice.code} · {choice.label}</option>)}</select></label>
        <label><span>Tipo de identificación del receptor</span><select value={receiverType} onChange={event=>setReceiverType(event.target.value as ReceiverType|'')}><option value="">Sin identificación</option>{RECEIVER_TYPES.map(([code,label])=><option key={code} value={code}>{code} · {label}</option>)}</select></label>
        <label><span>Número de identificación</span><input value={receiverNumber} onChange={event=>setReceiverNumber(event.target.value)} placeholder="Dígitos, espacios o guiones" /></label>
      </div><fieldset className={styles.paymentFieldset}><legend>Métodos de pago (1–4)</legend><div className={styles.checkGrid}>{PAYMENT_METHODS.map(([code,label])=><label key={code}><input type="checkbox" checked={paymentMethods.includes(code)} onChange={()=>togglePayment(code)} disabled={!paymentMethods.includes(code)&&paymentMethods.length>=4}/><span>{code} · {label}</span></label>)}</div></fieldset>
      {formError&&<div className={`${styles.issue} ${styles.issueBlocking}`} role="alert">{formError}</div>}<Button type="button" disabled={saving} onClick={requestConfirmation}>{saving?'Creando borrador…':'Crear borrador fiscal'}</Button></section>}
      {preparation.commercialObservations && <section className={`${styles.card} ${styles.section}`}><h2>Observaciones comerciales</h2><p className={styles.muted}>{preparation.commercialObservations}</p></section>}
    </div><ConfirmModal isOpen={confirming} title="Crear borrador fiscal" confirmText="Crear borrador" isLoading={saving} onCancel={()=>{if(!saving)setConfirming(false);}} onConfirm={()=>void createDraft()} message={<div><p>Se creará un snapshot fiscal persistido con los valores de la orden de venta.</p><p>Esta acción todavía no emite el documento ni consume un consecutivo. La emisión se realizará posteriormente desde el workspace.</p></div>}/></main>
  );
}
