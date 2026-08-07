import { EmailService } from "../email/email.service";
import {
  GeneratedDocumentAccessService,
  GeneratedDocumentRecord,
  GeneratedDocumentsService,
} from "../generated-documents";
import { TenantService } from "../tenant/tenant.service";
import { ConfigService } from "@nestjs/config";
import { CommercialProposalEmailService } from "./commercial-proposal-email.service";
import {
  AdditionalServiceOrderStatus,
  CommercialProposalStatus,
} from "./enums";
import type {
  AdditionalServiceOrderRecord,
  AdditionalServicesRepository,
} from "./repositories";

describe("CommercialProposalEmailService", () => {
  it("downloads and attaches the persisted PDF before recording SENT", async () => {
    const { service, repository, documents, email } = setup();
    const pdf = Buffer.from("stored-pdf");
    documents.findLatest.mockResolvedValue(documentRecord());
    documents.download.mockResolvedValue(pdf);
    email.sendEmail.mockResolvedValue({ success: true, emailId: "email-1" });

    const result = await service.send(orderRecord(), "tenant-1", {
      userId: "user-1",
      email: "agent@example.com",
      fullName: "Agent Example",
    });

    expect(documents.findLatest).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      ownerType: "ADDITIONAL_SERVICE_ORDER",
      ownerId: "order-1",
      documentType: "COMMERCIAL_PROPOSAL",
      variant: "GENERATED",
      version: 1,
    });
    expect(documents.download).toHaveBeenCalledWith("tenant-1", "document-1");
    expect(email.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        to: "customer@example.com",
        template: "business-document-attachment",
        templateData: expect.objectContaining({
          documentNumber: "AS-2026-0042",
          recipientName: "Customer Name",
        }),
        attachments: [
          {
            filename: "proposal.pdf",
            content: pdf.toString("base64"),
            contentType: "application/pdf",
          },
        ],
      }),
    );
    expect(repository.updateOrderDelivery).toHaveBeenCalledWith(
      "tenant-1",
      "order-1",
      {
        commercialStatus: CommercialProposalStatus.SENT,
        proposalSentAt: expect.any(Date),
        proposalSentToEmail: "customer@example.com",
      },
    );
    expect(result).toEqual(
      expect.objectContaining({
        documentId: "document-1",
        commercialStatus: CommercialProposalStatus.SENT,
        recipientEmail: "customer@example.com",
      }),
    );
  });

  it("rejects an order that is not ready for delivery", async () => {
    const { service, documents, email } = setup();
    await expect(
      service.send(
        orderRecord({ commercialStatus: CommercialProposalStatus.DRAFT }),
        "tenant-1",
        { userId: "user-1", email: "agent@example.com", fullName: "Agent" },
      ),
    ).rejects.toThrow("solo puede enviarse");
    expect(documents.findLatest).not.toHaveBeenCalled();
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it("rejects delivery when the persisted document is absent", async () => {
    const { service, documents, email } = setup();
    documents.findLatest.mockResolvedValue(null);
    await expect(
      service.send(orderRecord(), "tenant-1", {
        userId: "user-1",
        email: "agent@example.com",
        fullName: "Agent",
      }),
    ).rejects.toThrow("PDF persistido");
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it("does not record SENT when the email engine reports failure", async () => {
    const { service, repository, documents, email } = setup();
    documents.findLatest.mockResolvedValue(documentRecord());
    documents.download.mockResolvedValue(Buffer.from("pdf"));
    email.sendEmail.mockResolvedValue({ success: false, error: "provider down" });
    await expect(
      service.send(orderRecord(), "tenant-1", {
        userId: "user-1",
        email: "agent@example.com",
        fullName: "Agent",
      }),
    ).rejects.toThrow("provider down");
    expect(repository.updateOrderDelivery).not.toHaveBeenCalled();
  });
});

function setup() {
  const repository = {
    updateOrderDelivery: jest.fn(),
  } as unknown as jest.Mocked<AdditionalServicesRepository>;
  const documents = {
    findLatest: jest.fn(),
    download: jest.fn(),
  } as unknown as jest.Mocked<GeneratedDocumentsService>;
  const email = {
    sendEmail: jest.fn(),
  } as unknown as jest.Mocked<EmailService>;
  const access = {
    issue: jest.fn().mockResolvedValue("approval-token"),
    revoke: jest.fn(),
  } as unknown as jest.Mocked<GeneratedDocumentAccessService>;
  const tenantService = {
    getTenantConfig: jest.fn().mockResolvedValue({ subdomain: "acme" }),
  } as unknown as jest.Mocked<TenantService>;
  const configService = {
    get: jest.fn((key: string) =>
      key === "PUBLIC_APP_BASE_URL" ? "https://app.example.com" : "",
    ),
  } as unknown as jest.Mocked<ConfigService>;
  return {
    repository,
    documents,
    email,
    access,
    service: new CommercialProposalEmailService(
      repository,
      documents,
      email,
      access,
      tenantService,
      configService,
    ),
  };
}

function orderRecord(
  overrides: Partial<AdditionalServiceOrderRecord> = {},
): AdditionalServiceOrderRecord {
  return {
    id: "order-1",
    tenantId: "tenant-1",
    orderNumber: "AS-2026-0042",
    status: AdditionalServiceOrderStatus.DRAFT,
    commercialStatus: CommercialProposalStatus.PDF_GENERATED,
    lines: [
      {
        participants: [
          {
            role: "HOLDER",
            fullName: "Customer Name",
            email: " Customer@Example.com ",
          },
        ],
      },
    ],
    ...overrides,
  } as AdditionalServiceOrderRecord;
}

function documentRecord() {
  return {
    id: "document-1",
    fileName: "proposal.pdf",
    mimeType: "application/pdf",
  } as GeneratedDocumentRecord;
}
