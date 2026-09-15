import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountReceivableStatus, Payment, PaymentPurpose, PaymentStatus, Prisma } from "@prisma/client";
import { BusinessNumberingService } from "../business-numbering/business-numbering.service";
import { ContractReservationApprovalService } from "../contracts/contract-reservation-approval.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import {
  COMMERCIAL_OBLIGATION_ALLOCATION_ERRORS,
  CommercialObligationAllocationError,
  CommercialObligationAllocationService,
} from "./commercial-obligation-allocation.service";
import { applyLockedPaymentAllocations } from "./payment-allocation.service";
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
import { ContractPaymentFiscalizationOutboxService } from "./contract-payment-fiscalization-outbox.service";
import { DailyExchangeRateResolver, resolveDailySettlement } from "../exchange-rate/daily-exchange-rate.resolver";
import { paymentEvidenceMetadataForReview } from "./pending-invoice-payment-evidence.service";
import { normalizeCurrencySettlementAmount } from "./currency-settlement.policy";

const APPROVED_PAYMENT_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.RECEIVED,
  PaymentStatus.PARTIALLY_ALLOCATED,
  PaymentStatus.FULLY_ALLOCATED,
]);
const OPEN_ACCOUNT_RECEIVABLE_STATUSES: AccountReceivableStatus[] = [
  AccountReceivableStatus.OPEN,
  AccountReceivableStatus.PARTIALLY_SETTLED,
];

