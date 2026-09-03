export const ADDITIONAL_SERVICE_CATALOG_USAGE_TYPES = [
  "ADDITIONAL_SERVICE",
  "TRAVEL_PACKAGE",
  "INTERNAL_TRIP",
] as const;

export type AdditionalServiceCatalogUsageType =
  (typeof ADDITIONAL_SERVICE_CATALOG_USAGE_TYPES)[number];
