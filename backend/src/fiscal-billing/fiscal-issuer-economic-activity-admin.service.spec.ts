import { HttpException } from "@nestjs/common";
import { FiscalIssuerAdminService } from "./fiscal-issuer-admin.service";
import type { FiscalIssuerAdminRepository } from "./fiscal-issuer-admin.repository";

describe("Fiscal issuer economic activity administration", () => {
  it("lists tenant-scoped snapshots without Hacienda", async () => {
    const repository = repo();
    repository.find.mockResolvedValue(issuer());
    repository.listEconomicActivities.mockResolvedValue([activity()]);
    const provider = { findByIdentification: jest.fn() };
    const service = new FiscalIssuerAdminService(repository, provider);
    await expect(service.listEconomicActivities("tenant-a", "issuer-a")).resolves.toEqual([expect.objectContaining({ code: "007.0", description: "Official", isPrimary: false })]);
    expect(repository.listEconomicActivities).toHaveBeenCalledWith("tenant-a", "issuer-a");
    expect(provider.findByIdentification).not.toHaveBeenCalled();
  });

  it("verifies exact code and persists official immutable snapshots as non-primary", async () => {
    const repository = repo();
    repository.find.mockResolvedValue(issuer());
    repository.findEconomicActivity.mockResolvedValue(null);
    repository.createEconomicActivity.mockResolvedValue(activity());
    const provider = { findByIdentification: jest.fn().mockResolvedValue({ activities: [{ code: "007.0", description: "Official", active: true }] }) };
    const service = new FiscalIssuerAdminService(repository, provider);
    await service.assignEconomicActivity("tenant-a", "issuer-a", "007.0");
    expect(provider.findByIdentification).toHaveBeenCalledWith("0012345678");
    expect(repository.createEconomicActivity).toHaveBeenCalledWith("tenant-a", "issuer-a", "007.0", "Official");
    expect(activity().isPrimary).toBe(false);
  });

  it.each([
    [{ activities: [] }, "FISCAL_ISSUER_ECONOMIC_ACTIVITY_NOT_REGISTERED"],
    [{ activities: [{ code: "007.0", description: "Official", status: "I" }] }, "FISCAL_ISSUER_ECONOMIC_ACTIVITY_INACTIVE"],
  ])("rejects unverified/inactive activity without writing", async (lookup, code) => {
    const repository = repo(); repository.find.mockResolvedValue(issuer()); repository.findEconomicActivity.mockResolvedValue(null);
    const service = new FiscalIssuerAdminService(repository, { findByIdentification: jest.fn().mockResolvedValue(lookup) });
    await expectCode(service.assignEconomicActivity("tenant-a", "issuer-a", "007.0"), code);
    expect(repository.createEconomicActivity).not.toHaveBeenCalled();
  });

  it("returns an existing duplicate without Hacienda or overwrite", async () => {
    const repository = repo(); repository.find.mockResolvedValue(issuer()); repository.findEconomicActivity.mockResolvedValue(activity());
    const provider = { findByIdentification: jest.fn() };
    const result = await new FiscalIssuerAdminService(repository, provider).assignEconomicActivity("tenant-a", "issuer-a", "007.0");
    expect(result.id).toBe("activity-a"); expect(provider.findByIdentification).not.toHaveBeenCalled(); expect(repository.createEconomicActivity).not.toHaveBeenCalled();
  });

  it("delegates atomic primary selection and deletion without Hacienda", async () => {
    const repository = repo();
    repository.selectPrimaryEconomicActivity.mockResolvedValue({ kind: "UPDATED", activity: activity({ isPrimary: true }) });
    repository.deleteEconomicActivity.mockResolvedValue({ kind: "DELETED" });
    const provider = { findByIdentification: jest.fn() };
    const service = new FiscalIssuerAdminService(repository, provider);
    await service.selectPrimaryEconomicActivity("tenant-a", "issuer-a", "activity-a");
    await service.deleteEconomicActivity("tenant-a", "issuer-a", "activity-a");
    expect(repository.selectPrimaryEconomicActivity).toHaveBeenCalledWith("tenant-a", "issuer-a", "activity-a");
    expect(repository.deleteEconomicActivity).toHaveBeenCalledWith("tenant-a", "issuer-a", "activity-a");
    expect(provider.findByIdentification).not.toHaveBeenCalled();
  });

  it("forbids deleting a primary assignment", async () => {
    const repository = repo(); repository.deleteEconomicActivity.mockResolvedValue({ kind: "PRIMARY_REMOVAL_FORBIDDEN" });
    await expectCode(new FiscalIssuerAdminService(repository, { findByIdentification: jest.fn() }).deleteEconomicActivity("tenant-a", "issuer-a", "activity-a"), "FISCAL_ISSUER_PRIMARY_ACTIVITY_REMOVAL_FORBIDDEN");
  });
});

async function expectCode(promise: Promise<unknown>, code: string) {
  try { await promise; throw new Error("expected failure"); } catch (error) { expect(error).toBeInstanceOf(HttpException); expect((error as HttpException).getResponse()).toMatchObject({ code }); }
}
function repo() { return { list: jest.fn(), find: jest.fn(), create: jest.fn(), update: jest.fn(), setStatus: jest.fn(), listEconomicActivities: jest.fn(), findEconomicActivity: jest.fn(), createEconomicActivity: jest.fn(), selectPrimaryEconomicActivity: jest.fn(), deleteEconomicActivity: jest.fn() } as jest.Mocked<FiscalIssuerAdminRepository>; }
function issuer() { return { id: "issuer-a", tenantId: "tenant-a", displayName: "Issuer", isActive: true, legalName: "Issuer", identificationTypeCode: "02", identificationNumber: "0012345678", commercialName: null, countryCode: "CR", email: "a@b.com", phoneCountryCode: null, phoneNumber: null, provinceCode: "1", cantonCode: "01", districtCode: "01", neighborhoodCode: null, otherAddressDetails: "x", defaultCurrencyCode: null, establishmentCode: "001", terminalCode: "00001", createdAt: new Date(0), updatedAt: new Date(0) }; }
function activity(overrides: Record<string, unknown> = {}) { return { id: "activity-a", tenantId: "tenant-a", fiscalIssuerId: "issuer-a", economicActivityCode: "007.0", description: "Official", isPrimary: false, displayOrder: 0, createdAt: new Date(0), updatedAt: new Date(0), ...overrides }; }
