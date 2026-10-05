export const OPERATIONAL_PASSENGER_CONTRACT_CONTEXT_READER = Symbol(
  "OPERATIONAL_PASSENGER_CONTRACT_CONTEXT_READER",
);

export type OperationalPassengerContractCommercialContext = {
  snapshotAvailable: boolean;
  perPersonSellingPrice: string | null;
  commercialTotal: string | null;
  currency: string | null;
  frozenAt: Date | null;
};

export type OperationalPassengerContractContext = {
  travelPackageParticipantId: string;
  clientId: string;
  contractId: string;
  contractNumber: string;
  sourceRole: "HOLDER" | "COMPANION" | "MINOR";
  commercial: OperationalPassengerContractCommercialContext;
  /** No durable guardian relation exists; null avoids free-form-name matching. */
  responsibleAdult: {
    responsibleParticipantId: string;
    responsibleClientId: string;
    responsibleName: string | null;
  } | null;
};

export type ReadOperationalPassengerContractContextsRequest = {
  tenantId: string;
  travelPackageId: string;
  participantIds: readonly string[];
};

/** Bounded Contract context boundary consumed by Operations read models. */
export interface OperationalPassengerContractContextReader {
  readContractContextsForParticipants(
    request: ReadOperationalPassengerContractContextsRequest,
  ): Promise<Map<string, OperationalPassengerContractContext[]>>;
}
