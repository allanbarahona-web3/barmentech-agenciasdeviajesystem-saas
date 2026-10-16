import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const list = readFileSync(new URL('../src/app/custom-quotations/page.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/lib/custom-quotations-api.ts', import.meta.url), 'utf8');

test('grouped quotation rows expose persisted proposal metadata only', () => {
  assert.match(api, /CustomQuotationGroupedRow[\s\S]*proposalVersionId: string \| null[\s\S]*hasProposalPdf: boolean/);
  assert.match(api, /quotations: CustomQuotationGroupedRow\[\]/);
});

test('Ver propuesta is conditional, lazy, and does not replace quotation navigation', () => {
  assert.match(list, /quotation\.hasProposalPdf && quotation\.proposalVersionId/);
  assert.match(list, /<Button type="button" size="sm" className="shrink-0"[\s\S]*?<FileText aria-hidden="true" \/>Ver propuesta<\/Button>/);
  assert.match(list, /getCustomQuotationProposal\(proposalViewer\.quotationId, proposalViewer\.versionId\)/);
  assert.match(list, /event\.stopPropagation\(\); onViewProposal\(quotation\.id, quotation\.proposalVersionId!\)/);
  assert.match(list, /onClick=\{\(\) => onOpenQuotation\(quotation\.id\)\}/);
  assert.match(list, /<AttachmentViewer attachments=\{\[proposalAttachment\(proposalViewer\)\]\}/);
  assert.match(list, /No se pudo cargar la propuesta\./);
});

test('the list does not preload proposal URLs or persist signed URLs', () => {
  assert.doesNotMatch(list, /localStorage|sessionStorage/);
  assert.match(list, /return proposal\.url;/);
  assert.match(list, /proposalViewer \? <AttachmentViewer/);
});
