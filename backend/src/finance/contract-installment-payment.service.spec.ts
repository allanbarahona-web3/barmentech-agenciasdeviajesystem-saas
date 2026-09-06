import { CommercialObligationStatus, PaymentPurpose, PaymentStatus, Prisma } from "@prisma/client";
import {
  CONTRACT_INSTALLMENT_ERRORS,
  ContractInstallmentPaymentService,
  type ContractInstallmentPaymentCommand,
} from "./contract-installment-payment.service";

const actor = { userId: "finance-user", name: "Finance User" };
const receivedAt = new Date("2026-09-05T12:00:00.000Z");

describe("ContractInstallmentPaymentService", () => {
  it("registers and fully allocates a CREDIT Contract installment through the shared Finance primitives", async () => {
    const c = context({ outstanding: "1000", updatedOutstanding: "600" });

    await expect(c.service.register(command({ amount: d("400"), paymentMethod: "CARD" }))).resolves.toEqual({
      payment: {
        id: "payment-1", receiptNumber: "RCP-2026-000009", amount: "400", currencyCode: "USD",
        paymentMethod: "CARD", status: PaymentStatus.FULLY_ALLOCATED,
      },
      obligation: { id: "obligation-1", outstandingAmount: "600", status: CommercialObligationStatus.PARTIALLY_SETTLED },
    });

    expect(c.registrations.registerInTransaction).toHaveBeenCalledWith(c.tx, expect.objectContaining({
      tenantId: "tenant-1", contractId: "contract-1", customerId: "customer-1", currencyCode: "USD",
      receivedAmount: d("400"), paymentMethod: "CARD", purpose: PaymentPurpose.CONTRACT_INSTALLMENT,
      registrationDeduplicationKey: "contract-installment-request-1",
    }));
    expect(c.allocations.allocateInTransaction).toHaveBeenCalledWith(c.tx, expect.objectContaining({
      tenantId: "tenant-1", paymentId: "payment-1", commercialObligationId: "obligation-1", amount: d("400"),
      allocationDeduplicationKey: "contract-installment:payment-1:obligation-1",
    }));
    expect(c.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15000 });
    expect(c.fiscalizationOutbox.enqueueConfirmedPaymentInTransaction).toHaveBeenCalledWith(c.tx, paymentLike());
    expect(Object.keys(c.tx)).not.toContain("billingDocument");
    expect(Object.keys(c.tx)).not.toContain("accountReceivable");
    expect(Object.keys(c.tx)).not.toContain("paymentAllocation");
  });

  it("returns the fully settled obligation after the final installment", async () => {
    const c = context({ outstanding: "600", updatedOutstanding: "0", updatedObligationStatus: CommercialObligationStatus.SETTLED });

    const result = await c.service.register(command({ amount: d("600") }));

    expect(result.payment.status).toBe(PaymentStatus.FULLY_ALLOCATED);
    expect(result.obligation).toEqual({ id: "obligation-1", outstandingAmount: "0", status: CommercialObligationStatus.SETTLED });
  });

  it.each([undefined, "", "CRYPTO"])('rejects missing or invalid payment method %p before persistence', async (paymentMethod) => {
    const c = context();
    await expectCode(c.service.register(command({ paymentMethod })), CONTRACT_INSTALLMENT_ERRORS.PAYMENT_METHOD_INVALID);
    expect(c.prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([d("0"), d("-0.01"), d("1.000001")])('rejects non-positive or non-exact amount %s before persistence', async (amount) => {
    const c = context();
    await expectCode(c.service.register(command({ amount })), CONTRACT_INSTALLMENT_ERRORS.AMOUNT_INVALID);
    expect(c.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an amount over the outstanding obligation without registering a payment", async () => {
    const c = context({ outstanding: "100" });
    await expectCode(c.service.register(command({ amount: d("100.01") })), CONTRACT_INSTALLMENT_ERRORS.AMOUNT_EXCEEDS_OUTSTANDING);
    expect(c.registrations.registerInTransaction).not.toHaveBeenCalled();
  });

  it("rejects a missing, settled, or cancelled Contract obligation", async () => {
    let c = context({ obligation: null });
    await expectCode(c.service.register(command()), CONTRACT_INSTALLMENT_ERRORS.OBLIGATION_NOT_FOUND);
    expect(c.registrations.registerInTransaction).not.toHaveBeenCalled();

    c = context({ obligationStatus: CommercialObligationStatus.SETTLED, outstanding: "0" });
    await expectCode(c.service.register(command()), CONTRACT_INSTALLMENT_ERRORS.OBLIGATION_STATE_CONFLICT);
    c = context({ obligationStatus: CommercialObligationStatus.CANCELLED });
    await expectCode(c.service.register(command()), CONTRACT_INSTALLMENT_ERRORS.OBLIGATION_STATE_CONFLICT);
  });

  it.each([
    ["customer", { obligationCustomerId: "customer-other" }, CONTRACT_INSTALLMENT_ERRORS.CUSTOMER_MISMATCH],
    ["currency", { obligationCurrencyCode: "CRC" }, CONTRACT_INSTALLMENT_ERRORS.CURRENCY_MISMATCH],
    ["lifecycle", { contractStatus: "PENDING_PAYMENT_RESERVE" }, CONTRACT_INSTALLMENT_ERRORS.CONTRACT_STATE_CONFLICT],
  ])("enforces Contract customer/currency authority and post-approval lifecycle: %s", async (_, options, code) => {
    const c = context(options);
    await expectCode(c.service.register(command()), code);
    expect(c.registrations.registerInTransaction).not.toHaveBeenCalled();
  });

  it("treats the client idempotency key as one payment and one allocation", async () => {
    const c = context({ registrationCreated: false, allocationApplied: false });
    await c.service.register(command());

    expect(c.registrations.registerInTransaction).toHaveBeenCalledTimes(1);
    expect(c.allocations.allocateInTransaction).toHaveBeenCalledTimes(1);
    expect(c.allocations.allocateInTransaction.mock.calls[0][1].allocationDeduplicationKey).toBe(
      "contract-installment:payment-1:obligation-1",
    );
  });

  it("only permits the supported post-initial Contract lifecycle states", async () => {
    for (const contractStatus of ["PENDING_SIGNATURE", "SIGNING_SENT", "VIEWED", "SIGNED"]) {
      const c = context({ contractStatus });
      await expect(c.service.register(command())).resolves.toMatchObject({ payment: { id: "payment-1" } });
    }
  });
});

function d(value: string) { return new Prisma.Decimal(value); }

function command(overrides: Partial<ContractInstallmentPaymentCommand> = {}): ContractInstallmentPaymentCommand {
  return {
    tenantId: "tenant-1",
    contractId: "contract-1",
    registrationDeduplicationKey: "contract-installment-request-1",
    amount: d("400"),
    paymentMethod: "BANK_TRANSFER",
    receivedAt,
    actor,
    ...overrides,
  } as ContractInstallmentPaymentCommand;
}

function context(options: {
  outstanding?: string;
  updatedOutstanding?: string;
  updatedObligationStatus?: CommercialObligationStatus;
  obligation?: Record<string, unknown> | null;
  obligationStatus?: CommercialObligationStatus;
  obligationCustomerId?: string;
  obligationCurrencyCode?: string;
  contractStatus?: string;
  registrationCreated?: boolean;
  allocationApplied?: boolean;
} = {}) {
  const obligation = options.obligation === null ? null : {
    id: "obligation-1", tenantId: "tenant-1", customerId: options.obligationCustomerId ?? "customer-1",
    sourceType: "CONTRACT", sourceId: "contract-1", currencyCode: options.obligationCurrencyCode ?? "USD",
    originalAmount: d("1350"), outstandingAmount: d(options.outstanding ?? "1000"),
    status: options.obligationStatus ?? CommercialObligationStatus.PARTIALLY_SETTLED,
    ...(options.obligation ?? {}),
  };
  const payment = {
    id: "payment-1", tenantId: "tenant-1", contractId: "contract-1", customerId: "customer-1",
    purpose: PaymentPurpose.CONTRACT_INSTALLMENT, receiptNumber: "RCP-2026-000009", receivedAmount: d("400"),
    currencyCode: "USD", paymentMethod: "CARD", status: PaymentStatus.FULLY_ALLOCATED,
  };
  const updatedObligation = obligation && {
    ...obligation,
    outstandingAmount: d(options.updatedOutstanding ?? "600"),
    status: options.updatedObligationStatus ?? CommercialObligationStatus.PARTIALLY_SETTLED,
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: "contract-1" }]),
    contract: { findFirst: jest.fn().mockResolvedValue({
      id: "contract-1", tenantId: "tenant-1", clientId: "customer-1", status: options.contractStatus ?? "PENDING_SIGNATURE",
      commercialTotal: d("1350"), commercialCurrency: "USD", paymentConditionType: "CREDIT",
      commercialTaxTreatment: "TAX_INCLUDED", paymentDueDate: new Date("2026-12-31T00:00:00.000Z"),
      client: { fullName: "Ada Client" },
    }) },
    commercialObligation: {
      findUnique: jest.fn().mockResolvedValue(obligation),
      findFirst: jest.fn().mockResolvedValue(updatedObligation),
    },
    payment: { findFirst: jest.fn().mockResolvedValue(payment) },
  };
  const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
  const registrations = { registerInTransaction: jest.fn().mockResolvedValue({ payment, created: options.registrationCreated ?? true }) };
  const allocations = { allocateInTransaction: jest.fn().mockResolvedValue({ allocation: { id: "allocation-1" }, applied: options.allocationApplied ?? true }) };
  const fiscalizationOutbox = { enqueueConfirmedPaymentInTransaction: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new ContractInstallmentPaymentService(prisma as never, registrations as never, allocations as never, fiscalizationOutbox as never),
    prisma, tx, registrations, allocations, fiscalizationOutbox,
  };
}

function paymentLike() {
  return expect.objectContaining({ id: "payment-1", purpose: PaymentPurpose.CONTRACT_INSTALLMENT, status: PaymentStatus.FULLY_ALLOCATED });
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toThrow(code);
}
