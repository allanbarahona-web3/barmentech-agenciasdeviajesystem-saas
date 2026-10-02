import { BadRequestException } from "@nestjs/common";
import type { CommercialSourceRef } from "./finance-eligibility-reader.port";

const MAX_SOURCE_BATCH_SIZE = 50;

export function normalizeFinanceEligibilitySources(
  sources: readonly CommercialSourceRef[],
): CommercialSourceRef[] {
  if (!Array.isArray(sources)) {
    throw new BadRequestException("FINANCE_ELIGIBILITY_SOURCE_BATCH_INVALID");
  }
  if (sources.length > MAX_SOURCE_BATCH_SIZE) {
    throw new BadRequestException("FINANCE_ELIGIBILITY_SOURCE_BATCH_TOO_LARGE");
  }
  const normalized = sources.map((source) => ({
    sourceType: requiredFinanceEligibilityValue(source?.sourceType),
    sourceId: requiredFinanceEligibilityValue(source?.sourceId),
    ...(source?.sourceLineId === undefined
      ? {}
      : { sourceLineId: requiredFinanceEligibilityValue(source.sourceLineId) }),
    ...(source?.versionId === undefined
      ? {}
      : { versionId: requiredFinanceEligibilityValue(source.versionId) }),
    ...(source?.opaqueSourceKey === undefined
      ? {}
      : { opaqueSourceKey: requiredFinanceEligibilityValue(source.opaqueSourceKey) }),
    ...(source?.travelPackageId === undefined
      ? {}
      : { travelPackageId: requiredFinanceEligibilityValue(source.travelPackageId) }),
  }));
  const deduplicated = new Map<string, CommercialSourceRef>();
  for (const source of normalized) {
    const key = financeEligibilitySourceKey(source);
    if (!deduplicated.has(key)) deduplicated.set(key, source);
  }
  return [...deduplicated.values()];
}

export function requiredFinanceEligibilityTenantId(value: unknown): string {
  return requiredFinanceEligibilityValue(value);
}

export function financeEligibilitySourceKey(source: CommercialSourceRef): string {
  return JSON.stringify([
    source.sourceType,
    source.sourceId,
    source.sourceLineId ?? null,
    source.versionId ?? null,
    source.opaqueSourceKey ?? null,
    source.travelPackageId ?? null,
  ]);
}

function requiredFinanceEligibilityValue(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException("FINANCE_ELIGIBILITY_SOURCE_BATCH_INVALID");
  }
  return value.trim();
}
