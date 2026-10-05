export const OPERATIONAL_PASSENGER_NOTE_READER = Symbol(
  "OPERATIONAL_PASSENGER_NOTE_READER",
);

export type OperationalPassengerNote = {
  id: string;
  travelPackageParticipantId: string;
  text: string;
  status: "ACTIVE";
  createdAt: Date;
  archivedAt: Date | null;
  sourceType: "CONTRACT" | "CLIENT_PROFILE";
  authorName: string | null;
  source: {
    type: "CONTRACT_NOTE";
    sourceId: string;
  };
};

export type ReadOperationalPassengerNotesRequest = {
  tenantId: string;
  travelPackageId: string;
  participantIds: readonly string[];
};

/** Neutral Contract-originated passenger-note boundary for future consumers. */
export interface OperationalPassengerNoteReader {
  readNotesForParticipants(
    request: ReadOperationalPassengerNotesRequest,
  ): Promise<Map<string, OperationalPassengerNote[]>>;
}
