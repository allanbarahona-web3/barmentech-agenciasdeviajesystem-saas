import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { AccountReceivableStatus, Currency, PaymentPurpose, PaymentStatus, Prisma } from "@prisma/client";
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

export interface ReportedInvoicePaymentCommand {
  tenantId: string;
  customerId: string;
  actor: FinanceActor;
  currencyCode: string;
  amount: Prisma.Decimal;
  paymentMethod?: string;
  paymentDate?: Date;
  reference?: string;
  payerName?: string;
  notes?: string;
  targets: ReadonlyArray<{ accountReceivableId: string; intendedAmount: Prisma.Decimal }>;
}

class ReportedInvoicePaymentError extends Error {
  constructor(readonly code: (typeof REPORTED_INVOICE_PAYMENT_ERRORS)[keyof typeof REPORTED_INVOICE_PAYMENT_ERRORS]) {
    super(code);
  }
}

@Injectable()
export class ReportedInvoicePaymentIntakeService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(command: ReportedInvoicePaymentCommand) {
    const input = normalize(command);
    try {
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
            receivedAt: input.paymentDate ?? new Date(),
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

function optionalDate(value: unknown): Date | null {
  if (value === undefined || value === null) return null;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) fail(REPORTED_INVOICE_PAYMENT_ERRORS.INVALID);
  return new Date(value.getTime());
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
