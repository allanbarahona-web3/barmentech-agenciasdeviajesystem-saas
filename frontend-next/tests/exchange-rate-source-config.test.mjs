import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(
  new URL('../src/app/admin/exchange-rate/page.tsx', import.meta.url),
  'utf8',
);
const configurationApiSource = readFileSync(
  new URL('../src/lib/fiscal-billing-admin-api.ts', import.meta.url),
  'utf8',
);
const exchangeRateApiSource = readFileSync(
  new URL('../src/lib/exchange-rate-api.ts', import.meta.url),
  'utf8',
);
const historySource = readFileSync(
  new URL('../src/features/exchange-rate/exchange-rate-history.tsx', import.meta.url),
  'utf8',
);
const verticalNavSource = readFileSync(new URL('../src/components/vertical-nav.tsx', import.meta.url), 'utf8');
const calculatorSource = readFileSync(new URL('../src/components/currency-calculator.tsx', import.meta.url), 'utf8');
const checkerSource = readFileSync(new URL('../src/components/exchange-rate-checker.tsx', import.meta.url), 'utf8');

test('exchange-rate administration exposes and persists MANUAL/BCCR through the tenant configuration flow', () => {
  assert.match(pageSource, /Fuente del tipo de cambio/);
  assert.match(pageSource, /<option value="MANUAL">Manual<\/option>/);
  assert.match(pageSource, /<option value="BCCR">BCCR<\/option>/);
  assert.match(pageSource, /getTenantBillingConfiguration/);
  assert.match(pageSource, /updateTenantBillingConfiguration\(\{ exchangeRateSource: source \}\)/);
  assert.match(configurationApiSource, /exchangeRateSource: 'MANUAL' \| 'BCCR'/);
});

test('MANUAL keeps editing and source-aware history remains mounted for both active sources', () => {
  assert.match(pageSource, /exchangeRateSource === "MANUAL"/);
  assert.match(pageSource, /<ExchangeRateConfigForm/);
  assert.match(pageSource, /no se habilita edición manual/);
  assert.match(pageSource, /<ExchangeRateHistory/);
  assert.match(pageSource, /history=\{history\}/);
  assert.match(pageSource, /getExchangeRateHistoryReportRange/);
});

test('history is source-identified and uses the shared persisted report projection', () => {
  assert.match(exchangeRateApiSource, /\/exchange-rate\/history-report-range/);
  assert.match(historySource, /rate\.source === 'MANUAL'/);
  assert.match(exchangeRateApiSource, /source: 'MANUAL' \| 'BCCR'/);
  assert.match(historySource, />Fuente<\/TableHead>/);
  assert.match(historySource, />TC Compra<\/TableHead>/);
  assert.match(historySource, />TC Venta<\/TableHead>/);
  assert.doesNotMatch(exchangeRateApiSource, /bccr\.fi\.cr|indicadoreseconomicos\.bccr/);
});

test('global consumers share the source-aware current endpoint and source switches refresh immediately', () => {
  assert.match(exchangeRateApiSource, /status: 'AVAILABLE' \| 'INCOMPLETE' \| 'MISSING'/);
  assert.match(exchangeRateApiSource, /CURRENT_EXCHANGE_RATE_CHANGED_EVENT/);
  assert.match(pageSource, /notifyCurrentExchangeRateChanged\(\)/);
  assert.match(verticalNavSource, /CURRENT_EXCHANGE_RATE_CHANGED_EVENT/);
  assert.match(calculatorSource, /getCurrentExchangeRate/);
  assert.match(checkerSource, /getCurrentExchangeRate/);
  assert.match(pageSource, /getCurrentExchangeRate\(\)/);
  assert.match(pageSource, /Fecha efectiva/);
  assert.match(pageSource, /TC Compra/);
  assert.match(pageSource, /TC Venta/);
  assert.doesNotMatch(pageSource, /officialHistory\.find/);
});
