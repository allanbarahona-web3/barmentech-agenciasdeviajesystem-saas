import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  OFFICIAL_EXCHANGE_RATE_PROVIDER,
  type OfficialExchangeRateProvider,
  type OfficialExchangeRateType,
} from "./official-exchange-rate.provider";
import {
  OFFICIAL_EXCHANGE_RATE_REPOSITORY,
  type CreateOfficialExchangeRateObservation,
  type OfficialExchangeRateIdentity,
  type OfficialExchangeRateRepository,
  type PersistedOfficialExchangeRateObservation,
} from "./official-exchange-rate.repository";
import {
  OfficialExchangeRateResolverError,
  type OfficialExchangeRateResolverErrorCode,
} from "./official-exchange-rate.resolver.errors";

export interface ResolveExactOfficialExchangeRateRequest {
  countryCode: string;
  foreignCurrencyCode: string;
  localCurrencyCode: string;
  rateType: OfficialExchangeRateType;
  effectiveDate: string;
}

export type ResolvedOfficialExchangeRateObservation =
  PersistedOfficialExchangeRateObservation & { newlyPersisted: boolean };

@Injectable()
export class OfficialExchangeRateResolver {
  constructor(
    @Inject(OFFICIAL_EXCHANGE_RATE_REPOSITORY)
    private readonly repository: OfficialExchangeRateRepository,
    @Inject(OFFICIAL_EXCHANGE_RATE_PROVIDER)
    private readonly provider: OfficialExchangeRateProvider,
  ) {}

  async resolveExactObservation(
    request: ResolveExactOfficialExchangeRateRequest,
  ): Promise<ResolvedOfficialExchangeRateObservation> {
    validateRequest(request);
    const identity = authoritativeIdentity(request);
    let existing: PersistedOfficialExchangeRateObservation | null;
    try {
      existing = await this.repository.findExact(identity);
    } catch {
      resolverError("OFFICIAL_EXCHANGE_RATE_PERSISTENCE_FAILED");
    }
    if (existing) return { ...existing, newlyPersisted: false };

    const result = await this.provider.getObservations({
      countryCode: request.countryCode,
      foreignCurrencyCode: request.foreignCurrencyCode,
      localCurrencyCode: request.localCurrencyCode,
      rateType: request.rateType,
      startDate: request.effectiveDate,
      endDate: request.effectiveDate,
    });
    if (result.observations.length === 0) {
      resolverError("OFFICIAL_EXCHANGE_RATE_NOT_AVAILABLE");
    }
    if (
      result.sourceAuthority !== identity.sourceAuthority ||
      result.countryCode !== identity.countryCode ||
      result.foreignCurrencyCode !== identity.foreignCurrencyCode ||
      result.localCurrencyCode !== identity.localCurrencyCode ||
      result.rateType !== identity.rateType ||
      result.sourceIndicatorCode !== identity.sourceIndicatorCode ||
      result.observations.length !== 1
    ) {
      resolverError("OFFICIAL_EXCHANGE_RATE_PROVIDER_MISMATCH");
    }
    const observation = result.observations[0];
    if (
      observation.effectiveDate !== identity.effectiveDate ||
      observation.sourceIndicatorCode !== identity.sourceIndicatorCode
    ) {
      resolverError("OFFICIAL_EXCHANGE_RATE_PROVIDER_MISMATCH");
    }
    const value = canonicalDecimal(observation.value);
    const requestIdentity = buildRequestIdentity(identity);
    const candidate: CreateOfficialExchangeRateObservation = {
      ...identity,
      value,
      retrievedAt: new Date(),
      sourcePublishedAt: observation.sourcePublishedAt,
      requestIdentity,
      responseHash: buildResponseHash(identity, value),
    };
    try {
      const created = await this.repository.create(candidate);
      return { ...created, newlyPersisted: true };
    } catch (error) {
      if (!isUniqueConflict(error)) {
        resolverError("OFFICIAL_EXCHANGE_RATE_PERSISTENCE_FAILED");
      }
      let winner: PersistedOfficialExchangeRateObservation | null;
      try {
        winner = await this.repository.findExact(identity);
      } catch {
        resolverError("OFFICIAL_EXCHANGE_RATE_PERSISTENCE_FAILED");
      }
      if (!winner || !matchesCandidate(winner, candidate)) {
        resolverError("OFFICIAL_EXCHANGE_RATE_CONFLICT");
      }
      return { ...winner, newlyPersisted: false };
    }
  }
}

