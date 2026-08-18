export const HACIENDA_ECONOMIC_ACTIVITY_PROVIDER = Symbol(
  "HACIENDA_ECONOMIC_ACTIVITY_PROVIDER",
);

export type HaciendaActivityLookupErrorCode =
  | "HACIENDA_ACTIVITY_LOOKUP_UNAVAILABLE"
  | "HACIENDA_ACTIVITY_LOOKUP_TIMEOUT"
  | "HACIENDA_ACTIVITY_LOOKUP_RATE_LIMITED"
  | "HACIENDA_ACTIVITY_LOOKUP_INVALID_RESPONSE"
  | "HACIENDA_TAXPAYER_NOT_FOUND";

export class HaciendaActivityLookupError extends Error {
  constructor(readonly code: HaciendaActivityLookupErrorCode) {
    super(code);
  }
}

export interface HaciendaEconomicActivity {
  code: string;
  description: string;
  status?: string;
  active?: boolean;
  primary?: boolean;
}

export interface HaciendaTaxpayerActivities {
  legalName?: string;
  taxSituation?: {
    status?: string;
    delinquent?: boolean;
    omission?: boolean;
    taxAdministration?: string;
  };
  activities: HaciendaEconomicActivity[];
}

export interface HaciendaEconomicActivityProvider {
  findByIdentification(
    identificationNumber: string,
  ): Promise<HaciendaTaxpayerActivities>;
}
