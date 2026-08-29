import { ConflictException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { GeneratedDocumentsService } from "../generated-documents";
import { SalesOrderConversionService } from "../sales-orders/sales-order-conversion.service";
import { CommercialProposalInPersonApprovalService } from "./commercial-proposal-in-person-approval.service";
import { CommercialProposalStatus } from "./enums";
import type { AdditionalServiceOrderRecord } from "./repositories";

describe("CommercialProposalInPersonApprovalService", () => {
  it("atomically records the authenticated agent and materializes the SalesOrder", async () => {
    const {
      service,
      findLatest,
      executeRaw,
      lockSource,
      materialize,
      transactionClient,
    } = setup(1);

    const result = await service.approve(order(), "tenant-1", {
      id: "agent-1",
      fullName: "Agent One",
    });

    expect(findLatest).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      ownerType: "ADDITIONAL_SERVICE_ORDER",
      ownerId: "order-1",
      documentType: "COMMERCIAL_PROPOSAL",
      variant: "GENERATED",
      version: 1,
    });
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw.mock.calls[0].slice(1)).toEqual(
      expect.arrayContaining([
        expect.any(Date),
        "agent-1",
        "Agent One",
        "order-1",
        "tenant-1",
      ]),
    );
    expect(result).toEqual(
      expect.objectContaining({
        commercialStatus: CommercialProposalStatus.APPROVED,
        approvalMethod: "IN_PERSON",
      }),
    );
    expect(materialize).toHaveBeenCalledWith(
      transactionClient,
      "tenant-1",
      "order-1",
      { id: "agent-1", fullName: "Agent One" },
    );
    expect(lockSource).toHaveBeenCalledWith(
      transactionClient,
      "tenant-1",
      "order-1",
    );
    expect(lockSource.mock.invocationCallOrder[0]).toBeLessThan(
      executeRaw.mock.invocationCallOrder[0],
    );
  });

  it("does not commit APPROVED when SalesOrder materialization fails", async () => {
    const { service, materialize, transactionCommitted } = setup(1);
    materialize.mockRejectedValueOnce(
      new Error("native materialization failure"),
    );

    await expect(
      service.approve(order(), "tenant-1", {
        id: "agent-1",
        fullName: "Agent One",
      }),
    ).rejects.toThrow("native materialization failure");
    expect(transactionCommitted()).toBe(false);
  });

  it("reuses an existing SalesOrder winner", async () => {
    const { service, materialize } = setup(1);
    materialize.mockResolvedValueOnce(materialization(true));

    await service.approve(order(), "tenant-1", {
      id: "agent-1",
      fullName: "Agent One",
    });

    expect(materialize).toHaveBeenCalledTimes(1);
  });

  it("rejects an already approved proposal before document lookup", async () => {
    const { service, findLatest, executeRaw } = setup(1);
    await expect(
      service.approve(
        order({ commercialStatus: CommercialProposalStatus.APPROVED }),
        "tenant-1",
        { id: "agent-1", fullName: "Agent One" },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(findLatest).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("rejects approval when the persisted proposal PDF is absent", async () => {
    const { service, findLatest, executeRaw } = setup(1);
    findLatest.mockResolvedValue(null);
    await expect(
      service.approve(order(), "tenant-1", {
        id: "agent-1",
        fullName: "Agent One",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("loses safely when another approval wins the conditional update", async () => {
    const { service } = setup(0);
    await expect(
      service.approve(order(), "tenant-1", {
        id: "agent-1",
        fullName: "Agent One",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

function order(
  overrides: Partial<AdditionalServiceOrderRecord> = {},
): AdditionalServiceOrderRecord {
  return {
    id: "order-1",
    tenantId: "tenant-1",
    orderNumber: "AS-2026-1",
    commercialStatus: CommercialProposalStatus.SENT,
    ...overrides,
  } as AdditionalServiceOrderRecord;
}

function setup(updateCount: number) {
  const executeRaw = jest.fn().mockResolvedValue(updateCount);
  const transactionClient = { $executeRaw: executeRaw };
  let committed = false;
  const prisma = {
    $transaction: jest.fn(async (work: (tx: unknown) => unknown) => {
      const result = await work(transactionClient);
      committed = true;
      return result;
    }),
  } as unknown as PrismaService;
  const findLatest = jest.fn().mockResolvedValue({ id: "document-1" });
  const documents = {
    findLatest,
  } as unknown as GeneratedDocumentsService;
  const materialize = jest.fn().mockResolvedValue(materialization(false));
  const lockSource = jest.fn().mockResolvedValue(1);
  const salesOrders = {
    lockAdditionalServiceOrder: lockSource,
    materializeAdditionalServiceOrder: materialize,
  } as unknown as SalesOrderConversionService;
  return {
    service: new CommercialProposalInPersonApprovalService(
      prisma,
      documents,
      salesOrders,
    ),
    findLatest,
    executeRaw,
    materialize,
    lockSource,
    transactionClient,
    transactionCommitted: () => committed,
  };
}

function materialization(reusedExisting: boolean) {
  return {
    salesOrder: { id: "sales-order-1", orderNumber: "SO-2026-000001" },
    reusedExisting,
  };
}
