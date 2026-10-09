import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildAgencyTotalAmountSelections,
  totalAmountValidation,
} from '../src/app/fiscal-billing/invoices/[billingDocumentId]/fiscal-credit-note-draft-validation.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const receivableGroups = read('../src/app/finance/accounts-receivable/receivable-groups.tsx');
const invoiceDetail = read('../src/app/fiscal-billing/invoices/[billingDocumentId]/page.tsx');
const dialog = read('../src/app/fiscal-billing/invoices/[billingDocumentId]/fiscal-credit-note-draft-dialog.tsx');
const validation = read('../src/app/fiscal-billing/invoices/[billingDocumentId]/fiscal-credit-note-draft-validation.ts');
const fiscalApi = read('../src/lib/fiscal-billing-api.ts');
const creditNoteService = read('../../backend/src/fiscal-billing/fiscal-credit-note-draft.service.ts');

test('Finance enables the modern NC entry only for write users and supported fiscal originals', () => {
  assert.match(receivableGroups, /source\.sourceDocumentType !== '01' && source\.sourceDocumentType !== '04'/);
  assert.match(receivableGroups, /canWrite && fiscalCreditNoteHref\(receivable\.source\)/);
  assert.match(receivableGroups, /\?createCreditNote=1/);
  assert.match(receivableGroups, /<Link href=\{fiscalCreditNoteHref\(receivable\.source\)!\}>Nota de crédito<\/Link>/);
  assert.doesNotMatch(receivableGroups, /Nota de crédito \(NC\) · Próximamente/);
});

test('Finance retains the disabled debit-note placeholder', () => {
  assert.match(receivableGroups, /<DropdownMenuItem disabled>Nota de débito \(ND\) · Próximamente<\/DropdownMenuItem>/);
});

test('accepted document detail gates credit-note creation by write role, acceptance, and original type', () => {
  assert.match(invoiceDetail, /const readOnlyViewer = customerScopedReadOnly \|\| viewerRole === 'OPERACIONES';/);
  assert.match(invoiceDetail, /!readOnlyViewer/);
  assert.match(invoiceDetail, /invoice\.lifecycleStatus === 'SUBMITTED'/);
  assert.match(invoiceDetail, /invoice\.taxAuthorityStatus === 'ACCEPTED'/);
  assert.match(invoiceDetail, /invoice\.documentTypeCode === '01' \|\| invoice\.documentTypeCode === '04'/);
  assert.match(invoiceDetail, /Crear nota de crédito/);
  assert.match(invoiceDetail, /createCreditNoteIntent = searchParams\.get\('createCreditNote'\) === '1'/);
});

test('credit-note form uses modern workspace line IDs and mode-specific backend payloads', () => {
  assert.match(dialog, /getBillingDocumentWorkspace\(originalBillingDocumentId, controller\.signal\)/);
  assert.match(validation, /sourceBillingDocumentLineId/);
  assert.match(dialog, /referenceReasonCode: mode === 'FULL' \? '01' : '02'/);
  assert.match(dialog, /fullDocument: mode === 'FULL'/);
  assert.match(validation, /creditedTotalAmount: totalAmount/);
  assert.match(dialog, /Anulación total/);
  assert.match(dialog, /Corrección parcial/);
  assert.doesNotMatch(dialog, /referenceReasonCode: '03'/);
});

test('agency partial-credit UI validates the final amount locally and always sends the tax-inclusive variant', () => {
  assert.equal(totalAmountValidation('25'), null);
  assert.deepEqual(buildAgencyTotalAmountSelections({}), { kind: 'NO_SELECTION' });
  assert.deepEqual(buildAgencyTotalAmountSelections({ 'line-1': { selected: true, totalAmount: '25' } }), {
    kind: 'VALID',
    lines: [{ sourceBillingDocumentLineId: 'line-1', creditedTotalAmount: '25' }],
  });
  assert.equal(totalAmountValidation(''), 'Ingrese el monto a acreditar.');
  assert.equal(totalAmountValidation('0'), 'El monto a acreditar debe ser mayor que cero.');
  assert.equal(totalAmountValidation('-25'), 'El monto a acreditar debe ser mayor que cero.');
  assert.match(dialog, /Ingrese el motivo de la nota de crédito\./);
  assert.match(dialog, /Seleccione al menos una línea\./);
  assert.match(dialog, /El monto a acreditar no es válido para la línea seleccionada\./);
  assert.match(dialog, /Monto a acreditar/);
  assert.doesNotMatch(dialog, /Tipo de crédito para la línea|Cantidad a acreditar|credit-kind-|GROSS_AMOUNT|QUANTITY/);
  assert.match(validation, /creditedTotalAmount: totalAmount/);
  assert.match(dialog, /buildAgencyTotalAmountSelections\(lineDrafts\)/);
  assert.doesNotMatch(validation, /creditedGrossAmount/);
  assert.doesNotMatch(dialog, /creditedGrossAmount|creditedQuantity/);
  assert.doesNotMatch(validation, /iva|tax|dividedBy|times\(/i);
});

test('backend quantity and generic gross-amount support remain available', () => {
  assert.match(creditNoteService, /const quantity = decimal\(selection\?\.creditedQuantity, 4\);/);
  assert.match(creditNoteService, /const grossAmount = decimal\(selection\?\.creditedGrossAmount, 5\);/);
  assert.match(creditNoteService, /const totalAmount = decimal\(selection\?\.creditedTotalAmount, 5\);/);
  assert.match(creditNoteService, /"QUANTITY" \| "GROSS_AMOUNT" \| "TOTAL_AMOUNT"/);
});

test('modern draft helper and success navigation do not use legacy credit-note APIs', () => {
  assert.match(fiscalApi, /export function createFiscalCreditNoteDraft/);
  assert.match(fiscalApi, /\/fiscal-billing\/credit-notes\/draft/);
  assert.match(invoiceDetail, /router\.push\(`\/fiscal-billing\/documents\/\$\{encodeURIComponent\(draft\.billingDocumentId\)\}`\)/);
  assert.doesNotMatch(dialog, /@\/lib\/billing-api|BillingCreditNote|createBillingCreditNote/);
  assert.doesNotMatch(receivableGroups, /@\/lib\/billing-api|BillingCreditNote|createBillingCreditNote/);
});

test('modern client maps known credit-note domain validation failures to actionable Spanish messages', () => {
  for (const code of [
    'BILLING_CREDIT_NOTE_ORIGINAL_TYPE_UNSUPPORTED',
    'BILLING_CREDIT_NOTE_ORIGINAL_NOT_ACCEPTED',
    'BILLING_CREDIT_NOTE_CREDIT_CAP_EXCEEDED',
    'BILLING_CREDIT_NOTE_INPUT_INVALID',
    'BILLING_CREDIT_NOTE_SOURCE_LINE_INVALID',
    'BILLING_CREDIT_NOTE_TOTAL_AMOUNT_UNRECONCILABLE',
  ]) {
    assert.match(fiscalApi, new RegExp(`${code}: '[^']+'`));
  }
});
