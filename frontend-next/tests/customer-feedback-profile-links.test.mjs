import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const profileLinks = source('../src/components/profile-detail-link.tsx');
const quotationList = source('../src/app/custom-quotations/page.tsx');
const quotationDetail = source('../src/app/custom-quotations/[id]/page.tsx');
const leadDetail = source('../src/app/leads/[id]/page.tsx');
const contractCustomerLookup = source('../src/features/contracts-form/wizard/steps/CustomerLookupStep.tsx');
const contractsWizard = source('../src/features/contracts-form/wizard/ContractsWizard.tsx');
const additionalOrderDetail = source('../src/app/additional-services/orders/[id]/page.tsx');
const salesOrderDetail = source('../src/app/sales-orders/[id]/page.tsx');
const additionalOrdersApi = source('../src/lib/additional-services-orders-api.ts');
const customerDirectory = source('../src/app/admin/customers/page.tsx');
const leadDirectory = source('../src/app/leads/page.tsx');

test('customer and lead detail actions use safe new-tab route links without fetching profiles', () => {
  assert.match(profileLinks, /href=\{`\/admin\/customers\/\$\{encodeURIComponent\(customerId\)\}`\}/);
  assert.match(profileLinks, /href=\{`\/leads\/\$\{encodeURIComponent\(leadId\)\}`\}/);
  assert.match(profileLinks, /target="_blank" rel="noopener noreferrer"/);
  assert.match(profileLinks, /Ver cliente/);
  assert.match(profileLinks, /Ver prospecto/);
  assert.doesNotMatch(profileLinks, /getCustomerProfile|getLead\(/);
});

test('commercial workflows expose the authorized profile/detail actions using existing IDs', () => {
  assert.match(quotationList, /CustomerProfileLink customerId=\{group\.recipient\.id\}/);
  assert.match(quotationList, /LeadDetailLink leadId=\{group\.recipient\.id\}/);
  assert.match(quotationDetail, /CustomerProfileLink customerId=\{quotation\.target\.id\}/);
  assert.match(quotationDetail, /LeadDetailLink leadId=\{quotation\.target\.id\}/);
  assert.match(leadDetail, /CustomerProfileLink customerId=\{lead\.convertedCustomerId\}/);
  assert.match(contractCustomerLookup, /CustomerProfileLink customerId=\{customer\.id\}/);
  assert.match(contractsWizard, /window\.open\(`\/admin\/customers\/\$\{encodeURIComponent\(completion\.customerId\)\}`, '_blank', 'noopener,noreferrer'\)/);
  assert.match(additionalOrderDetail, /CustomerProfileLink customerId=\{order\.quoteCustomerId\}/);
  assert.match(salesOrderDetail, /CustomerProfileLink customerId=\{order\.customerId\}/);
  assert.match(additionalOrdersApi, /quoteCustomerId: string \| null/);
});

test('quotation recipient links are siblings of the accordion trigger and preserve its toggle behavior', () => {
  assert.match(quotationList, /<div className="flex items-center gap-2"><button[^>]*aria-expanded=\{expanded\}[^>]*onClick=\{onToggle\}/);
  assert.match(quotationList, /<\/button>\{group\.recipient\.type/);
  assert.match(quotationList, /onClick=\{\(\) => onOpenQuotation\(quotation\.id\)\}/);
});

test('profile actions preserve existing authorization boundaries and directory navigation', () => {
  assert.match(profileLinks, /CUSTOMER_PROFILE_ROLES/);
  assert.match(profileLinks, /LEAD_DETAIL_ROLES/);
  assert.match(profileLinks, /if \(!customerId \|\| !role \|\| !CUSTOMER_PROFILE_ROLES\.has\(role\)\) return null/);
  assert.match(profileLinks, /if \(!leadId \|\| !role \|\| !LEAD_DETAIL_ROLES\.has\(role\)\) return null/);
  assert.match(customerDirectory, /router\.push\(`\/admin\/customers\/\$\{customerId\}`\)/);
  assert.match(leadDirectory, /router\.push\(`\/leads\/\$\{lead\.id\}`\)/);
});

test('profile links do not add profile API reads to order or contract workflows', () => {
  for (const page of [additionalOrderDetail, salesOrderDetail, quotationDetail, quotationList]) {
    assert.doesNotMatch(page, /getCustomerProfile\(|getLead\(/);
  }
});
