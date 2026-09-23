import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  canCompleteCustomQuotationCustomer,
  customerPrefillFromLead,
} from '../src/features/custom-quotations/customer-lead-conversion.ts';

const modalSource = readFileSync(new URL('../src/features/customers/components/CustomerCreateModal.tsx', import.meta.url), 'utf8');
const conversionComponentSource = readFileSync(new URL('../src/features/custom-quotations/components/CustomQuotationLeadCustomerConversion.tsx', import.meta.url), 'utf8');
const conversionApiSource = readFileSync(new URL('../src/lib/custom-quotation-conversion-api.ts', import.meta.url), 'utf8');

test('la conversión solo se habilita para una cotización aceptada de un prospecto abierto sin cliente', () => {
  assert.equal(canCompleteCustomQuotationCustomer({ status: 'ACCEPTED', leadId: 'lead-1', customerId: null, leadStatus: 'OPEN' }), true);
  assert.equal(canCompleteCustomQuotationCustomer({ status: 'DRAFT', leadId: 'lead-1', customerId: null, leadStatus: 'OPEN' }), false);
  assert.equal(canCompleteCustomQuotationCustomer({ status: 'ACCEPTED', leadId: null, customerId: 'customer-1', leadStatus: null }), false);
  assert.equal(canCompleteCustomQuotationCustomer({ status: 'ACCEPTED', leadId: 'lead-1', customerId: null, leadStatus: 'CONVERTED' }), false);
});

test('el modal reutilizado precarga únicamente los datos comerciales del prospecto', () => {
  assert.deepEqual(
    customerPrefillFromLead({ fullName: 'Ana Prospecto', email: 'ana@example.test', phone: '8888-9999' }),
    { fullName: 'Ana Prospecto', email: 'ana@example.test', phone: '8888-9999' },
  );
  assert.match(conversionComponentSource, /CustomerCreateModal/);
  assert.match(conversionComponentSource, /initialValues=\{customerPrefillFromLead\(lead\)\}/);
  assert.match(conversionComponentSource, /title="Completar cliente"/);
  assert.match(modalSource, /initialValues\?: Pick<CreateCustomerDto, 'fullName' \| 'email' \| 'phone'>/);
  assert.match(modalSource, /idType/);
  assert.match(modalSource, /idNumber/);
});

test('la conversión usa exclusivamente el endpoint de cotizaciones y notifica para refrescar el estado', () => {
  assert.match(conversionApiSource, /custom-quotations\/\$\{encodeURIComponent\(quotationId\)\}\/convert-lead-to-customer/);
  assert.match(conversionApiSource, /method: 'POST'/);
  assert.doesNotMatch(conversionApiSource, /authenticatedFetch\([^]*\/customers/);
  assert.match(conversionComponentSource, /onConversionCompleted\(result\)/);
  assert.match(conversionComponentSource, /setConverted\(true\)/);
  assert.match(conversionComponentSource, /Completar cliente/);
});

test('el comportamiento existente de creación de clientes conserva su API por defecto', () => {
  assert.match(modalSource, /if \(onSubmitCustomer\) \{/);
  assert.match(modalSource, /const createdCustomer = await createCustomer\(customerInput\)/);
  assert.match(modalSource, /onCustomerCreated\?\.\(createdCustomer\)/);
});
