'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingModal } from '@/components/loading-modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/patterns/form-field';
import { FormSheet } from '@/components/patterns/form-sheet';
import { formatFinanceMoneyDisplay } from '@/lib/finance-money-display';
import { FINANCE_PAYMENT_METHOD_OPTIONS, type FinancePaymentMethod } from '@/lib/finance-payment-methods';
import {
  acceptReportedInvoicePaymentDestinationOverride,
  attachReportedInvoicePaymentEvidence,
  extractReportedInvoicePaymentEvidence,
  getCustomerPaymentSettlementPreview,
  listCustomerInvoicePaymentTargets,
  submitReportedContractPayment,
  submitReportedInvoicePayment,
  type CustomerContractPaymentTarget,
  type CustomerElectronicInvoice,
  type CustomerInvoicePaymentTarget,
  type CustomerPaymentSettlementPreview,
  type FinanceCurrency,
  type FinancePaymentEvidenceExtraction,
  type PaymentDestinationValidation,
} from '@/lib/finance-api';

type PaymentForm = {
  receivedCurrencyCode: FinanceCurrency | '';
  amount: string;
  paymentMethod: FinancePaymentMethod;
  paymentDate: string;
  reference: string;
  payerName: string;
  notes: string;
};

type PendingDestinationOverride = {
  paymentId: string;
  evidenceId: string;
  validation: PaymentDestinationValidation;
};

type FxUiState = 'not_required' | 'insufficient_input' | 'loading' | 'available' | 'unavailable' | 'error';

type Props = {
  customerId: string;
  open: boolean;
  preselectedInvoice: CustomerElectronicInvoice | null;
  contractTarget?: CustomerContractPaymentTarget | null;
  currencies: FinanceCurrency[];
  onOpenChange: (open: boolean) => void;
  onSubmitted: (input: { paymentId: string; evidenceAttached: boolean; destinationOverrideAccepted?: boolean }) => void;
};

const EMPTY_FORM: PaymentForm = {
  receivedCurrencyCode: '', amount: '', paymentMethod: 'BANK_TRANSFER', paymentDate: '', reference: '', payerName: '', notes: '',
};

