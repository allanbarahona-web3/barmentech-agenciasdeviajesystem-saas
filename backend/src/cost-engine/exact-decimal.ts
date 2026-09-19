type ParsedDecimal = { integer: bigint; scale: number };

export function addExactDecimals(left: string, right: string): string {
  const a = parse(left);
  const b = parse(right);
  const scale = Math.max(a.scale, b.scale);
  const total = a.integer * power10(scale - a.scale) + b.integer * power10(scale - b.scale);
  return format(total, scale);
}

function parse(value: string): ParsedDecimal {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error("COST_DECIMAL_INVALID");
  return {
    integer: BigInt(`${match[1]}${match[2] ?? ""}`),
    scale: match[2]?.length ?? 0,
  };
}

function power10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function format(integer: bigint, scale: number): string {
  const digits = integer.toString();
  if (scale === 0) return digits;
  const padded = digits.padStart(scale + 1, "0");
  const whole = padded.slice(0, -scale);
  const fraction = padded.slice(-scale).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}
