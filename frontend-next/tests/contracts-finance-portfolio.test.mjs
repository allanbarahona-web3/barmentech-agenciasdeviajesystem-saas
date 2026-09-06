import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CONTRACT_PAYMENT_PURPOSE_LABELS,
  CONTRACT_PAYMENT_STATUS_LABELS,
  formatContractPaymentPurpose,
} from '../src/features/contracts-finance/contract-payment-labels.ts';
import {
  canRegisterContractInstallments,
  CONTRACT_OBLIGATION_STATUS_LABELS,
} from '../src/features/contracts-finance/contract-installment.ts';
import { formatFinancePaymentMethod } from '../src/lib/finance-payment-methods.ts';

const portfolioSource = readFileSync(
  new URL('../src/app/finance/accounts-receivable/contract-obligation-groups.tsx', import.meta.url),
  'utf8',
);
const pageSource = readFileSync(
  new URL('../src/app/finance/accounts-receivable/page.tsx', import.meta.url),
  'utf8',
);
const apiSource = readFileSync(
  new URL('../src/lib/finance-api.ts', import.meta.url),
  'utf8',
);
const cssSource = readFileSync(
  new URL('../src/app/finance/accounts-receivable/accounts-receivable.module.css', import.meta.url),
  'utf8',
);
const groupRowsSource = portfolioSource.slice(
  portfolioSource.indexOf('function GroupRows'),
  portfolioSource.indexOf('export function ContractObligationGroupsView'),
);

test('Accounts Receivable keeps Cartera and Pagos and adds the Contratos tab', () => {
  assert.match(pageSource, /Cartera por cliente/);
  assert.match(pageSource, />Pagos</);
  assert.match(pageSource, />Contratos</);
  assert.match(pageSource, /useState<'receivables' \| 'payments' \| 'contracts'>\('receivables'\)/);
  assert.match(pageSource, /<ReceivableGroupsView/);
  assert.match(pageSource, /<PaymentsView/);
  assert.match(pageSource, /<ContractObligationGroupsView/);
});

test('typed Finance client supports paginated Contract group, child-row, and payment-history reads', () => {
  assert.match(apiSource, /export function listContractObligationGroups/);
  assert.match(apiSource, /\/finance\/contract-obligation-groups\$\{queryString\(params\)\}/);
  assert.match(apiSource, /export function listContractObligationGroupContracts/);
  assert.match(apiSource, /\/contracts\$\{queryString\(params\)\}/);
  assert.match(apiSource, /export function listContractPayments/);
  assert.match(apiSource, /\/finance\/contracts\/\$\{encodeURIComponent\(contractId\)\}\/payments/);
  assert.match(apiSource, /totalOriginalAmount: string/);
  assert.match(apiSource, /paidAmount: string/);
  assert.match(apiSource, /receiptAvailable: boolean/);
});

