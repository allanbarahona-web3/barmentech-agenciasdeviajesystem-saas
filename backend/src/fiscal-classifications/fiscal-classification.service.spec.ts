import { ConflictException, NotFoundException } from "@nestjs/common";
import { FiscalItemCategory } from "@prisma/client";
import { FiscalClassificationService } from "./fiscal-classification.service";

const tenantId = "tenant-a";
const actor = { userId: "admin-a", name: "Admin A" };
const selection = {
  cabysCode: "1234567890123",
  unitOfMeasureCode: "Sp",
  taxCode: "01",
  taxRateCode: "08",
  taxPercentage: "13.0000",
};

describe("FiscalClassificationService", () => {
  it("creates tenant-scoped classifications from the authoritative catalog and permits shared CABYS", async () => {
    const c = context();
    c.tx.tenantFiscalClassification.create
      .mockResolvedValueOnce(record({ id: "classification-a", displayName: "Transporte privado" }))
      .mockResolvedValueOnce(record({ id: "classification-b", displayName: "Traslado aeropuerto" }));

    await c.service.create(tenantId, create("Transporte privado"), actor);
    await c.service.create(tenantId, create("Traslado aeropuerto"), actor);

    expect(c.fiscal.resolveFiscalSelection).toHaveBeenCalledWith(tenantId, fiscalSelection(), true);
    expect(c.tx.tenantFiscalClassification.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ tenantId, displayName: "Transporte privado", ...selection, taxPercentage: "13.0000" }),
    }));
    expect(c.tx.tenantFiscalClassification.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ tenantId, displayName: "Traslado aeropuerto", cabysCode: selection.cabysCode }),
    }));
    expect(c.tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid CABYS through the existing authoritative catalog", async () => {
    const c = context();
    c.fiscal.resolveFiscalSelection.mockRejectedValue(new Error("FISCAL_CATALOG_ENTRY_NOT_FOUND"));

    await expect(c.service.create(tenantId, create(), actor)).rejects.toThrow("FISCAL_CATALOG_ENTRY_NOT_FOUND");
    expect(c.tx.tenantFiscalClassification.create).not.toHaveBeenCalled();
  });

  it("uses explicit tenant predicates and rejects cross-tenant detail access", async () => {
    const c = context();
    c.tx.tenantFiscalClassification.findFirst.mockResolvedValue(null);

    await expect(c.service.find("tenant-b", "classification-a")).rejects.toBeInstanceOf(NotFoundException);
    expect(c.tx.tenantFiscalClassification.findFirst).toHaveBeenCalledWith({
      where: { id: "classification-a", tenantId: "tenant-b" },
    });
  });

  it("updates configuration using an authoritative replacement tax selection", async () => {
    const c = context();
    const current = record({ updatedAt: new Date("2026-09-22T00:00:00.000Z") });
    c.tx.tenantFiscalClassification.findFirst
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(record({ displayName: "Transporte terrestre", taxRateCode: "11", taxPercentage: decimal("0.0000") }));
    c.tx.tenantFiscalClassification.updateMany.mockResolvedValue({ count: 1 });
    c.fiscal.resolveFiscalSelection.mockResolvedValue({ ...selection, taxRateCode: "11", taxPercentage: "0.0000" });

    const result = await c.service.update(tenantId, "classification-a", { displayName: "Transporte terrestre", taxRateCode: "11" }, actor);

    expect(c.fiscal.resolveFiscalSelection).toHaveBeenCalledWith(tenantId, { ...fiscalSelection(), taxRateCode: "11" }, true);
    expect(c.tx.tenantFiscalClassification.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "classification-a", tenantId, updatedAt: current.updatedAt },
      data: expect.objectContaining({ displayName: "Transporte terrestre", taxRateCode: "11", taxPercentage: "0.0000", updatedByUserId: actor.userId }),
    }));
    expect(result).toMatchObject({ displayName: "Transporte terrestre", taxRateCode: "11", taxPercentage: "0.0000" });
  });

  it("deactivates and reactivates without deleting the classification", async () => {
    const c = context();
    c.tx.tenantFiscalClassification.updateMany.mockResolvedValue({ count: 1 });
    c.tx.tenantFiscalClassification.findFirst
      .mockResolvedValueOnce(record({ isActive: false }))
      .mockResolvedValueOnce(record({ isActive: true }))
      .mockResolvedValueOnce(record({ isActive: true }));

    await expect(c.service.setStatus(tenantId, "classification-a", false, actor)).resolves.toMatchObject({ isActive: false });
    await expect(c.service.setStatus(tenantId, "classification-a", true, actor)).resolves.toMatchObject({ isActive: true });
    expect(c.tx.tenantFiscalClassification.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: "classification-a", tenantId }, data: expect.objectContaining({ isActive: false }),
    }));
    expect(c.tx.tenantFiscalClassification.delete).not.toHaveBeenCalled();
  });

  it("does not convert a tenant-name uniqueness conflict into cross-tenant access", async () => {
    const c = context();
    c.tx.tenantFiscalClassification.create.mockRejectedValue({ code: "P2002" });

    await expect(c.service.create(tenantId, create(), actor)).rejects.toBeInstanceOf(ConflictException);
  });
});

function context() {
  const delegate = () => ({
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  });
  const tx = { $executeRaw: jest.fn(), tenantFiscalClassification: delegate() };
  const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => Promise<unknown>) => work(tx)) };
  const fiscal = { resolveFiscalSelection: jest.fn().mockResolvedValue(selection) };
  return { tx, fiscal, service: new FiscalClassificationService(prisma as never, fiscal as never) };
}

function create(displayName = "Transporte privado") {
  return {
    displayName,
    fiscalItemCategory: FiscalItemCategory.SERVICE,
    cabysCode: selection.cabysCode,
    unitOfMeasureCode: selection.unitOfMeasureCode,
    taxCode: selection.taxCode,
    taxRateCode: selection.taxRateCode,
  };
}

function fiscalSelection() {
  return {
    cabysCode: selection.cabysCode,
    unitOfMeasureCode: selection.unitOfMeasureCode,
    taxCode: selection.taxCode,
    taxRateCode: selection.taxRateCode,
  };
}

function decimal(value: string) {
  return { toFixed: () => value };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "classification-a",
    tenantId,
    displayName: "Transporte privado",
    description: null,
    fiscalItemCategory: FiscalItemCategory.SERVICE,
    cabysCode: selection.cabysCode,
    unitOfMeasureCode: selection.unitOfMeasureCode,
    taxCode: selection.taxCode,
    taxRateCode: selection.taxRateCode,
    taxPercentage: decimal(selection.taxPercentage),
    isActive: true,
    createdByUserId: actor.userId,
    createdByName: actor.name,
    updatedByUserId: null,
    updatedByName: null,
    createdAt: new Date("2026-09-22T00:00:00.000Z"),
    updatedAt: new Date("2026-09-22T00:00:00.000Z"),
    ...overrides,
  };
}
