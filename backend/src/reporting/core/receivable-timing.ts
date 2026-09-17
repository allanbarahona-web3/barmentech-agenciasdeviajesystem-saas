import type { ReceivableCollectionTiming } from "../contracts/receivables-reporting.contracts";

/** Pure presentation classification over date-only values; it never changes source state. */
export function classifyReceivableTiming(
  dueOn: string | null | undefined,
  tenantCurrentOn: string,
): ReceivableCollectionTiming {
  if (!dueOn) return "NO_PROJECTABLE_DATE";
  if (dueOn < tenantCurrentOn) return "OVERDUE";
  if (dueOn === tenantCurrentOn) return "CURRENT";
  return "FUTURE";
}
