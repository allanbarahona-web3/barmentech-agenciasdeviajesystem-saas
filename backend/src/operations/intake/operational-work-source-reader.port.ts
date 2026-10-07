export const OPERATIONAL_WORK_SOURCE_READER = Symbol("OPERATIONAL_WORK_SOURCE_READER");

export type OperationalWorkSourceSnapshot = {
  travelPackageId: string;
  costingProjectId: string;
  costComponentId: string;
  category: { code: string; displayName: string };
  title: string;
  description: string | null;
  structuredDetails: unknown;
  detailSchemaVersion: number | null;
  quantity: string | null;
  unit: string | null;
  supplier: { id: string; name: string } | null;
  currentCostSnapshotId: string;
  currentInternalCost: { amount: string; currency: string };
};

type OperationalWorkSourceIdentity = {
  tenantId: string;
  sourceType: string;
  sourceId: string;
  sourceLineId: string;
};

export type TravelPackageOperationalWorkSourceReference = OperationalWorkSourceIdentity & {
  scopeType: "TRAVEL_PACKAGE";
  travelPackageId: string;
};

export type StandaloneCustomerOperationalWorkSourceReference = OperationalWorkSourceIdentity & {
  scopeType: "STANDALONE_CUSTOMER";
  customerId: string;
};

export type OperationalWorkSourceReference =
  | TravelPackageOperationalWorkSourceReference
  | StandaloneCustomerOperationalWorkSourceReference;

type OperationalWorkSourceItemFields = {
  sourceVersionId: string | null;
  sourceReference: string | null;
  sourceAcceptedAt: Date | null;
  servicePurposeCode: string;
  servicePurposeName: string;
  description: string;
  /** Context only; Cost Engine remains authoritative for cost history. */
  sourceSnapshot: OperationalWorkSourceSnapshot | null;
  /** Explicit even when soldValue is null, so NONE is not inferred by consumers. */
  soldValueScope: "EXACT_SERVICE_LINE" | "NONE";
  soldValue: {
    scope: "EXACT_SERVICE_LINE";
    amount: string;
    currency: string;
  } | null;
};

export type TravelPackageOperationalWorkSourceItem =
  & TravelPackageOperationalWorkSourceReference
  & OperationalWorkSourceItemFields
  & {
  /**
   * Additional Services supplies explicit client identities. Base package work
   * is instead expanded later from the tenant/package scoped contracted roster.
   */
  participantClientIds: string[];
  participantScope?: "ALL_CONTRACTED_TRAVEL_PACKAGE_PARTICIPANTS";
};

export type StandaloneCustomerOperationalWorkSourceItem =
  & StandaloneCustomerOperationalWorkSourceReference
  & OperationalWorkSourceItemFields;

export type OperationalWorkSourceItem =
  | TravelPackageOperationalWorkSourceItem
  | StandaloneCustomerOperationalWorkSourceItem;

export interface OperationalWorkSourceReader {
  readSourceItem(reference: OperationalWorkSourceReference): Promise<OperationalWorkSourceItem>;
}

export type OperationalWorkMaterializationErrorCode =
  | "SOURCE_NOT_FOUND"
  | "SOURCE_NOT_ELIGIBLE"
  | "PARTICIPANT_NOT_FOUND"
  | "CUSTOMER_NOT_FOUND"
  | "PACKAGE_MISMATCH"
  | "SOURCE_CONFLICT"
  | "MATERIALIZATION_FAILED";

export class OperationalWorkMaterializationError extends Error {
  constructor(
    readonly code: OperationalWorkMaterializationErrorCode,
    readonly retryable: boolean,
    readonly diagnostics: Record<string, string | number> = {},
  ) {
    super(code);
    this.name = "OperationalWorkMaterializationError";
  }
}
