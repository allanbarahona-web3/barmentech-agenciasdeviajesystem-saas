import { OperationalPassengerNotesService } from "./operational-passenger-notes.service";

describe("OperationalPassengerNotesService", () => {
  const tenantId = "tenant-a";
  const travelPackageId = "trip-a";
  const participantId = "participant-a";

  it("returns only normalized active Contract notes for the resolved passenger", async () => {
    const reader = {
      readNotesForParticipant: jest.fn().mockResolvedValue([
        note("note-new", "Passport pending", "contract-a", "ALM-B899", new Date("2026-10-15T13:00:00.000Z")),
        note("note-old", "Visa received", "contract-b", "ALM-C100", new Date("2026-10-14T13:00:00.000Z")),
      ]),
    };
    const service = new OperationalPassengerNotesService(reader as never);

    await expect(service.list(tenantId, travelPackageId, participantId)).resolves.toEqual([
      {
        id: "note-new",
        note: "Passport pending",
        contract: { id: "contract-a", contractNumber: "ALM-B899" },
        author: { displayName: "Agent One" },
        createdAt: new Date("2026-10-15T13:00:00.000Z"),
      },
      expect.objectContaining({ id: "note-old", contract: { id: "contract-b", contractNumber: "ALM-C100" } }),
    ]);
    expect(reader.readNotesForParticipant).toHaveBeenCalledWith({ tenantId, travelPackageId, participantId });
  });

  it("does not treat an unknown tenant/trip participant as an empty notes list", async () => {
    const reader = { readNotesForParticipant: jest.fn().mockResolvedValue(null) };
    const service = new OperationalPassengerNotesService(reader as never);

    await expect(service.list(tenantId, travelPackageId, participantId)).rejects.toThrow("OPERATIONAL_PASSENGER_NOTES_PARTICIPANT_NOT_FOUND");
  });
});

function note(id: string, text: string, contractId: string, contractNumber: string, createdAt: Date) {
  return {
    id,
    travelPackageParticipantId: "participant-a",
    text,
    status: "ACTIVE" as const,
    createdAt,
    archivedAt: null,
    sourceType: "CONTRACT" as const,
    authorName: "Agent One",
    source: { type: "CONTRACT_NOTE" as const, sourceId: contractId, contractNumber },
  };
}
