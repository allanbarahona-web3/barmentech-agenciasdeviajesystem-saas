import type {
  TravelPackageOperationalWorkSourceItem,
  TravelPackageOperationalWorkSourceReference,
} from "./operational-work-source-reader.port";

export const OPERATIONAL_WORK_SOURCE_RECONCILIATION_READER = Symbol("OPERATIONAL_WORK_SOURCE_RECONCILIATION_READER");

export type OperationalWorkSourceScanRequest = {
  tenantId: string;
  travelPackageId?: string;
  cursor?: string;
  limit: number;
};

export type OperationalWorkSourceInspectionState =
  | "VALID"
  | "SOURCE_MISSING"
  | "SOURCE_NOT_ELIGIBLE"
  | "SOURCE_CANCELLED"
  | "PACKAGE_MISMATCH"
  | "SOURCE_IDENTITY_CONFLICT";

export type OperationalWorkSourceInspection = {
  reference: TravelPackageOperationalWorkSourceReference;
  state: OperationalWorkSourceInspectionState;
  item: TravelPackageOperationalWorkSourceItem | null;
};

export interface OperationalWorkSourceReconciliationReader {
  scanApprovedSourceItems(request: OperationalWorkSourceScanRequest): Promise<{
    items: TravelPackageOperationalWorkSourceItem[];
    nextCursor: string | null;
  }>;
  inspectSourceItems(request: {
    tenantId: string;
    references: readonly TravelPackageOperationalWorkSourceReference[];
  }): Promise<Map<string, OperationalWorkSourceInspection>>;
}

export function operationalWorkSourceIdentityKey(reference: Pick<TravelPackageOperationalWorkSourceReference, "sourceId" | "sourceLineId">) {
  return `${reference.sourceId}\u0000${reference.sourceLineId}`;
}
