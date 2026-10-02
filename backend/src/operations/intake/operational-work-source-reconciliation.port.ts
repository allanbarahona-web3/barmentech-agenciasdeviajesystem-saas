import type { OperationalWorkSourceItem, OperationalWorkSourceReference } from "./operational-work-source-reader.port";

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
  reference: OperationalWorkSourceReference;
  state: OperationalWorkSourceInspectionState;
  item: OperationalWorkSourceItem | null;
};

export interface OperationalWorkSourceReconciliationReader {
  scanApprovedSourceItems(request: OperationalWorkSourceScanRequest): Promise<{
    items: OperationalWorkSourceItem[];
    nextCursor: string | null;
  }>;
  inspectSourceItems(request: {
    tenantId: string;
    references: readonly OperationalWorkSourceReference[];
  }): Promise<Map<string, OperationalWorkSourceInspection>>;
}

export function operationalWorkSourceIdentityKey(reference: Pick<OperationalWorkSourceReference, "sourceId" | "sourceLineId">) {
  return `${reference.sourceId}\u0000${reference.sourceLineId}`;
}
