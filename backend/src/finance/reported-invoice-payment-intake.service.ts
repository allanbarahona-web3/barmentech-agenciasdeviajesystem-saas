import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { AccountReceivableStatus, CommercialObligationStatus, Currency, PaymentPurpose, PaymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  FINANCE_AUDIT_ACTIONS,
  FINANCE_AUDIT_ENTITY_TYPES,
  financeAuditRecord,
  financeMoney,
  type FinanceActor,
} from "./finance-audit";
import { normalizeFinancialPaymentMethod, type FinancialPaymentMethod } from "./finance-payment-method";
import { normalizeCurrencySettlementAmount } from "./currency-settlement.policy";
import { DEFAULT_FISCAL_TIMEZONE, tenantLocalMidnightAsUtc } from "./tenant-fiscal-date";

const MAX_AMOUNT = new Prisma.Decimal("99999999999999.99999");
const OPEN_STATUSES = [AccountReceivableStatus.OPEN, AccountReceivableStatus.PARTIALLY_SETTLED] as const;

export const REPORTED_INVOICE_PAYMENT_ERRORS = {
  INVALID: "REPORTED_INVOICE_PAYMENT_INVALID",
  TARGET_INVALID: "REPORTED_INVOICE_PAYMENT_TARGET_INVALID",
  CURRENCY_MISMATCH: "REPORTED_INVOICE_PAYMENT_CURRENCY_MISMATCH",
  TARGET_INSUFFICIENT: "REPORTED_INVOICE_PAYMENT_TARGET_INSUFFICIENT",
  PAYMENT_INSUFFICIENT: "REPORTED_INVOICE_PAYMENT_INSUFFICIENT",
  PERSISTENCE_FAILED: "REPORTED_INVOICE_PAYMENT_PERSISTENCE_FAILED",
} as const;

export const REPORTED_CONTRACT_PAYMENT_ERRORS = {
  INVALID: "REPORTED_CONTRACT_PAYMENT_INVALID",
  TARGET_INVALID: "REPORTED_CONTRACT_PAYMENT_TARGET_INVALID",
  CURRENCY_MISMATCH: "REPORTED_CONTRACT_PAYMENT_CURRENCY_MISMATCH",
  TARGET_INSUFFICIENT: "REPORTED_CONTRACT_PAYMENT_TARGET_INSUFFICIENT",
  PAYMENT_INSUFFICIENT: "REPORTED_CONTRACT_PAYMENT_INSUFFICIENT",
  PERSISTENCE_FAILED: "REPORTED_CONTRACT_PAYMENT_PERSISTENCE_FAILED",
} as const;

export interface ReportedInvoicePaymentCommand {
  tenantId: string;
  customerId: string;
  actor: FinanceActor;
  currencyCode: string;
  amount: Prisma.Decimal;
  paymentMethod?: string;
  paymentDate?: Date | string;
  reference?: string;
  payerName?: string;
  notes?: string;
  targets: ReadonlyArray<{ accountReceivableId: string; intendedAmount: Prisma.Decimal }>;
}

export interface ReportedContractPaymentCommand {
  tenantId: string;
  customerId: string;
  actor: FinanceActor;
  currencyCode: string;
  amount: Prisma.Decimal;
  paymentMethod?: string;
  paymentDate?: Date | string;
  reference?: string;
  payerName?: string;
  notes?: string;
  contractId: string;
  commercialObligationId: string;
  intendedAmount: Prisma.Decimal;
}

class ReportedInvoicePaymentError extends Error {
  constructor(readonly code: (typeof REPORTED_INVOICE_PAYMENT_ERRORS)[keyof typeof REPORTED_INVOICE_PAYMENT_ERRORS]) {
    super(code);
  }
}

class ReportedContractPaymentError extends Error {
  constructor(readonly code: (typeof REPORTED_CONTRACT_PAYMENT_ERRORS)[keyof typeof REPORTED_CONTRACT_PAYMENT_ERRORS]) {
    super(code);
  }
}