function authoritativeIdentity(
  request: ResolveExactOfficialExchangeRateRequest,
): OfficialExchangeRateIdentity {
  return {
    ...request,
    sourceAuthority: "BCCR",
    sourceIndicatorCode:
      request.rateType === "REFERENCE_BUY" ? "317" : "318",
  };
}

function validateRequest(request: ResolveExactOfficialExchangeRateRequest): void {
  if (
    !request ||
    !/^[A-Z]{2}$/.test(request.countryCode) ||
    !/^[A-Z]{3}$/.test(request.foreignCurrencyCode) ||
    !/^[A-Z]{3}$/.test(request.localCurrencyCode) ||
    request.foreignCurrencyCode === request.localCurrencyCode ||
    (request.rateType !== "REFERENCE_BUY" &&
      request.rateType !== "REFERENCE_SELL") ||
    !isCanonicalDate(request.effectiveDate)
  ) {
    resolverError("OFFICIAL_EXCHANGE_RATE_REQUEST_INVALID");
  }
}

function isCanonicalDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 1 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function canonicalDecimal(value: string): string {
  const match = /^((?:0|[1-9]\d*))(?:\.(\d+))?$/.exec(value);
  if (!match) {
    resolverError("OFFICIAL_EXCHANGE_RATE_PROVIDER_MISMATCH");
  }
  const integer = match[1];
  const fraction = match[2]?.replace(/0+$/, "") ?? "";
  if (
    (integer === "0" && !fraction) ||
    integer.length > 18 ||
    fraction.length > 12
  ) {
    resolverError("OFFICIAL_EXCHANGE_RATE_PROVIDER_MISMATCH");
  }
  return fraction ? `${integer}.${fraction}` : integer;
}

export function buildRequestIdentity(identity: OfficialExchangeRateIdentity): string {
  return [
    "official-fx",
    "v1",
    identity.sourceAuthority,
    identity.countryCode,
    identity.foreignCurrencyCode,
    identity.localCurrencyCode,
    identity.rateType,
    identity.effectiveDate,
    identity.sourceIndicatorCode,
  ].join(":");
}

export function buildResponseHash(
  identity: OfficialExchangeRateIdentity,
  value: string,
): string {
  // Canonical order: version, authority, country, foreign, local, rate type,
  // effective date, source indicator, exact canonical decimal value.
  const canonical = [
    "official-fx-observation:v1",
    identity.sourceAuthority,
    identity.countryCode,
    identity.foreignCurrencyCode,
    identity.localCurrencyCode,
    identity.rateType,
    identity.effectiveDate,
    identity.sourceIndicatorCode,
    value,
  ].join("|");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function matchesCandidate(
  winner: PersistedOfficialExchangeRateObservation,
  candidate: CreateOfficialExchangeRateObservation,
): boolean {
  return (
    winner.countryCode === candidate.countryCode &&
    winner.foreignCurrencyCode === candidate.foreignCurrencyCode &&
    winner.localCurrencyCode === candidate.localCurrencyCode &&
    winner.rateType === candidate.rateType &&
    winner.effectiveDate === candidate.effectiveDate &&
    winner.sourceAuthority === candidate.sourceAuthority &&
    winner.sourceIndicatorCode === candidate.sourceIndicatorCode &&
    canonicalDecimal(winner.value) === candidate.value &&
    winner.requestIdentity === candidate.requestIdentity &&
    winner.responseHash === candidate.responseHash
  );
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function resolverError(code: OfficialExchangeRateResolverErrorCode): never {
  throw new OfficialExchangeRateResolverError(code);
}
