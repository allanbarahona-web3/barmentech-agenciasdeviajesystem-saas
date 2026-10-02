import { AdditionalServiceOperationalContextAdapter } from "./additional-service-operational-context.adapter";

describe("AdditionalServiceOperationalContextAdapter", () => {
  it("uses one approved-order participant batch and groups neutral context by client", async () => {
    const tx = { $executeRaw: jest.fn().mockResolvedValue(undefined), additionalServiceOrderParticipant: { findMany: jest.fn().mockResolvedValue([{ clientId: "client-a", line: { id: "line-a", serviceCode: "LODGING", serviceName: "Hospedaje", serviceDetailsVersion: 1, serviceDetails: { lodgingType: "HOTEL_WITH_BREAKFAST", checkInDate: "2026-09-18", checkOutDate: "2026-09-22" }, finalSellingPrice: "10.00", quotationCurrency: "USD" } }]) } };
    const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
    const result = await new AdditionalServiceOperationalContextAdapter(prisma as never).readForClients({ tenantId: "tenant-a", travelPackageId: "trip-a", clientIds: ["client-a", "client-b"] });
    expect(tx.additionalServiceOrderParticipant.findMany).toHaveBeenCalledTimes(1);
    expect(tx.additionalServiceOrderParticipant.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-a", clientId: { in: ["client-a", "client-b"] }, line: { order: expect.objectContaining({ travelPackageId: "trip-a", commercialStatus: "APPROVED" }) } }) }));
    expect(result.get("client-a")).toEqual([expect.objectContaining({ serviceCode: "LODGING", commercialStatus: "APPROVED", sourceRef: { type: "ADDITIONAL_SERVICE_ORDER_LINE", id: "line-a", lineId: "line-a", version: 1 }, soldValue: { amount: "10.00", currency: "USD", scope: "EXACT_SERVICE_LINE" }, presentation: expect.objectContaining({ subtitle: "Hotel con desayuno", fields: expect.arrayContaining([{ key: "start-date", label: "Entrada", value: "2026-09-18", valueType: "DATE" }]) }) })]);
    expect(result.get("client-b")).toEqual([]);
  });
});