@Injectable()
export class ReportedInvoicePaymentIntakeService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(command: ReportedInvoicePaymentCommand) {
    const input = normalize(command);
    try {
      const receivedAt = await this.resolveReportedPaymentReceivedAt(
        input.tenantId,
        input.paymentDate,
        () => fail(REPORTED_INVOICE_PAYMENT_ERRORS.INVALID),
      );
      return await this.prisma.$transaction(async (tx) => {
        const targetIds = input.targets.map((target) => target.accountReceivableId);
        const receivables = await tx.accountReceivable.findMany({
          where: {
            tenantId: input.tenantId,
            customerId: input.customerId,
            id: { in: targetIds },
            sourceType: "BILLING_DOCUMENT",
            status: { in: [...OPEN_STATUSES] },
            outstandingAmount: { gt: new Prisma.Decimal(0) },
          },
          select: {
            id: true,
            sourceId: true,
            currencyCode: true,
            originalAmount: true,
            outstandingAmount: true,
            debtorDisplayName: true,
          },
        });
        if (receivables.length !== targetIds.length) fail(REPORTED_INVOICE_PAYMENT_ERRORS.TARGET_INVALID);
        const receivableById = new Map(receivables.map((receivable) => [receivable.id, receivable]));
        const documentIds = [...new Set(receivables.map((receivable) => receivable.sourceId))];
        const acceptedDocuments = await tx.billingDocument.findMany({
          where: {
            tenantId: input.tenantId,
            id: { in: documentIds },
            taxAuthorityStatus: "ACCEPTED",
          },
          select: { id: true },
        });
        if (acceptedDocuments.length !== documentIds.length) fail(REPORTED_INVOICE_PAYMENT_ERRORS.TARGET_INVALID);

        let proposedTotal = new Prisma.Decimal(0);
        const settlementCurrencies = new Set<string>();
        for (const target of input.targets) {
          const receivable = receivableById.get(target.accountReceivableId);
          if (!receivable) fail(REPORTED_INVOICE_PAYMENT_ERRORS.TARGET_INVALID);
          settlementCurrencies.add(receivable.currencyCode);
          if (!hasCurrencySettlementPrecision(target.intendedAmount, receivable.currencyCode)) {
            fail(REPORTED_INVOICE_PAYMENT_ERRORS.TARGET_INVALID);
          }
          if (target.intendedAmount.greaterThan(receivable.outstandingAmount)) {
            fail(REPORTED_INVOICE_PAYMENT_ERRORS.TARGET_INSUFFICIENT);
          }
          proposedTotal = proposedTotal.plus(target.intendedAmount);
        }
        if (settlementCurrencies.size !== 1) fail(REPORTED_INVOICE_PAYMENT_ERRORS.CURRENCY_MISMATCH);
        const settlementCurrencyCode = [...settlementCurrencies][0]!;
        if (settlementCurrencyCode === input.currencyCode && proposedTotal.greaterThan(normalizeCurrencySettlementAmount(input.amount, settlementCurrencyCode))) {
          fail(REPORTED_INVOICE_PAYMENT_ERRORS.PAYMENT_INSUFFICIENT);
        }

        const payment = await tx.payment.create({
          data: {
            tenantId: input.tenantId,
            registrationDeduplicationKey: `reported-invoice-payment:${randomUUID()}`,
            receiptNumber: null,
            customerId: input.customerId,
            payerDisplayName: input.payerName ?? receivables[0]!.debtorDisplayName,
            currencyCode: input.currencyCode,
            receivedAmount: input.amount,
            availableAmount: new Prisma.Decimal(0),
            receivedAt,
            paymentMethod: input.paymentMethod,
            externalReference: input.reference,
            description: input.notes,
            purpose: PaymentPurpose.GENERAL,
            contractId: null,
            status: PaymentStatus.PENDING_VERIFICATION,
            reviewedAt: null,
            reviewedByUserId: null,
            reviewedByName: null,
            rejectionReason: null,
            cancelledAt: null,
            allocationProposal: {
              kind: "INVOICES",
              targets: input.targets.map((target) => ({
                targetType: "ACCOUNT_RECEIVABLE",
                targetId: target.accountReceivableId,
                intendedAmount: financeMoney(target.intendedAmount),
              })),
            },
          } as Prisma.PaymentUncheckedCreateInput,
        });
        await tx.billingAuditLog.create({
          data: financeAuditRecord({
            tenantId: input.tenantId,
            entityType: FINANCE_AUDIT_ENTITY_TYPES.PAYMENT,
            entityId: payment.id,
            action: FINANCE_AUDIT_ACTIONS.REPORTED_INVOICE_PAYMENT_SUBMITTED,
            actor: input.actor,
            occurredAt: payment.createdAt,
            afterJson: {
              paymentId: payment.id,
              customerId: payment.customerId,
              currencyCode: payment.currencyCode,
              receivedAmount: financeMoney(payment.receivedAmount),
              availableAmount: financeMoney(payment.availableAmount),
              status: payment.status,
              allocationProposal: {
                kind: "INVOICES",
                targets: input.targets.map((target) => ({
                  targetType: "ACCOUNT_RECEIVABLE",
                  targetId: target.accountReceivableId,
                  intendedAmount: financeMoney(target.intendedAmount),
                })),
              },
            },
          }),
        });
        return {
          paymentId: payment.id,
          status: payment.status,
          receiptNumber: payment.receiptNumber,
          currencyCode: payment.currencyCode,
          amount: financeMoney(payment.receivedAmount),
          availableAmount: financeMoney(payment.availableAmount),
          allocationProposal: {
            kind: "INVOICES",
            targets: input.targets.map((target) => ({
              targetType: "ACCOUNT_RECEIVABLE",
              targetId: target.accountReceivableId,
              intendedAmount: financeMoney(target.intendedAmount),
            })),
          },
        };
      });
    } catch (error) {
      if (error instanceof ReportedInvoicePaymentError) throw error;
      throw new ReportedInvoicePaymentError(REPORTED_INVOICE_PAYMENT_ERRORS.PERSISTENCE_FAILED);
    }
  }

  async submitContract(command: ReportedContractPaymentCommand) {
    const input = normalizeContract(command);
    try {
      const receivedAt = await this.resolveReportedPaymentReceivedAt(
        input.tenantId,
        input.paymentDate,
        () => failContract(REPORTED_CONTRACT_PAYMENT_ERRORS.INVALID),
      );
      return await this.prisma.$transaction(async (tx) => {
        const obligation = await tx.commercialObligation.findFirst({
          where: {
            id: input.commercialObligationId,
            tenantId: input.tenantId,
            customerId: input.customerId,
            sourceType: "CONTRACT",
            sourceId: input.contractId,
            status: { in: [CommercialObligationStatus.OPEN, CommercialObligationStatus.PARTIALLY_SETTLED] },
            outstandingAmount: { gt: new Prisma.Decimal(0) },
          },
          select: {
            id: true,
            currencyCode: true,
            outstandingAmount: true,
            customer: { select: { fullName: true } },
          },
        });
        if (!obligation) failContract(REPORTED_CONTRACT_PAYMENT_ERRORS.TARGET_INVALID);
        const contract = await tx.contract.findFirst({
          where: {
            id: input.contractId,
            tenantId: input.tenantId,
            clientId: input.customerId,
            cancelledAt: null,
            status: { not: "CANCELLED" },
          },
          select: { id: true },
        });
        if (!contract) failContract(REPORTED_CONTRACT_PAYMENT_ERRORS.TARGET_INVALID);
        if (!hasCurrencySettlementPrecision(input.intendedAmount, obligation.currencyCode)) {
          failContract(REPORTED_CONTRACT_PAYMENT_ERRORS.TARGET_INVALID);
        }
        if (input.intendedAmount.greaterThan(obligation.outstandingAmount)) {
          failContract(REPORTED_CONTRACT_PAYMENT_ERRORS.TARGET_INSUFFICIENT);
        }
        if (
          input.currencyCode === obligation.currencyCode &&
          input.intendedAmount.greaterThan(normalizeCurrencySettlementAmount(input.amount, obligation.currencyCode))
        ) {
          failContract(REPORTED_CONTRACT_PAYMENT_ERRORS.PAYMENT_INSUFFICIENT);
        }

        const allocationProposal = {
          kind: "CONTRACTS",
          targets: [{
            targetType: "COMMERCIAL_OBLIGATION",
            targetId: obligation.id,
            intendedAmount: financeMoney(input.intendedAmount),
          }],
        };
        const payment = await tx.payment.create({
          data: {
            tenantId: input.tenantId,
            registrationDeduplicationKey: `reported-contract-payment:${randomUUID()}`,
            receiptNumber: null,
            customerId: input.customerId,
            payerDisplayName: input.payerName ?? obligation.customer.fullName,
            currencyCode: input.currencyCode,
            receivedAmount: input.amount,
            availableAmount: new Prisma.Decimal(0),
            receivedAt,
            paymentMethod: input.paymentMethod,
            externalReference: input.reference,
            description: input.notes,
            purpose: PaymentPurpose.CONTRACT_INSTALLMENT,
            contractId: contract.id,
            status: PaymentStatus.PENDING_VERIFICATION,
            reviewedAt: null,
            reviewedByUserId: null,
            reviewedByName: null,
            rejectionReason: null,
            cancelledAt: null,
            allocationProposal,
          } as Prisma.PaymentUncheckedCreateInput,
        });
        await tx.billingAuditLog.create({
          data: financeAuditRecord({
            tenantId: input.tenantId,
            entityType: FINANCE_AUDIT_ENTITY_TYPES.PAYMENT,
            entityId: payment.id,
            action: FINANCE_AUDIT_ACTIONS.REPORTED_CONTRACT_PAYMENT_SUBMITTED,
            actor: input.actor,
            occurredAt: payment.createdAt,
            afterJson: {
              paymentId: payment.id,
              customerId: payment.customerId,
              contractId: contract.id,
              commercialObligationId: obligation.id,
              currencyCode: payment.currencyCode,
              receivedAmount: financeMoney(payment.receivedAmount),
              availableAmount: financeMoney(payment.availableAmount),
              status: payment.status,
              allocationProposal,
            },
          }),
        });
        return {
          paymentId: payment.id,
          status: payment.status,
          receiptNumber: payment.receiptNumber,
          currencyCode: payment.currencyCode,
          amount: financeMoney(payment.receivedAmount),
          availableAmount: financeMoney(payment.availableAmount),
          contractId: contract.id,
          allocationProposal,
        };
      });
    } catch (error) {
      if (error instanceof ReportedContractPaymentError) throw error;
      throw new ReportedContractPaymentError(REPORTED_CONTRACT_PAYMENT_ERRORS.PERSISTENCE_FAILED);
    }
  }

  private async resolveReportedPaymentReceivedAt(
    tenantId: string,
    paymentDate: ReportedPaymentDate | null,
    invalid: () => never,
  ): Promise<Date> {
    if (paymentDate === null) return new Date();
    if (paymentDate instanceof Date) return new Date(paymentDate.getTime());

    const calendarDate = parseCalendarDate(paymentDate, invalid);
    if (calendarDate === null) {
      const instant = new Date(paymentDate);
      if (Number.isNaN(instant.getTime())) invalid();
      return instant;
    }

    const configuration = await this.prisma.tenantBillingConfiguration.findUnique({
      where: { tenantId },
      select: { fiscalTimezone: true },
    });
    try {
      return tenantLocalMidnightAsUtc(
        calendarDate,
        configuration?.fiscalTimezone ?? DEFAULT_FISCAL_TIMEZONE,
      );
    } catch {
      invalid();
    }
  }
}

