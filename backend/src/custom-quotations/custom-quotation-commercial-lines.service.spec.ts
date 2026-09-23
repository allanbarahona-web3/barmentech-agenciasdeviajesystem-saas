import { NotFoundException } from "@nestjs/common";
import { CustomQuotationCommercialLinesService } from "./custom-quotation-commercial-lines.service";

describe("CustomQuotationCommercialLinesService", () => {
  it("maps only active components in the tenant-owned linked CostingProject", async () => {
    const c = context();
    c.tx.costComponent.findMany.mockResolvedValue([component()]);

    await expect(c.service.list("tenant-a", "quotation-a")).resolves.toEqual({
      lines: [expect.objectContaining({ displayOrder: 1, description: "Vuelo: SJO → MAD", quantity: "1" })],
    });
    expect(c.tx.costComponent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-a", costingProjectId: "project-a", status: "ACTIVE" },
      orderBy: [{ sortPosition: "asc" }, { id: "asc" }],
    }));
  });

  it("returns no structured lines for a quotation without a linked project and never reads free-form lines", async () => {
    const c = context({ link: null });
    await expect(c.service.list("tenant-a", "quotation-a")).resolves.toEqual({ lines: [] });
    expect(c.tx.costComponent.findMany).not.toHaveBeenCalled();
    expect(c.tx.customQuotationLine).toBeUndefined();
  });

  it("rejects cross-tenant quotation access before resolving a project", async () => {
    const c = context({ quotation: null });
    await expect(c.service.list("tenant-a", "quotation-b")).rejects.toBeInstanceOf(NotFoundException);
    expect(c.tx.customQuotationCostingProjectLink.findFirst).not.toHaveBeenCalled();
  });
});

function context(options: { quotation?: Record<string, unknown> | null; link?: Record<string, unknown> | null } = {}) {
  const tx = {
    $executeRaw: jest.fn(),
    customQuotation: { findFirst: jest.fn().mockResolvedValue(options.quotation === undefined ? { id: "quotation-a" } : options.quotation) },
    customQuotationCostingProjectLink: { findFirst: jest.fn().mockResolvedValue(options.link === undefined ? { costingProjectId: "project-a" } : options.link) },
    costComponent: { findMany: jest.fn() },
  } as any;
  const prisma = { $transaction: jest.fn((work: (value: typeof tx) => Promise<unknown>) => work(tx)) };
  return { tx, service: new CustomQuotationCommercialLinesService(prisma as never) };
}

function component() {
  return {
    id: "component-a", title: "SJO → MAD", description: "Interna", detailSchemaVersion: 1, quantity: null, unit: null,
    detailPayload: { flightType: "INTERNATIONAL", tripType: "ONE_WAY", origin: "SJO", destination: "MAD", departureDate: "2026-10-01" },
    costCategory: { code: "AIRFARE", origin: "STANDARD" },
  };
}
