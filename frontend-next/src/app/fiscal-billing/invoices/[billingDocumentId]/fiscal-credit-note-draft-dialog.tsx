'use client';

import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  createFiscalCreditNoteDraft,
  FiscalBillingApiError,
  getBillingDocumentWorkspace,
  type BillingDocumentWorkspace,
  type FiscalCreditNoteDraft,
  type FiscalCreditNoteLineSelectionInput,
} from '@/lib/fiscal-billing-api';
import { formatFiscalMoney } from '@/lib/fiscal-money';
import { buildAgencyTotalAmountSelections, type AgencyCreditLineDraft } from './fiscal-credit-note-draft-validation';

type CreditNoteMode = 'FULL' | 'PARTIAL';
type LineDraft = AgencyCreditLineDraft;

type FiscalCreditNoteDraftDialogProps = {
  open: boolean;
  originalBillingDocumentId: string;
  currencyCode: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (draft: FiscalCreditNoteDraft) => void;
};

function blankLineDrafts(workspace: BillingDocumentWorkspace): Record<string, LineDraft> {
  return Object.fromEntries(workspace.lines.map((line) => [line.id, {
    selected: false,
    totalAmount: '',
  }]));
}

export function FiscalCreditNoteDraftDialog({
  open,
  originalBillingDocumentId,
  currencyCode,
  onOpenChange,
  onCreated,
}: FiscalCreditNoteDraftDialogProps) {
  const [mode, setMode] = useState<CreditNoteMode>('FULL');
  const [reasonDescription, setReasonDescription] = useState('');
  const [workspace, setWorkspace] = useState<BillingDocumentWorkspace | null>(null);
  const [lineDrafts, setLineDrafts] = useState<Record<string, LineDraft>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setMode('FULL');
    setReasonDescription('');
    setWorkspace(null);
    setLineDrafts({});
    setError(null);
    setReasonError(null);
    setLineErrors({});
    setLoading(true);
    void getBillingDocumentWorkspace(originalBillingDocumentId, controller.signal)
      .then((sourceWorkspace) => {
        if (controller.signal.aborted) return;
        setWorkspace(sourceWorkspace);
        setLineDrafts(blankLineDrafts(sourceWorkspace));
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar las líneas fiscales originales.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, originalBillingDocumentId]);

  function updateLine(lineId: string, update: Partial<LineDraft>) {
    setLineDrafts((current) => ({
      ...current,
      [lineId]: { ...(current[lineId] ?? { selected: false, totalAmount: '' }), ...update },
    }));
    setLineErrors((current) => {
      const { [lineId]: _removed, ...remaining } = current;
      return remaining;
    });
  }

  function partialSelections(): FiscalCreditNoteLineSelectionInput[] | null {
    const selection = buildAgencyTotalAmountSelections(lineDrafts);
    if (selection.kind === 'NO_SELECTION') {
      setError('Seleccione al menos una línea.');
      return null;
    }
    if (selection.kind === 'INVALID_LINES') {
      setLineErrors(selection.errors);
      return null;
    }
    return selection.lines;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const reason = reasonDescription.trim();
    if (!reason) {
      setReasonError('Ingrese el motivo de la nota de crédito.');
      return;
    }
    setReasonError(null);
    const lines = mode === 'PARTIAL' ? partialSelections() : undefined;
    if (mode === 'PARTIAL' && !lines) return;

    setSubmitting(true);
    setError(null);
    try {
      const draft = await createFiscalCreditNoteDraft({
        originalBillingDocumentId,
        referenceReasonCode: mode === 'FULL' ? '01' : '02',
        referenceReasonDescription: reason,
        fullDocument: mode === 'FULL',
        ...(lines ? { lines } : {}),
      });
      onOpenChange(false);
      onCreated(draft);
    } catch (requestError) {
      if (requestError instanceof FiscalBillingApiError && requestError.code === 'BILLING_CREDIT_NOTE_INPUT_INVALID' && mode === 'PARTIAL') {
        const amountError = 'El monto a acreditar no es válido para la línea seleccionada.';
        setLineErrors(Object.fromEntries(Object.entries(lineDrafts)
          .filter(([, draft]) => draft.selected)
          .map(([lineId]) => [lineId, amountError])));
        return;
      }
      setError(requestError instanceof Error ? requestError.message : 'No se pudo crear el borrador de la nota de crédito.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!submitting) onOpenChange(nextOpen); }}>
      <DialogContent className="max-w-3xl" showCloseButton={!submitting}>
        <DialogHeader>
          <DialogTitle>Crear nota de crédito</DialogTitle>
          <DialogDescription>
            El borrador referenciará este documento fiscal aceptado. Revíselo antes de solicitar su emisión electrónica.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={(event) => void submit(event)}>
          <fieldset className="grid gap-3">
            <legend className="text-sm font-medium">Tipo de nota de crédito</legend>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
              <input checked={mode === 'FULL'} disabled={submitting} name="credit-note-mode" type="radio" value="FULL" onChange={() => setMode('FULL')} />
              <span><strong className="block text-sm">Anulación total</strong><span className="text-sm text-muted-foreground">Acredita todas las líneas elegibles del documento original.</span></span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
              <input checked={mode === 'PARTIAL'} disabled={submitting} name="credit-note-mode" type="radio" value="PARTIAL" onChange={() => setMode('PARTIAL')} />
              <span><strong className="block text-sm">Corrección parcial</strong><span className="text-sm text-muted-foreground">Seleccione líneas e indique el monto final a acreditar por línea, con impuestos incluidos.</span></span>
            </label>
          </fieldset>

          <label className="grid gap-2 text-sm font-medium" htmlFor="credit-note-reason-description">
            Motivo
            <Textarea
              id="credit-note-reason-description"
              disabled={submitting}
              maxLength={500}
              placeholder="Describa el motivo de la nota de crédito"
              rows={3}
              value={reasonDescription}
              aria-invalid={Boolean(reasonError)}
              onChange={(event) => { setReasonDescription(event.target.value); setReasonError(null); }}
            />
            {reasonError ? <span className="text-sm text-destructive" role="alert">{reasonError}</span> : null}
          </label>

          {mode === 'PARTIAL' ? (
            <section className="space-y-3" aria-label="Líneas para corrección parcial">
              <div><h3 className="text-sm font-medium">Líneas a acreditar</h3><p className="text-sm text-muted-foreground">Los importes finales, impuestos y capacidad disponible los valida el backend.</p></div>
              {loading ? <p className="text-sm text-muted-foreground">Cargando líneas fiscales originales…</p> : null}
              {!loading && workspace?.lines.map((line) => {
                const draft = lineDrafts[line.id] ?? { selected: false, totalAmount: '' };
                return <article className="rounded-lg border border-border p-3" key={line.id}>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input checked={draft.selected} disabled={submitting} type="checkbox" onChange={(event) => updateLine(line.id, { selected: event.target.checked })} />
                    <span><strong className="block text-sm">{line.lineNumber}. {line.description}</strong><span className="text-sm text-muted-foreground">Total original: {formatFiscalMoney(line.lineTotal, currencyCode)}</span></span>
                  </label>
                  {draft.selected ? <label className="mt-3 grid gap-1 text-sm font-medium" htmlFor={`credit-value-${line.id}`}>
                    Monto a acreditar (impuestos incluidos)
                    <Input id={`credit-value-${line.id}`} inputMode="decimal" aria-invalid={Boolean(lineErrors[line.id])} disabled={submitting} value={draft.totalAmount} onChange={(event) => updateLine(line.id, { totalAmount: event.target.value })} />
                    {lineErrors[line.id] ? <span className="text-sm text-destructive" role="alert">{lineErrors[line.id]}</span> : null}
                  </label> : null}
                </article>;
              })}
              {!loading && workspace && workspace.lines.length === 0 ? <p className="text-sm text-muted-foreground">El documento original no contiene líneas disponibles.</p> : null}
            </section>
          ) : null}

          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <DialogFooter>
            <Button disabled={submitting} type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button disabled={submitting || loading || !workspace} type="submit">{submitting ? 'Creando borrador…' : 'Crear borrador'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