function normalize(command: ReportedInvoicePaymentCommand) {
  const tenantId = required(command.tenantId, 191);
  const customerId = required(command.customerId, 191);
  const actor = { userId: required(command.actor?.userId, 191), name: required(command.actor?.name, 500) };
  const currencyCode = currency(command.currencyCode);
  const amount = exactAmount(command.amount);
  if (!Array.isArray(command.targets) || command.targets.length < 1 || command.targets.length > 25) {
    fail(REPORTED_INVOICE_PAYMENT_ERRORS.INVALID);
  }
  const targetIds = new Set<string>();
  const targets = command.targets.map((target) => {
    if (!target || typeof target !== "object") fail(REPORTED_INVOICE_PAYMENT_ERRORS.INVALID);
    const accountReceivableId = required(target.accountReceivableId, 191);
    if (targetIds.has(accountReceivableId)) fail(REPORTED_INVOICE_PAYMENT_ERRORS.INVALID);
    targetIds.add(accountReceivableId);
    return { accountReceivableId, intendedAmount: exactAmount(target.intendedAmount) };
  });
  return {
    tenantId,
    customerId,
    actor,
    currencyCode,
    amount,
    paymentMethod: paymentMethod(command.paymentMethod),
    paymentDate: optionalDate(command.paymentDate),
    reference: optional(command.reference, 150),
    payerName: optional(command.payerName, 500),
    notes: optional(command.notes, 500),
    targets,
  };
}

