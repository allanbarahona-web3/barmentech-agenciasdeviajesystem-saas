import type { CommercialSourceRef } from "../finance/eligibility-read/finance-eligibility-reader.port";

const ADDITIONAL_SERVICE_ORDER_LINE = "ADDITIONAL_SERVICE_ORDER_LINE";
const CONTRACT = "CONTRACT";
const CUSTOM_QUOTATION_LINE = "CUSTOM_QUOTATION_LINE";

/**
 * The Requirement source snapshot is the only commercial identity Operations
 * may pass to Finance.  Keeping this conversion here prevents callers from
 * reconstructing provenance from passengers, SalesOrders, or package data.
 */
export type RequirementFinanceSource = {
  travelPackageId: string | null;
  sourceType: string | null;
  sourceId: string | null;
  sourceLineId: string | null;
  sourceVersionId: string | null;
};

export function requirementToCommercialSourceRef(
  requirement: RequirementFinanceSource,
): CommercialSourceRef | null {
  if (requirement.sourceType === CONTRACT && requirement.sourceId) {
    return {
      sourceType: CONTRACT,
      sourceId: requirement.sourceId,
      ...(requirement.sourceLineId ? { sourceLineId: requirement.sourceLineId } : {}),
      ...(requirement.sourceVersionId ? { versionId: requirement.sourceVersionId } : {}),
    };
  }

  if (
    requirement.sourceType === ADDITIONAL_SERVICE_ORDER_LINE
    && requirement.sourceId
    && requirement.sourceLineId
    && requirement.travelPackageId
  ) {
    return {
      sourceType: ADDITIONAL_SERVICE_ORDER_LINE,
      sourceId: requirement.sourceId,
      sourceLineId: requirement.sourceLineId,
      ...(requirement.sourceVersionId ? { versionId: requirement.sourceVersionId } : {}),
      travelPackageId: requirement.travelPackageId,
    };
  }

  if (
    requirement.sourceType === CUSTOM_QUOTATION_LINE
    && requirement.sourceId
    && requirement.sourceLineId
    && !requirement.travelPackageId
  ) {
    return {
      sourceType: CUSTOM_QUOTATION_LINE,
      sourceId: requirement.sourceId,
      sourceLineId: requirement.sourceLineId,
    };
  }

  return null;
}

export function commercialSourceRefKey(source: CommercialSourceRef): string {
  return [
    source.sourceType,
    source.sourceId,
    source.sourceLineId ?? "",
    source.versionId ?? "",
    source.travelPackageId ?? "",
    source.opaqueSourceKey ?? "",
  ].join("\u0000");
}
