type PassengerInput = {
  fullName?: string | null;
  idNumber?: string | null;
  minorName?: string | null;
  name?: string | null;
  minorId?: string | null;
};

export function calculateContractDisplayPassengerQuantity(input: {
  companions: readonly PassengerInput[];
  minors: readonly PassengerInput[];
}): number {
  return 1 + input.companions.filter(isCompleteCompanion).length + input.minors.filter(isCompleteMinor).length;
}

export function calculatePublishedPricingDisplayTotal(
  perPersonSellingPrice: string,
  billablePassengerQuantity: number,
): string | null {
  if (!Number.isSafeInteger(billablePassengerQuantity) || billablePassengerQuantity < 1) return null;

  const normalizedPrice = String(perPersonSellingPrice || "").trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalizedPrice);
  if (!match) return null;

  const integer = match[1];
  const fraction = match[2] ?? "";
  const product = multiplyIntegerString(`${integer}${fraction}`, billablePassengerQuantity);
  if (!fraction) return product;

  const padded = product.padStart(fraction.length + 1, "0");
  return `${padded.slice(0, -fraction.length)}.${padded.slice(-fraction.length)}`;
}

export function archivePayloadForCommercialAuthority<T extends { totalAmount?: unknown }>(
  state: T,
  pricingPublished: boolean,
): T | Omit<T, "totalAmount"> {
  if (!pricingPublished) return state;
  const { totalAmount: _submittedCommercialTotal, ...payload } = state;
  return payload;
}

export function isPricingPublished(commercialPriceStatus: string | null | undefined): boolean {
  return commercialPriceStatus === "PRICING_PUBLISHED";
}

function isCompleteCompanion(input: PassengerInput): boolean {
  return hasText(input.fullName) && hasText(input.idNumber);
}

function isCompleteMinor(input: PassengerInput): boolean {
  return hasText(input.minorName ?? input.name) && hasText(input.minorId ?? input.idNumber);
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function multiplyIntegerString(value: string, multiplier: number): string {
  let carry = 0;
  let result = "";

  for (let index = value.length - 1; index >= 0; index -= 1) {
    const product = Number(value[index]) * multiplier + carry;
    result = String(product % 10) + result;
    carry = Math.floor(product / 10);
  }

  return `${carry || ""}${result}`.replace(/^0+(?=\d)/, "");
}
