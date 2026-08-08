import { PrismaService } from "../prisma/prisma.service";
import {
  GeneratedDocumentAccessService,
  GeneratedDocumentsService,
} from "../generated-documents";
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

  it("atomically consumes the token and records approval audit", async () => {
    const { service, transactionTokenUpdate, transactionOrderUpdate } = setup();

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
    expect(result.commercialStatus).toBe(CommercialProposalStatus.APPROVED);
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
  const transaction = jest.fn(async (work: (client: unknown) => unknown) =>
    work({
      generatedDocumentAccessToken: { updateMany: transactionTokenUpdate },
      additionalServiceOrder: { updateMany: transactionOrderUpdate },
    }),
  );
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
    ),
  };
}
