export const OPERATIONAL_WORK_SOURCE_READER = Symbol("OPERATIONAL_WORK_SOURCE_READER");

export type OperationalWorkSourceReference = {
  tenantId: string;
  travelPackageId: string;
  sourceType: string;
  sourceId: string;
  sourceLineId: string;
};

export type OperationalWorkSourceItem = OperationalWorkSourceReference & {
  sourceVersionId: string | null;
  sourceReference: string | null;
  sourceAcceptedAt: Date | null;
  servicePurposeCode: string;
  servicePurposeName: string;
  description: string;
  participantClientIds: string[];
  soldValue: {
    scope: "EXACT_SERVICE_LINE";
    amount: string;
    currency: string;
  } | null;
};

export interface OperationalWorkSourceReader {
  readSourceItem(reference: OperationalWorkSourceReference): Promise<OperationalWorkSourceItem>;
}

export type OperationalWorkMaterializationErrorCode =
  | "SOURCE_NOT_FOUND"
  | "SOURCE_NOT_ELIGIBLE"
  | "PARTICIPANT_NOT_FOUND"
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
