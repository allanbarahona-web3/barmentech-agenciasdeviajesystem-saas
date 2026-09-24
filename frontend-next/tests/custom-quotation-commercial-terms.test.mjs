import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const editor = readFileSync(new URL('../src/features/custom-quotations/components/CustomQuotationEditorDialog.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/lib/custom-quotations-api.ts', import.meta.url), 'utf8');
const proposal = readFileSync(new URL('../src/features/custom-quotations/components/CustomQuotationProposalTab.tsx', import.meta.url), 'utf8');

test('Custom Quotation crédito only offers días and keeps CASH term controls hidden', () => {
  assert.match(editor, /paymentConditionType === 'CREDIT'/);
  assert.match(editor, /<option value="DAYS">Días<\/option>/);
  assert.match(editor, /value="DAYS" disabled/);
  assert.doesNotMatch(editor, /<option value="MONTHS">Meses<\/option>/);
  assert.match(editor, /paymentTermUnit: 'DAYS'/);
});

test('Custom Quotation requests use days-only credit terms and map the domain error safely', () => {
  assert.match(api, /paymentTermUnit\?: 'DAYS' \| null/);
  assert.match(api, /CUSTOM_QUOTATION_CREDIT_TERM_UNIT_INVALID/);
  assert.match(api, /Para cotizaciones a crédito, el plazo debe definirse en días\./);
  assert.match(proposal, /code\.includes\('CREDIT_TERM_UNIT'\).*Para cotizaciones a crédito, el plazo debe definirse en días\./);
  assert.doesNotMatch(api, /customQuotationErrorMessage[\s\S]{0,300}BILLING_COMMERCIAL_CREDIT_TERM_INVALID/);
});
