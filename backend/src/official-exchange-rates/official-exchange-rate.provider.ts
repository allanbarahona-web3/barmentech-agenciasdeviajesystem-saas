export const OFFICIAL_EXCHANGE_RATE_PROVIDER = Symbol(
  "OFFICIAL_EXCHANGE_RATE_PROVIDER",
);

export type OfficialExchangeRateType =
  | "REFERENCE_BUY"
  | "REFERENCE_SELL";

export interface OfficialExchangeRateRequest {
  countryCode: string;
  foreignCurrencyCode: string;
  localCurrencyCode: string;
  rateType: OfficialExchangeRateType;
  startDate: string;
  endDate: string;
}

export interface OfficialExchangeRateObservation {
  effectiveDate: string;
  value: string;
  sourceIndicatorCode: string;
  sourcePublishedAt: null;
}

export interface OfficialExchangeRateResult {
  sourceAuthority: string;
  countryCode: string;
  foreignCurrencyCode: string;
  localCurrencyCode: string;
  rateType: OfficialExchangeRateType;
  sourceIndicatorCode: string;
  observations: OfficialExchangeRateObservation[];
}

export interface OfficialExchangeRateProvider {
  getObservations(
    request: OfficialExchangeRateRequest,
  ): Promise<OfficialExchangeRateResult>;
}
