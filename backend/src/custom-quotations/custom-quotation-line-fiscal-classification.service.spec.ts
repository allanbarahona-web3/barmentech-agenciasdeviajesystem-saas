import { ConflictException, NotFoundException } from "@nestjs/common";
import { CustomQuotationLineFiscalClassificationService } from "./custom-quotation-line-fiscal-classification.service";

describe("CustomQuotationLineFiscalClassificationService", () => {
  it("assigns an active tenant fiscal classification only to an active component in the quotation CostingProject", async () => {
    const c = context();
    await expect(c.service.assign("tenant-a", "quotation-a", "component-a", "fiscal-a")).resolves.toEqual({ costComponentId: "component-a", fiscalClassificationId: "fiscal-a" });
    expect(c.tx.customQuotationComponentFiscalClassification.upsert).toHaveBeenCalledWith({
      where: { tenantId_customQuotationId_costComponentId: { tenantId: "tenant-a", customQuotationId: "quotation-a", costComponentId: "component-a" } },
      create: { tenantId: "tenant-a", customQuotationId: "quotation-a", costComponentId: "component-a", fiscalClassificationId: "fiscal-a" },
      update: { fiscalClassificationId: "fiscal-a" },
    });
  });

  it("preserves tenant isolation and rejects non-draft or unavailable selections", async () => {
    const c = context();
    c.tx.customQuotation.findFirst.mockResolvedValueOnce(null);
    await expect(c.service.assign("tenant-a", "quotation-a", "component-a", "fiscal-a")).rejects.toBeInstanceOf(ConflictException);

    const missingComponent = context();
    missingComponent.tx.costComponent.findFirst.mockResolvedValue(null);
    await expect(missingComponent.service.assign("tenant-a", "quotation-a", "component-b", "fiscal-a")).rejects.toBeInstanceOf(NotFoundException);

    const missingFiscal = context();
    missingFiscal.tx.tenantFiscalClassification.findFirst.mockResolvedValue(null);
    await expect(missingFiscal.service.assign("tenant-a", "quotation-a", "component-a", "fiscal-b")).rejects.toBeInstanceOf(NotFoundException);
  });
});

function context() {
  const tx = {
    $executeRaw: jest.fn(),
    customQuotation: { findFirst: jest.fn().mockResolvedValue({ id: "quotation-a" }) },
    customQuotationCostingProjectLink: { findFirst: jest.fn().mockResolvedValue({ costingProjectId: "project-a" }) },
    costComponent: { findFirst: jest.fn().mockResolvedValue({ id: "component-a" }) },
    tenantFiscalClassification: { findFirst: jest.fn().mockResolvedValue({ id: "fiscal-a" }), findMany: jest.fn().mockResolvedValue([]) },
    customQuotationComponentFiscalClassification: { upsert: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = { $transaction: jest.fn(async (work: (transaction: typeof tx) => unknown) => work(tx)) };
  return { tx, service: new CustomQuotationLineFiscalClassificationService(prisma as never) };
}
