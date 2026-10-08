import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { formatFinanceMoneyDisplay } from '../src/lib/finance-money-display.ts';
import { formatFiscalMoney } from '../src/lib/fiscal-money.ts';

test('currency formatters round Decimal strings to exactly two places without mutating raw values', () => {
  const raw = '100.12345';
  assert.equal(formatFinanceMoneyDisplay('4700', 'USD'), 'USD 4,700.00');
  assert.equal(formatFinanceMoneyDisplay('607.73123', 'USD'), 'USD 607.73');
  assert.equal(formatFinanceMoneyDisplay('4237.725', 'USD'), 'USD 4,237.73');
  assert.equal(formatFinanceMoneyDisplay('1070.00000', 'USD'), 'USD 1,070.00');
  assert.equal(formatFinanceMoneyDisplay('300', 'USD'), 'USD 300.00');
  assert.equal(formatFinanceMoneyDisplay(raw, 'CRC'), 'CRC 100.12');
  assert.equal(formatFiscalMoney(raw, 'CRC'), 'CRC 100.12');
  assert.equal(formatFinanceMoneyDisplay('100.1', 'USD'), 'USD 100.10');
  assert.equal(raw, '100.12345');
});

test('Finance money display delegates to the shared two-decimal formatter', () => {
  const financeApi = readFileSync(new URL('../src/lib/finance-api.ts', import.meta.url), 'utf8');
  assert.match(financeApi, /import \{ formatFinanceMoneyDisplay \} from '@\/lib\/finance-money-display';/);
  assert.match(financeApi, /return formatFinanceMoneyDisplay\(value, currency\);/);
});
