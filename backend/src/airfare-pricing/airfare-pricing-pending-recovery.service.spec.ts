import type { JobDispatcherService } from "../infrastructure/job-dispatcher";
import type { PrismaService } from "../prisma/prisma.service";
import { AirfarePricingPendingRecoveryService } from "./airfare-pricing-pending-recovery.service";

describe("AirfarePricingPendingRecoveryService", () => {
  it("redelivers bounded pending durable requests through the existing dispatcher", async () => {
    const tx = { $executeRaw: jest.fn().mockResolvedValue(undefined), $queryRaw: jest.fn().mockResolvedValue([{ id: "request-a" }]) };
    const prisma = { tenant: { findMany: jest.fn().mockResolvedValue([{ id: "tenant-a" }]) }, $transaction: jest.fn(async (work) => work(tx)) };
    const dispatch = jest.fn().mockResolvedValue(undefined);
    const service = new AirfarePricingPendingRecoveryService(prisma as unknown as PrismaService, { dispatch } as unknown as JobDispatcherService);

    await service.recover();

    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      payload: { tenantId: "tenant-a", requestId: "request-a", eventVersion: 1 },
      metadata: { tenantId: "tenant-a" },
    }));
  });
});
