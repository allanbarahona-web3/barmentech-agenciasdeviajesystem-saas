import type { OfficialExchangeRateType } from "./official-exchange-rate.provider";

export const OFFICIAL_EXCHANGE_RATE_REPOSITORY = Symbol(
  "OFFICIAL_EXCHANGE_RATE_REPOSITORY",
);

export interface OfficialExchangeRateIdentity {
  countryCode: string;
  foreignCurrencyCode: string;
  localCurrencyCode: string;
  rateType: OfficialExchangeRateType;
  effectiveDate: string;
  sourceAuthority: string;
  sourceIndicatorCode: string;
}

export interface PersistedOfficialExchangeRateObservation
  extends OfficialExchangeRateIdentity {
  id: string;
  value: string;
  retrievedAt: Date;
  sourcePublishedAt: Date | null;
  requestIdentity: string;
  responseHash: string | null;
}

export interface CreateOfficialExchangeRateObservation
  extends OfficialExchangeRateIdentity {
  value: string;
  retrievedAt: Date;
  sourcePublishedAt: Date | null;
  requestIdentity: string;
  responseHash: string;
}

export interface OfficialExchangeRateRepository {
  findExact(
    identity: OfficialExchangeRateIdentity,
  ): Promise<PersistedOfficialExchangeRateObservation | null>;
  create(
    observation: CreateOfficialExchangeRateObservation,
  ): Promise<PersistedOfficialExchangeRateObservation>;
}
