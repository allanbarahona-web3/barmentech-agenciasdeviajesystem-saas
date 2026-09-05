import { Injectable } from "@nestjs/common";
import { Payment, PaymentConditionType, PaymentPurpose, PaymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  FINANCE_AUDIT_ACTIONS,
  FINANCE_AUDIT_ENTITY_TYPES,
  financeAuditRecord,
  financeMoney,
  type FinanceActor,
} from "./finance-audit";
import { normalizeFinancialPaymentMethod } from "./finance-payment-method";
import {
  INITIAL_CONTRACT_PAYMENT_PURPOSES,
  resolveInitialContractPayment,
  type InitialContractPayment,
} from "./contract-initial-payment";

const ACTIVE_STATUSES = [
  PaymentStatus.PENDING_VERIFICATION,
  PaymentStatus.RECEIVED,
  PaymentStatus.PARTIALLY_ALLOCATED,
  PaymentStatus.FULLY_ALLOCATED,
] as const;

export interface ContractReservationPaymentCommand {
  contract: {
    id: string;
    tenantId: string;
    clientId: string;
    createdAt: Date;
    paymentReference: string;
    paymentMethod: string;
    commercialTotal: Prisma.Decimal | null;
    paymentConditionType: PaymentConditionType | null;
    payload: unknown;
    client: { fullName: string };
    documents: Array<{
      kind: string | null;
      objectKey: string;
      originalFileName: string;
      mimeType: string;
      size: number;
    }>;
  };
  actor: FinanceActor;
}

@Injectable()
export class ContractReservationPaymentService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(command: ContractReservationPaymentCommand): Promise<Payment | null> {
    const paymentMethod = reservationPaymentMethod(command.contract.paymentMethod);
    const initialPayment = resolveInitialContractPayment({
      paymentConditionType: command.contract.paymentConditionType,
      commercialTotal: command.contract.commercialTotal,
      reservationAmount: reservationAmountOf(command.contract.payload),
    });

    const currencyCode = reservationCurrencyOf(command.contract.id, command.contract.payload);
    const existing = await this.findActive(command.contract.tenantId, command.contract.id);
    if (existing) return existingInitialPayment(existing, initialPayment);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const winner = await tx.payment.findFirst({
          where: {
            tenantId: command.contract.tenantId,
            contractId: command.contract.id,
            purpose: { in: [...INITIAL_CONTRACT_PAYMENT_PURPOSES] },
            status: { in: [...ACTIVE_STATUSES] },
          },
          orderBy: { createdAt: "asc" },
        });
        if (winner) return existingInitialPayment(winner, initialPayment);

        const payment = await tx.payment.create({
          data: {
            tenantId: command.contract.tenantId,
            registrationDeduplicationKey: `contract-reservation:${command.contract.id}`,
            receiptNumber: null,
            customerId: command.contract.clientId,
            contractId: command.contract.id,
            payerDisplayName: requiredName(command.contract.client.fullName),
            currencyCode,
            receivedAmount: initialPayment.amount,
            availableAmount: new Prisma.Decimal(0),
            // The archive timestamp is the canonical submission/report timestamp; no payment receipt date is inferred.
            receivedAt: command.contract.createdAt,
            paymentMethod,
            externalReference: nonEmpty(command.contract.paymentReference),
            description: null,
            purpose: initialPayment.purpose,
            status: PaymentStatus.PENDING_VERIFICATION,
            cancelledAt: null,
          },
        });

        const evidence = reservationEvidence(command.contract.documents);
        if (evidence.length) {
          await tx.paymentEvidence.createMany({
            data: evidence.map((document) => ({
              tenantId: command.contract.tenantId,
              paymentId: payment.id,
              ...document,
            })),
            skipDuplicates: true,
          });
        }

        await tx.billingAuditLog.create({
          data: financeAuditRecord({
            tenantId: command.contract.tenantId,
            entityType: FINANCE_AUDIT_ENTITY_TYPES.PAYMENT,
            entityId: payment.id,
            action: initialPaymentAuditAction(initialPayment.purpose),
            actor: command.actor,
            occurredAt: payment.createdAt,
            afterJson: {
              paymentId: payment.id,
              contractId: command.contract.id,
              purpose: payment.purpose,
              status: payment.status,
              receivedAmount: financeMoney(payment.receivedAmount),
              availableAmount: financeMoney(payment.availableAmount),
            },
          }),
        });
        return payment;
      });
    } catch (error) {
      if (!isP2002(error)) throw error;
      const winner = await this.findActive(command.contract.tenantId, command.contract.id);
      if (winner) return existingInitialPayment(winner, initialPayment);
      throw error;
    }
  }

  private findActive(tenantId: string, contractId: string): Promise<Payment | null> {
    return this.prisma.payment.findFirst({
      where: {
        tenantId,
        contractId,
        purpose: { in: [...INITIAL_CONTRACT_PAYMENT_PURPOSES] },
        status: { in: [...ACTIVE_STATUSES] },
      },
      orderBy: { createdAt: "asc" },
    });
  }
}

function existingInitialPayment(payment: Payment, initial: InitialContractPayment): Payment {
  if (payment.purpose !== initial.purpose || !payment.receivedAmount.equals(initial.amount)) {
    throw new Error("CONTRACT_INITIAL_PAYMENT_CONFLICT");
  }
  return payment;
}

function initialPaymentAuditAction(purpose: PaymentPurpose): string {
  return purpose === PaymentPurpose.CONTRACT_PAYMENT
    ? FINANCE_AUDIT_ACTIONS.CONTRACT_PAYMENT_SUBMITTED
    : FINANCE_AUDIT_ACTIONS.RESERVATION_SUBMITTED;
}

function reservationAmountOf(payload: unknown): Prisma.Decimal {
  const value = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>).reservationAmount
    : null;
  return value as Prisma.Decimal;
}

function reservationCurrencyOf(contractId: string, payload: unknown): "CRC" | "USD" {
  const currency = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>).reservationCurrencyCode
    : null;
  const normalized = String(currency || "").trim().toUpperCase();
  if (normalized === "CRC" || normalized === "USD") return normalized;
  throw new Error(`CONTRACT_RESERVATION_CURRENCY_UNAVAILABLE contractId=${contractId}`);
}

function reservationPaymentMethod(value: unknown) {
  const paymentMethod = normalizeFinancialPaymentMethod(value);
  if (!paymentMethod) {
    throw new Error("CONTRACT_RESERVATION_PAYMENT_METHOD_INVALID");
  }
  return paymentMethod;
}

function reservationEvidence(documents: ContractReservationPaymentCommand["contract"]["documents"]) {
  return documents
    .filter(isReservationDocument)
    .filter((document) => Boolean(nonEmpty(document.objectKey)))
    .map((document) => ({
      objectKey: document.objectKey,
      originalFileName: document.originalFileName || "documento",
      mimeType: document.mimeType || "application/octet-stream",
      size: Number(document.size || 0),
    }));
}

function isReservationDocument(document: { kind: string | null; originalFileName: string }): boolean {
  const kind = String(document.kind || "").trim().toUpperCase();
  if (["RESERVATION", "PAYMENT_RESERVATION"].includes(kind)) return true;
  const name = String(document.originalFileName || "").toLowerCase();
  return name.includes("reserva") || name.includes("comprobante") || name.includes("pago");
}

function requiredName(value: string): string {
  const name = nonEmpty(value);
  if (!name) throw new Error("CONTRACT_RESERVATION_PAYER_UNAVAILABLE");
  return name;
}

function nonEmpty(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function isP2002(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002");
}
