export const OPERATIONAL_CONTRACTED_TRAVEL_PACKAGE_ROSTER_READER = Symbol("OPERATIONAL_CONTRACTED_TRAVEL_PACKAGE_ROSTER_READER");

export type ContractedTravelPackageParticipant = {
  id: string;
  clientId: string;
};

export type ReadContractedTravelPackageRosterRequest = {
  tenantId: string;
  travelPackageId: string;
  cursor?: string;
  limit?: number;
};

export type ContractedTravelPackageRosterPage = {
  participants: ContractedTravelPackageParticipant[];
  nextCursor: string | null;
};

export type ReadContractedTravelPackageRostersRequest = {
  tenantId: string;
  travelPackageIds: readonly string[];
};

/**
 * Neutral Operations read boundary for TravelPackage participants backed by
 * Contract provenance. Consumers must page rather than infer identity by name.
 */
export interface ContractedTravelPackageRosterReader {
  readContractedRoster(
    request: ReadContractedTravelPackageRosterRequest,
  ): Promise<ContractedTravelPackageRosterPage>;

  /** Bounded batch read used by reconciliation; keys are stable package IDs. */
  readContractedRosters(
    request: ReadContractedTravelPackageRostersRequest,
  ): Promise<Map<string, ContractedTravelPackageParticipant[]>>;
}
