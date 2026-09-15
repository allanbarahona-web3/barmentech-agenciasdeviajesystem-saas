import { NotFoundException } from "@nestjs/common";
import { BillingTaxAuthorityStatus } from "@prisma/client";
import { CustomerAcceptedInvoiceReadService } from "./customer-accepted-invoice-read.service";

describe("CustomerAcceptedInvoiceReadService", () => {
  it("delegates an accepted invoice read only after tenant/customer/accepted scope validation", async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: "document-a" });
    const getAcceptedInvoice = jest.fn().mockResolvedValue({ billingDocumentId: "document-a" });
    const service = new CustomerAcceptedInvoiceReadService(
      { billingDocument: { findFirst } } as never,
      { getAcceptedInvoice } as never,
      {} as never,
    );

    await expect(service.get("tenant-a", "customer-a", "document-a")).resolves.toEqual({ billingDocumentId: "document-a" });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "document-a", tenantId: "tenant-a", customerId: "customer-a", taxAuthorityStatus: BillingTaxAuthorityStatus.ACCEPTED },
      select: { id: true },
    });
    expect(getAcceptedInvoice).toHaveBeenCalledWith("tenant-a", "document-a");
  });

  it("does not disclose an invoice outside the requested customer scope", async () => {
    const getAcceptedInvoice = jest.fn();
    const service = new CustomerAcceptedInvoiceReadService(
      { billingDocument: { findFirst: jest.fn().mockResolvedValue(null) } } as never,
      { getAcceptedInvoice } as never,
      {} as never,
    );
    await expect(service.get("tenant-a", "customer-b", "document-a")).rejects.toBeInstanceOf(NotFoundException);
    expect(getAcceptedInvoice).not.toHaveBeenCalled();
  });

  it("reuses the immutable fiscal artifact reader after the same customer scope check", async () => {
    const list = jest.fn().mockResolvedValue([{ artifactType: "INTERNAL_PDF" }]);
    const download = jest.fn().mockResolvedValue({ bytes: Buffer.from("pdf"), mimeType: "application/pdf", filename: "invoice.pdf" });
    const service = new CustomerAcceptedInvoiceReadService(
      { billingDocument: { findFirst: jest.fn().mockResolvedValue({ id: "document-a" }) } } as never,
      {} as never,
      { list, download } as never,
    );
    await expect(service.listArtifacts("tenant-a", "customer-a", "document-a")).resolves.toEqual([{ artifactType: "INTERNAL_PDF" }]);
    await expect(service.downloadArtifact("tenant-a", "customer-a", "document-a", "INTERNAL_PDF", "1")).resolves.toMatchObject({ filename: "invoice.pdf" });
    expect(list).toHaveBeenCalledWith("tenant-a", "document-a");
    expect(download).toHaveBeenCalledWith("tenant-a", "document-a", "INTERNAL_PDF", "1");
  });
});
