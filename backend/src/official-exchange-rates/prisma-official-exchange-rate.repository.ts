import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreateOfficialExchangeRateObservation,
  OfficialExchangeRateIdentity,
  OfficialExchangeRateRepository,
  PersistedOfficialExchangeRateObservation,
} from "./official-exchange-rate.repository";

const observationSelect = {
  id: true,
  countryCode: true,
  foreignCurrencyCode: true,
  localCurrencyCode: true,
  rateType: true,
  effectiveDate: true,
  value: true,
  sourceAuthority: true,
  sourceIndicatorCode: true,
  retrievedAt: true,
  sourcePublishedAt: true,
  requestIdentity: true,
  responseHash: true,
} as const;

type ObservationRow = {
  id: string;
  countryCode: string;
  foreignCurrencyCode: string;
  localCurrencyCode: string;
  rateType: "REFERENCE_BUY" | "REFERENCE_SELL";
  effectiveDate: Date;
  value: Prisma.Decimal;
  sourceAuthority: string;
  sourceIndicatorCode: string;
  retrievedAt: Date;
  sourcePublishedAt: Date | null;
  requestIdentity: string;
  responseHash: string | null;
};

@Injectable()
export class PrismaOfficialExchangeRateRepository
  implements OfficialExchangeRateRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async findExact(identity: OfficialExchangeRateIdentity) {
    const row = await this.prisma.officialExchangeRateObservation.findFirst({
      where: {
        countryCode: identity.countryCode,
        foreignCurrencyCode: identity.foreignCurrencyCode,
        localCurrencyCode: identity.localCurrencyCode,
        rateType: identity.rateType,
        effectiveDate: dateOnlyToUtc(identity.effectiveDate),
        sourceAuthority: identity.sourceAuthority,
        sourceIndicatorCode: identity.sourceIndicatorCode,
      },
      select: observationSelect,
    });
    return row ? mapRow(row) : null;
  }

  async create(observation: CreateOfficialExchangeRateObservation) {
    const row = await this.prisma.officialExchangeRateObservation.create({
      data: {
        countryCode: observation.countryCode,
        foreignCurrencyCode: observation.foreignCurrencyCode,
        localCurrencyCode: observation.localCurrencyCode,
        rateType: observation.rateType,
        effectiveDate: dateOnlyToUtc(observation.effectiveDate),
        value: new Prisma.Decimal(observation.value),
        sourceAuthority: observation.sourceAuthority,
        sourceIndicatorCode: observation.sourceIndicatorCode,
        retrievedAt: observation.retrievedAt,
        sourcePublishedAt: observation.sourcePublishedAt,
        requestIdentity: observation.requestIdentity,
        responseHash: observation.responseHash,
      },
      select: observationSelect,
    });
    return mapRow(row);
  }
}

function dateOnlyToUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function mapRow(row: ObservationRow): PersistedOfficialExchangeRateObservation {
  return {
    ...row,
    effectiveDate: [
      row.effectiveDate.getUTCFullYear().toString().padStart(4, "0"),
      (row.effectiveDate.getUTCMonth() + 1).toString().padStart(2, "0"),
      row.effectiveDate.getUTCDate().toString().padStart(2, "0"),
    ].join("-"),
    value: row.value.toFixed(),
  };
}
