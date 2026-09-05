import { Injectable } from "@nestjs/common";
import {
  CommercialObligationStatus,
  Currency,
  PaymentPurpose,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS,
  CommercialObligationAllocationError,
  CommercialObligationAllocationService,
} from "./commercial-obligation-allocation.service";
import type { FinanceActor } from "./finance-audit";
import { normalizeFinancialPaymentMethod } from "./finance-payment-method";
import {
  PAYMENT_REGISTRATION_ERRORS,
  PaymentRegistrationError,
  PaymentRegistrationService,
} from "./payment-registration.service";

const MAX_AMOUNT = new Prisma.Decimal("99999999999999.99999");
const INSTALLMENT_CONTRACT_STATUSES = new Set([
  "PENDING_SIGNATURE",
  "SIGNING_SENT",
  "VIEWED",
  "SIGNED",
]);

export const CONTRACT_INSTALLMENT_ERRORS = {
  INVALID: "CONTRACT_INSTALLMENT_INVALID",
  PAYMENT_METHOD_INVALID: "CONTRACT_INSTALLMENT_PAYMENT_METHOD_INVALID",
  AMOUNT_INVALID: "CONTRACT_INSTALLMENT_AMOUNT_INVALID",
  CONTRACT_NOT_FOUND: "CONTRACT_INSTALLMENT_CONTRACT_NOT_FOUND",
  CONTRACT_STATE_CONFLICT: "CONTRACT_INSTALLMENT_CONTRACT_STATE_CONFLICT",
  COMMERCIAL_TERMS_INCOMPLETE: "CONTRACT_INSTALLMENT_COMMERCIAL_TERMS_INCOMPLETE",
  OBLIGATION_NOT_FOUND: "CONTRACT_INSTALLMENT_OBLIGATION_NOT_FOUND",
  OBLIGATION_STATE_CONFLICT: "CONTRACT_INSTALLMENT_OBLIGATION_STATE_CONFLICT",
  AMOUNT_EXCEEDS_OUTSTANDING: "CONTRACT_INSTALLMENT_AMOUNT_EXCEEDS_OUTSTANDING",
  CUSTOMER_MISMATCH: "CONTRACT_INSTALLMENT_CUSTOMER_MISMATCH",
  CURRENCY_MISMATCH: "CONTRACT_INSTALLMENT_CURRENCY_MISMATCH",
  CONFLICT: "CONTRACT_INSTALLMENT_CONFLICT",
} as const;

export class ContractInstallmentPaymentError extends Error {
  constructor(readonly code: (typeof CONTRACT_INSTALLMENT_ERRORS)[keyof typeof CONTRACT_INSTALLMENT_ERRORS]) {
    super(code);
  }
}

export interface ContractInstallmentPaymentCommand {
  tenantId: string;
  contractId: string;
  registrationDeduplicationKey: string;
  amount: Prisma.Decimal;
  paymentMethod: string;
  receivedAt: Date;
  externalReference?: string | null;
  description?: string | null;
  actor: FinanceActor;
}

