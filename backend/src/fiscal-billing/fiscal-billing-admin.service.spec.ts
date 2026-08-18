import { HttpException } from "@nestjs/common";
import { FiscalBillingAdminService } from "./fiscal-billing-admin.service";
import type { FiscalBillingAdminRepository } from "./fiscal-billing-admin.repository";
import type {
  TenantBillingConfigurationRecord,
  TenantBillingConfigurationUpdate,
} from "./fiscal-billing-admin.types";

describe("FiscalBillingAdminService", () => {
  it("returns safe defaults without writing when configuration is absent", async () => {
    const repository = repositoryMock();
    repository.findConfiguration.mockResolvedValue(null);
    const service = new FiscalBillingAdminService(repository);

    await expect(service.getConfiguration("tenant-a")).resolves.toEqual({
      configured: false,
      configuration: {
        id: null,
        billingEnabled: false,
        externalRegistrationEnabled: false,
        electronicIssuanceEnabled: false,
        countryCode: "CR",
        defaultCurrencyCode: "CRC",
        fiscalTimezone: "America/Costa_Rica",
        fiscalSchemaVersion: "4.4",
        createdAt: null,
        updatedAt: null,
      },
    });
    expect(repository.upsertConfiguration).not.toHaveBeenCalled();
  });

  it("returns all persisted values and timestamps without provider data", async () => {
    const repository = repositoryMock();
    repository.findConfiguration.mockResolvedValue(record());
    const service = new FiscalBillingAdminService(repository);

    const response = await service.getConfiguration("tenant-a");

    expect(response).toEqual({
      configured: true,
      configuration: {
        id: "config-a",
        billingEnabled: true,
        externalRegistrationEnabled: false,
        electronicIssuanceEnabled: true,
        countryCode: "CR",
        defaultCurrencyCode: "CRC",
        fiscalTimezone: "America/Costa_Rica",
        fiscalSchemaVersion: "4.4",
        createdAt: "2026-08-17T10:00:00.000Z",
        updatedAt: "2026-08-17T11:00:00.000Z",
      },
    });
    expect(JSON.stringify(response)).not.toMatch(/credential|apiKey|apiSecret/i);
  });

  it("creates a disabled singleton without requiring an issuer", async () => {
    const repository = repositoryMock();
    repository.findConfiguration.mockResolvedValue(null);
    repository.upsertConfiguration.mockResolvedValue(
      record({ billingEnabled: false, electronicIssuanceEnabled: false }),
    );
    const service = new FiscalBillingAdminService(repository);

    await service.updateConfiguration("tenant-a", { billingEnabled: false });

    expect(repository.upsertConfiguration).toHaveBeenCalledWith("tenant-a", {
      billingEnabled: false,
    });
  });

  it("updates the same singleton through the repository upsert boundary", async () => {
    const repository = new InMemoryRepository();
    const service = new FiscalBillingAdminService(repository);

    const created = await service.updateConfiguration("tenant-a", {
      billingEnabled: false,
    });
    const updated = await service.updateConfiguration("tenant-a", {
      billingEnabled: true,
    });

    expect(created.configuration.id).toBe("config-tenant-a");
    expect(updated.configuration.id).toBe("config-tenant-a");
    expect(repository.records).toHaveLength(1);
  });

  it("rejects electronic issuance for a non-CR country with a stable error", async () => {
    const repository = repositoryMock();
    repository.findConfiguration.mockResolvedValue(null);
    const service = new FiscalBillingAdminService(repository);

    await expectStableError(
      service.updateConfiguration("tenant-a", {
        electronicIssuanceEnabled: true,
        countryCode: "US",
      }),
      "BILLING_CONFIGURATION_INVALID_COUNTRY",
    );
    expect(repository.upsertConfiguration).not.toHaveBeenCalled();
  });

  it("rejects electronic issuance for an unsupported schema with a stable error", async () => {
    const repository = repositoryMock();
    repository.findConfiguration.mockResolvedValue(null);
    const service = new FiscalBillingAdminService(repository);

    await expectStableError(
      service.updateConfiguration("tenant-a", {
        electronicIssuanceEnabled: true,
        fiscalSchemaVersion: "4.3",
      }),
      "BILLING_CONFIGURATION_INVALID_SCHEMA",
    );
  });
});

function repositoryMock() {
  return {
    findConfiguration: jest.fn(),
    upsertConfiguration: jest.fn(),
  } as jest.Mocked<FiscalBillingAdminRepository>;
}

function record(
  overrides: Partial<TenantBillingConfigurationRecord> = {},
): TenantBillingConfigurationRecord {
  return {
    id: "config-a",
    tenantId: "tenant-a",
    billingEnabled: true,
    externalRegistrationEnabled: false,
    electronicIssuanceEnabled: true,
    countryCode: "CR",
    defaultCurrencyCode: "CRC",
    fiscalTimezone: "America/Costa_Rica",
    fiscalSchemaVersion: "4.4",
    createdAt: new Date("2026-08-17T10:00:00.000Z"),
    updatedAt: new Date("2026-08-17T11:00:00.000Z"),
    ...overrides,
  };
}

class InMemoryRepository implements FiscalBillingAdminRepository {
  records: TenantBillingConfigurationRecord[] = [];

  async findConfiguration(tenantId: string) {
    return this.records.find((item) => item.tenantId === tenantId) ?? null;
  }

  async upsertConfiguration(
    tenantId: string,
    input: TenantBillingConfigurationUpdate,
  ) {
    const existing = await this.findConfiguration(tenantId);
    if (existing) {
      Object.assign(existing, input, { updatedAt: new Date() });
      return existing;
    }
    const created = record({
      id: `config-${tenantId}`,
      tenantId,
      billingEnabled: false,
      electronicIssuanceEnabled: false,
      ...input,
    });
    this.records.push(created);
    return created;
  }
}

async function expectStableError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error("Expected request to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getResponse()).toEqual(
      expect.objectContaining({ code }),
    );
  }
}
