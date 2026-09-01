import { Injectable } from "@nestjs/common";
import { Currency, Payment, PaymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { BusinessNumberingService } from "../business-numbering/business-numbering.service";
import {
  FINANCE_AUDIT_ACTIONS,
  FINANCE_AUDIT_ENTITY_TYPES,
  financeAuditRecord,
  financeMoney,
  type FinanceActor,
} from "./finance-audit";

const MAX_AMOUNT = new Prisma.Decimal("99999999999999.99999");
const FINANCIAL_PAYMENT_METHODS = new Set([
  "CASH", "BANK_TRANSFER", "CARD", "CHECK", "MOBILE_TRANSFER", "OTHER",
]);
export const FINANCE_RECEIPT_SEQUENCE_KEY = "FINANCE_RECEIPT";

export const PAYMENT_REGISTRATION_ERRORS = {
  INVALID: "PAYMENT_REGISTRATION_INVALID",
  CUSTOMER_INVALID: "PAYMENT_REGISTRATION_CUSTOMER_INVALID",
  CONFLICT: "PAYMENT_REGISTRATION_CONFLICT",
  PERSISTENCE_FAILED: "PAYMENT_REGISTRATION_PERSISTENCE_FAILED",
} as const;

export type FinancialPaymentMethod =
  | "CASH"
  | "BANK_TRANSFER"
  | "CARD"
  | "CHECK"
  | "MOBILE_TRANSFER"
  | "OTHER";

export interface PaymentRegistrationCommand {
  tenantId: string;
  actor: FinanceActor;
  registrationDeduplicationKey: string;
  payerDisplayName: string;
  currencyCode: string;
  receivedAmount: Prisma.Decimal;
  receivedAt: Date;
  paymentMethod: string;
  customerId?: string | null;
  payerIdentificationType?: string | null;
  payerIdentificationNumber?: string | null;
  externalReference?: string | null;
  description?: string | null;
}

class PaymentRegistrationError extends Error {
  constructor(readonly code: (typeof PAYMENT_REGISTRATION_ERRORS)[keyof typeof PAYMENT_REGISTRATION_ERRORS]) {
    super(code);
  }
}

interface NormalizedRegistration {
  tenantId: string;
  actor: FinanceActor;
  registrationDeduplicationKey: string;
  payerDisplayName: string;
  currencyCode: Currency;
  receivedAmount: Prisma.Decimal;
  receivedAt: Date;
  paymentMethod: FinancialPaymentMethod;
  customerId: string | null;
  payerIdentificationType: string | null;
  payerIdentificationNumber: string | null;
  externalReference: string | null;
  description: string | null;
}

@Injectable()
export class PaymentRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessNumbers: BusinessNumberingService,
  ) {}

  async register(command: PaymentRegistrationCommand): Promise<Payment> {
    const input = normalize(command);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.payment.findUnique({
          where: {
            tenantId_registrationDeduplicationKey: {
              tenantId: input.tenantId,
              registrationDeduplicationKey: input.registrationDeduplicationKey,
            },
          },
        });
        if (existing) {
          if (!isExactRegistrationWinner(existing, input)) {
            throw new PaymentRegistrationError(PAYMENT_REGISTRATION_ERRORS.CONFLICT);
          }
          return existing;
        }
        if (input.customerId !== null) {
          const customer = await tx.client.findFirst({
            where: { id: input.customerId, tenantId: input.tenantId },
            select: { id: true },
          });
          if (!customer) {
            throw new PaymentRegistrationError(PAYMENT_REGISTRATION_ERRORS.CUSTOMER_INVALID);
          }
        }

        const sequence = await this.businessNumbers.next(tx, {
          tenantId: input.tenantId,
          sequenceKey: FINANCE_RECEIPT_SEQUENCE_KEY,
          year: input.receivedAt.getUTCFullYear(),
        });
        const payment = await tx.payment.create({
          data: initialPaymentData(input, financeReceiptNumber(input.receivedAt.getUTCFullYear(), sequence)),
        });
        await tx.billingAuditLog.create({
          data: financeAuditRecord({
            tenantId: input.tenantId,
            entityType: FINANCE_AUDIT_ENTITY_TYPES.PAYMENT,
            entityId: payment.id,
            action: FINANCE_AUDIT_ACTIONS.REGISTERED,
            actor: input.actor,
            occurredAt: payment.createdAt,
            afterJson: {
              paymentId: payment.id,
              receiptNumber: payment.receiptNumber,
              customerId: payment.customerId,
              currencyCode: payment.currencyCode,
              receivedAmount: financeMoney(payment.receivedAmount),
              availableAmount: financeMoney(payment.availableAmount),
              receivedAt: payment.receivedAt.toISOString(),
              paymentMethod: payment.paymentMethod,
              status: payment.status,
            },
          }),
        });
        return payment;
      });
    } catch (error) {
      if (error instanceof PaymentRegistrationError) throw error;
      if (isP2002(error)) return this.findConcurrentWinner(input);
      throw new PaymentRegistrationError(PAYMENT_REGISTRATION_ERRORS.PERSISTENCE_FAILED);
    }
  }

  private async findConcurrentWinner(input: NormalizedRegistration): Promise<Payment> {
    const winner = await this.prisma.payment.findUnique({
      where: {
        tenantId_registrationDeduplicationKey: {
          tenantId: input.tenantId,
          registrationDeduplicationKey: input.registrationDeduplicationKey,
        },
      },
    });
    if (!winner) {
      throw new PaymentRegistrationError(PAYMENT_REGISTRATION_ERRORS.PERSISTENCE_FAILED);
    }
    if (!isExactRegistrationWinner(winner, input)) {
      throw new PaymentRegistrationError(PAYMENT_REGISTRATION_ERRORS.CONFLICT);
    }
    return winner;
  }
}

