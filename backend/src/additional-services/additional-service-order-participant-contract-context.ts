import type {
  AdditionalServiceOrderParticipantContractContextSnapshot,
  AdditionalServiceOrderParticipantContractSource,
  AdditionalServiceParticipantRole,
  AdditionalServiceTravelParticipantRecord,
} from "./repositories";

const PARTICIPANT_ROLES = new Set<AdditionalServiceParticipantRole>([
  "HOLDER",
  "COMPANION",
  "MINOR",
]);

/**
 * Produces the immutable commercial-order snapshot from tenant- and
 * TravelPackage-scoped provenance already resolved by the repository.
 */
export function snapshotAdditionalServiceParticipantContractContext(
  participant: AdditionalServiceTravelParticipantRecord,
): AdditionalServiceOrderParticipantContractContextSnapshot | null {
  if (!participant.travelPackageParticipantId) return null;

  return {
    travelPackageParticipantId: participant.travelPackageParticipantId,
    contractSources: participant.contractSources.map((source) => ({ ...source })).sort(
      (left, right) =>
        left.contractNumber.localeCompare(right.contractNumber) ||
        left.contractId.localeCompare(right.contractId),
    ),
  };
}

/**
 * Keeps raw Contract IDs inside the persisted snapshot while exposing only the
 * safe display fields through the internal order-detail contract.
 */
export function readAdditionalServiceParticipantContractSources(
  value: unknown,
): AdditionalServiceOrderParticipantContractSource[] | null {
  if (!isRecord(value) || !isNonEmptyString(value.travelPackageParticipantId)) {
    return null;
  }
  if (!Array.isArray(value.contractSources)) return null;

  const sources: AdditionalServiceOrderParticipantContractSource[] = [];
  for (const source of value.contractSources) {
    if (
      !isRecord(source) ||
      !isNonEmptyString(source.contractId) ||
      !isNonEmptyString(source.contractNumber) ||
      !isNonEmptyString(source.status) ||
      !isParticipantRole(source.sourceRole)
    ) {
      return null;
    }
    sources.push({
      contractNumber: source.contractNumber,
      status: source.status,
      sourceRole: source.sourceRole,
    });
  }

  return sources;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isParticipantRole(value: unknown): value is AdditionalServiceParticipantRole {
  return typeof value === "string" && PARTICIPANT_ROLES.has(value as AdditionalServiceParticipantRole);
}
