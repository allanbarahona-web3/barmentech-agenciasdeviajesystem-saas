export type TravelFiscalClassificationUsage =
  | 'TRAVEL_PACKAGE'
  | 'INTERNAL_TRIP';

export type TravelUiType = 'internal' | 'international' | 'migration';

export type TravelFiscalClassificationOption = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  fiscalItemCategory: string;
  cabysCode: string;
  unitOfMeasureCode: string;
  taxCode: string | null;
  taxRateCode: string | null;
  taxPercentage: string | number | null;
};

export function travelFiscalUsageForType(
  tripType: TravelUiType,
): TravelFiscalClassificationUsage {
  return tripType === 'internal' ? 'INTERNAL_TRIP' : 'TRAVEL_PACKAGE';
}

export function canConfigureTravelFiscalClassification(
  role: string | null | undefined,
): boolean {
  return String(role || '').toUpperCase() === 'ADMIN';
}

export function hasTravelFiscalBillingCapability(configuration: {
  configured: boolean;
  configuration: {
    billingEnabled: boolean;
    electronicIssuanceEnabled: boolean;
  };
}): boolean {
  return Boolean(
    configuration.configured &&
      configuration.configuration.billingEnabled &&
      configuration.configuration.electronicIssuanceEnabled,
  );
}

export function selectionForUsageChange(
  previousUsage: TravelFiscalClassificationUsage,
  nextUsage: TravelFiscalClassificationUsage,
  selectedCatalogId: string,
): string {
  return previousUsage === nextUsage ? selectedCatalogId : '';
}

export function withFiscalClassification<T extends object>(
  payload: T,
  enabled: boolean,
  selectedCatalogId: string,
): T & { fiscalClassificationCatalogId?: string | null } {
  if (!enabled) return payload;
  return {
    ...payload,
    fiscalClassificationCatalogId: selectedCatalogId || null,
  };
}