function normalizeContract(command: ReportedContractPaymentCommand) {
  const tenantId = requiredContract(command.tenantId, 191);
  const customerId = requiredContract(command.customerId, 191);
  return {
    tenantId,
    customerId,
    actor: {
      userId: requiredContract(command.actor?.userId, 191),
      name: requiredContract(command.actor?.name, 500),
    },
    currencyCode: currencyContract(command.currencyCode),
    amount: exactContractAmount(command.amount),
    paymentMethod: paymentMethodContract(command.paymentMethod),
    paymentDate: optionalDateContract(command.paymentDate),
    reference: optionalContract(command.reference, 150),
    payerName: optionalContract(command.payerName, 500),
    notes: optionalContract(command.notes, 500),
    contractId: requiredContract(command.contractId, 191),
    commercialObligationId: requiredContract(command.commercialObligationId, 191),
    intendedAmount: exactContractAmount(command.intendedAmount),
  };
}

function hasCurrencySettlementPrecision(amount: Prisma.Decimal, currencyCode: string): boolean {
  try {
    return normalizeCurrencySettlementAmount(amount, currencyCode).equals(amount);
  } catch {
    return false;
  }
}

function required(value: unknown, maximum: number): string {
  const normalized = optional(value, maximum);
  if (normalized === null) fail(REPORTED_INVOICE_PAYMENT_ERRORS.INVALID);
  return normalized;
}