@Injectable()
export class ContractInstallmentPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registrations: PaymentRegistrationService,
    private readonly commercialObligationAllocations: CommercialObligationAllocationService,
  ) {}

  async register(command: ContractInstallmentPaymentCommand) {
    const input = normalize(command);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockContract(tx, input.tenantId, input.contractId);
        const contract = await tx.contract.findFirst({
          where: { id: input.contractId, tenantId: input.tenantId },
          select: {
            id: true,
            tenantId: true,
            clientId: true,
            status: true,
            commercialTotal: true,
            commercialCurrency: true,
            paymentConditionType: true,
            commercialTaxTreatment: true,
            paymentDueDate: true,
            client: { select: { fullName: true } },
          },
        });
        if (!contract) fail(CONTRACT_INSTALLMENT_ERRORS.CONTRACT_NOT_FOUND);
        validateContract(contract);

        const obligation = await tx.commercialObligation.findUnique({
          where: {
            tenantId_sourceType_sourceId: {
              tenantId: input.tenantId,
              sourceType: "CONTRACT",
              sourceId: contract.id,
            },
          },
        });
        if (!obligation) fail(CONTRACT_INSTALLMENT_ERRORS.OBLIGATION_NOT_FOUND);
        validateObligation(obligation, contract.clientId, contract.commercialCurrency!);
        if (input.amount.greaterThan(obligation.outstandingAmount)) {
          fail(CONTRACT_INSTALLMENT_ERRORS.AMOUNT_EXCEEDS_OUTSTANDING);
        }

        const registered = await this.registrations.registerInTransaction(tx, {
          tenantId: input.tenantId,
          actor: input.actor,
          registrationDeduplicationKey: input.registrationDeduplicationKey,
          payerDisplayName: required(contract.client.fullName, 500),
          customerId: contract.clientId,
          currencyCode: obligation.currencyCode,
          receivedAmount: input.amount,
          receivedAt: input.receivedAt,
          paymentMethod: input.paymentMethod,
          externalReference: input.externalReference,
          description: input.description,
          purpose: PaymentPurpose.CONTRACT_INSTALLMENT,
          contractId: contract.id,
        });

        try {
          await this.commercialObligationAllocations.allocateInTransaction(tx, {
            tenantId: input.tenantId,
            paymentId: registered.payment.id,
            commercialObligationId: obligation.id,
            amount: input.amount,
            allocationDeduplicationKey: `contract-installment:${registered.payment.id}:${obligation.id}`,
            actor: input.actor,
          });
        } catch (error) {
          translateAllocationError(error);
        }

        const [payment, updatedObligation] = await Promise.all([
          tx.payment.findFirst({ where: { id: registered.payment.id, tenantId: input.tenantId } }),
          tx.commercialObligation.findFirst({ where: { id: obligation.id, tenantId: input.tenantId } }),
        ]);
        if (!payment || !updatedObligation) fail(CONTRACT_INSTALLMENT_ERRORS.CONFLICT);
        return {
          payment: {
            id: payment.id,
            receiptNumber: payment.receiptNumber,
            amount: payment.receivedAmount.toFixed(),
            currencyCode: payment.currencyCode,
            paymentMethod: payment.paymentMethod,
            status: payment.status,
          },
          obligation: {
            id: updatedObligation.id,
            outstandingAmount: updatedObligation.outstandingAmount.toFixed(),
            status: updatedObligation.status,
          },
        };
      }, { timeout: 15000 });
    } catch (error) {
      if (error instanceof ContractInstallmentPaymentError) throw error;
      if (error instanceof PaymentRegistrationError) {
        if (error.code === PAYMENT_REGISTRATION_ERRORS.INVALID) {
          fail(CONTRACT_INSTALLMENT_ERRORS.INVALID);
        }
        if (error.code === PAYMENT_REGISTRATION_ERRORS.CONFLICT) {
          fail(CONTRACT_INSTALLMENT_ERRORS.CONFLICT);
        }
      }
      throw error;
    }
  }
}

function normalize(command: ContractInstallmentPaymentCommand) {
  const paymentMethod = normalizeFinancialPaymentMethod(command.paymentMethod);
  if (!paymentMethod) fail(CONTRACT_INSTALLMENT_ERRORS.PAYMENT_METHOD_INVALID);
  const amount = command.amount;
  if (
    !(amount instanceof Prisma.Decimal) || !amount.isFinite() || amount.lessThanOrEqualTo(0) ||
    amount.decimalPlaces() > 5 || amount.greaterThan(MAX_AMOUNT)
  ) fail(CONTRACT_INSTALLMENT_ERRORS.AMOUNT_INVALID);
  const receivedAt = date(command.receivedAt);
  return {
    tenantId: required(command.tenantId, 191),
    contractId: required(command.contractId, 191),
    registrationDeduplicationKey: required(command.registrationDeduplicationKey, 200),
    amount,
    paymentMethod,
    receivedAt,
    externalReference: optional(command.externalReference, 150),
    description: optional(command.description, 500),
    actor: { userId: required(command.actor?.userId, 191), name: required(command.actor?.name, 500) },
  };
}

