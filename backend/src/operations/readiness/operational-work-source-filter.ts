import {
  ADDITIONAL_SERVICE_ORDER_LINE_SOURCE,
  TRAVEL_PACKAGE_COST_COMPONENT_SOURCE,
} from "../intake/operations-intake-outbox.constants";

export const OPERATIONAL_WORK_SOURCE_CATEGORIES = ["ALL", "BASE_TRIP", "ADDITIONAL_SERVICES"] as const;
export type OperationalWorkSourceCategory = (typeof OPERATIONAL_WORK_SOURCE_CATEGORIES)[number];

/**
 * Maps stable Operations filter categories to source identities without exposing
 * source-type persistence details as the public filtering contract.
 */
export function sourceTypesForOperationalWorkCategory(category?: OperationalWorkSourceCategory): readonly string[] | undefined {
  switch (category) {
    case "BASE_TRIP": return [TRAVEL_PACKAGE_COST_COMPONENT_SOURCE];
    case "ADDITIONAL_SERVICES": return [ADDITIONAL_SERVICE_ORDER_LINE_SOURCE];
    case "ALL":
    case undefined: return undefined;
  }
}

/**
 * Projects persisted source identity into the existing public category model.
 * Historical identities intentionally remain uncategorized.
 */
export function sourceCategoryForOperationalWorkSourceType(
  sourceType: string | null | undefined,
): Exclude<OperationalWorkSourceCategory, "ALL"> | undefined {
  if (!sourceType) return undefined;
  return (OPERATIONAL_WORK_SOURCE_CATEGORIES as readonly OperationalWorkSourceCategory[])
    .filter((category): category is Exclude<OperationalWorkSourceCategory, "ALL"> => category !== "ALL")
    .find((category) => sourceTypesForOperationalWorkCategory(category)?.includes(sourceType));
}
