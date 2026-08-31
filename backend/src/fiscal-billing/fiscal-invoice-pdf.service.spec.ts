import { createHash } from "node:crypto";
import type { DocumentPdfService } from "../documents/document-pdf.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { ImmutableBillingArtifactStoragePort } from "../storage/immutable-billing-artifact-storage.port";
import type { BillingDocumentService } from "./billing-document.service";
import type { TenantService } from "../tenant/tenant.service";
import type { AcceptedBillingInvoice } from "./billing-document.types";
import { fiscalBillingError } from "./fiscal-billing.errors";
import { FiscalInvoicePdfService } from "./fiscal-invoice-pdf.service";

const STORED_AT = new Date("2026-08-30T18:01:00.000Z");
const PDF = Buffer.from("%PDF-1.7 accepted invoice snapshot");
const HASH = createHash("sha256").update(PDF).digest("hex");

describe("FiscalInvoicePdfService", () => {
  it("renders the persisted accepted snapshot and stores INTERNAL_PDF version 2", async () => {
    const c = context();

    await expect(
      c.service.generateAndPersist("tenant-a", "document-a"),
    ).resolves.toEqual({
      artifactType: "INTERNAL_PDF",
      version: 2,
      status: "AVAILABLE",
      mimeType: "application/pdf",
      byteSize: PDF.length.toString(),
      storedAt: STORED_AT,
    });

    expect(c.billing.getAcceptedInvoice).toHaveBeenCalledWith("tenant-a", "document-a");
    expect(c.artifacts.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId_billingDocumentId_artifactType_version: {
          tenantId: "tenant-a",
          billingDocumentId: "document-a",
          artifactType: "INTERNAL_PDF",
          version: 2,
        },
      },
    }));
    expect(c.tenant.getTenantConfig).toHaveBeenCalledWith("tenant-a");
    const html = c.pdf.renderDocumentToBuffer.mock.calls[0][0] as string;
    expect(html).toContain("Viajes Tenant");
    expect(html).toContain("https://cdn.example.test/logo.png");
    expect(html).toContain("--invoice-primary: #125ea8");
    expect(html).toContain("Sabana, San José");
    expect(html).toContain("Issuer SA");
    expect(html).toContain("Seguro · Cobertura: USD 60,000");
    expect(html).toContain("USD&nbsp;12.68");
    expect(html).toContain("USD&nbsp;110.18");
    expect(c.storage.storeImmutable).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      billingDocumentId: "document-a",
      artifactType: "INTERNAL_PDF",
      artifactVersion: 2,
      expectedSha256: HASH,
      mimeType: "application/pdf",
      bytes: PDF,
    });
    expect(c.artifacts.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: "tenant-a",
        billingDocumentId: "document-a",
        artifactType: "INTERNAL_PDF",
        version: 2,
        status: "AVAILABLE",
        sha256: HASH,
        byteSize: BigInt(PDF.length),
        mimeType: "application/pdf",
        sourceEtag: null,
        retrievedAt: STORED_AT,
        storedAt: STORED_AT,
      }),
    }));
    expect(c.invoice.totals.total).toBe("110.17500");
    expect(c.invoice.lines[0].taxes[0].taxAmount).toBe("12.67500");
  });

  it("does not render, store, or persist an ineligible document", async () => {
    const ineligible = fiscalBillingError("BILLING_DOCUMENT_INVOICE_NOT_AVAILABLE");
    const c = context({ invoiceError: ineligible });

    await expect(
      c.service.generateAndPersist("tenant-a", "document-a"),
    ).rejects.toBe(ineligible);
    expect(c.pdf.renderDocumentToBuffer).not.toHaveBeenCalled();
    expect(c.storage.storeImmutable).not.toHaveBeenCalled();
    expect(c.artifacts.findUnique).not.toHaveBeenCalled();
    expect(c.artifacts.create).not.toHaveBeenCalled();
    expect(c.tenant.getTenantConfig).not.toHaveBeenCalled();
  });

  it("returns an exact available artifact without regenerating it", async () => {
    const existing = artifact();
    const c = context({ existing });

    await expect(
      c.service.generateAndPersist("tenant-a", "document-a"),
    ).resolves.toMatchObject({
      artifactType: "INTERNAL_PDF",
      version: 2,
      status: "AVAILABLE",
    });
    expect(c.pdf.renderDocumentToBuffer).not.toHaveBeenCalled();
    expect(c.storage.storeImmutable).not.toHaveBeenCalled();
    expect(c.artifacts.create).not.toHaveBeenCalled();
    expect(c.tenant.getTenantConfig).not.toHaveBeenCalled();
  });

  it("accepts the exact concurrent unique winner and never overwrites it", async () => {
    const winner = artifact({ sha256: "b".repeat(64), storageKey: "private/winner.pdf" });
    const c = context({ createError: { code: "P2002" }, winner });

    await expect(
      c.service.generateAndPersist("tenant-a", "document-a"),
    ).resolves.toMatchObject({ status: "AVAILABLE", version: 2 });
    expect(c.artifacts.findUnique).toHaveBeenCalledTimes(2);
    expect(c.artifacts.create).toHaveBeenCalledTimes(1);
    expect(c.artifacts.update).toBeUndefined();
  });

  it.each([
    ["PENDING", artifact({ status: "PENDING", storageProvider: null, storageKey: null, sha256: null, byteSize: null, mimeType: null, retrievedAt: null, storedAt: null })],
    ["contradictory AVAILABLE", artifact({ mimeType: "application/xml" })],
  ])("rejects an existing %s artifact without overwriting", async (_label, existing) => {
    const c = context({ existing });
    await expect(
      c.service.generateAndPersist("tenant-a", "document-a"),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "BILLING_DOCUMENT_INVOICE_PDF_CONFLICT" }),
    });
    expect(c.pdf.renderDocumentToBuffer).not.toHaveBeenCalled();
    expect(c.artifacts.create).not.toHaveBeenCalled();
  });
});

