/**
 * Counts the same structurally complete payload rows that can become Contract
 * travel participants. Every current role is one billable pricing unit.
 */
export function calculateContractBillablePassengerQuantity(input: {
  companions: readonly unknown[];
  minors: readonly unknown[];
}): number {
  return 1 + validCompanions(input.companions).length + validMinors(input.minors).length;
}

export function validCompanions(input: readonly unknown[]): Record<string, unknown>[] {
  return input.filter((value): value is Record<string, unknown> =>
    isRecord(value) && hasText(value.fullName) && hasText(value.idNumber),
  );
}

export function validMinors(input: readonly unknown[]): Record<string, unknown>[] {
  return input.filter((value): value is Record<string, unknown> =>
    isRecord(value) && hasText(value.minorName ?? value.name) && hasText(value.minorId ?? value.idNumber),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