export const FINANCIAL_PAYMENT_METHOD_REGISTRY: readonly FinancialPaymentMethod[] = [
  "CASH", "BANK_TRANSFER", "CARD", "CHECK", "MOBILE_TRANSFER", "OTHER",
];

function normalize(command: PaymentRegistrationCommand): NormalizedRegistration {
  const tenantId = required(command.tenantId, 191);
  const actor = {
    userId: required(command.actor?.userId, 191),
    name: required(command.actor?.name, 500),
  };
  const registrationDeduplicationKey = required(command.registrationDeduplicationKey, 200);
  const payerDisplayName = required(command.payerDisplayName, 500);
  const currencyCode = currency(command.currencyCode);
  const receivedAmount = amount(command.receivedAmount);
  const receivedAt = instant(command.receivedAt);
  const paymentMethod = financialMethod(command.paymentMethod);
  const customerId = optional(command.customerId, 191);
  const payerIdentificationType = optional(command.payerIdentificationType, 4);
  const payerIdentificationNumber = optional(command.payerIdentificationNumber, 30);
  if ((payerIdentificationType === null) !== (payerIdentificationNumber === null)) {
    invalid();
  }
  return {
    tenantId, actor, registrationDeduplicationKey, payerDisplayName, currencyCode,
    receivedAmount, receivedAt, paymentMethod, customerId,
    payerIdentificationType, payerIdentificationNumber,
    externalReference: optional(command.externalReference, 150),
    description: optional(command.description, 500),
  };
}

function initialPaymentData(input: NormalizedRegistration, receiptNumber: string): Prisma.PaymentUncheckedCreateInput {
  return {
    tenantId: input.tenantId,
    registrationDeduplicationKey: input.registrationDeduplicationKey,
    receiptNumber,
    payerDisplayName: input.payerDisplayName,
    currencyCode: input.currencyCode,
    receivedAmount: input.receivedAmount,
    availableAmount: input.receivedAmount,
    receivedAt: input.receivedAt,
    paymentMethod: input.paymentMethod,
    customerId: input.customerId,
    payerIdentificationType: input.payerIdentificationType,
    payerIdentificationNumber: input.payerIdentificationNumber,
    externalReference: input.externalReference,
    description: input.description,
    status: PaymentStatus.RECEIVED,
    cancelledAt: null,
  };
}

export function financeReceiptNumber(year: number, sequence: bigint): string {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || sequence < 1n) {
    throw new Error("FINANCE_RECEIPT_NUMBER_INVALID");
  }
  return `RCP-${String(year).padStart(4, "0")}-${sequence.toString().padStart(6, "0")}`;
}

function isExactRegistrationWinner(winner: Payment, input: NormalizedRegistration): boolean {
  return winner.tenantId === input.tenantId &&
    winner.registrationDeduplicationKey === input.registrationDeduplicationKey &&
    winner.customerId === input.customerId &&
    winner.payerDisplayName === input.payerDisplayName &&
    winner.payerIdentificationType === input.payerIdentificationType &&
    winner.payerIdentificationNumber === input.payerIdentificationNumber &&
    winner.currencyCode === input.currencyCode &&
    winner.receivedAmount.equals(input.receivedAmount) &&
    sameInstant(winner.receivedAt, input.receivedAt) &&
    winner.paymentMethod === input.paymentMethod &&
    winner.externalReference === input.externalReference &&
    winner.description === input.description;
}

function required(value: unknown, maximum: number): string {
  const normalized = optional(value, maximum);
  if (normalized === null) invalid();
  return normalized;
}

function optional(value: unknown, maximum: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") invalid();
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) invalid();
  return normalized;
}

function currency(value: unknown): Currency {
  const normalized = required(value, 3).toUpperCase();
  if (normalized !== Currency.CRC && normalized !== Currency.USD) invalid();
  return normalized;
}

function financialMethod(value: unknown): FinancialPaymentMethod {
  const normalized = required(value, 50).toUpperCase();
  if (!FINANCIAL_PAYMENT_METHODS.has(normalized)) invalid();
  return normalized as FinancialPaymentMethod;
}

function amount(value: unknown): Prisma.Decimal {
  if (
    !(value instanceof Prisma.Decimal) || !value.isFinite() ||
    value.lessThanOrEqualTo(0) || value.decimalPlaces() > 5 || value.greaterThan(MAX_AMOUNT)
  ) invalid();
  return value;
}

function instant(value: unknown): Date {
  if (!(value instanceof Date) || value.getTime() !== value.getTime()) invalid();
  return new Date(value.getTime());
}

function sameInstant(left: Date, right: Date): boolean {
  return left.getTime() === right.getTime();
}

function isP2002(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

function invalid(): never {
  throw new PaymentRegistrationError(PAYMENT_REGISTRATION_ERRORS.INVALID);
}
