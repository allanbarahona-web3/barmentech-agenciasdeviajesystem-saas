import type { FiscalCreditNoteLineSelectionInput } from '@/lib/fiscal-billing-api';

export type AgencyCreditLineDraft = {
  selected: boolean;
  totalAmount: string;
};

export type AgencyTotalAmountSelectionResult =
  | { kind: 'NO_SELECTION' }
  | { kind: 'INVALID_LINES'; errors: Record<string, string> }
  | { kind: 'VALID'; lines: FiscalCreditNoteLineSelectionInput[] };

export function totalAmountValidation(value: string): string | null {
  const amount = value.trim();
  if (!amount) return 'Ingrese el monto a acreditar.';
  if (amount.startsWith('-') || /^0(?:\.0+)?$/.test(amount)) return 'El monto a acreditar debe ser mayor que cero.';
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount) || amount.split('.')[1]?.length > 5) {
    return 'Ingrese un monto válido de hasta cinco decimales.';
  }
  return null;
}

export function buildAgencyTotalAmountSelections(
  lineDrafts: Record<string, AgencyCreditLineDraft>,
): AgencyTotalAmountSelectionResult {
  const selected = Object.entries(lineDrafts).filter(([, draft]) => draft.selected);
  if (selected.length === 0) return { kind: 'NO_SELECTION' };

  const errors: Record<string, string> = {};
  const lines = selected.map(([sourceBillingDocumentLineId, draft]) => {
    const totalAmount = draft.totalAmount.trim();
    const error = totalAmountValidation(totalAmount);
    if (error) errors[sourceBillingDocumentLineId] = error;
    return { sourceBillingDocumentLineId, creditedTotalAmount: totalAmount };
  });
  return Object.keys(errors).length > 0 ? { kind: 'INVALID_LINES', errors } : { kind: 'VALID', lines };
}
