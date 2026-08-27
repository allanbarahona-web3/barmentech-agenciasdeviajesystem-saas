import { Currency, PaymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  FINANCIAL_PAYMENT_METHOD_REGISTRY,
  PAYMENT_REGISTRATION_ERRORS,
  PaymentRegistrationService,
  type PaymentRegistrationCommand,
} from "./payment-registration.service";

describe("PaymentRegistrationService", () => {
  it("registers one exact source-neutral five-decimal payment with forced initial state", async () => {
    const c = context();
    await c.service.register(command());
    const data = c.tx.payment.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: "tenant-a", registrationDeduplicationKey: "payment-a", payerDisplayName: "Payer",
      customerId: "customer-a", currencyCode: Currency.CRC, receivedAt: RECEIVED_AT,
      paymentMethod: "BANK_TRANSFER", status: PaymentStatus.RECEIVED, cancelledAt: null,
    });
    expect((data.receivedAmount as Prisma.Decimal).toFixed()).toBe("123.12345");
    expect((data.availableAmount as Prisma.Decimal).toFixed()).toBe("123.12345");
    expect(c.tx.client.findFirst).toHaveBeenCalledWith({ where: { id: "customer-a", tenantId: "tenant-a" }, select: { id: true } });
  });

  it.each(FINANCIAL_PAYMENT_METHOD_REGISTRY)("accepts the provider-neutral financial method %s", async (paymentMethod) => {
    const c = context(); await c.service.register(command({ paymentMethod }));
    expect(c.tx.payment.create.mock.calls[0][0].data.paymentMethod).toBe(paymentMethod);
  });

  it.each([
    ["numeric fiscal code", "01"], ["unsupported", "CRYPTO"], ["empty", " "],
  ])("rejects unsupported payment methods: %s", async (_, paymentMethod) => {
    const c = context(); await expectCode(c.service.register(command({ paymentMethod })), PAYMENT_REGISTRATION_ERRORS.INVALID);
    expect(c.tx.payment.create).not.toHaveBeenCalled();
  });

  it.each([
    ["zero", d("0")], ["negative", d("-0.00001")], ["over-scale", d("1.000001")],
    ["overflow", d("100000000000000.00000")], ["malformed", {}],
  ])("rejects invalid Decimal(19,5) amounts: %s", async (_, receivedAmount) => {
    const c = context(); await expectCode(c.service.register(command({ receivedAmount })), PAYMENT_REGISTRATION_ERRORS.INVALID);
    expect(c.tx.payment.create).not.toHaveBeenCalled();
  });

  it.each([
    ["type without number", { payerIdentificationType: "01", payerIdentificationNumber: null }],
    ["number without type", { payerIdentificationType: null, payerIdentificationNumber: "123" }],
    ["overlong type", { payerIdentificationType: "12345", payerIdentificationNumber: "123" }],
  ])("requires identification as an exact optional pair: %s", async (_, override) => {
    const c = context(); await expectCode(c.service.register(command(override)), PAYMENT_REGISTRATION_ERRORS.INVALID);
  });

  it("validates an optional customer by tenant-scoped identity only", async () => {
    let c = context({ customer: null });
    await expectCode(c.service.register(command()), PAYMENT_REGISTRATION_ERRORS.CUSTOMER_INVALID);
    expect(c.tx.payment.create).not.toHaveBeenCalled();
    c = context(); await c.service.register(command({ customerId: null }));
    expect(c.tx.client.findFirst).not.toHaveBeenCalled();
  });

  it("accepts an exact idempotency winner even after allocation changed mutable fields", async () => {
    const input = command();
    const c = context({ createError: { code: "P2002" }, winner: payment(input, { availableAmount: d("1.00000"), status: PaymentStatus.PARTIALLY_ALLOCATED }) });
    const result = await c.service.register(input);
    expect(result.id).toBe("payment-a");
    expect(c.tx.payment.findUnique).toHaveBeenCalledWith({ where: { tenantId_registrationDeduplicationKey: { tenantId: "tenant-a", registrationDeduplicationKey: "payment-a" } } });
  });

  it.each([
    ["payer", { payerDisplayName: "Other" }], ["currency", { currencyCode: "USD" }],
    ["amount", { receivedAmount: d("123.12344") }], ["method", { paymentMethod: "CARD" }],
  ])("rejects a contradictory idempotency winner: %s", async (_, override) => {
    const input = command(); const c = context({ createError: { code: "P2002" }, winner: payment(input, override) });
    await expectCode(c.service.register(input), PAYMENT_REGISTRATION_ERRORS.CONFLICT);
  });

  it("handles concurrent P2002 exact and conflicting winners safely", async () => {
    const input = command();
    let c = context({ createError: { code: "P2002" }, winner: payment(input) });
    await expect(c.service.register(input)).resolves.toMatchObject({ id: "payment-a" });
    c = context({ createError: { code: "P2002" }, winner: payment(input, { customerId: null }) });
    await expectCode(c.service.register(input), PAYMENT_REGISTRATION_ERRORS.CONFLICT);
  });

  it("does not allow caller-controlled mutable payment state", async () => {
    const c = context();
    await c.service.register({ ...command(), availableAmount: d("0"), status: PaymentStatus.CANCELLED, cancelledAt: RECEIVED_AT } as PaymentRegistrationCommand);
    const data = c.tx.payment.create.mock.calls[0][0].data;
    expect((data.availableAmount as Prisma.Decimal).equals(data.receivedAmount as Prisma.Decimal)).toBe(true);
    expect(data.status).toBe(PaymentStatus.RECEIVED); expect(data.cancelledAt).toBeNull();
  });

  it("uses only tenant-scoped Client and Payment access with bounded queries", async () => {
    const c = context(); await c.service.register(command());
    expect(Object.keys(c.tx).sort()).toEqual(["client", "payment"]);
    expect(c.tx.client.findFirst).toHaveBeenCalledTimes(1); expect(c.tx.payment.create).toHaveBeenCalledTimes(1);
    expect(c.tx.payment.findUnique).not.toHaveBeenCalled();
  });

  it("returns only stable safe errors", async () => {
    const c = context(); const error = await capture(c.service.register(command({ receivedAmount: {} })));
    expect(error.message).toBe(PAYMENT_REGISTRATION_ERRORS.INVALID);
    expect(error.message).not.toMatch(/customer|payment-a|P2002|database/i);
  });
});

