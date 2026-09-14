/** Presentation-only Decimal-string rounding for Customer Profile amounts. */
export function formatFinanceMoneyDisplay(value: string, currency: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return `${currency} ${value}`;
  const fraction = match[3] ?? '';
  let scaled = `${match[2]}${fraction.padEnd(2, '0').slice(0, 2)}`;
  if ((fraction[2] ?? '0') >= '5') scaled = incrementDigits(scaled);
  const whole = scaled.slice(0, -2) || '0';
  const cents = scaled.slice(-2).padStart(2, '0');
  return `${currency} ${match[1]}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`;
}

function incrementDigits(value: string): string {
  const digits = value.split('');
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    if (digits[index] === '9') {
      digits[index] = '0';
      continue;
    }
    digits[index] = nextDigit(digits[index]);
    return digits.join('');
  }
  return `1${digits.join('')}`;
}

function nextDigit(value: string): string {
  return { '0': '1', '1': '2', '2': '3', '3': '4', '4': '5', '5': '6', '6': '7', '7': '8', '8': '9' }[value] ?? value;
}