async function lockContract(tx: Prisma.TransactionClient, tenantId: string, contractId: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Contract"
    WHERE "id" = ${contractId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
  if (rows.length !== 1) fail(CONTRACT_INSTALLMENT_ERRORS.CONTRACT_NOT_FOUND);
}

function validateContract(contract: {
  status: string;
  commercialTotal: Prisma.Decimal | null;
  commercialCurrency: Currency | null;
  paymentConditionType: string | null;
  commercialTaxTreatment: string | null;
  paymentDueDate: Date | null;
}): void {
  if (!INSTALLMENT_CONTRACT_STATUSES.has(contract.status)) {
    fail(CONTRACT_INSTALLMENT_ERRORS.CONTRACT_STATE_CONFLICT);
  }
  if (
    !(contract.commercialTotal instanceof Prisma.Decimal) || !contract.commercialTotal.isFinite() ||
    contract.commercialTotal.lessThanOrEqualTo(0) ||
    (contract.commercialCurrency !== Currency.CRC && contract.commercialCurrency !== Currency.USD) ||
    contract.paymentConditionType !== "CREDIT" ||
    contract.commercialTaxTreatment !== "TAX_INCLUDED" ||
    !(contract.paymentDueDate instanceof Date) || Number.isNaN(contract.paymentDueDate.getTime())
  ) fail(CONTRACT_INSTALLMENT_ERRORS.COMMERCIAL_TERMS_INCOMPLETE);
}

function validateObligation(
  obligation: { customerId: string; currencyCode: string; status: CommercialObligationStatus; originalAmount: Prisma.Decimal; outstandingAmount: Prisma.Decimal },
  customerId: string,
  currencyCode: Currency,
): void {
  if (obligation.customerId !== customerId) fail(CONTRACT_INSTALLMENT_ERRORS.CUSTOMER_MISMATCH);
  if (obligation.currencyCode !== currencyCode) fail(CONTRACT_INSTALLMENT_ERRORS.CURRENCY_MISMATCH);
  if (
    (obligation.status !== CommercialObligationStatus.OPEN && obligation.status !== CommercialObligationStatus.PARTIALLY_SETTLED) ||
    !obligation.originalAmount.isFinite() || obligation.originalAmount.lessThanOrEqualTo(0) ||
    !obligation.outstandingAmount.isFinite() || obligation.outstandingAmount.lessThanOrEqualTo(0) ||
    obligation.outstandingAmount.greaterThan(obligation.originalAmount)
  ) fail(CONTRACT_INSTALLMENT_ERRORS.OBLIGATION_STATE_CONFLICT);
}

function translateAllocationError(error: unknown): never {
  if (!(error instanceof CommercialObligationAllocationError)) throw error;
  if (error.code === COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.OBLIGATION_INSUFFICIENT) {
    fail(CONTRACT_INSTALLMENT_ERRORS.AMOUNT_EXCEEDS_OUTSTANDING);
  }
  if (error.code === COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.CUSTOMER_MISMATCH) {
    fail(CONTRACT_INSTALLMENT_ERRORS.CUSTOMER_MISMATCH);
  }
  if (error.code === COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.CURRENCY_MISMATCH) {
    fail(CONTRACT_INSTALLMENT_ERRORS.CURRENCY_MISMATCH);
  }
  if (error.code === COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.OBLIGATION_INVALID) {
    fail(CONTRACT_INSTALLMENT_ERRORS.OBLIGATION_STATE_CONFLICT);
  }
  fail(CONTRACT_INSTALLMENT_ERRORS.CONFLICT);
}

function required(value: unknown, maximum: number): string {
  const normalized = optional(value, maximum);
  if (normalized === null) fail(CONTRACT_INSTALLMENT_ERRORS.INVALID);
  return normalized;
}

function optional(value: unknown, maximum: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") fail(CONTRACT_INSTALLMENT_ERRORS.INVALID);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) fail(CONTRACT_INSTALLMENT_ERRORS.INVALID);
  return normalized;
}

function date(value: unknown): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) fail(CONTRACT_INSTALLMENT_ERRORS.INVALID);
  return new Date(value.getTime());
}

function fail(code: (typeof CONTRACT_INSTALLMENT_ERRORS)[keyof typeof CONTRACT_INSTALLMENT_ERRORS]): never {
  throw new ContractInstallmentPaymentError(code);
}
