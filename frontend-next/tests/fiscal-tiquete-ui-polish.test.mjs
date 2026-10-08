import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const detailSource = readFileSync(
  new URL('../src/app/fiscal-billing/invoices/[billingDocumentId]/page.tsx', import.meta.url),
  'utf8',
);
const listSource = readFileSync(
  new URL('../src/app/finance/accounts-receivable/electronic-invoices-view.tsx', import.meta.url),
  'utf8',
);

test('fiscal detail derives the accepted heading from the document type without exposing raw codes', () => {
  assert.match(detailSource, /'01': 'Factura electrónica'/);
  assert.match(detailSource, /'04': 'Tiquete electrónico'/);
  assert.match(detailSource, /function documentTypeLabel\(documentTypeCode: string\)/);
  assert.match(detailSource, /\{documentTypeLabel\(invoice\.documentTypeCode\)\} #\{invoice\.fiscalNumber\}/);
  assert.doesNotMatch(detailSource, /Factura electrónica #\{invoice\.fiscalNumber\}/);
  assert.doesNotMatch(detailSource, /Documento \$\{invoice\.documentTypeCode\}/);
});

test('fiscal list renders a document-type badge and a cash ticket financial state separate from Hacienda acceptance', () => {
  assert.match(listSource, /<Badge variant="outline" className=\{styles\.documentTypeBadge\}>\{documentTypeLabel\(invoice\.documentType\)\}<\/Badge>/);
  assert.match(listSource, /documentType === '04' && taxAuthorityStatus === 'ACCEPTED' && status === 'NOT_APPLICABLE'/);
  assert.match(listSource, /label: 'Sin CxC'/);
  assert.match(listSource, /if \(status === 'PAID'\) return \{ label: 'Pagada'/);
  assert.match(listSource, /const fiscal = fiscalStatusPresentation\(invoice\.taxAuthorityStatus\)/);
  assert.match(listSource, /<Badge variant=\{fiscal\.variant\}>\{fiscal\.label\}<\/Badge>/);
});
