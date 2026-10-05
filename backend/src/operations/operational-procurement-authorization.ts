import type { CommercialSourceRef } from "../finance/eligibility-read/finance-eligibility-reader.port";
import { TRAVEL_PACKAGE_COST_COMPONENT_SOURCE } from "./intake/operations-intake-outbox.constants";
import { requirementToCommercialSourceRef, type RequirementFinanceSource } from "./requirement-finance-source";

export type OperationalProcurementAuthorization =
  | { kind: "AUTHORIZED_BY_SOURCE_POLICY"; reason: "TRAVEL_PACKAGE_BASE_COMPONENT" }
  | { kind: "FINANCE_ELIGIBILITY_REQUIRED"; source: CommercialSourceRef }
  | { kind: "UNAVAILABLE" };

/**
 * Keeps financial settlement eligibility separate from source-owned procurement
 * policy. Base TravelPackage components are operationally authorized, not
 * synthetically Finance-eligible.
 */
export function procurementAuthorizationForRequirement(
  requirement: RequirementFinanceSource,
): OperationalProcurementAuthorization {
  if (
    requirement.sourceType === TRAVEL_PACKAGE_COST_COMPONENT_SOURCE
    && requirement.travelPackageId
    && requirement.sourceId
    && requirement.sourceLineId
  ) {
    return { kind: "AUTHORIZED_BY_SOURCE_POLICY", reason: "TRAVEL_PACKAGE_BASE_COMPONENT" };
  }
  const source = requirementToCommercialSourceRef(requirement);
  return source ? { kind: "FINANCE_ELIGIBILITY_REQUIRED", source } : { kind: "UNAVAILABLE" };
}

export function procurementAuthorizationReadState(
  authorization: OperationalProcurementAuthorization,
  finance: { eligibility?: string; reason?: string | null } | null | undefined,
) {
  if (authorization.kind === "AUTHORIZED_BY_SOURCE_POLICY") {
    return { state: "AUTHORIZED_BY_SOURCE_POLICY", reason: authorization.reason };
  }
  if (!finance) return { state: "UNAVAILABLE", reason: null };
  if (finance.eligibility === "BLOCKED") return { state: "BLOCKED", reason: finance.reason ?? null };
  if (finance.eligibility === "ELIGIBLE") return { state: "ELIGIBLE", reason: finance.reason ?? null };
  return { state: "UNAVAILABLE", reason: finance.reason ?? null };
}