function optional(value: unknown, maximum: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") fail(REPORTED_INVOICE_PAYMENT_ERRORS.INVALID);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) fail(REPORTED_INVOICE_PAYMENT_ERRORS.INVALID);
  return normalized;
}

function currency(value: unknown): Currency {
  const normalized = required(value, 3).toUpperCase();
  if (normalized !== Currency.CRC && normalized !== Currency.USD) fail(REPORTED_INVOICE_PAYMENT_ERRORS.INVALID);
  return normalized;
}

function paymentMethod(value: unknown): FinancialPaymentMethod {
  if (value === undefined || value === null) return "OTHER";
  const normalized = normalizeFinancialPaymentMethod(value);
  if (!normalized) fail(REPORTED_INVOICE_PAYMENT_ERRORS.INVALID);
  return normalized;
}

type ReportedPaymentDate = Date | string;

function optionalDate(value: unknown): ReportedPaymentDate | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getTime());
  if (typeof value === "string" && value.trim()) return value.trim();
  fail(REPORTED_INVOICE_PAYMENT_ERRORS.INVALID);
}

function exactAmount(value: unknown): Prisma.Decimal {
  if (!(value instanceof Prisma.Decimal) || !value.isFinite() || value.lessThanOrEqualTo(0) || value.decimalPlaces() > 5 || value.greaterThan(MAX_AMOUNT)) {
    fail(REPORTED_INVOICE_PAYMENT_ERRORS.INVALID);
  }
  return value;
}

function fail(code: (typeof REPORTED_INVOICE_PAYMENT_ERRORS)[keyof typeof REPORTED_INVOICE_PAYMENT_ERRORS]): never {
  throw new ReportedInvoicePaymentError(code);
}

function requiredContract(value: unknown, maximum: number): string {
  const normalized = optionalContract(value, maximum);
  if (normalized === null) failContract(REPORTED_CONTRACT_PAYMENT_ERRORS.INVALID);
  return normalized;
}

function optionalContract(value: unknown, maximum: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") failContract(REPORTED_CONTRACT_PAYMENT_ERRORS.INVALID);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) failContract(REPORTED_CONTRACT_PAYMENT_ERRORS.INVALID);
  return normalized;
}

function currencyContract(value: unknown): Currency {
  const normalized = requiredContract(value, 3).toUpperCase();
  if (normalized !== Currency.CRC && normalized !== Currency.USD) failContract(REPORTED_CONTRACT_PAYMENT_ERRORS.INVALID);
  return normalized;
}

function paymentMethodContract(value: unknown): FinancialPaymentMethod {
  if (value === undefined || value === null) return "OTHER";
  const normalized = normalizeFinancialPaymentMethod(value);
  if (!normalized) failContract(REPORTED_CONTRACT_PAYMENT_ERRORS.INVALID);
  return normalized;
}

function optionalDateContract(value: unknown): ReportedPaymentDate | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getTime());
  if (typeof value === "string" && value.trim()) return value.trim();
  failContract(REPORTED_CONTRACT_PAYMENT_ERRORS.INVALID);
}

function exactContractAmount(value: unknown): Prisma.Decimal {
  if (!(value instanceof Prisma.Decimal) || !value.isFinite() || value.lessThanOrEqualTo(0) || value.decimalPlaces() > 5 || value.greaterThan(MAX_AMOUNT)) {
    failContract(REPORTED_CONTRACT_PAYMENT_ERRORS.INVALID);
  }
  return value;
}

function failContract(code: (typeof REPORTED_CONTRACT_PAYMENT_ERRORS)[keyof typeof REPORTED_CONTRACT_PAYMENT_ERRORS]): never {
  throw new ReportedContractPaymentError(code);
}

function parseCalendarDate(
  value: string,
  invalid: () => never,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const instant = new Date(Date.UTC(year, month - 1, day));
  if (
    instant.getUTCFullYear() !== year ||
    instant.getUTCMonth() !== month - 1 ||
    instant.getUTCDate() !== day
  ) {
    invalid();
  }
  return { year, month, day };
}
