import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Payment, PaymentPurpose, PaymentStatus, Prisma } from "@prisma/client";
import { BusinessNumberingService } from "../business-numbering/business-numbering.service";
import { ContractReservationApprovalService } from "../contracts/contract-reservation-approval.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import {
  COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS,
  CommercialObligationAllocationError,
  CommercialObligationAllocationService,
} from "./commercial-obligation-allocation.service";
import {
  FINANCE_AUDIT_ACTIONS,
  FINANCE_AUDIT_ENTITY_TYPES,
  financeAuditRecord,
  financeMoney,
  type FinanceActor,
} from "./finance-audit";
import {
  INITIAL_CONTRACT_PAYMENT_PURPOSES,
} from "./contract-initial-payment";
import { FINANCE_RECEIPT_SEQUENCE_KEY, financeReceiptNumber } from "./payment-registration.service";

const APPROVED_PAYMENT_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.RECEIVED,
  PaymentStatus.PARTIALLY_ALLOCATED,
  PaymentStatus.FULLY_ALLOCATED,
]);

@Injectable()
export class ContractReservationReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessNumbers: BusinessNumberingService,
    private readonly contracts: ContractReservationApprovalService,
    private readonly commercialObligationAllocations: CommercialObligationAllocationService,
    private readonly storage: StorageService,
  ) {}

  async approve(tenantId: string, paymentId: string, actor: FinanceActor): Promise<Payment> {
    return this.prisma.$transaction(async (tx) => {
      const payment = await this.lockPayment(tx, tenantId, paymentId);
      this.validateInitialPaymentIdentity(payment);
      if (APPROVED_PAYMENT_STATUSES.has(payment.status)) {
        if (approvedState(payment)) return payment;
        throw new ConflictException("CONTRACT_RESERVATION_REVIEW_STATE_CONFLICT");
      }
      if (payment.status !== PaymentStatus.PENDING_VERIFICATION) {
        throw new ConflictException("CONTRACT_RESERVATION_REVIEW_ALREADY_DECIDED");
      }
      validatePendingState(payment);
      const contractId = payment.contractId;
      if (!contractId) throw new BadRequestException("CONTRACT_RESERVATION_PAYMENT_INVALID");

      const reviewedAt = new Date();
      const sequence = await this.businessNumbers.next(tx, {
        tenantId,
        sequenceKey: FINANCE_RECEIPT_SEQUENCE_KEY,
        year: reviewedAt.getUTCFullYear(),
      });
      const receiptNumber = financeReceiptNumber(reviewedAt.getUTCFullYear(), sequence);
      const updated = await tx.payment.updateMany({
        where: {
          id: payment.id,
          tenantId,
          status: PaymentStatus.PENDING_VERIFICATION,
          receiptNumber: null,
          availableAmount: new Prisma.Decimal(0),
        },
        data: {
          receiptNumber,
          status: PaymentStatus.RECEIVED,
          availableAmount: payment.receivedAmount,
          reviewedAt,
          reviewedByUserId: actor.userId,
          reviewedByName: actor.name,
          rejectionReason: null,
        },
      });
      if (updated.count !== 1) throw new ConflictException("CONTRACT_RESERVATION_REVIEW_CONFLICT");

      const confirmed = await tx.payment.findFirst({ where: { id: payment.id, tenantId } });
      if (!confirmed) throw new Error("CONTRACT_RESERVATION_APPROVAL_PERSISTENCE_FAILED");
      const approval = await this.contracts.approveInTransaction(tx, {
        tenantId,
        contractId,
        actor,
        afterCommercialObligation: async ({ commercialObligationId }) => {
          await this.allocateReservationPayment(tx, {
            tenantId,
            payment: confirmed,
            commercialObligationId,
            actor,
          });
        },
      });
      if (!approval.applied || !approval.commercialObligationId) {
        throw new ConflictException("CONTRACT_RESERVATION_APPROVAL_STATE_CONFLICT");
      }
      const allocated = await tx.payment.findFirst({ where: { id: payment.id, tenantId } });
      if (!allocated) throw new Error("CONTRACT_RESERVATION_ALLOCATION_PERSISTENCE_FAILED");
      await tx.billingAuditLog.create({
        data: financeAuditRecord({
          tenantId,
          entityType: FINANCE_AUDIT_ENTITY_TYPES.PAYMENT,
          entityId: allocated.id,
          action: initialPaymentAuditAction(payment.purpose, "APPROVED"),
          actor,
          occurredAt: reviewedAt,
          beforeJson: { status: payment.status, availableAmount: financeMoney(payment.availableAmount), receiptNumber: null },
          afterJson: { status: allocated.status, availableAmount: financeMoney(allocated.availableAmount), receiptNumber: allocated.receiptNumber, contractId: allocated.contractId },
        }),
      });
      return allocated;
    }, { timeout: 15000 });
  }

  async reject(tenantId: string, paymentId: string, reason: string, actor: FinanceActor): Promise<Payment> {
    const rejectionReason = String(reason || "").trim();
    if (!rejectionReason || rejectionReason.length > 500) {
      throw new BadRequestException("CONTRACT_RESERVATION_REJECTION_REASON_INVALID");
    }
    return this.prisma.$transaction(async (tx) => {
      const payment = await this.lockPayment(tx, tenantId, paymentId);
      this.validateInitialPaymentIdentity(payment);
      if (payment.status === PaymentStatus.REJECTED) {
        if (rejectedState(payment, rejectionReason)) return payment;
        throw new ConflictException("CONTRACT_RESERVATION_REVIEW_STATE_CONFLICT");
      }
      if (payment.status !== PaymentStatus.PENDING_VERIFICATION) {
        throw new ConflictException("CONTRACT_RESERVATION_REVIEW_ALREADY_DECIDED");
      }
      validatePendingState(payment);
      const reviewedAt = new Date();
      const updated = await tx.payment.updateMany({
        where: {
          id: payment.id,
          tenantId,
          status: PaymentStatus.PENDING_VERIFICATION,
          receiptNumber: null,
          availableAmount: new Prisma.Decimal(0),
        },
        data: {
          status: PaymentStatus.REJECTED,
          receiptNumber: null,
          availableAmount: new Prisma.Decimal(0),
          reviewedAt,
          reviewedByUserId: actor.userId,
          reviewedByName: actor.name,
          rejectionReason,
        },
      });
      if (updated.count !== 1) throw new ConflictException("CONTRACT_RESERVATION_REVIEW_CONFLICT");
      const rejected = await tx.payment.findFirst({ where: { id: payment.id, tenantId } });
      if (!rejected) throw new Error("CONTRACT_RESERVATION_REJECTION_PERSISTENCE_FAILED");
      await tx.billingAuditLog.create({
        data: financeAuditRecord({
          tenantId,
          entityType: FINANCE_AUDIT_ENTITY_TYPES.PAYMENT,
          entityId: rejected.id,
          action: initialPaymentAuditAction(payment.purpose, "REJECTED"),
          actor,
          occurredAt: reviewedAt,
          beforeJson: { status: payment.status },
          afterJson: { status: rejected.status, rejectionReason, contractId: rejected.contractId },
        }),
      });
      return rejected;
    });
  }

  async listPending(tenantId: string, limit = 100) {
    const take = requirePendingListLimit(limit);
    const payments = await this.prisma.payment.findMany({
      where: { tenantId, purpose: { in: [...INITIAL_CONTRACT_PAYMENT_PURPOSES] }, status: PaymentStatus.PENDING_VERIFICATION },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
      take,
      select: {
        id: true, customerId: true, contractId: true, currencyCode: true, receivedAmount: true,
        availableAmount: true, receivedAt: true, paymentMethod: true, externalReference: true,
        description: true, purpose: true, status: true, receiptNumber: true,
        evidence: { select: { id: true, originalFileName: true, mimeType: true, size: true } },
        contract: {
          select: {
            id: true, contractNumber: true, status: true, destination: true, clientId: true,
            client: { select: { id: true, fullName: true, idNumber: true, email: true, phone: true } },
            travelPackage: { select: { id: true, name: true, departureDate: true, returnDate: true } },
            internalTrip: { select: { id: true, name: true, departureDate: true, returnDate: true } },
          },
        },
      },
    });
    return { payments: payments.map((payment) => ({ ...payment, receivedAmount: payment.receivedAmount.toFixed(), availableAmount: payment.availableAmount.toFixed() })) };
  }

  async getEvidenceUrl(tenantId: string, paymentId: string, evidenceId: string) {
    const evidence = await this.prisma.paymentEvidence.findFirst({
      where: {
        id: evidenceId,
        paymentId,
        tenantId,
        payment: { tenantId, purpose: { in: [...INITIAL_CONTRACT_PAYMENT_PURPOSES] } },
      },
      select: { id: true, originalFileName: true, mimeType: true, size: true, objectKey: true },
    });
    if (!evidence) throw new NotFoundException("CONTRACT_RESERVATION_EVIDENCE_NOT_FOUND");
    return {
      id: evidence.id,
      originalFileName: evidence.originalFileName,
      mimeType: evidence.mimeType,
      size: evidence.size,
      url: await this.storage.generateSignedUrl(evidence.objectKey, 900),
    };
  }

  private async lockPayment(tx: Prisma.TransactionClient, tenantId: string, paymentId: string): Promise<Payment> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "payments"
      WHERE "id" = ${paymentId} AND "tenantId" = ${tenantId}
      FOR UPDATE
    `;
    if (locked.length !== 1) throw new NotFoundException("CONTRACT_RESERVATION_PAYMENT_NOT_FOUND");
    const payment = await tx.payment.findFirst({ where: { id: paymentId, tenantId } });
    if (!payment) throw new NotFoundException("CONTRACT_RESERVATION_PAYMENT_NOT_FOUND");
    return payment;
  }

  private validateInitialPaymentIdentity(payment: Payment): void {
    if (!INITIAL_CONTRACT_PAYMENT_PURPOSES.includes(payment.purpose as typeof INITIAL_CONTRACT_PAYMENT_PURPOSES[number]) || !payment.contractId) {
      throw new BadRequestException("CONTRACT_RESERVATION_PAYMENT_INVALID");
    }
  }

  private async allocateReservationPayment(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      payment: Payment;
      commercialObligationId: string;
      actor: FinanceActor;
    },
  ): Promise<void> {
    try {
      await this.commercialObligationAllocations.allocateInTransaction(tx, {
        tenantId: input.tenantId,
        paymentId: input.payment.id,
        commercialObligationId: input.commercialObligationId,
        amount: input.payment.receivedAmount,
        allocationDeduplicationKey: `${initialPaymentAllocationKey(input.payment.purpose)}:${input.payment.id}:${input.commercialObligationId}`,
        actor: input.actor,
      });
    } catch (error) {
      if (error instanceof CommercialObligationAllocationError) {
        if (error.code === COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS.CONFLICT) {
          throw new ConflictException(error.code);
        }
        throw new BadRequestException(error.code);
      }
      throw error;
    }
  }
}

function initialPaymentAuditAction(
  purpose: PaymentPurpose,
  decision: "APPROVED" | "REJECTED",
): string {
  if (purpose === PaymentPurpose.CONTRACT_PAYMENT) {
    return decision === "APPROVED"
      ? FINANCE_AUDIT_ACTIONS.CONTRACT_PAYMENT_APPROVED
      : FINANCE_AUDIT_ACTIONS.CONTRACT_PAYMENT_REJECTED;
  }
  return decision === "APPROVED"
    ? FINANCE_AUDIT_ACTIONS.RESERVATION_APPROVED
    : FINANCE_AUDIT_ACTIONS.RESERVATION_REJECTED;
}

function initialPaymentAllocationKey(purpose: PaymentPurpose): string {
  return purpose === PaymentPurpose.CONTRACT_PAYMENT
    ? "contract-payment"
    : "contract-reservation";
}

function validatePendingState(payment: Payment): void {
  if (!payment.receivedAmount.isFinite() || payment.receivedAmount.lessThanOrEqualTo(0) ||
      !payment.availableAmount.isZero() || payment.receiptNumber !== null) {
    throw new ConflictException("CONTRACT_RESERVATION_PENDING_STATE_INVALID");
  }
}

function approvedState(payment: Payment): boolean {
  return payment.receiptNumber !== null && payment.receiptNumber.trim().length > 0 &&
    payment.reviewedAt !== null && payment.reviewedByUserId !== null &&
    payment.reviewedByName !== null && payment.rejectionReason === null;
}

function rejectedState(payment: Payment, reason: string): boolean {
  return payment.receiptNumber === null && payment.availableAmount.isZero() && payment.reviewedAt !== null &&
    payment.reviewedByUserId !== null && payment.reviewedByName !== null && payment.rejectionReason === reason;
}

function requirePendingListLimit(limit: unknown): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new BadRequestException("CONTRACT_RESERVATION_PENDING_LIMIT_INVALID");
  }
  return limit;
}
