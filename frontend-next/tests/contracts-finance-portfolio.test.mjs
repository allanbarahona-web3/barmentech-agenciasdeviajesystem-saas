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
const drawerSource = readFileSync(
  new URL('../src/features/contracts-finance/contract-finance-drawer.tsx', import.meta.url),
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

test('Accounts Receivable orders tabs as Cartera, Contratos, Recibos, then Facturas electrónicas', () => {
  const tabsSource = pageSource.slice(
    pageSource.indexOf('<nav className={styles.viewTabs}'),
    pageSource.indexOf('</nav>') + '</nav>'.length,
  );
  assert.match(tabsSource, />Cartera<\/button>[\s\S]*>Contratos<\/button>[\s\S]*>Recibos<\/button>[\s\S]*>Facturas electrónicas<\/button>/);
  assert.doesNotMatch(tabsSource, /Cartera por cliente/);
  assert.match(pageSource, /useState<'receivables' \| 'payments' \| 'contracts' \| 'electronic-invoices'>\('receivables'\)/);
  assert.match(pageSource, /<ReceivableGroupsView/);
  assert.match(pageSource, /<PaymentsView/);
  assert.match(pageSource, /<ContractObligationGroupsView/);
  assert.match(pageSource, /<ElectronicInvoicesView/);
});

test('Cartera retains its canonical statement action and invoicing subtitle', () => {
  assert.match(pageSource, /onStatement=\{setStatementGroup\}/);
  assert.match(
    readFileSync(new URL('../src/app/finance/accounts-receivable/receivable-groups.tsx', import.meta.url), 'utf8'),
    /Cuentas por cobrar generadas por facturación y servicios adicionales\./,
  );
});

test('Contract customer-currency groups reuse the canonical customer statement modal', () => {
  assert.match(groupRowsSource, /onStatement\(group\)[\s\S]*Estado de cuenta/);
  assert.match(portfolioSource, /onStatement: \(group: ContractObligationGroup\) => void/);
  assert.match(pageSource, /onStatement=\{\(group\) => setStatementGroup\(group\)\}/);
  assert.match(pageSource, /<CustomerAccountStatementModal group=\{statementGroup\}/);
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
  assert.match(apiSource, /fiscalDocument: \{/);
  assert.match(apiSource, /providerStatus: string/);
  assert.match(apiSource, /taxAuthorityStatus: string/);
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
  assert.match(portfolioSource, /import \{ ContractFinanceDrawer, ContractInstallmentForm \}/);
  assert.match(drawerSource, /export function ContractFinanceDrawer/);
  assert.match(portfolioSource, /function ContractInstallmentModal/);
  assert.match(drawerSource, /showInstallmentForm && commercialObligation \? <ContractInstallmentForm/);
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
  assert.match(drawerSource, /formatFinancePaymentMethod\(payment\.paymentMethod\)/);
});

test('the financial drawer and compact modal reuse installment helpers and refresh authoritative reads', () => {
  assert.match(drawerSource, /getContractCommercialObligation\(contract\.contractId/);
  assert.match(drawerSource, /listContractPayments\(contract\.contractId, \{ page: paymentPage, pageSize: PAYMENT_PAGE_SIZE \}/);
  assert.match(drawerSource, /payment\.receiptAvailable \? <Button/);
  assert.match(drawerSource, /downloadReceipt\(payment\.id\)/);
  assert.match(drawerSource, /downloadPaymentReceipt\(paymentId\)/);
  assert.match(drawerSource, /await refresh\(\);\s*onChanged\(\);/);
  assert.match(drawerSource, /buildContractInstallmentRequest/);
  assert.match(drawerSource, /createContractInstallmentDeduplicationKey/);
  assert.match(drawerSource, /installmentFormError/);
  assert.match(drawerSource, /<ContractInstallmentForm contractId=\{contract\.contractId\}/);
  assert.match(portfolioSource, /setSelectedInstallmentContract\(null\);\s*onContractsChanged\(\);/);
});

test('payment history exposes fiscal document visibility without changing payment or receipt actions', () => {
  assert.match(drawerSource, /fiscalDocumentPresentation\(payment\.fiscalDocument\)/);
  assert.match(drawerSource, /Factura electrónica pendiente/);
  assert.match(drawerSource, /Factura aceptada/);
  assert.match(drawerSource, /Factura rechazada/);
  assert.match(drawerSource, /Factura con error de emisión/);
  assert.match(drawerSource, /payment\.fiscalDocument \? <Button asChild/);
  assert.match(drawerSource, /Ver factura/);
  assert.match(drawerSource, /\/fiscal-billing\/invoices\/\$\{documentId\}/);
  assert.match(drawerSource, /\/fiscal-billing\/documents\/\$\{documentId\}/);
  assert.match(drawerSource, /payment\.receiptAvailable \? <Button/);
  assert.match(drawerSource, /Descargar recibo/);
  assert.doesNotMatch(drawerSource, /Emitir factura|Reintentar Hacienda|Cancelar factura|Crear NC|Reenviar XML|Reenviar PDF/);
});

test('Contracts terminology uses Total contratado and keeps Total comprometido out of the new UI', () => {
  assert.match(drawerSource, /Total contratado/);
  assert.doesNotMatch(drawerSource, /Total comprometido/);
});

test('only Finance write roles can register installments, while Contract controls avoid CxC actions', () => {
  assert.equal(canRegisterContractInstallments('ADMIN'), true);
  assert.equal(canRegisterContractInstallments('FACTURACION_COBROS'), true);
  assert.equal(canRegisterContractInstallments('CONTADOR'), false);
  assert.equal(canRegisterContractInstallments('AGENT'), false);
  assert.match(drawerSource, /canWrite\s*&& canRegisterContractInstallments/);
  assert.doesNotMatch(drawerSource, /Nota fiscal|Aplicar saldo/);
});

test('Contracts use the bounded Finance drawer and responsive portfolio styling, not the legacy History modal', () => {
  assert.match(drawerSource, /className=\{styles\.drawer\}/);
  assert.doesNotMatch(drawerSource, /viewer-modal|viewer-panel/);
  assert.match(cssSource, /\.contractGroupTable \{ min-width: 1180px; \}/);
  assert.match(cssSource, /\.contractChildTable \{ min-width: 1120px; \}/);
  assert.match(cssSource, /\.drawer \{ width: 100vw; \}/);
  assert.match(cssSource, /\.contractPaymentFacts, \.statementSummary/);
  assert.match(cssSource, /\.contractInstallmentModal \{ position: fixed/);
  assert.match(cssSource, /\.contractInstallmentContext/);
  assert.match(cssSource, /\.paymentModal, \.contractInstallmentModal \{ top: 0; width: 100vw/);
});

test('Finance keeps the shared drawer in its existing context without a customer return control', () => {
  assert.match(drawerSource, /onReturnToCustomer \? <Button[\s\S]*Volver al cliente/);
  assert.doesNotMatch(portfolioSource, /onReturnToCustomer=/);
});
