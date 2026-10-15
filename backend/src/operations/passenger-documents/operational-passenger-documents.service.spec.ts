import { NotFoundException } from "@nestjs/common";
import { CustomerDocumentCategory } from "@prisma/client";
import { OperationalPassengerDocumentsService } from "./operational-passenger-documents.service";

const tenantId = "tenant-a";
const requirementId = "requirement-a";

describe("OperationalPassengerDocumentsService", () => {
  it("returns only allowed current documents for a trip passenger without object keys", async () => {
    const c = context(tripRequirement());
    c.tx.customerDocument.findMany.mockResolvedValue([
      document({ category: CustomerDocumentCategory.ID_FRONT }),
      document({ id: "passport-a", category: CustomerDocumentCategory.PASSPORT }),
      document({ id: "other-a", category: CustomerDocumentCategory.OTHER, objectKey: "private/other" }),
    ]);

    const result = await c.service.list(tenantId, requirementId);

    expect(result).toEqual({
      passengers: [{
        contextKey: "passenger:participant-a",
        displayName: "Ada Passenger",
        documents: [
          expect.objectContaining({ id: "document-a", category: CustomerDocumentCategory.ID_FRONT }),
          expect.objectContaining({ id: "passport-a", category: CustomerDocumentCategory.PASSPORT }),
        ],
      }],
    });
    expect(JSON.stringify(result)).not.toContain("objectKey");
    expect(c.tx.customerDocument.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId,
        customerId: { in: ["customer-a"] },
        category: { in: [CustomerDocumentCategory.ID_FRONT, CustomerDocumentCategory.ID_BACK, CustomerDocumentCategory.PASSPORT] },
        isCurrent: true,
      }),
    }));
  });

  it("resolves multiple trip passengers with one requirement read and one document query", async () => {
    const c = context(tripRequirement({
      passengers: [
        tripPassenger("participant-a", "customer-a", "Ada Passenger"),
        tripPassenger("participant-b", "customer-b", "Ben Passenger"),
      ],
    }));
    c.tx.customerDocument.findMany.mockResolvedValue([
      document({ customerId: "customer-a" }),
      document({ id: "document-b", customerId: "customer-b", category: CustomerDocumentCategory.ID_BACK }),
    ]);

    await expect(c.service.list(tenantId, requirementId)).resolves.toMatchObject({
      passengers: [
        { contextKey: "passenger:participant-a", documents: [{ id: "document-a" }] },
        { contextKey: "passenger:participant-b", documents: [{ id: "document-b" }] },
      ],
    });
    expect(c.tx.operationalRequirement.findFirst).toHaveBeenCalledTimes(1);
    expect(c.tx.customerDocument.findMany).toHaveBeenCalledTimes(1);
  });

  it("returns standalone customer documents from the requirement authority without a caller-supplied customer", async () => {
    const c = context(standaloneRequirement());
    c.tx.customerDocument.findMany.mockResolvedValue([document({ customerId: "customer-standalone", category: CustomerDocumentCategory.ID_BACK })]);

    await expect(c.service.list(tenantId, requirementId)).resolves.toMatchObject({
      passengers: [{
        contextKey: "customer:customer-standalone",
        displayName: "Standalone Customer",
        documents: [{ category: CustomerDocumentCategory.ID_BACK }],
      }],
    });
    expect(c.tx.operationalRequirement.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: requirementId, tenantId },
    }));
  });

  it.each([
    CustomerDocumentCategory.ID_FRONT,
    CustomerDocumentCategory.ID_BACK,
    CustomerDocumentCategory.PASSPORT,
  ])("includes allowed category %s", async (category) => {
    const c = context(tripRequirement());
    c.tx.customerDocument.findMany.mockResolvedValue([document({ category })]);

    await expect(c.service.list(tenantId, requirementId)).resolves.toMatchObject({
      passengers: [{ documents: [{ category }] }],
    });
  });

  it("denies cross-tenant requirements before document lookup", async () => {
    const c = context(null);

    await expect(c.service.list("tenant-b", requirementId)).rejects.toBeInstanceOf(NotFoundException);
    expect(c.tx.customerDocument.findMany).not.toHaveBeenCalled();
  });

  it("uses CustomerDocumentsService for one authorized signed URL", async () => {
    const c = context(tripRequirement());
    c.tx.customerDocument.findFirst.mockResolvedValue({ customerId: "customer-a", category: CustomerDocumentCategory.PASSPORT });
    c.customerDocuments.generateDownloadUrl.mockResolvedValue({ url: "https://signed.example/document", fileName: "passport.pdf", mimeType: "application/pdf", size: 100 });

    await expect(c.service.getSignedUrl(tenantId, requirementId, "passport-a")).resolves.toEqual({
      url: "https://signed.example/document",
      fileName: "passport.pdf",
      mimeType: "application/pdf",
      size: 100,
    });
    expect(c.customerDocuments.generateDownloadUrl).toHaveBeenCalledWith(tenantId, "customer-a", "passport-a");
  });

  it("denies an unrelated, disallowed, or substituted document before signing", async () => {
    const c = context(tripRequirement());
    c.tx.customerDocument.findFirst.mockResolvedValue(null);

    await expect(c.service.getSignedUrl(tenantId, requirementId, "document-customer-b")).rejects.toThrow("OPERATIONAL_PASSENGER_DOCUMENT_NOT_FOUND");
    expect(c.tx.customerDocument.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ customerId: { in: ["customer-a"] } }),
    }));
    expect(c.customerDocuments.generateDownloadUrl).not.toHaveBeenCalled();
  });
});

function context(requirement: ReturnType<typeof tripRequirement> | ReturnType<typeof standaloneRequirement> | null) {
  const tx = {
    $executeRaw: jest.fn(),
    operationalRequirement: { findFirst: jest.fn().mockResolvedValue(requirement) },
    customerDocument: { findMany: jest.fn(), findFirst: jest.fn() },
  };
  const prisma = { $transaction: jest.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)) };
  const customerDocuments = { generateDownloadUrl: jest.fn() };
  return {
    tx,
    customerDocuments,
    service: new OperationalPassengerDocumentsService(prisma as never, customerDocuments as never),
  };
}

function tripRequirement(overrides: Record<string, unknown> = {}) {
  return {
    scopeType: "TRAVEL_PACKAGE" as const,
    customerId: null,
    customer: null,
    passengers: [tripPassenger("participant-a", "customer-a", "Ada Passenger")],
    ...overrides,
  };
}

function standaloneRequirement() {
  return {
    scopeType: "STANDALONE_CUSTOMER" as const,
    customerId: "customer-standalone",
    customer: { id: "customer-standalone", fullName: "Standalone Customer" },
    passengers: [],
  };
}

function tripPassenger(travelPackageParticipantId: string, clientId: string, fullName: string) {
  return {
    travelPackageParticipantId,
    travelPackageParticipant: { clientId, client: { fullName } },
  };
}

function document(overrides: Record<string, unknown> = {}) {
  return {
    id: "document-a",
    customerId: "customer-a",
    category: CustomerDocumentCategory.ID_FRONT,
    originalFileName: "identification.pdf",
    mimeType: "application/pdf",
    createdAt: new Date("2026-10-14T00:00:00.000Z"),
    objectKey: "private/customer-a/document-a",
    ...overrides,
  };
}
