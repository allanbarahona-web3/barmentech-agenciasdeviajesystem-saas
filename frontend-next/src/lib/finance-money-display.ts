/** Presentation-only Decimal-string rounding for user-facing currency amounts. */
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

/** Adds decimal strings exactly for display-only totals; persisted purchase amounts remain authoritative. */
export function addFinanceMoneyDisplayValues(left: string, right: string | null): string {
  const [leftWhole, leftFraction = ''] = left.split('.');
  const [rightWhole, rightFraction = ''] = (right ?? '0').split('.');
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const digits = addDigits(`${leftWhole}${leftFraction.padEnd(scale, '0')}`, `${rightWhole}${rightFraction.padEnd(scale, '0')}`);
  return scale === 0 ? digits : `${digits.slice(0, -scale) || '0'}.${digits.slice(-scale)}`;
}

function addDigits(left: string, right: string): string {
  let carry = 0, result = '';
  const width = Math.max(left.length, right.length);
  for (let index = 0; index < width; index += 1) {
    const sum = Number(left[left.length - 1 - index] ?? '0') + Number(right[right.length - 1 - index] ?? '0') + carry;
    result = `${sum % 10}${result}`; carry = Math.floor(sum / 10);
  }
  return `${carry || ''}${result}`.replace(/^0+(?=\d)/, '');
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