@Injectable()
export class ContractReservationReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessNumbers: BusinessNumberingService,
    private readonly contracts: ContractReservationApprovalService,
    private readonly commercialObligationAllocations: CommercialObligationAllocationService,
    private readonly storage: StorageService,
    private readonly fiscalizationOutbox: ContractPaymentFiscalizationOutboxService,
    private readonly dailyExchangeRates: DailyExchangeRateResolver,
  ) {}

  async approve(tenantId: string, paymentId: string, actor: FinanceActor): Promise<Payment> {
    return this.prisma.$transaction(async (tx) => {
      const payment = await this.lockPayment(tx, tenantId, paymentId);
      const invoiceProposal = invoiceAllocationProposal(payment);
      if (invoiceProposal) {
        return this.approveInvoicePendingPayment(tx, payment, invoiceProposal, actor);
      }
      this.validateInitialPaymentIdentity(payment);
      if (APPROVED_PAYMENT_STATUSES.has(payment.status)) {
        if (approvedState(payment)) {
          await this.fiscalizationOutbox.enqueueConfirmedPaymentInTransaction(tx, payment);
          return payment;
        }
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
      await this.fiscalizationOutbox.enqueueConfirmedPaymentInTransaction(tx, allocated);
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
      if (invoiceAllocationProposal(payment)) {
        return this.rejectInvoicePendingPayment(tx, payment, reason, actor);
      }
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
    const contractPayments = await this.prisma.payment.findMany({
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
    const invoicePayments = await this.invoicePendingPayments(tenantId, take);
    const contractItems = contractPayments.map((payment) => ({
      ...payment,
      reviewKind: "CONTRACT" as const,
      receivedAmount: payment.receivedAmount.toFixed(),
      availableAmount: payment.availableAmount.toFixed(),
    }));
    return {
      payments: [...contractItems, ...invoicePayments]
        .sort((left, right) => left.receivedAt.getTime() - right.receivedAt.getTime() || left.id.localeCompare(right.id))
        .slice(0, take),
    };
  }

  async getInvoicePendingDetail(tenantId: string, paymentId: string) {
    const payments = await this.invoicePendingPayments(tenantId, 1, paymentId);
    if (payments.length !== 1) throw new NotFoundException("INVOICE_PENDING_PAYMENT_NOT_FOUND");
    return payments[0];
  }

  async precheckInvoicePendingPayment(tenantId: string, paymentId: string) {
    const payment = await this.findInvoicePendingPayment(tenantId, paymentId);
    if (!payment) throw new NotFoundException("INVOICE_PENDING_PAYMENT_NOT_FOUND");
    const proposal = invoiceAllocationProposal(payment);
    if (!proposal) throw new ConflictException("INVOICE_PENDING_PAYMENT_STALE_TARGET");
    const current = await this.currentInvoiceTargets(tenantId, proposal);
    const settlementCurrencyCode = validateInvoiceProposal(payment, proposal, current);
    const settlement = await this.resolveInvoiceSettlement(payment, settlementCurrencyCode);
    validateInvoiceProposal(payment, proposal, current, settlement.amount);
    return {
      ok: true,
      paymentId: payment.id,
      status: payment.status,
      customerId: payment.customerId,
      currencyCode: payment.currencyCode,
      amount: financeMoney(payment.receivedAmount),
      settlementCurrencyCode: settlement.currencyCode,
      settlementAmount: financeMoney(settlement.amount),
      allocationProposal: proposal,
      targets: invoiceTargetReviewRows(proposal, current),
    };
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

  private async lockPayment(tx: Prisma.TransactionClient, tenantId: string, paymentId: string): Promise<PaymentWithAllocationProposal> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "payments"
      WHERE "id" = ${paymentId} AND "tenantId" = ${tenantId}
      FOR UPDATE
    `;
    if (locked.length !== 1) throw new NotFoundException("CONTRACT_RESERVATION_PAYMENT_NOT_FOUND");
    const payment = await tx.payment.findFirst({ where: { id: paymentId, tenantId } }) as PaymentWithAllocationProposal | null;
    if (!payment) throw new NotFoundException("CONTRACT_RESERVATION_PAYMENT_NOT_FOUND");
    return payment;
  }

  private validateInitialPaymentIdentity(payment: Payment): void {
    if (!INITIAL_CONTRACT_PAYMENT_PURPOSES.includes(payment.purpose as typeof INITIAL_CONTRACT_PAYMENT_PURPOSES[number]) || !payment.contractId) {
      throw new BadRequestException("CONTRACT_RESERVATION_PAYMENT_INVALID");
    }
  }

  private async rejectInvoicePendingPayment(
    tx: Prisma.TransactionClient,
    payment: PaymentWithAllocationProposal,
    reason: string,
    actor: FinanceActor,
  ) {
    const rejectionReason = String(reason || "").trim();
    if (!rejectionReason || rejectionReason.length > 500) {
      throw new BadRequestException("INVOICE_PENDING_PAYMENT_REJECTION_REASON_INVALID");
    }
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
        tenantId: payment.tenantId,
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
    const rejected = await tx.payment.findFirst({ where: { id: payment.id, tenantId: payment.tenantId } });
    if (!rejected) throw new Error("INVOICE_PENDING_PAYMENT_REJECTION_PERSISTENCE_FAILED");
    await tx.billingAuditLog.create({
      data: financeAuditRecord({
        tenantId: payment.tenantId,
        entityType: FINANCE_AUDIT_ENTITY_TYPES.PAYMENT,
        entityId: rejected.id,
        action: FINANCE_AUDIT_ACTIONS.REPORTED_INVOICE_PAYMENT_REJECTED,
        actor,
        occurredAt: reviewedAt,
        beforeJson: { status: payment.status, receiptNumber: null, availableAmount: financeMoney(payment.availableAmount) },
        afterJson: { status: rejected.status, receiptNumber: rejected.receiptNumber, availableAmount: financeMoney(rejected.availableAmount), rejectionReason },
      }),
    });
    return rejected;
  }

  private async approveInvoicePendingPayment(
    tx: Prisma.TransactionClient,
    payment: PaymentWithAllocationProposal,
    proposal: InvoiceAllocationProposal,
    actor: FinanceActor,
  ): Promise<Payment> {
    if (payment.purpose !== PaymentPurpose.GENERAL || payment.contractId !== null) {
      throw new ConflictException("INVOICE_PENDING_PAYMENT_STALE_TARGET");
    }
    if (APPROVED_PAYMENT_STATUSES.has(payment.status)) {
      if (approvedState(payment)) return payment;
      throw new ConflictException("CONTRACT_RESERVATION_REVIEW_STATE_CONFLICT");
    }
    if (payment.status !== PaymentStatus.PENDING_VERIFICATION) {
      throw new ConflictException("CONTRACT_RESERVATION_REVIEW_ALREADY_DECIDED");
    }
    validatePendingState(payment);

    const targetIds = [...new Set(proposal.targets.map((target) => target.targetId))].sort();
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "account_receivables"
      WHERE "tenantId" = ${payment.tenantId} AND "id" IN (${Prisma.join(targetIds)})
      ORDER BY "id" ASC
      FOR UPDATE
    `;
    if (locked.length !== targetIds.length) {
      throw new ConflictException("INVOICE_PENDING_PAYMENT_STALE_TARGET");
    }
    const receivables = await tx.accountReceivable.findMany({
      where: { tenantId: payment.tenantId, id: { in: targetIds } },
      select: {
        id: true,
        customerId: true,
        currencyCode: true,
        originalAmount: true,
        outstandingAmount: true,
        status: true,
        sourceType: true,
        sourceId: true,
        sourceNumber: true,
      },
    });
    const settlementCurrencyCode = validateInvoiceProposal(payment, proposal, invoiceTargetMap(receivables, []));
    const settlement = await this.resolveInvoiceSettlement(payment, settlementCurrencyCode);
    validateInvoiceProposal(payment, proposal, invoiceTargetMap(receivables, []), settlement.amount);

    const reviewedAt = new Date();
    const sequence = await this.businessNumbers.next(tx, {
      tenantId: payment.tenantId,
      sequenceKey: FINANCE_RECEIPT_SEQUENCE_KEY,
      year: reviewedAt.getUTCFullYear(),
    });
    const receiptNumber = financeReceiptNumber(reviewedAt.getUTCFullYear(), sequence);
    const verified = await tx.payment.updateMany({
      where: {
        id: payment.id,
        tenantId: payment.tenantId,
        status: PaymentStatus.PENDING_VERIFICATION,
        receiptNumber: null,
        availableAmount: new Prisma.Decimal(0),
      },
      data: {
        receiptNumber,
        status: PaymentStatus.RECEIVED,
        availableAmount: payment.receivedAmount,
        settlementCurrencyCode: settlement.currencyCode,
        settlementAmount: settlement.amount,
        settlementAvailableAmount: settlement.amount,
        settlementExchangeRate: settlement.exchangeRate,
        settlementExchangeRateSource: settlement.exchangeRateSource,
        settlementExchangeRateEffectiveDate: settlement.exchangeRateEffectiveDate,
        reviewedAt,
        reviewedByUserId: actor.userId,
        reviewedByName: actor.name,
        rejectionReason: null,
      } as never,
    });
    if (verified.count !== 1) throw new ConflictException("CONTRACT_RESERVATION_REVIEW_CONFLICT");
    const verifiedPayment = await tx.payment.findFirst({ where: { id: payment.id, tenantId: payment.tenantId } });
    if (!verifiedPayment) throw new Error("INVOICE_PENDING_PAYMENT_APPROVAL_PERSISTENCE_FAILED");

    await applyLockedPaymentAllocations(
      tx,
      payment.tenantId,
      actor,
      [verifiedPayment],
      receivables,
      proposal.targets.map((target) => ({
        paymentId: payment.id,
        accountReceivableId: target.targetId,
        amount: new Prisma.Decimal(target.intendedAmount),
        allocationDeduplicationKey: `reported-invoice-payment:${payment.id}:${target.targetId}`,
      })),
    );
    const approved = await tx.payment.findFirst({ where: { id: payment.id, tenantId: payment.tenantId } });
    if (!approved) throw new Error("INVOICE_PENDING_PAYMENT_ALLOCATION_PERSISTENCE_FAILED");
    await tx.billingAuditLog.create({
      data: financeAuditRecord({
        tenantId: payment.tenantId,
        entityType: FINANCE_AUDIT_ENTITY_TYPES.PAYMENT,
        entityId: payment.id,
        action: FINANCE_AUDIT_ACTIONS.REPORTED_INVOICE_PAYMENT_APPROVED,
        actor,
        occurredAt: reviewedAt,
        beforeJson: {
          status: payment.status,
          receiptNumber: null,
          availableAmount: financeMoney(payment.availableAmount),
          allocationProposal: proposal,
        },
        afterJson: {
          status: approved.status,
          receiptNumber: approved.receiptNumber,
          availableAmount: financeMoney(approved.availableAmount),
          settlementCurrencyCode: settlement.currencyCode,
          settlementAmount: financeMoney(settlement.amount),
          settlementAvailableAmount: financeMoney((approved as PaymentWithAllocationProposal).settlementAvailableAmount ?? settlement.amount),
          settlementExchangeRate: settlement.exchangeRate ? financeMoney(settlement.exchangeRate) : null,
          settlementExchangeRateSource: settlement.exchangeRateSource,
          settlementExchangeRateEffectiveDate: settlement.exchangeRateEffectiveDate,
        },
      }),
    });
    return approved;
  }

  private async resolveInvoiceSettlement(
    payment: InvoiceSettlementPayment,
    settlementCurrencyCode: string,
  ): Promise<InvoicePaymentSettlementSnapshot> {
    const existing = paymentSettlementSnapshot(payment);
    if (existing) {
      if (existing.currencyCode !== settlementCurrencyCode) {
        throw new ConflictException("INVOICE_PENDING_PAYMENT_CURRENCY_MISMATCH");
      }
      return existing;
    }
    const settlement = await resolveDailySettlement({
      resolver: this.dailyExchangeRates,
      tenantId: payment.tenantId,
      receivedCurrencyCode: payment.currencyCode,
      settlementCurrencyCode,
      receivedAmount: payment.receivedAmount,
    });
    if (!settlement) {
      throw new ConflictException("INVOICE_PENDING_PAYMENT_EXCHANGE_RATE_UNAVAILABLE");
    }
    return {
      currencyCode: settlementCurrencyCode,
      amount: settlement.amount,
      exchangeRate: settlement.exchangeRate,
      exchangeRateSource: settlement.exchangeRateSource,
      exchangeRateEffectiveDate: settlement.exchangeRateEffectiveDate
        ? new Date(`${settlement.exchangeRateEffectiveDate}T00:00:00.000Z`)
        : null,
    };
  }

  private async findInvoicePendingPayment(tenantId: string, paymentId: string): Promise<InvoicePendingPaymentRow | null> {
    const payment = await this.prisma.payment.findFirst({
      where: { tenantId, id: paymentId, purpose: PaymentPurpose.GENERAL },
      select: invoicePendingPaymentSelect,
    } as never) as unknown as InvoicePendingPaymentRow | null;
    return payment;
  }

  private async invoicePendingPayments(tenantId: string, take: number, paymentId?: string) {
    const where = invoicePendingPaymentWhere(tenantId, paymentId);
    const payments = await this.prisma.payment.findMany({
      where,
      select: invoicePendingPaymentSelect,
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
      take,
    } as never) as unknown as InvoicePendingPaymentRow[];
    if (!payments.length) return [];
    const proposals = payments.map((payment) => invoiceAllocationProposal(payment));
    const targetIds = [...new Set(proposals.flatMap((proposal) => proposal?.targets.map((target) => target.targetId) ?? []))];
    const customerIds = [...new Set(payments.map((payment) => payment.customerId).filter((id): id is string => id !== null))];
    const [customers, receivables, evidence] = await Promise.all([
      customerIds.length === 0 ? [] : this.prisma.client.findMany({ where: { tenantId, id: { in: customerIds } }, select: { id: true, fullName: true, idNumber: true, email: true, phone: true } }),
      targetIds.length === 0 ? [] : this.prisma.accountReceivable.findMany({ where: { tenantId, id: { in: targetIds } }, select: { id: true, customerId: true, currencyCode: true, originalAmount: true, outstandingAmount: true, status: true, sourceType: true, sourceId: true, sourceNumber: true } }),
      paymentId ? this.prisma.paymentEvidence.findMany({
        where: { tenantId, paymentId: { in: payments.map((payment) => payment.id) } },
        select: { id: true, paymentId: true, originalFileName: true, mimeType: true, size: true, createdAt: true, extractionMetadata: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      } as never) as unknown as Promise<InvoicePaymentEvidenceMetadata[]> : [],
    ]);
    const documentIds = [...new Set(receivables.filter((receivable) => receivable.status !== AccountReceivableStatus.CANCELLED).map((receivable) => receivable.sourceId))];
    const documents = documentIds.length === 0 ? [] : await this.prisma.billingDocument.findMany({ where: { tenantId, id: { in: documentIds } }, select: { id: true, fiscalNumber: true, internalNumber: true, issuedAt: true } });
    const customersById = new Map(customers.map((customer) => [customer.id, customer]));
    const current = invoiceTargetMap(receivables, documents);
    const evidenceByPayment = paymentId ? paymentEvidenceMap(evidence) : null;
    return payments.map((payment, index) => invoicePendingReviewItem(payment, proposals[index], customersById, current, evidenceByPayment?.get(payment.id)));
  }

  private async currentInvoiceTargets(tenantId: string, proposal: InvoiceAllocationProposal) {
    const targetIds = proposal.targets.map((target) => target.targetId);
    const receivables = await this.prisma.accountReceivable.findMany({
      where: { tenantId, id: { in: targetIds } },
      select: { id: true, customerId: true, currencyCode: true, originalAmount: true, outstandingAmount: true, status: true, sourceType: true, sourceId: true, sourceNumber: true },
    });
    const documentIds = [...new Set(receivables.map((receivable) => receivable.sourceId))];
    const documents = documentIds.length === 0 ? [] : await this.prisma.billingDocument.findMany({ where: { tenantId, id: { in: documentIds } }, select: { id: true, fiscalNumber: true, internalNumber: true, issuedAt: true } });
    return invoiceTargetMap(receivables, documents);
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

const invoicePendingPaymentSelect = {
  id: true,
  tenantId: true,
  customerId: true,
  payerDisplayName: true,
  currencyCode: true,
  receivedAmount: true,
  availableAmount: true,
  settlementCurrencyCode: true,
  settlementAmount: true,
  settlementAvailableAmount: true,
  settlementExchangeRate: true,
  settlementExchangeRateSource: true,
  settlementExchangeRateEffectiveDate: true,
  receivedAt: true,
  paymentMethod: true,
  externalReference: true,
  description: true,
  purpose: true,
  status: true,
  receiptNumber: true,
  reviewedAt: true,
  reviewedByUserId: true,
  reviewedByName: true,
  rejectionReason: true,
  allocationProposal: true,
} as const;

type SettlementSnapshotFields = {
  settlementCurrencyCode?: string | null;
  settlementAmount?: Prisma.Decimal | null;
  settlementAvailableAmount?: Prisma.Decimal | null;
  settlementExchangeRate?: Prisma.Decimal | null;
  settlementExchangeRateSource?: "MANUAL" | "BCCR" | null;
  settlementExchangeRateEffectiveDate?: Date | null;
};

type PaymentWithAllocationProposal = Payment & SettlementSnapshotFields & { allocationProposal?: unknown };
type InvoiceSettlementPayment = Pick<Payment, "tenantId" | "currencyCode" | "receivedAmount"> & SettlementSnapshotFields;

type InvoicePendingPaymentRow = {
  id: string;
  tenantId: string;
  customerId: string | null;
  payerDisplayName: string;
  currencyCode: string;
  receivedAmount: Prisma.Decimal;
  availableAmount: Prisma.Decimal;
  settlementCurrencyCode?: string | null;
  settlementAmount?: Prisma.Decimal | null;
  settlementAvailableAmount?: Prisma.Decimal | null;
  settlementExchangeRate?: Prisma.Decimal | null;
  settlementExchangeRateSource?: "MANUAL" | "BCCR" | null;
  settlementExchangeRateEffectiveDate?: Date | null;
  receivedAt: Date;
  paymentMethod: string;
  externalReference: string | null;
  description: string | null;
  purpose: PaymentPurpose;
  status: PaymentStatus;
  receiptNumber: string | null;
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  reviewedByName: string | null;
  rejectionReason: string | null;
  allocationProposal: unknown;
};

type InvoiceAllocationProposal = {
  kind: "INVOICES";
  targets: Array<{ targetType: "ACCOUNT_RECEIVABLE"; targetId: string; intendedAmount: string }>;
};

type InvoicePaymentSettlementSnapshot = {
  currencyCode: string;
  amount: Prisma.Decimal;
  exchangeRate: Prisma.Decimal | null;
  exchangeRateSource: "MANUAL" | "BCCR" | null;
  exchangeRateEffectiveDate: Date | null;
};

type InvoicePaymentEvidenceMetadata = {
  id: string;
  paymentId: string;
  originalFileName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  extractionMetadata: unknown;
};

type CurrentInvoiceTarget = {
  id: string;
  customerId: string | null;
  currencyCode: string;
  originalAmount: Prisma.Decimal;
  outstandingAmount: Prisma.Decimal;
  status: AccountReceivableStatus;
  sourceType: string;
  sourceId: string;
  sourceNumber: string | null;
  document: { id: string; fiscalNumber: string | null; internalNumber: string; issuedAt: Date | null } | null;
};

function invoicePendingPaymentWhere(tenantId: string, paymentId?: string) {
  return {
    tenantId,
    ...(paymentId ? { id: paymentId } : {}),
    purpose: PaymentPurpose.GENERAL,
    status: PaymentStatus.PENDING_VERIFICATION,
    allocationProposal: { path: ["kind"], equals: "INVOICES" },
  };
}

function invoiceAllocationProposal(payment: { allocationProposal?: unknown }): InvoiceAllocationProposal | null {
  const value = payment.allocationProposal;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.kind !== "INVOICES" || !Array.isArray(record.targets) || record.targets.length < 1 || record.targets.length > 25) return null;
  const targetIds = new Set<string>();
  const targets: InvoiceAllocationProposal["targets"] = [];
  for (const value of record.targets) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const target = value as Record<string, unknown>;
    if (target.targetType !== "ACCOUNT_RECEIVABLE" || typeof target.targetId !== "string" || !target.targetId.trim() || typeof target.intendedAmount !== "string") return null;
    const targetId = target.targetId.trim();
    if (targetIds.has(targetId) || !isPositiveMoneyText(target.intendedAmount)) return null;
    targetIds.add(targetId);
    targets.push({ targetType: "ACCOUNT_RECEIVABLE", targetId, intendedAmount: target.intendedAmount });
  }
  return { kind: "INVOICES", targets };
}

function isPositiveMoneyText(value: string): boolean {
  try {
    const amount = new Prisma.Decimal(value);
    return amount.isFinite() && amount.greaterThan(0) && amount.decimalPlaces() <= 5;
  } catch {
    return false;
  }
}

function invoiceTargetMap(
  receivables: Array<Omit<CurrentInvoiceTarget, "document">>,
  documents: Array<{ id: string; fiscalNumber: string | null; internalNumber: string; issuedAt: Date | null }>,
) {
  const documentById = new Map(documents.map((document) => [document.id, document]));
  return new Map(receivables.map((receivable) => [receivable.id, {
    ...receivable,
    document: documentById.get(receivable.sourceId) ?? null,
  }]));
}

function paymentEvidenceMap(evidence: InvoicePaymentEvidenceMetadata[]) {
  const byPayment = new Map<string, InvoicePaymentEvidenceMetadata[]>();
  for (const item of evidence) {
    const items = byPayment.get(item.paymentId) ?? [];
    items.push(item);
    byPayment.set(item.paymentId, items);
  }
  return byPayment;
}

function invoiceTargetReviewRows(
  proposal: InvoiceAllocationProposal,
  current: Map<string, CurrentInvoiceTarget>,
) {
  return proposal.targets.map((target) => {
    const receivable = current.get(target.targetId) ?? null;
    return {
      accountReceivableId: target.targetId,
      intendedAmount: target.intendedAmount,
      billingDocumentId: receivable?.sourceId ?? null,
      fiscalNumber: receivable?.document?.fiscalNumber ?? null,
      reference: receivable?.document?.fiscalNumber ?? receivable?.sourceNumber ?? receivable?.document?.internalNumber ?? null,
      issuedAt: receivable?.document?.issuedAt ?? null,
      currentOriginalAmount: receivable ? financeMoney(receivable.originalAmount) : null,
      currentOutstandingAmount: receivable ? financeMoney(receivable.outstandingAmount) : null,
      currentCurrencyCode: receivable?.currencyCode ?? null,
      currentStatus: receivable?.status ?? null,
    };
  });
}

function invoicePendingReviewItem(
  payment: InvoicePendingPaymentRow,
  proposal: InvoiceAllocationProposal | null,
  customersById: Map<string, { id: string; fullName: string; idNumber: string; email: string | null; phone: string | null }>,
  current: Map<string, CurrentInvoiceTarget>,
  evidence?: InvoicePaymentEvidenceMetadata[],
) {
  const customer = payment.customerId ? customersById.get(payment.customerId) ?? null : null;
  return {
    id: payment.id,
    reviewKind: "INVOICES" as const,
    customer: customer ?? {
      id: payment.customerId,
      fullName: payment.payerDisplayName,
      idNumber: null,
      email: null,
      phone: null,
    },
    customerId: payment.customerId,
    payerDisplayName: payment.payerDisplayName,
    currencyCode: payment.currencyCode,
    receivedAmount: financeMoney(payment.receivedAmount),
    availableAmount: financeMoney(payment.availableAmount),
    receivedAt: payment.receivedAt,
    paymentMethod: payment.paymentMethod,
    externalReference: payment.externalReference,
    description: payment.description,
    status: payment.status,
    receiptNumber: payment.receiptNumber,
    reviewer: {
      reviewedAt: payment.reviewedAt,
      reviewedByUserId: payment.reviewedByUserId,
      reviewedByName: payment.reviewedByName,
      rejectionReason: payment.rejectionReason,
    },
    allocationProposal: proposal,
    targets: proposal ? invoiceTargetReviewRows(proposal, current) : [],
    ...(evidence ? { evidence: evidence.map(({ id, originalFileName, mimeType, size, createdAt, extractionMetadata }) => ({ id, originalFileName, mimeType, size, createdAt, destinationValidation: paymentEvidenceMetadataForReview(extractionMetadata) })) } : {}),
  };
}

function validateInvoiceProposal(
  payment: Pick<InvoicePendingPaymentRow, "customerId" | "currencyCode" | "receivedAmount" | "availableAmount" | "status" | "receiptNumber">,
  proposal: InvoiceAllocationProposal,
  current: Map<string, CurrentInvoiceTarget>,
  settlementAmount?: Prisma.Decimal,
): string {
  if (payment.status !== PaymentStatus.PENDING_VERIFICATION || payment.receiptNumber !== null || !payment.availableAmount.isZero()) {
    throw new ConflictException("INVOICE_PENDING_PAYMENT_STALE_TARGET");
  }
  if (!payment.customerId) throw new ConflictException("INVOICE_PENDING_PAYMENT_CUSTOMER_MISMATCH");
  let proposedTotal = new Prisma.Decimal(0);
  const settlementCurrencies = new Set<string>();
  for (const target of proposal.targets) {
    const receivable = current.get(target.targetId);
    if (!receivable || receivable.sourceType !== "BILLING_DOCUMENT" || receivable.status === AccountReceivableStatus.CANCELLED || !OPEN_ACCOUNT_RECEIVABLE_STATUSES.includes(receivable.status) || receivable.outstandingAmount.lessThanOrEqualTo(0)) {
      throw new ConflictException("INVOICE_PENDING_PAYMENT_STALE_TARGET");
    }
    if (receivable.customerId !== payment.customerId) throw new ConflictException("INVOICE_PENDING_PAYMENT_CUSTOMER_MISMATCH");
    settlementCurrencies.add(receivable.currencyCode);
    const intendedAmount = new Prisma.Decimal(target.intendedAmount);
    if (!isCurrencySettlementAmount(intendedAmount, receivable.currencyCode)) {
      throw new ConflictException("INVOICE_PENDING_PAYMENT_CURRENCY_PRECISION_INVALID");
    }
    if (intendedAmount.greaterThan(receivable.outstandingAmount)) throw new ConflictException("INVOICE_PENDING_PAYMENT_STALE_TARGET");
    proposedTotal = proposedTotal.plus(intendedAmount);
  }
  if (settlementCurrencies.size !== 1) throw new ConflictException("INVOICE_PENDING_PAYMENT_CURRENCY_MISMATCH");
  const settlementCurrencyCode = [...settlementCurrencies][0]!;
  const availableForProposal = settlementAmount ?? (settlementCurrencyCode === payment.currencyCode
    ? normalizeCurrencySettlementAmount(payment.receivedAmount, settlementCurrencyCode)
    : null);
  if (availableForProposal && proposedTotal.greaterThan(availableForProposal)) {
    throw new ConflictException("INVOICE_PENDING_PAYMENT_INSUFFICIENT");
  }
  return settlementCurrencyCode;
}

function paymentSettlementSnapshot(payment: InvoiceSettlementPayment): InvoicePaymentSettlementSnapshot | null {
  const currencyCode = payment.settlementCurrencyCode?.toUpperCase();
  const amount = payment.settlementAmount;
  const availableAmount = payment.settlementAvailableAmount;
  const snapshotFields = [
    payment.settlementCurrencyCode,
    amount,
    availableAmount,
    payment.settlementExchangeRate,
    payment.settlementExchangeRateSource,
    payment.settlementExchangeRateEffectiveDate,
  ];
  if (snapshotFields.every((value) => value === null || value === undefined)) return null;
  if (!currencyCode || !(amount instanceof Prisma.Decimal) || !(availableAmount instanceof Prisma.Decimal) ||
      !amount.isFinite() || !availableAmount.isFinite() || amount.lessThanOrEqualTo(0) ||
      availableAmount.isNegative() || availableAmount.greaterThan(amount)) {
    throw new ConflictException("INVOICE_PENDING_PAYMENT_SETTLEMENT_STATE_INVALID");
  }
  if (!isCurrencySettlementAmount(amount, currencyCode) ||
      (availableAmount.greaterThan(0) && !isCurrencySettlementAmount(availableAmount, currencyCode))) {
    throw new ConflictException("INVOICE_PENDING_PAYMENT_SETTLEMENT_STATE_INVALID");
  }
  const crossCurrency = currencyCode !== payment.currencyCode;
  const rate = payment.settlementExchangeRate ?? null;
  const source = payment.settlementExchangeRateSource ?? null;
  const effectiveDate = payment.settlementExchangeRateEffectiveDate ?? null;
  if (crossCurrency && (!(rate instanceof Prisma.Decimal) || !rate.isFinite() || rate.lessThanOrEqualTo(0) || !source || !effectiveDate)) {
    throw new ConflictException("INVOICE_PENDING_PAYMENT_SETTLEMENT_STATE_INVALID");
  }
  return { currencyCode, amount, exchangeRate: rate, exchangeRateSource: source, exchangeRateEffectiveDate: effectiveDate };
}

function isCurrencySettlementAmount(amount: Prisma.Decimal, currencyCode: string): boolean {
  try {
    return normalizeCurrencySettlementAmount(amount, currencyCode).equals(amount);
  } catch {
    return false;
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
