import { ConflictException } from "@nestjs/common";
import {
  ADDITIONAL_SERVICE_ORDER_LINE_SOURCE,
  AdditionalServiceOperationsIntakeOutboxProducer,
  OPERATIONS_SOURCE_ITEM_APPROVED_EVENT,
} from "./additional-service-operations-intake-outbox.producer";

describe("AdditionalServiceOperationsIntakeOutboxProducer", () => {
  it("writes one minimal pending event per approved source line in the caller transaction", async () => {
    const { producer, tx, createMany } = setup([
      { id: "line-a", serviceDetailsVersion: 3 },
      { id: "line-b", serviceDetailsVersion: null },
    ]);

    await expect(producer.persistApprovedOrder(tx as never, "tenant-a", "order-a")).resolves.toBe(2);

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        expect.objectContaining({
          tenantId: "tenant-a",
          travelPackageId: "trip-a",
          eventType: OPERATIONS_SOURCE_ITEM_APPROVED_EVENT,
          eventVersion: 1,
          sourceType: ADDITIONAL_SERVICE_ORDER_LINE_SOURCE,
          sourceId: "order-a",
          sourceLineId: "line-a",
          sourceVersionId: "3",
          availableAt: approvedAt,
        }),
        expect.objectContaining({
          sourceLineId: "line-b",
          sourceVersionId: null,
          availableAt: approvedAt,
        }),
      ],
    });
    const rows = createMany.mock.calls[0][0].data;
    expect(rows.flatMap((row: Record<string, unknown>) => Object.keys(row))).not.toEqual(expect.arrayContaining(["payload", "participants", "serviceDetails", "salesOrderId"]));
    expect((tx as Record<string, unknown>).operationalRequirement).toBeUndefined();
  });

  it("treats a unique-conflict replay as a bounded idempotent batch insert", async () => {
    const { producer, tx, createMany } = setup([{ id: "line-a", serviceDetailsVersion: 1 }], 0);

    await expect(producer.persistApprovedOrder(tx as never, "tenant-a", "order-a")).resolves.toBe(0);

    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });

  it("rejects approved source input that lacks an authoritative TravelPackage before writing", async () => {
    const { producer, tx, createMany } = setup([{ id: "line-a", serviceDetailsVersion: 1 }], 1, { id: "order-a", travelPackageId: null, proposalApprovedAt: approvedAt, lines: [{ id: "line-a", serviceDetailsVersion: 1 }] });

    await expect(producer.persistApprovedOrder(tx as never, "tenant-a", "order-a")).rejects.toEqual(expect.any(ConflictException));
    expect(createMany).not.toHaveBeenCalled();
  });

  it("does not emit for cancelled or otherwise ineligible source data", async () => {
    const { producer, tx, createMany, findFirst } = setup([], 0, null);

    await expect(producer.persistApprovedOrder(tx as never, "tenant-a", "order-a")).rejects.toEqual(expect.any(ConflictException));
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant-a", commercialStatus: "APPROVED", status: { not: "CANCELLED" } }) }));
    expect(createMany).not.toHaveBeenCalled();
  });

  it("surfaces a bounded producer failure instead of silently approving without durable intake", async () => {
    const { producer, tx, createMany } = setup([{ id: "line-a", serviceDetailsVersion: 1 }]);
    createMany.mockRejectedValueOnce(new Error("database detail"));

    await expect(producer.persistApprovedOrder(tx as never, "tenant-a", "order-a")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "OPERATIONS_INTAKE_OUTBOX_PERSISTENCE_FAILED" }),
    });
  });
});

const approvedAt = new Date("2026-09-30T18:00:00.000Z");

function setup(
  lines: Array<{ id: string; serviceDetailsVersion: number | null }>,
  inserted = lines.length,
  result: { id: string; travelPackageId: string | null; proposalApprovedAt: Date; lines: Array<{ id: string; serviceDetailsVersion: number | null }> } | null = { id: "order-a", travelPackageId: "trip-a", proposalApprovedAt: approvedAt, lines },
) {
  const findFirst = jest.fn().mockResolvedValue(result);
  const createMany = jest.fn().mockResolvedValue({ count: inserted });
  const tx = {
    additionalServiceOrder: { findFirst },
    operationsIntakeOutboxEvent: { createMany },
  };
  return { producer: new AdditionalServiceOperationsIntakeOutboxProducer(), tx, findFirst, createMany };
}
