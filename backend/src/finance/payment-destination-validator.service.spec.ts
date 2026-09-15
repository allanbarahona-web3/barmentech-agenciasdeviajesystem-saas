import { PaymentDestinationValidator } from "./payment-destination-validator.service";

describe("PaymentDestinationValidator", () => {
  it("matches an exact normalized registered account and returns only masked values", async () => {
    const c = context([account({ accountNumber: "CR12 3456-7890-1234-5678" })]);

    await expect(c.service.validate({ tenantId: "tenant-a", extractedDestinationAccount: " cr123456789012345678 ", extractedBankName: "Banco A" })).resolves.toEqual({
      status: "MATCHED",
      matchedAccount: { id: "account-a", bankName: "Banco A", maskedAccountNumber: "****5678", maskedSinpeNumber: "****1234", currencyCode: "CRC" },
      bankNameMatches: true,
    });
    expect(c.accounts.listDestinationValidationAccounts).toHaveBeenCalledWith("tenant-a");
  });

  it("matches an exact SINPE identifier", async () => {
    const c = context([account({ sinpeNumber: "8888-1234" })]);
    await expect(c.service.validate({ tenantId: "tenant-a", extractedSinpePhone: "88881234" })).resolves.toMatchObject({
      status: "MATCHED", matchedAccount: { id: "account-a", maskedSinpeNumber: "****1234" },
    });
  });

  it("reports an inactive exact match as unmatched with safe account context", async () => {
    const c = context([account({ isActive: false })]);
    await expect(c.service.validate({ tenantId: "tenant-a", extractedDestinationAccount: "CR123456789012345678" })).resolves.toMatchObject({
      status: "UNMATCHED", reason: "INACTIVE", matchedAccount: { id: "account-a", maskedAccountNumber: "****5678" },
    });
  });

  it("reports unregistered and absent identifiers without fabrication", async () => {
    const c = context([]);
    await expect(c.service.validate({ tenantId: "tenant-a", extractedDestinationAccount: "CR0000" })).resolves.toEqual({ status: "UNMATCHED", reason: "NOT_REGISTERED" });
    await expect(c.service.validate({ tenantId: "tenant-a", extractedBankName: "Banco A" })).resolves.toEqual({ status: "UNKNOWN", reason: "NO_IDENTIFIER" });
  });

  it("does not infer a match from bank name alone", async () => {
    const c = context([account()]);
    await expect(c.service.validate({ tenantId: "tenant-a", extractedBankName: "Banco A" })).resolves.toEqual({ status: "UNKNOWN", reason: "NO_IDENTIFIER" });
  });

  it("reports duplicate SINPE matches as ambiguous instead of choosing one", async () => {
    const c = context([account(), account({ id: "account-b", accountNumber: "CR999999999999999999", sinpeNumber: "88881234" })]);
    await expect(c.service.validate({ tenantId: "tenant-a", extractedSinpePhone: "8888 1234" })).resolves.toEqual({ status: "AMBIGUOUS", reason: "AMBIGUOUS" });
  });

  it("uses only the requested tenant's registered-account read", async () => {
    const c = context([account()]);
    await c.service.validate({ tenantId: "tenant-a", extractedDestinationAccount: "CR123456789012345678" });
    expect(c.accounts.listDestinationValidationAccounts).toHaveBeenCalledTimes(1);
    expect(c.accounts.listDestinationValidationAccounts).toHaveBeenLastCalledWith("tenant-a");
  });
});

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: "account-a", bankName: "Banco A", accountNumber: "CR123456789012345678", sinpeNumber: "88881234", currency: "CRC", isActive: true,
    ...overrides,
  };
}

function context(accounts: ReturnType<typeof account>[]) {
  const accountService = { listDestinationValidationAccounts: jest.fn().mockResolvedValue(accounts) };
  return { service: new PaymentDestinationValidator(accountService as never), accounts: accountService };
}
