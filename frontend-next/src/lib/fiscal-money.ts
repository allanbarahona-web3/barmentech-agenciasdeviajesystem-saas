const DECIMAL_VALUE = /^(-?)(\d+)(?:\.(\d+))?$/;
const ONE = BigInt(1);
const HUNDRED = BigInt(100);
const ZERO = BigInt(0);

export function formatFiscalDecimal(value: string): string {
  const match = DECIMAL_VALUE.exec(value);
  if (!match) return value;

  const fraction = (match[3] ?? "").padEnd(3, "0");
  let minorUnits = BigInt(match[2]) * HUNDRED + BigInt(fraction.slice(0, 2));
  if (fraction[2] >= "5") minorUnits += ONE;

  const whole = (minorUnits / HUNDRED)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = (minorUnits % HUNDRED).toString().padStart(2, "0");
  const sign = match[1] === "-" && minorUnits !== ZERO ? "-" : "";
  return `${sign}${whole}.${cents}`;
}

export function formatFiscalMoney(value: string, currency: string): string {
  return `${currency} ${formatFiscalDecimal(value)}`;
}
