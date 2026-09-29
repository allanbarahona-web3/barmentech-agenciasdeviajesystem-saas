export const PARTICIPANT_SOURCE_READER = Symbol("PARTICIPANT_SOURCE_READER");

export type ParticipantSourceRef = {
  travelPackageParticipantId: string;
  sourceType: "CONTRACT";
  sourceId: string;
  sourceRole: "HOLDER" | "COMPANION" | "MINOR";
  linkedAt: Date;
};

export type ReadParticipantSourcesRequest = {
  tenantId: string;
  travelPackageId: string;
  participantIds: readonly string[];
};

/** Neutral Contract/Travel provenance boundary for future application consumers. */
export interface ParticipantSourceReader {
  readSourcesForParticipants(
    request: ReadParticipantSourcesRequest,
  ): Promise<Map<string, ParticipantSourceRef[]>>;
}
