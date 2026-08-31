export const FISCAL_NUMBER_SEQUENCE_ADMIN_REPOSITORY = Symbol(
  "FISCAL_NUMBER_SEQUENCE_ADMIN_REPOSITORY",
);

export type FiscalNumberSequenceScope = {
  tenantId: string;
  fiscalIssuerId: string;
  establishmentCode: string;
  terminalCode: string;
  documentTypeCode: string;
};

export type FiscalNumberSequenceRecord = FiscalNumberSequenceScope & {
  id: string;
  startingSequenceNumber: bigint;
  nextSequenceNumber: bigint;
};

export type ConditionalAdvanceResult =
  | { kind: "UPDATED"; sequence: FiscalNumberSequenceRecord }
  | { kind: "CHANGED"; sequence: FiscalNumberSequenceRecord | null };

export interface FiscalNumberSequenceAdminRepository {
  list(
    tenantId: string,
    fiscalIssuerId: string,
    establishmentCode: string,
    terminalCode: string,
  ): Promise<FiscalNumberSequenceRecord[]>;
  find(
    scope: FiscalNumberSequenceScope,
  ): Promise<FiscalNumberSequenceRecord | null>;
  create(
    scope: FiscalNumberSequenceScope,
    nextSequenceNumber: bigint,
  ): Promise<FiscalNumberSequenceRecord>;
  advance(
    scope: FiscalNumberSequenceScope,
    expectedNext: bigint,
    requestedNext: bigint,
  ): Promise<ConditionalAdvanceResult>;
}
