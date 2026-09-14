import assert from 'node:assert/strict';
import test from 'node:test';
import { formatFinanceMoneyDisplay } from '../src/lib/finance-money-display.ts';

test('Customer Profile money display rounds Decimal strings to exactly two places without Number arithmetic', () => {
  assert.equal(formatFinanceMoneyDisplay('4700', 'USD'), 'USD 4,700.00');
  assert.equal(formatFinanceMoneyDisplay('607.73123', 'USD'), 'USD 607.73');
  assert.equal(formatFinanceMoneyDisplay('4237.725', 'USD'), 'USD 4,237.73');
  assert.equal(formatFinanceMoneyDisplay('1070.00000', 'USD'), 'USD 1,070.00');
  assert.equal(formatFinanceMoneyDisplay('300', 'USD'), 'USD 300.00');
});