export function CustomerInvoicePaymentIntakeSheet({ customerId, open, preselectedInvoice, contractTarget = null, currencies, onOpenChange, onSubmitted }: Props) {
  const [form, setForm] = useState<PaymentForm>(EMPTY_FORM);
  const [applicationCurrencyCode, setApplicationCurrencyCode] = useState<FinanceCurrency | ''>('');
  const [targets, setTargets] = useState<CustomerInvoicePaymentTarget[]>([]);
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [extractionDetails, setExtractionDetails] = useState<FinancePaymentEvidenceExtraction['extractedData'] | null>(null);
  const [destinationValidation, setDestinationValidation] = useState<PaymentDestinationValidation | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [settlementPreview, setSettlementPreview] = useState<CustomerPaymentSettlementPreview | null>(null);
  const [settlementPreviewKey, setSettlementPreviewKey] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingEvidencePaymentId, setPendingEvidencePaymentId] = useState<string | null>(null);
  const [pendingDestinationOverride, setPendingDestinationOverride] = useState<PendingDestinationOverride | null>(null);
  const [overrideDialogStage, setOverrideDialogStage] = useState<'FIRST' | 'SECOND' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const preselectedReceivableId = preselectedInvoice?.financialDetail?.type === 'ACCOUNT_RECEIVABLE'
    ? preselectedInvoice.financialDetail.accountReceivableId : null;
  const contractMode = contractTarget !== null;
  const receivedCurrencyOptions = useMemo(() => Array.from(new Set<FinanceCurrency>([...currencies, 'CRC', 'USD'])), [currencies]);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setApplicationCurrencyCode(contractTarget?.currencyCode ?? preselectedInvoice?.currencyCode ?? (currencies.length === 1 ? currencies[0]! : ''));
    setAllocations(contractTarget ? { [contractTarget.commercialObligationId]: '' } : {}); setEvidenceFile(null); setExtractionDetails(null); setDestinationValidation(null); setExtractionError(null);
    setSettlementPreview(null); setSettlementPreviewKey(null); setPreviewError(null); setSubmitError(null); setPendingEvidencePaymentId(null);
    setPendingDestinationOverride(null); setOverrideDialogStage(null); setTargets([]); setTargetError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [contractTarget, currencies, open, preselectedInvoice?.billingDocumentId, preselectedInvoice?.currencyCode]);

  useEffect(() => {
    if (!open || !applicationCurrencyCode || contractMode) { setTargets([]); return; }
    const controller = new AbortController();
    setTargetLoading(true); setTargetError(null);
    void listCustomerInvoicePaymentTargets(customerId, applicationCurrencyCode, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setTargets(result.targets);
        if (preselectedReceivableId && result.targets.some((target) => target.accountReceivableId === preselectedReceivableId)) {
          setAllocations((current) => current[preselectedReceivableId] === undefined ? { ...current, [preselectedReceivableId]: '' } : current);
        }
      })
      .catch((error) => { if (!controller.signal.aborted) setTargetError(error instanceof Error ? error.message : 'No se pudieron cargar las facturas disponibles.'); })
      .finally(() => { if (!controller.signal.aborted) setTargetLoading(false); });
    return () => controller.abort();
  }, [applicationCurrencyCode, contractMode, customerId, open, preselectedReceivableId]);

  const selectedTargets = useMemo(() => targets.filter((target) => Object.prototype.hasOwnProperty.call(allocations, target.accountReceivableId)), [allocations, targets]);
  const totalUnits = decimalUnits(form.amount);
  const crossCurrency = Boolean(form.receivedCurrencyCode && applicationCurrencyCode && form.receivedCurrencyCode !== applicationCurrencyCode);
  const fxLookupKey = crossCurrency && open && form.receivedCurrencyCode && applicationCurrencyCode && totalUnits !== null && totalUnits > ZERO
    ? `${form.receivedCurrencyCode}:${applicationCurrencyCode}:${form.amount.trim()}:${form.paymentDate}`
    : null;

  useEffect(() => {
    if (!fxLookupKey || !form.receivedCurrencyCode || !applicationCurrencyCode) {
      setSettlementPreview(null); setSettlementPreviewKey(null); setPreviewError(null); setPreviewLoading(false); return;
    }
    const controller = new AbortController();
    setSettlementPreview(null); setSettlementPreviewKey(null); setPreviewLoading(true); setPreviewError(null);
    void getCustomerPaymentSettlementPreview(customerId, {
      receivedCurrencyCode: form.receivedCurrencyCode, settlementCurrencyCode: applicationCurrencyCode, receivedAmount: form.amount.trim(),
    }, controller.signal)
      .then((preview) => { if (!controller.signal.aborted) { setSettlementPreview(preview); setSettlementPreviewKey(fxLookupKey); } })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setSettlementPreview(null);
          setSettlementPreviewKey(fxLookupKey);
          setPreviewError(error instanceof Error ? error.message : 'No se pudo obtener el equivalente para aplicar.');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setPreviewLoading(false); });
    return () => controller.abort();
  }, [applicationCurrencyCode, customerId, form.amount, form.receivedCurrencyCode, fxLookupKey]);

  const fxUiState: FxUiState = !crossCurrency
    ? 'not_required'
    : !fxLookupKey
      ? 'insufficient_input'
      : settlementPreviewKey !== fxLookupKey || previewLoading
        ? 'loading'
        : previewError
          ? 'error'
          : settlementPreview?.status === 'AVAILABLE' && settlementPreview.settlementAmount
            ? 'available'
            : settlementPreview?.status === 'MISSING'
              ? 'unavailable'
              : 'error';
  const previewAvailable = fxUiState === 'not_required' || fxUiState === 'available';
  const allocationBudgetUnits = crossCurrency
    ? fxUiState === 'available' ? decimalUnits(settlementPreview?.settlementAmount ?? '') : null
    : totalUnits;
  const invoiceAllocationUnits = selectedTargets.reduce<bigint | null>((total, target) => {
    const value = decimalUnits(allocations[target.accountReceivableId] ?? '');
    return total === null || value === null ? null : total + value;
  }, ZERO);
  const allocationUnits = contractTarget
    ? decimalUnits(allocations[contractTarget.commercialObligationId] ?? '')
    : invoiceAllocationUnits;
  const contractOutstandingUnits = contractTarget ? decimalUnits(contractTarget.outstandingAmount) : null;
  const remainingUnits = allocationBudgetUnits !== null && allocationUnits !== null ? allocationBudgetUnits - allocationUnits : null;
  const allocationsExceedPayment = remainingUnits !== null && remainingUnits < ZERO;
  const hasUnassignedSelection = contractTarget
    ? (allocationUnits ?? ZERO) <= ZERO
    : selectedTargets.some((target) => (decimalUnits(allocations[target.accountReceivableId] ?? '') ?? ZERO) <= ZERO);
  const contractAmountExceedsOutstanding = Boolean(contractTarget && allocationUnits !== null && contractOutstandingUnits !== null && allocationUnits > contractOutstandingUnits);
  const paymentAlreadyCreated = Boolean(pendingEvidencePaymentId || pendingDestinationOverride);
  const canSubmit = !submitting && !paymentAlreadyCreated && Boolean(form.receivedCurrencyCode) && Boolean(applicationCurrencyCode) && totalUnits !== null && totalUnits > ZERO && (contractTarget ? allocationUnits !== null && !contractAmountExceedsOutstanding : selectedTargets.length > 0) && !hasUnassignedSelection && !allocationsExceedPayment && previewAvailable && !previewLoading;

  function updateForm<K extends keyof PaymentForm>(key: K, value: PaymentForm[K]) { setForm((current) => ({ ...current, [key]: value })); }
  function changeApplicationCurrency(currencyCode: FinanceCurrency | '') { if (contractMode) return; setApplicationCurrencyCode(currencyCode); setAllocations({}); setTargets([]); }
  function toggleTarget(target: CustomerInvoicePaymentTarget) {
    setAllocations((current) => {
      if (Object.prototype.hasOwnProperty.call(current, target.accountReceivableId)) {
        const { [target.accountReceivableId]: _, ...rest } = current;
        return rest;
      }
      return { ...current, [target.accountReceivableId]: '' };
    });
  }

  async function selectEvidence(file: File | null) {
    setEvidenceFile(file); setExtractionDetails(null); setDestinationValidation(null); setExtractionError(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) { setExtractionError('El comprobante se adjuntará después del envío. La extracción con IA está disponible para imágenes.'); return; }
    setExtracting(true);
    try {
      const extraction = await extractReportedInvoicePaymentEvidence(customerId, file);
      const data = extraction.extractedData;
      setExtractionDetails(data); setDestinationValidation(extraction.destinationValidation);
      setForm((current) => ({
        ...current, amount: current.amount || decimalText(data.amount), receivedCurrencyCode: current.receivedCurrencyCode || supportedCurrency(data.currency),
        paymentDate: current.paymentDate || validDate(data.date), reference: current.reference || data.reference || '', payerName: current.payerName || data.payerName || '', notes: current.notes || data.notes || '',
      }));
    } catch { setExtractionError('No se pudo extraer la información del comprobante. Puede completar el pago manualmente.'); }
    finally { setExtracting(false); }
  }

  async function submit() {
    if (!canSubmit || !form.receivedCurrencyCode || !applicationCurrencyCode) return;
    setSubmitting(true); setSubmitError(null);
    try {
      const payment = contractTarget
        ? await submitReportedContractPayment(customerId, {
            contractId: contractTarget.contractId, commercialObligationId: contractTarget.commercialObligationId,
            intendedAmount: allocations[contractTarget.commercialObligationId]!.trim(),
            currencyCode: form.receivedCurrencyCode, amount: form.amount.trim(), paymentMethod: form.paymentMethod,
            paymentDate: form.paymentDate || undefined, reference: emptyToUndefined(form.reference), payerName: emptyToUndefined(form.payerName), notes: emptyToUndefined(form.notes),
          })
        : await submitReportedInvoicePayment(customerId, {
            currencyCode: form.receivedCurrencyCode, amount: form.amount.trim(), paymentMethod: form.paymentMethod,
            paymentDate: form.paymentDate || undefined, reference: emptyToUndefined(form.reference), payerName: emptyToUndefined(form.payerName), notes: emptyToUndefined(form.notes),
            targets: selectedTargets.map((target) => ({ accountReceivableId: target.accountReceivableId, intendedAmount: allocations[target.accountReceivableId]!.trim() })),
          });
      if (!evidenceFile) { completeSubmission(payment.paymentId, false); return; }
      await attachEvidenceAndContinue(payment.paymentId);
    } catch (error) { setSubmitError(error instanceof Error ? error.message : 'No se pudo enviar el pago para verificación.'); }
    finally { setSubmitting(false); }
  }

  async function attachEvidenceAndContinue(paymentId: string) {
    if (!evidenceFile) return;
    try {
      const evidence = await attachReportedInvoicePaymentEvidence(customerId, paymentId, evidenceFile, evidenceExtractionMetadata(extractionDetails));
      const persistedValidation = evidence.extractionMetadata?.destinationValidation ?? destinationValidation;
      if (persistedValidation) setDestinationValidation(persistedValidation);
      if (requiresDestinationOverride(persistedValidation)) {
        setPendingDestinationOverride({ paymentId, evidenceId: evidence.id, validation: persistedValidation });
        setOverrideDialogStage('FIRST');
        return;
      }
      completeSubmission(paymentId, true);
    } catch (error) {
      setPendingEvidencePaymentId(paymentId);
      const reason = error instanceof Error && error.message ? ` (${error.message})` : '';
      setSubmitError(`Pago enviado para verificación con ID ${paymentId}, pero no se pudo adjuntar el comprobante${reason}. Puede reintentar el adjunto sin registrar otro pago.`);
    }
  }

  async function retryEvidence() {
    if (!pendingEvidencePaymentId || !evidenceFile) return;
    setSubmitting(true); setSubmitError(null);
    try { await attachEvidenceAndContinue(pendingEvidencePaymentId); } finally { setSubmitting(false); }
  }

  async function acceptDestinationOverride() {
    if (!pendingDestinationOverride) return;
    setSubmitting(true); setSubmitError(null);
    try {
      const validation = await acceptReportedInvoicePaymentDestinationOverride(customerId, pendingDestinationOverride.paymentId, pendingDestinationOverride.evidenceId);
      setDestinationValidation(validation);
      setPendingDestinationOverride({ ...pendingDestinationOverride, validation });
      setOverrideDialogStage(null);
      completeSubmission(pendingDestinationOverride.paymentId, true, true);
    } catch {
      setOverrideDialogStage(null);
      setSubmitError(`El pago ${pendingDestinationOverride.paymentId} ya fue enviado, pero no se pudo registrar la excepción de destino. Reintente sin registrar otro pago.`);
    } finally { setSubmitting(false); }
  }

  function completeSubmission(paymentId: string, evidenceAttached: boolean, destinationOverrideAccepted = false) {
    onSubmitted({ paymentId, evidenceAttached, destinationOverrideAccepted });
    onOpenChange(false);
  }

  const activeValidation = pendingDestinationOverride?.validation ?? destinationValidation;
  const actionLabel = pendingEvidencePaymentId ? 'Reintentar adjunto' : pendingDestinationOverride ? 'Revisar excepción' : 'Enviar para verificación';

  return <>
    <FormSheet open={open} onOpenChange={onOpenChange} title="Registrar pago" description="El pago se enviará para verificación. Los saldos no cambian hasta que Administración o Facturación lo valide." contentClassName="space-y-5" actions={<><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button><Button type="button" onClick={() => void (pendingEvidencePaymentId ? retryEvidence() : pendingDestinationOverride ? setOverrideDialogStage('FIRST') : submit())} disabled={pendingEvidencePaymentId ? submitting || !evidenceFile : pendingDestinationOverride ? submitting : !canSubmit}>{submitting ? 'Enviando…' : actionLabel}</Button></>}>
      {submitError ? <Alert variant={paymentAlreadyCreated ? 'warning' : 'destructive'}><AlertTitle>{paymentAlreadyCreated ? 'Pago enviado; acción pendiente' : 'No se pudo enviar el pago'}</AlertTitle><AlertDescription>{submitError}</AlertDescription></Alert> : null}
      {pendingDestinationOverride && !overrideDialogStage ? <Badge variant="destructive">Cuenta destino no verificada · excepción pendiente</Badge> : null}
      {contractTarget ? <section className="rounded-lg border border-border bg-muted/30 p-4" aria-label="Contrato seleccionado">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-foreground">Contrato {contractTarget.contractNumber}</p><p className="mt-1 text-xs text-muted-foreground">{contractTarget.travelName}</p></div><Badge variant="outline">Destino fijo</Badge></div>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><span className="text-muted-foreground">Moneda de aplicación: <strong className="text-foreground">{contractTarget.currencyCode}</strong></span><span className="text-muted-foreground">Estado: <strong className="text-foreground">{contractTarget.status}</strong></span><span className="text-muted-foreground">Monto original: <strong className="text-foreground">{formatFinanceMoneyDisplay(contractTarget.originalAmount, contractTarget.currencyCode)}</strong></span><span className="text-muted-foreground">Pagado: <strong className="text-foreground">{formatFinanceMoneyDisplay(contractTarget.paidAmount, contractTarget.currencyCode)}</strong></span><span className="text-muted-foreground">Saldo pendiente: <strong className="text-foreground">{formatFinanceMoneyDisplay(contractTarget.outstandingAmount, contractTarget.currencyCode)}</strong></span></div>
      </section> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="invoice-payment-received-currency" label="Moneda recibida" required><Select id="invoice-payment-received-currency" value={form.receivedCurrencyCode} onChange={(event) => updateForm('receivedCurrencyCode', event.target.value as FinanceCurrency | '')} disabled={paymentAlreadyCreated || extracting}><option value="">Seleccione moneda</option>{receivedCurrencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</Select></FormField>
        {contractTarget ? <FormField htmlFor="contract-payment-intended-amount" label={`Monto a aplicar (${contractTarget.currencyCode})`} required><Input id="contract-payment-intended-amount" inputMode="decimal" placeholder="0.00" value={allocations[contractTarget.commercialObligationId] ?? ''} onChange={(event) => setAllocations({ [contractTarget.commercialObligationId]: event.target.value })} disabled={paymentAlreadyCreated} />{contractAmountExceedsOutstanding ? <p className="mt-1 text-xs text-destructive">El monto a aplicar no puede superar el saldo pendiente del contrato.</p> : null}</FormField> : <FormField htmlFor="invoice-payment-application-currency" label="Moneda de aplicación" required><Select id="invoice-payment-application-currency" value={applicationCurrencyCode} onChange={(event) => changeApplicationCurrency(event.target.value as FinanceCurrency | '')} disabled={paymentAlreadyCreated || extracting}><option value="">Seleccione moneda</option>{currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</Select></FormField>}
        <FormField htmlFor="invoice-payment-amount" label="Monto recibido" required><Input id="invoice-payment-amount" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={(event) => updateForm('amount', event.target.value)} disabled={paymentAlreadyCreated} /></FormField>
        <FormField htmlFor="invoice-payment-method" label="Método de pago"><Select id="invoice-payment-method" value={form.paymentMethod} onChange={(event) => updateForm('paymentMethod', event.target.value as FinancePaymentMethod)} disabled={paymentAlreadyCreated}>{FINANCE_PAYMENT_METHOD_OPTIONS.map((option) => <option key={option.token} value={option.token}>{option.label}</option>)}</Select></FormField>
        <FormField htmlFor="invoice-payment-date" label="Fecha de pago"><Input id="invoice-payment-date" type="date" value={form.paymentDate} onChange={(event) => updateForm('paymentDate', event.target.value)} disabled={paymentAlreadyCreated} /></FormField>
        <FormField htmlFor="invoice-payment-reference" label="Referencia"><Input id="invoice-payment-reference" value={form.reference} onChange={(event) => updateForm('reference', event.target.value)} disabled={paymentAlreadyCreated} /></FormField>
        <FormField htmlFor="invoice-payment-payer" label="Nombre de quien paga"><Input id="invoice-payment-payer" value={form.payerName} onChange={(event) => updateForm('payerName', event.target.value)} disabled={paymentAlreadyCreated} /></FormField>
      </div>
      <FormField htmlFor="invoice-payment-notes" label="Notas"><Textarea id="invoice-payment-notes" rows={3} value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} disabled={paymentAlreadyCreated} /></FormField>
      {crossCurrency ? <SettlementPreviewPanel preview={settlementPreview} state={fxUiState} error={previewError} /> : null}
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
        <FormField htmlFor="invoice-payment-evidence" label="Comprobante de pago"><Input ref={fileInputRef} id="invoice-payment-evidence" type="file" accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf" onChange={(event) => void selectEvidence(event.target.files?.[0] ?? null)} disabled={paymentAlreadyCreated || extracting} /></FormField>
        {evidenceFile ? <p className="mt-2 text-xs text-muted-foreground">{evidenceFile.name} · se adjuntará al pago después de enviarlo.</p> : null}
        {extractionError ? <p className="mt-2 text-sm text-warning">{extractionError}</p> : null}
        {extractionDetails ? <div className="mt-3 rounded-md border border-border bg-card p-3 text-xs text-muted-foreground"><p className="font-medium text-foreground">Datos detectados — revíselos antes de enviar</p><div className="mt-2 grid gap-1 sm:grid-cols-2">{extractionDetails.originBank ? <span>Banco origen: {extractionDetails.originBank}</span> : null}{extractionDetails.destinationBank ? <span>Banco destino: {extractionDetails.destinationBank}</span> : null}{extractionDetails.destinationAccount ? <span>Cuenta destino: {maskIdentifier(extractionDetails.destinationAccount)}</span> : null}{extractionDetails.paymentCode ? <span>Código: {extractionDetails.paymentCode}</span> : null}{extractionDetails.confidence !== undefined ? <span>Confianza: {String(extractionDetails.confidence)}</span> : null}</div></div> : null}
        {activeValidation ? <DestinationValidationAlert validation={activeValidation} /> : null}
      </div>
      {!contractTarget ? <div className="space-y-3">
        <div><h3 className="text-sm font-semibold text-foreground">Facturas a proponer</h3><p className="mt-1 text-xs text-muted-foreground">Seleccione una o varias facturas abiertas en la moneda de aplicación. La propuesta se valida nuevamente durante la revisión.</p></div>
        {targetLoading ? <p className="text-sm text-muted-foreground">Cargando facturas disponibles…</p> : null}
        {targetError ? <Alert variant="destructive"><AlertDescription>{targetError}</AlertDescription></Alert> : null}
        {!targetLoading && !targetError && applicationCurrencyCode && targets.length === 0 ? <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">No hay facturas abiertas en {applicationCurrencyCode}.</p> : null}
        {!targetLoading && targets.map((target) => {
          const selected = Object.prototype.hasOwnProperty.call(allocations, target.accountReceivableId);
          return <div key={target.accountReceivableId} className="rounded-lg border border-border bg-card p-3"><div className="flex items-start gap-3"><input aria-label={`Seleccionar ${target.reference}`} type="checkbox" checked={selected} onChange={() => toggleTarget(target)} disabled={paymentAlreadyCreated} className="mt-1 size-4 accent-primary" /><div className="min-w-0 flex-1"><p className="font-medium text-foreground">{target.reference}</p><p className="mt-1 text-xs text-muted-foreground">{target.issuedAt ? new Date(target.issuedAt).toLocaleDateString('es-CR') : 'Fecha no disponible'} · {target.currencyCode}</p><div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-3"><span>Original: {formatFinanceMoneyDisplay(target.originalAmount, target.currencyCode)}</span><span>Aplicado: {formatFinanceMoneyDisplay(target.appliedAmount, target.currencyCode)}</span><span>Saldo: {formatFinanceMoneyDisplay(target.outstandingAmount, target.currencyCode)}</span></div></div>{selected ? <div className="w-32"><Input aria-label={`Monto para ${target.reference}`} inputMode="decimal" placeholder="0.00" value={allocations[target.accountReceivableId] ?? ''} onChange={(event) => setAllocations((current) => ({ ...current, [target.accountReceivableId]: event.target.value }))} disabled={paymentAlreadyCreated} /></div> : null}</div></div>;
        })}
      </div> : null}
      {form.receivedCurrencyCode && applicationCurrencyCode ? <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm"><div className="flex justify-between gap-3"><span className="text-muted-foreground">Monto recibido</span><strong>{displayUnits(totalUnits, form.receivedCurrencyCode)}</strong></div><div className="mt-2 flex justify-between gap-3"><span className="text-muted-foreground">Total propuesto</span><strong>{displayUnits(allocationUnits, applicationCurrencyCode)}</strong></div><div className="mt-2 flex justify-between gap-3"><span className="text-muted-foreground">{crossCurrency ? 'Equivalente sin asignar' : 'Sin asignar'}</span><strong className={allocationsExceedPayment ? 'text-destructive' : ''}>{displayUnits(remainingUnits, applicationCurrencyCode)}</strong></div>{allocationsExceedPayment ? <p className="mt-3 text-xs text-destructive">La propuesta no puede superar el monto disponible para aplicar.</p> : null}{hasUnassignedSelection ? <p className="mt-3 text-xs text-destructive">{contractTarget ? 'Indique un monto mayor que cero para aplicar al contrato.' : 'Asigne un monto mayor que cero a cada factura seleccionada.'}</p> : null}</div> : null}
    </FormSheet>
    <LoadingModal isOpen={extracting} state="loading" loadingMessage="Analizando comprobante…" successMessage="" errorMessage="" onClose={() => undefined} />
    <ConfirmDialog open={overrideDialogStage === 'FIRST'} onOpenChange={(nextOpen) => { if (!nextOpen) setOverrideDialogStage((current) => current === 'FIRST' ? null : current); }} title="Cuenta destino no registrada" description="La cuenta o SINPE detectado no coincide con una cuenta activa registrada. Detenga la operación si el comprobante requiere corrección." cancelLabel="Detener operación" confirmLabel="Continuar" variant="destructive" onConfirm={() => setOverrideDialogStage('SECOND')} />
    <ConfirmDialog open={overrideDialogStage === 'SECOND'} onOpenChange={(nextOpen) => { if (!nextOpen && !submitting) setOverrideDialogStage(null); }} title="Confirmar excepción de destino" description="Confirmo que deseo registrar este pago aunque la cuenta o SINPE destino no coincide con una cuenta registrada en el sistema." cancelLabel="Cancelar" confirmLabel="Confirmar y continuar" variant="destructive" isPending={submitting} onConfirm={() => void acceptDestinationOverride()} />
  </>;
}

export function CustomerContractPaymentIntakeSheet(props: Omit<Props, 'preselectedInvoice' | 'contractTarget' | 'currencies'> & { contractTarget: CustomerContractPaymentTarget }) {
  return <CustomerInvoicePaymentIntakeSheet {...props} preselectedInvoice={null} contractTarget={props.contractTarget} currencies={[props.contractTarget.currencyCode]} />;
}

function SettlementPreviewPanel({ preview, state, error }: { preview: CustomerPaymentSettlementPreview | null; state: FxUiState; error: string | null }) {
  if (state === 'not_required' || state === 'insufficient_input') return null;
  if (state === 'loading') return <p className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">Consultando equivalente de aplicación…</p>;
  if (state === 'error') return <Alert variant="warning"><AlertTitle>No se pudo consultar el tipo de cambio</AlertTitle><AlertDescription>{error ?? 'No se pudo obtener el equivalente para aplicar.'}</AlertDescription></Alert>;
  if (state === 'unavailable') return <Alert variant="warning"><AlertTitle>Tipo de cambio del día no disponible</AlertTitle><AlertDescription>No es posible enviar este pago cruzado hasta que Finance tenga un tipo de cambio diario válido.</AlertDescription></Alert>;
  if (!preview || !preview.settlementAmount) return null;
  return <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm"><p className="font-semibold text-foreground">Vista previa de aplicación</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><span className="text-muted-foreground">Monto recibido: <strong className="text-foreground">{formatFinanceMoneyDisplay(preview.receivedAmount, preview.receivedCurrencyCode)}</strong></span><span className="text-muted-foreground">Moneda de aplicación: <strong className="text-foreground">{preview.settlementCurrencyCode}</strong></span><span className="text-muted-foreground">Tipo de cambio: <strong className="text-foreground">{preview.exchangeRate ?? '—'}</strong></span><span className="text-muted-foreground">Fuente: <strong className="text-foreground">{preview.exchangeRateSource ?? '—'}</strong></span><span className="text-muted-foreground">Fecha efectiva: <strong className="text-foreground">{preview.exchangeRateEffectiveDate ? new Date(`${preview.exchangeRateEffectiveDate}T00:00:00`).toLocaleDateString('es-CR') : '—'}</strong></span><span className="text-muted-foreground">Equivalente disponible para aplicar: <strong className="text-foreground">{formatFinanceMoneyDisplay(preview.settlementAmount, preview.settlementCurrencyCode)}</strong></span></div><p className="mt-3 text-xs text-muted-foreground">La conversión definitiva se confirma durante la verificación del pago.</p></div>;
}

function DestinationValidationAlert({ validation }: { validation: PaymentDestinationValidation }) {
  if (validation.status === 'MATCHED') return <Alert variant="success" className="mt-3"><AlertTitle>Cuenta destino verificada</AlertTitle><AlertDescription>{matchedAccountLabel(validation) ?? 'La cuenta o SINPE detectado coincide con una cuenta registrada para la agencia.'}</AlertDescription></Alert>;
  if (validation.status === 'UNKNOWN') return <Alert variant="warning" className="mt-3"><AlertTitle>Destino no identificado</AlertTitle><AlertDescription>No fue posible identificar una cuenta o SINPE destino.</AlertDescription></Alert>;
  const inactive = validation.reason === 'INACTIVE';
  return <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><Badge variant="destructive">{inactive ? 'Cuenta destino inactiva' : validation.status === 'AMBIGUOUS' ? 'Destino ambiguo' : 'Cuenta destino no verificada'}</Badge>{validation.overrideAccepted ? <span className="text-muted-foreground">Excepción aceptada y registrada.</span> : null}</div>;
}

function evidenceExtractionMetadata(extraction: FinancePaymentEvidenceExtraction['extractedData'] | null) {
  if (!extraction) return undefined;
  const metadata = {
    destinationAccount: optionalMetadataText(extraction.destinationAccount),
    destinationBank: optionalMetadataText(extraction.destinationBank),
    reference: optionalMetadataText(extraction.reference),
    paymentCode: optionalMetadataText(extraction.paymentCode),
    confidence: typeof extraction.confidence === 'number' && Number.isFinite(extraction.confidence) ? extraction.confidence : undefined,
  };
  return Object.values(metadata).some((value) => value !== undefined) ? metadata : undefined;
}

function requiresDestinationOverride(validation: PaymentDestinationValidation | null): validation is PaymentDestinationValidation { return validation?.status === 'UNMATCHED' || validation?.status === 'AMBIGUOUS'; }
function matchedAccountLabel(validation: PaymentDestinationValidation): string | null { const account = validation.matchedAccount; if (!account) return null; const identifier = account.maskedAccountNumber ?? account.maskedSinpeNumber; return `${account.bankName}${identifier ? ` · ${identifier}` : ''}`; }
function maskIdentifier(value: string): string { const compact = value.replace(/[\s-]/g, ''); return compact.length <= 4 ? '••••' : `••••${compact.slice(-4)}`; }
function optionalMetadataText(value: string | undefined): string | undefined { const normalized = value?.trim(); return normalized || undefined; }

const SCALE = BigInt(100_000);
const ZERO = BigInt(0);
function decimalUnits(value: string): bigint | null { const match = /^(\d+)(?:\.(\d{1,5}))?$/.exec(value.trim()); return match ? BigInt(match[1]) * SCALE + BigInt((match[2] ?? '').padEnd(5, '0')) : null; }
function displayUnits(value: bigint | null, currency: FinanceCurrency): string { if (value === null) return `${currency} —`; const sign = value < ZERO ? '-' : ''; const absolute = value < ZERO ? -value : value; return formatFinanceMoneyDisplay(`${sign}${absolute / SCALE}.${(absolute % SCALE).toString().padStart(5, '0')}`, currency); }
function decimalText(value: number | undefined): string { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? String(value) : ''; }
function supportedCurrency(value: string | undefined): FinanceCurrency | '' { return value === 'USD' || value === 'CRC' ? value : ''; }
function validDate(value: string | undefined): string { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''; }
function emptyToUndefined(value: string): string | undefined { return value.trim() || undefined; }
