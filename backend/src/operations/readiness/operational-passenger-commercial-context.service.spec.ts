import { OperationalPassengerCommercialContextService } from "./operational-passenger-commercial-context.service";

describe("OperationalPassengerCommercialContextService", () => {
  it("reads semantic Additional Services context only for the requested tenant-scoped participant", async () => {
    const c = context();
    c.tx.travelPackageParticipant.findFirst.mockResolvedValue({ id: "participant-a", clientId: "client-a" });
    const services = [{ sourceRef: { type: "ADDITIONAL_SERVICE_ORDER_LINE", id: "line-a", lineId: "line-a", version: 2 }, serviceCode: "TOUR", serviceName: "Tour", commercialStatus: "APPROVED", soldValue: { amount: "125.00", currency: "USD", scope: "EXACT_SERVICE_LINE" }, presentation: { title: "Tour", subtitle: "Centro", fields: [{ key: "date", label: "Fecha", value: "2026-10-01", valueType: "DATE" }] } }];
    c.additional.readForClients.mockResolvedValue(new Map([["client-a", services]]));
    c.contractContext.readContractContextsForParticipants.mockResolvedValue(new Map([["participant-a", [{ contractId: "contract-a", contractNumber: "CT-1", sourceRole: "HOLDER" }]]]));
    c.notes.readNotesForParticipants.mockResolvedValue(new Map([["participant-a", [{ id: "note-a", sourceType: "CONTRACT", text: "Passport pending" }]]]));

    await expect(c.service.get("tenant-a", "trip-a", "participant-a")).resolves.toMatchObject({ travelPackageParticipantId: "participant-a", additionalServices: [{ soldValue: { amount: "125.00", currency: "USD", scope: "EXACT_SERVICE_LINE" }, presentation: { title: "Tour" } }], contractContexts: [{ contractNumber: "CT-1", sourceRole: "HOLDER" }], operationalNotes: [{ sourceType: "CONTRACT", text: "Passport pending" }] });
    expect(c.tx.travelPackageParticipant.findFirst).toHaveBeenCalledWith({ where: { id: "participant-a", tenantId: "tenant-a", travelPackageId: "trip-a" }, select: { id: true, clientId: true } });
    expect(c.additional.readForClients).toHaveBeenCalledWith({ tenantId: "tenant-a", travelPackageId: "trip-a", clientIds: ["client-a"] });
    expect(c.contractContext.readContractContextsForParticipants).toHaveBeenCalledWith({ tenantId: "tenant-a", travelPackageId: "trip-a", participantIds: ["participant-a"] });
    expect(c.notes.readNotesForParticipants).toHaveBeenCalledWith({ tenantId: "tenant-a", travelPackageId: "trip-a", participantIds: ["participant-a"] });
  });

  it("does not read commercial context when the participant is outside the tenant/package", async () => {
    const c = context();
    c.tx.travelPackageParticipant.findFirst.mockResolvedValue(null);

    await expect(c.service.get("tenant-a", "trip-a", "participant-b")).rejects.toThrow("OPERATIONAL_COMMERCIAL_CONTEXT_PARTICIPANT_NOT_FOUND");
    expect(c.additional.readForClients).not.toHaveBeenCalled();
    expect(c.contractContext.readContractContextsForParticipants).not.toHaveBeenCalled();
    expect(c.notes.readNotesForParticipants).not.toHaveBeenCalled();
  });
});

function context() {
  const tx = { $executeRaw: jest.fn().mockResolvedValue(undefined), travelPackageParticipant: { findFirst: jest.fn() } };
  const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
  const additional = { readForClients: jest.fn() };
  const contractContext = { readContractContextsForParticipants: jest.fn().mockResolvedValue(new Map()) };
  const notes = { readNotesForParticipants: jest.fn().mockResolvedValue(new Map()) };
  return { tx, additional, contractContext, notes, service: new OperationalPassengerCommercialContextService(prisma as never, additional as never, contractContext, notes) };
}
