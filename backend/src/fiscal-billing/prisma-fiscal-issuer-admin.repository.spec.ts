import { PrismaFiscalIssuerAdminRepository } from "./prisma-fiscal-issuer-admin.repository";

describe("PrismaFiscalIssuerAdminRepository", () => {
  it("lists and reads with exact tenant scoping and stable ordering", async () => {
    const { prisma } = prismaMock();
    prisma.fiscalIssuer.findMany.mockResolvedValue([]);
    prisma.fiscalIssuer.findFirst.mockResolvedValue(null);
    const repository = new PrismaFiscalIssuerAdminRepository(prisma as never);

    await repository.list("tenant-a");
    await repository.find("tenant-a", "issuer-a");

    expect(prisma.fiscalIssuer.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a" },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
    });
    expect(prisma.fiscalIssuer.findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", id: "issuer-a" },
    });
  });

  it("always creates an issuer inactive for the authenticated tenant", async () => {
    const { prisma } = prismaMock();
    prisma.fiscalIssuer.create.mockResolvedValue({});
    const repository = new PrismaFiscalIssuerAdminRepository(prisma as never);
    const input = issuerInput();

    await repository.create("tenant-a", input);

    expect(prisma.fiscalIssuer.create).toHaveBeenCalledWith({
      data: { tenantId: "tenant-a", ...input, isActive: false },
    });
  });

  it("updates only a tenant-owned issuer and does not change status", async () => {
    const { prisma, tx } = prismaMock();
    tx.fiscalIssuer.findFirst.mockResolvedValue({ id: "issuer-a" });
    tx.fiscalIssuer.update.mockResolvedValue({});
    const repository = new PrismaFiscalIssuerAdminRepository(prisma as never);

    await repository.update("tenant-a", "issuer-a", { displayName: "Updated" });

    expect(tx.fiscalIssuer.update).toHaveBeenCalledWith({
      where: { id_tenantId: { id: "issuer-a", tenantId: "tenant-a" } },
      data: { displayName: "Updated" },
    });
  });

  it("never modifies another tenant when the target is foreign or missing", async () => {
    const { prisma, tx } = prismaMock();
    tx.fiscalIssuer.findFirst.mockResolvedValue(null);
    const repository = new PrismaFiscalIssuerAdminRepository(prisma as never);

    await expect(repository.setStatus("tenant-a", "foreign", true)).resolves.toEqual({ kind: "NOT_FOUND" });

    expect(tx.fiscalIssuer.updateMany).not.toHaveBeenCalled();
    expect(tx.fiscalIssuer.update).not.toHaveBeenCalled();
  });

  it("rejects incomplete activation before any write", async () => {
    const { prisma, tx } = prismaMock();
    tx.fiscalIssuer.findFirst.mockResolvedValue(issuerRecord({ establishmentCode: null }));
    const repository = new PrismaFiscalIssuerAdminRepository(prisma as never);

    await expect(repository.setStatus("tenant-a", "issuer-a", true)).resolves.toEqual({
      kind: "INCOMPLETE",
      missingFields: ["establishmentCode"],
    });
    expect(tx.fiscalIssuer.updateMany).not.toHaveBeenCalled();
    expect(tx.fiscalIssuer.update).not.toHaveBeenCalled();
  });

  it("atomically deactivates the previous issuer and activates the tenant target", async () => {
    const { prisma, tx } = prismaMock();
    tx.fiscalIssuer.findFirst.mockResolvedValue(issuerRecord());
    tx.fiscalIssuer.updateMany.mockResolvedValue({ count: 1 });
    tx.fiscalIssuer.update.mockResolvedValue(issuerRecord({ isActive: true }));
    const repository = new PrismaFiscalIssuerAdminRepository(prisma as never);

    await repository.setStatus("tenant-a", "issuer-a", true);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.fiscalIssuer.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", isActive: true, id: { not: "issuer-a" } },
      data: { isActive: false },
    });
    expect(tx.fiscalIssuer.update).toHaveBeenCalledWith({
      where: { id_tenantId: { id: "issuer-a", tenantId: "tenant-a" } },
      data: { isActive: true },
    });
  });

  it.each([
    { current: false, requested: false },
    { current: true, requested: true },
  ])("is idempotent for repeated status $requested", async ({ current, requested }) => {
    const { prisma, tx } = prismaMock();
    tx.fiscalIssuer.findFirst.mockResolvedValue(issuerRecord({ isActive: current }));
    const repository = new PrismaFiscalIssuerAdminRepository(prisma as never);

    await repository.setStatus("tenant-a", "issuer-a", requested);

    expect(tx.fiscalIssuer.updateMany).not.toHaveBeenCalled();
    expect(tx.fiscalIssuer.update).not.toHaveBeenCalled();
  });

  it("deactivates only the tenant-scoped target without touching other issuers", async () => {
    const { prisma, tx } = prismaMock();
    tx.fiscalIssuer.findFirst.mockResolvedValue(issuerRecord({ isActive: true }));
    tx.fiscalIssuer.update.mockResolvedValue(issuerRecord({ isActive: false }));
    const repository = new PrismaFiscalIssuerAdminRepository(prisma as never);

    await repository.setStatus("tenant-a", "issuer-a", false);

    expect(tx.fiscalIssuer.updateMany).not.toHaveBeenCalled();
    expect(tx.fiscalIssuer.update).toHaveBeenCalledWith({
      where: { id_tenantId: { id: "issuer-a", tenantId: "tenant-a" } },
      data: { isActive: false },
    });
  });
});

function prismaMock() {
  const tx = {
    fiscalIssuer: {
      findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn(),
    },
  };
  const prisma = {
    fiscalIssuer: {
      findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return { prisma, tx };
}

function issuerInput() {
  return {
    displayName: "Issuer", legalName: "Issuer S.A.", identificationTypeCode: "02",
    identificationNumber: "0012345678", commercialName: null, countryCode: "CR",
    email: "fiscal@example.com", phoneCountryCode: null, phoneNumber: null,
    provinceCode: "1", cantonCode: "01", districtCode: "01", neighborhoodCode: null,
    otherAddressDetails: "San José", defaultCurrencyCode: null,
    establishmentCode: "001", terminalCode: "00001",
  };
}

function issuerRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "issuer-a", tenantId: "tenant-a", isActive: false,
    ...issuerInput(), createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}
