import { AdditionalServiceOperationalWorkSourceAdapter } from "./additional-service-operational-work-source.adapter";
import { OperationalWorkMaterializationError } from "../../operations/intake/operational-work-source-reader.port";

describe("AdditionalServiceOperationalWorkSourceAdapter", () => {
  const reference = {
    tenantId: "tenant-a",
    travelPackageId: "travel-a",
    sourceType: "ADDITIONAL_SERVICE_ORDER_LINE",
    sourceId: "order-a",
    sourceLineId: "line-a",
  };

  it("maps one approved line into a neutral, semantic source item", async () => {
    const c = context();
    c.tx.additionalServiceOrder.findFirst.mockResolvedValue(order());

    await expect(c.adapter.readSourceItem(reference)).resolves.toMatchObject({
      ...reference,
      sourceVersionId: "2",
      servicePurposeCode: "LODGING",
      servicePurposeName: "Hospedaje",
      participantClientIds: ["client-a", "client-b"],
      soldValue: { scope: "EXACT_SERVICE_LINE", amount: "432.7300", currency: "USD" },
    });
    const item = await c.adapter.readSourceItem(reference);
    expect(item.description).toContain("Hotel con desayuno");
    expect(item.description).not.toContain("checkInDate");
    expect(item.description).not.toContain("HOTEL_WITH_BREAKFAST");
    expect(c.tx.additionalServiceOrder.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "order-a", tenantId: "tenant-a" }),
    }));
    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["DRAFT", "CONFIRMED"],
    ["APPROVED", "CANCELLED"],
  ])("rejects non-operational commercial sources", async (commercialStatus, status) => {
    const c = context();
    c.tx.additionalServiceOrder.findFirst.mockResolvedValue(order({ commercialStatus, status }));
    await expect(c.adapter.readSourceItem(reference)).rejects.toMatchObject({ code: "SOURCE_NOT_ELIGIBLE", retryable: false });
  });

  it("rejects a source line without stable client correlation", async () => {
    const c = context();
    c.tx.additionalServiceOrder.findFirst.mockResolvedValue(order({ lines: [{ ...order().lines[0], participants: [{ clientId: null }] }] }));
    await expect(c.adapter.readSourceItem(reference)).rejects.toBeInstanceOf(OperationalWorkMaterializationError);
    await expect(c.adapter.readSourceItem(reference)).rejects.toMatchObject({ code: "PARTICIPANT_NOT_FOUND", retryable: true });
  });

  it("rejects an order from another travel package without resolving its work", async () => {
    const c = context();
    c.tx.additionalServiceOrder.findFirst.mockResolvedValue(order({ travelPackageId: "travel-b" }));
    await expect(c.adapter.readSourceItem(reference)).rejects.toMatchObject({ code: "PACKAGE_MISMATCH", retryable: false });
  });
});

function context() {
  const tx = { $executeRaw: jest.fn(), additionalServiceOrder: { findFirst: jest.fn() } };
  const prisma = { $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)) };
  return { tx, adapter: new AdditionalServiceOperationalWorkSourceAdapter(prisma as never) };
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-a",
    travelPackageId: "travel-a",
    commercialStatus: "APPROVED",
    status: "CONFIRMED",
    proposalApprovedAt: new Date("2026-09-30T12:00:00.000Z"),
    lines: [{
      id: "line-a",
      serviceCode: "LODGING",
      serviceName: "Hospedaje",
      serviceDetailsVersion: 2,
      serviceDetails: { lodgingType: "HOTEL_WITH_BREAKFAST", checkInDate: "2026-10-18" },
      finalSellingPrice: { toString: () => "432.7300" },
      quotationCurrency: "USD",
      participants: [{ clientId: "client-a" }, { clientId: "client-b" }],
    }],
    ...overrides,
  };
}