const RECEIVED_AT = new Date("2026-08-27T12:34:56.789Z");
function d(value: string) { return new Prisma.Decimal(value); }
function command(overrides: Record<string, unknown> = {}): PaymentRegistrationCommand { return { tenantId: "tenant-a", registrationDeduplicationKey: "payment-a", payerDisplayName: "Payer", currencyCode: "CRC", receivedAmount: d("123.12345"), receivedAt: RECEIVED_AT, paymentMethod: "BANK_TRANSFER", customerId: "customer-a", payerIdentificationType: "02", payerIdentificationNumber: "3101999999", externalReference: "bank-42", description: "Payment", ...overrides } as PaymentRegistrationCommand; }
function payment(input: PaymentRegistrationCommand, overrides: Record<string, unknown> = {}) { return { id: "payment-a", tenantId: input.tenantId, registrationDeduplicationKey: input.registrationDeduplicationKey, customerId: input.customerId ?? null, payerDisplayName: input.payerDisplayName, payerIdentificationType: input.payerIdentificationType ?? null, payerIdentificationNumber: input.payerIdentificationNumber ?? null, currencyCode: input.currencyCode, receivedAmount: input.receivedAmount, availableAmount: input.receivedAmount, receivedAt: input.receivedAt, paymentMethod: input.paymentMethod, externalReference: input.externalReference ?? null, description: input.description ?? null, status: PaymentStatus.RECEIVED, cancelledAt: null, createdAt: RECEIVED_AT, updatedAt: RECEIVED_AT, ...overrides }; }
function context(options: { customer?: { id: string } | null; createError?: unknown; winner?: ReturnType<typeof payment> | null } = {}) { const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => { if (options.createError) throw options.createError; return payment(command(), data); }); const tx = { client: { findFirst: jest.fn().mockResolvedValue(options.customer === undefined ? { id: "customer-a" } : options.customer) }, payment: { create, findUnique: jest.fn().mockResolvedValue(options.winner ?? null) } }; const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => unknown) => work(tx)) } as unknown as PrismaService; return { service: new PaymentRegistrationService(prisma), tx }; }
async function expectCode(value: Promise<unknown>, code: string) { await expect(value).rejects.toThrow(code); }
async function capture(value: Promise<unknown>): Promise<Error> { try { await value; throw new Error("expected error"); } catch (error) { return error as Error; } }
