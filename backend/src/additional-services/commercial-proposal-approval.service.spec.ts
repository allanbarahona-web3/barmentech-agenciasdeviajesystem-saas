import { PrismaService } from "../prisma/prisma.service";
import {
  GeneratedDocumentAccessService,
  GeneratedDocumentsService,
} from "../generated-documents";
import { SalesOrderConversionService } from "../sales-orders/sales-order-conversion.service";
import { CommercialProposalApprovalService } from "./commercial-proposal-approval.service";
import { CommercialProposalStatus } from "./enums";

describe("CommercialProposalApprovalService", () => {
  it("returns only public proposal data and the persisted PDF URL", async () => {
    const { service, documents } = setup();
    documents.getSignedUrl.mockResolvedValue("https://signed.example/pdf");

    const result = await service.getPublicProposal("token");

    expect(documents.getSignedUrl).toHaveBeenCalledWith(
      "tenant-1",
      "document-1",
      900,
    );
    expect(result).toEqual({
      proposalNumber: "AS-1",
      commercialStatus: CommercialProposalStatus.SENT,
      company: { name: "Acme", logoUrl: null },
      document: {
        fileName: "proposal.pdf",
        mimeType: "application/pdf",
        size: 100,
        url: "https://signed.example/pdf",
        expiresInSeconds: 900,
      },
    });
    expect(result).not.toHaveProperty("document.id");
    expect(result).not.toHaveProperty("document.objectKey");
  });

  it("atomically approves and materializes a SalesOrder using the persisted creator", async () => {
    const {
      service,
      transactionClient,
      transactionTokenUpdate,
      transactionOrderUpdate,
      lockSource,
      materialize,
    } = setup();

    const result = await service.approve(
      "token",
      "203.0.113.10",
      "Customer Browser",
    );

    expect(transactionTokenUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "access-1", isActive: true }),
        data: expect.objectContaining({ isActive: false, usedAt: expect.any(Date) }),
      }),
    );
    expect(transactionOrderUpdate).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "order-1",
        tenantId: "tenant-1",
        commercialStatus: {
          in: [
            CommercialProposalStatus.PDF_GENERATED,
            CommercialProposalStatus.SENT,
          ],
        },
      }),
      data: {
        commercialStatus: CommercialProposalStatus.APPROVED,
        proposalApprovedAt: expect.any(Date),
        proposalApprovalMethod: "EMAIL_LINK",
        proposalApprovedByUserId: null,
        proposalApprovedByName: null,
        proposalApprovedIp: "203.0.113.10",
        proposalApprovedUserAgent: "Customer Browser",
      },
    });
    expect(materialize).toHaveBeenCalledWith(
      transactionClient,
      "tenant-1",
      "order-1",
      { id: "creator-1", fullName: "Order Creator" },
    );
    expect(lockSource).toHaveBeenCalledWith(
      transactionClient,
      "tenant-1",
      "order-1",
    );
    expect(lockSource.mock.invocationCallOrder[0]).toBeLessThan(
      transactionOrderUpdate.mock.invocationCallOrder[0],
    );
    expect(result.commercialStatus).toBe(CommercialProposalStatus.APPROVED);
  });

  it("does not commit approval or token consumption when materialization fails", async () => {
    const { service, materialize, transactionCommitted } = setup();
    materialize.mockRejectedValueOnce(
      new Error("native database detail that must not be returned"),
    );

    await expect(
      service.approve("token", "203.0.113.10", "Customer Browser"),
    ).rejects.toThrow("native database detail");
    expect(transactionCommitted()).toBe(false);
  });

  it("reuses an existing SalesOrder winner without changing public approval audit", async () => {
    const { service, materialize, transactionOrderUpdate } = setup();
    materialize.mockResolvedValueOnce(materialization(true));

    await service.approve("token", null, null);

    expect(materialize).toHaveBeenCalledTimes(1);
    expect(transactionOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          proposalApprovalMethod: "EMAIL_LINK",
          proposalApprovedByUserId: null,
          proposalApprovedByName: null,
        }),
      }),
    );
  });

  it("resolves tenant ownership from the token document", async () => {
    const { service, prismaTenantLookup } = setup();
    await service.getPublicProposal("token");
    expect(prismaTenantLookup).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      select: { name: true, logoUrl: true },
    });
  });

  it("cannot approve by email after an in-person approval won", async () => {
    const { service, transactionTokenUpdate } = setup(
      CommercialProposalStatus.APPROVED,
    );

    await expect(
      service.approve("token", "203.0.113.10", "Customer Browser"),
    ).rejects.toThrow("cannot be approved");
    expect(transactionTokenUpdate).not.toHaveBeenCalled();
  });
});

function setup(
  commercialStatus: CommercialProposalStatus = CommercialProposalStatus.SENT,
) {
  const access = {
    id: "access-1",
    generatedDocument: {
      id: "document-1",
      tenantId: "tenant-1",
      ownerType: "ADDITIONAL_SERVICE_ORDER",
      ownerId: "order-1",
      documentType: "COMMERCIAL_PROPOSAL",
      variant: "GENERATED",
      version: 1,
      objectKey: "private/key.pdf",
      fileName: "proposal.pdf",
      mimeType: "application/pdf",
      size: 100,
    },
  };
  const documentAccess = {
    resolve: jest.fn().mockResolvedValue(access),
  } as unknown as jest.Mocked<GeneratedDocumentAccessService>;
  const documents = {
    getSignedUrl: jest.fn(),
  } as unknown as jest.Mocked<GeneratedDocumentsService>;
  const transactionTokenUpdate = jest.fn().mockResolvedValue({ count: 1 });
  const transactionOrderUpdate = jest.fn().mockResolvedValue({ count: 1 });
  const transactionClient = {
    generatedDocumentAccessToken: { updateMany: transactionTokenUpdate },
    additionalServiceOrder: { updateMany: transactionOrderUpdate },
  };
  let committed = false;
  const transaction = jest.fn(async (work: (client: unknown) => unknown) => {
    const result = await work(transactionClient);
    committed = true;
    return result;
  });
  const materialize = jest.fn().mockResolvedValue(materialization(false));
  const lockSource = jest.fn().mockResolvedValue(1);
  const salesOrders = {
    lockAdditionalServiceOrder: lockSource,
    materializeAdditionalServiceOrder: materialize,
  } as unknown as SalesOrderConversionService;
  const prismaTenantLookup = jest
    .fn()
    .mockResolvedValue({ name: "Acme", logoUrl: null });
  const prisma = {
    tenant: {
      findUnique: prismaTenantLookup,
    },
    additionalServiceOrder: {
      findFirst: jest.fn().mockResolvedValue({
        id: "order-1",
        orderNumber: "AS-1",
        commercialStatus,
        createdByUserId: "creator-1",
        createdByName: "Order Creator",
      }),
    },
    $transaction: transaction,
  } as unknown as PrismaService;
  return {
    documents,
    transactionTokenUpdate,
    transactionOrderUpdate,
    prismaTenantLookup,
    service: new CommercialProposalApprovalService(
      prisma,
      documentAccess,
      documents,
      salesOrders,
    ),
    transactionClient,
    materialize,
    lockSource,
    transactionCommitted: () => committed,
  };
}

function materialization(reusedExisting: boolean) {
  return {
    salesOrder: { id: "sales-order-1", orderNumber: "SO-2026-000001" },
    reusedExisting,
  };
}