test('Contracts groups display backend customer, currency, and authoritative totals without frontend aggregation', () => {
  assert.match(portfolioSource, /group\.debtor\.displayName/);
  assert.match(portfolioSource, /group\.currencyCode/);
  assert.match(portfolioSource, /group\.totalOriginalAmount/);
  assert.match(portfolioSource, /group\.totalPaidAmount/);
  assert.match(portfolioSource, /group\.totalOutstandingAmount/);
  assert.match(portfolioSource, /listContractObligationGroups\(\{ page, pageSize: PAGE_SIZE \}/);
  assert.doesNotMatch(portfolioSource, /totalOriginalAmount\.reduce|totalPaidAmount\.reduce|totalOutstandingAmount\.reduce/);
});

test('expanded Contract rows are lazy, paginated, and retain historical obligations', () => {
  assert.match(portfolioSource, /if \(!expanded\) return/);
  assert.match(portfolioSource, /listContractObligationGroupContracts\(group\.groupKey, \{ page, pageSize: CHILD_PAGE_SIZE \}/);
  assert.match(portfolioSource, /contract\.contractNumber/);
  assert.match(portfolioSource, /contract\.travelLabel/);
  assert.match(portfolioSource, /contract\.status/);
  assert.match(portfolioSource, /CONTRACT_OBLIGATION_STATUS_LABELS\[contract\.status\]/);
  assert.match(portfolioSource, /contract\.isOverdue/);
  assert.match(portfolioSource, /Vencido/);
  assert.doesNotMatch(portfolioSource, /filter\([^\n]*SETTLED|filter\([^\n]*CANCELLED/);
  assert.match(portfolioSource, /Página \{result\.page\} de \{result\.totalPages\}/);
});

test('Contracts overlays are owned outside table rows so tbody only receives rows', () => {
  assert.doesNotMatch(groupRowsSource, /ContractFinanceDrawer|ContractInstallmentModal|<aside|drawerBackdrop|paymentBackdrop/);
  assert.match(groupRowsSource, /onOpenDetail\(contract\)/);
  assert.match(groupRowsSource, /onRegisterInstallment\(contract\)/);
  assert.match(portfolioSource, /selectedDetailContract \? <ContractFinanceDrawer/);
  assert.match(portfolioSource, /selectedInstallmentContract \? <ContractInstallmentModal/);
});

test('detail and row installment actions open separate overlay state', () => {
  assert.match(groupRowsSource, /onOpenDetail\(contract\)[\s\S]*Detalle financiero/);
  assert.match(groupRowsSource, /onRegisterInstallment\(contract\)[\s\S]*Registrar abono/);
  assert.doesNotMatch(groupRowsSource, /setSelectedDetailContract|setSelectedInstallmentContract/);
  assert.match(portfolioSource, /function ContractFinanceDrawer/);
  assert.match(portfolioSource, /function ContractInstallmentModal/);
  assert.match(portfolioSource, /showInstallmentForm && commercialObligation \? <ContractInstallmentForm/);
});

test('Contract obligation and payment labels are Spanish and payment methods use the shared registry', () => {
  assert.deepEqual(CONTRACT_OBLIGATION_STATUS_LABELS, {
    OPEN: 'Pendiente',
    PARTIALLY_SETTLED: 'Parcialmente pagado',
    SETTLED: 'Pagado',
    CANCELLED: 'Cancelado',
  });
  assert.deepEqual(CONTRACT_PAYMENT_PURPOSE_LABELS, {
    CONTRACT_RESERVATION: 'Reserva',
    CONTRACT_PAYMENT: 'Pago de contado',
    CONTRACT_INSTALLMENT: 'Abono',
  });
  assert.equal(formatContractPaymentPurpose('CONTRACT_INSTALLMENT'), 'Abono');
  assert.equal(CONTRACT_PAYMENT_STATUS_LABELS.RECEIVED, 'Recibido');
  assert.equal(formatFinancePaymentMethod('MOBILE_TRANSFER'), 'SINPE Móvil');
  assert.match(portfolioSource, /formatFinancePaymentMethod\(payment\.paymentMethod\)/);
});

test('the financial drawer and compact modal reuse installment helpers and refresh authoritative reads', () => {
  assert.match(portfolioSource, /getContractCommercialObligation\(contract\.contractId/);
  assert.match(portfolioSource, /listContractPayments\(contract\.contractId, \{ page: paymentPage, pageSize: PAYMENT_PAGE_SIZE \}/);
  assert.match(portfolioSource, /payment\.receiptAvailable \? <Button/);
  assert.match(portfolioSource, /downloadReceipt\(payment\.id\)/);
  assert.match(portfolioSource, /downloadPaymentReceipt\(paymentId\)/);
  assert.match(portfolioSource, /await refresh\(\);\s*onChanged\(\);/);
  assert.match(portfolioSource, /buildContractInstallmentRequest/);
  assert.match(portfolioSource, /createContractInstallmentDeduplicationKey/);
  assert.match(portfolioSource, /installmentFormError/);
  assert.match(portfolioSource, /<ContractInstallmentForm contractId=\{contract\.contractId\}/);
  assert.match(portfolioSource, /setSelectedInstallmentContract\(null\);\s*onContractsChanged\(\);/);
});

test('Contracts terminology uses Total contratado and keeps Total comprometido out of the new UI', () => {
  assert.match(portfolioSource, /Total contratado/);
  assert.doesNotMatch(portfolioSource, /Total comprometido/);
});

test('only Finance write roles can register installments, while Contract controls avoid CxC fiscal actions', () => {
  assert.equal(canRegisterContractInstallments('ADMIN'), true);
  assert.equal(canRegisterContractInstallments('FACTURACION_COBROS'), true);
  assert.equal(canRegisterContractInstallments('CONTADOR'), false);
  assert.equal(canRegisterContractInstallments('AGENT'), false);
  assert.match(portfolioSource, /canWrite\s*&& canRegisterContractInstallments/);
  assert.doesNotMatch(portfolioSource, /Ver factura|Nota fiscal|Aplicar saldo|BillingDocument|Hacienda/i);
});

test('Contracts use the bounded Finance drawer and responsive portfolio styling, not the legacy History modal', () => {
  assert.match(portfolioSource, /className=\{styles\.drawer\}/);
  assert.doesNotMatch(portfolioSource, /viewer-modal|viewer-panel/);
  assert.match(cssSource, /\.contractGroupTable \{ min-width: 1180px; \}/);
  assert.match(cssSource, /\.contractChildTable \{ min-width: 1120px; \}/);
  assert.match(cssSource, /\.drawer \{ width: 100vw; \}/);
  assert.match(cssSource, /\.contractPaymentFacts, \.statementSummary/);
  assert.match(cssSource, /\.contractInstallmentModal \{ position: fixed/);
  assert.match(cssSource, /\.contractInstallmentContext/);
  assert.match(cssSource, /\.paymentModal, \.contractInstallmentModal \{ top: 0; width: 100vw/);
});