function context(options: {
  existing?: ReturnType<typeof artifact> | null;
  winner?: ReturnType<typeof artifact> | null;
  createError?: unknown;
  invoiceError?: unknown;
} = {}) {
  const invoice = acceptedInvoice();
  const billing = {
    getAcceptedInvoice: options.invoiceError
      ? jest.fn().mockRejectedValue(options.invoiceError)
      : jest.fn().mockResolvedValue(invoice),
  };
  const pdf = { renderDocumentToBuffer: jest.fn().mockResolvedValue({ pdfBuffer: PDF, signatureAnchors: {} }) };
  const storage = {
    storeImmutable: jest.fn().mockResolvedValue({
      storageProvider: "PRIVATE_OBJECT_STORAGE",
      storageKey: `dev/tenants/tenant-a/billing-documents/document-a/artifacts/internal-pdf/v2/${HASH}.pdf`,
      sha256: HASH,
      byteSize: BigInt(PDF.length),
      mimeType: "application/pdf",
      storedAt: STORED_AT,
      storageEtag: "storage-etag",
    }),
  };
  const created = artifact();
  const findUnique = jest.fn()
    .mockResolvedValueOnce(options.existing ?? null)
    .mockResolvedValue(options.winner ?? options.existing ?? created);
  const create = options.createError
    ? jest.fn().mockRejectedValue(options.createError)
    : jest.fn().mockResolvedValue(created);
  const artifacts = { findUnique, create };
  const prisma = { billingDocumentArtifact: artifacts };
  const tenant = { getTenantConfig: jest.fn().mockResolvedValue({ name: "Viajes Tenant", logoUrl: "https://cdn.example.test/logo.png", contactEmail: "info@tenant.test", contactPhone: "2222-0000", contactWhatsApp: "8888-0000", businessAddress: "Sabana, San José", primaryColor: "#125EA8", secondaryColor: "#17324D" }) };
  return {
    service: new FiscalInvoicePdfService(
      billing as unknown as BillingDocumentService,
      pdf as unknown as DocumentPdfService,
      prisma as unknown as PrismaService,
      storage as unknown as ImmutableBillingArtifactStoragePort,
      tenant as unknown as TenantService,
    ),
    invoice,
    billing,
    pdf,
    storage,
    artifacts: artifacts as typeof artifacts & { update?: jest.Mock },
    tenant,
  };
}

function artifact(overrides: Record<string, unknown> = {}) {
  return {
    id: "artifact-a",
    tenantId: "tenant-a",
    billingDocumentId: "document-a",
    artifactType: "INTERNAL_PDF",
    version: 2,
    status: "AVAILABLE",
    storageProvider: "PRIVATE_OBJECT_STORAGE",
    storageKey: "private/invoice.pdf",
    sha256: HASH,
    byteSize: BigInt(PDF.length),
    mimeType: "application/pdf",
    sourceEtag: null,
    retrievedAt: STORED_AT,
    storedAt: STORED_AT,
    terminalErrorCode: null,
    failedAt: null,
    ...overrides,
  };
}

function acceptedInvoice(): AcceptedBillingInvoice {
  return {
    billingDocumentId: "document-a",
    internalNumber: "BD-SO-order-a",
    fiscalNumber: "00100001010000000228",
    haciendaKey: "50630082600310100000000100001010000000228123456789",
    documentTypeCode: "01",
    lifecycleStatus: "SUBMITTED",
    taxAuthorityStatus: "ACCEPTED",
    issuedDate: "2026-08-30",
    currencyCode: "USD",
    issuer: { name: "Issuer SA", legalName: "Issuer SA", identificationType: "02", identificationNumber: "3101000000", email: "issuer@example.test", phone: "2222-2222", address: { provinceCode: "1", cantonCode: "01", districtCode: "01", neighborhoodCode: null, otherAddressDetails: "San José centro" } },
    paymentCondition: { code: "01", creditTermDays: null, dueDate: "2026-08-30" },
    receiver: { name: "Customer", identificationType: "01", identificationNumber: "123456789", email: "customer@example.test" },
    salesOrder: { id: "order-a", number: "SO-2026-000010" },
    paymentMethods: [{ code: "01", description: null, declaredAmount: null }],
    lines: [{
      lineNumber: 1,
      cabysCode: "78111800",
      itemCode: "INSURANCE",
      description: "Seguro · Cobertura: USD 60,000",
      quantity: "1.00000",
      unitOfMeasureCode: "Sp",
      unitPrice: "97.50000",
      subtotal: "97.50000",
      taxableBase: "97.50000",
      taxes: [{ taxCode: "01", rateCode: "08", ratePercentage: "13.00000", taxableBase: "97.50000", taxAmount: "12.67500", netTaxAmount: "12.67500" }],
      lineTotal: "110.17500",
    }],
    totals: { subtotal: "97.50000", totalTax: "12.67500", total: "110.17500" },
  };
}
