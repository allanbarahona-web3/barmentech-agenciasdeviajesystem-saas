import { Injectable } from "@nestjs/common";
import { AccountReceivableStatus, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import {
  FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE,
  FISCAL_CREDIT_NOTE_FINANCE_EFFECT_REQUESTED_EVENT_TYPE,
  FISCAL_CREDIT_NOTE_FINANCE_EFFECT_REQUESTED_EVENT_VERSION,
} from "./jobs/fiscal-accepted-fanout.constants";

const SOURCE_TYPE = "BILLING_DOCUMENT";
const MAX = new Prisma.Decimal("99999999999999.99999");
const WORKER_FAILURE = "FISCAL_CREDIT_NOTE_FINANCE_EFFECT_WORKER_FAILED";

export const FISCAL_CREDIT_NOTE_FINANCE_EFFECT_ERRORS = {
  CLAIM_INVALID: "FISCAL_CREDIT_NOTE_FINANCE_EFFECT_CLAIM_INVALID",
  CHILD_INVALID: "FISCAL_CREDIT_NOTE_FINANCE_EFFECT_CHILD_INVALID",
  DOCUMENT_INVALID: "FISCAL_CREDIT_NOTE_FINANCE_EFFECT_DOCUMENT_INVALID",
  REFERENCE_INVALID: "FISCAL_CREDIT_NOTE_FINANCE_EFFECT_REFERENCE_INVALID",
  RECEIVABLE_NOT_READY: "FISCAL_CREDIT_NOTE_FINANCE_EFFECT_RECEIVABLE_NOT_READY",
  EFFECT_CONFLICT: "FISCAL_CREDIT_NOTE_FINANCE_EFFECT_CONFLICT",
} as const;

export type ClaimedFiscalCreditNoteFinanceEffectEvent = {
  tenantId: string;
  billingOutboxEventId: string;
  lockOwner: string;
};

class FinanceEffectError extends Error {
  constructor(readonly code: (typeof FISCAL_CREDIT_NOTE_FINANCE_EFFECT_ERRORS)[keyof typeof FISCAL_CREDIT_NOTE_FINANCE_EFFECT_ERRORS]) { super(code); }
}

@Injectable()
export class FiscalCreditNoteFinanceEffectService {
  constructor(private readonly prisma: PrismaService) {}

  async applyClaimedEvent(claim: ClaimedFiscalCreditNoteFinanceEffectEvent): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "billing_outbox_events"
        WHERE "id" = ${claim.billingOutboxEventId} AND "tenantId" = ${claim.tenantId}
          AND "eventType" = ${FISCAL_CREDIT_NOTE_FINANCE_EFFECT_REQUESTED_EVENT_TYPE}
          AND "eventVersion" = ${FISCAL_CREDIT_NOTE_FINANCE_EFFECT_REQUESTED_EVENT_VERSION}
          AND "status" = 'PROCESSING' AND "lockedBy" = ${claim.lockOwner}
        FOR UPDATE
      `;
      if (locked.length !== 1) fail("CLAIM_INVALID");
      const child = await tx.billingOutboxEvent.findUnique({ where: { id: claim.billingOutboxEventId } });
      const documentId = child && validChild(child, claim);
      if (!documentId) fail("CHILD_INVALID");

      const document = await tx.billingDocument.findUnique({
        where: { id_tenantId: { id: documentId, tenantId: claim.tenantId } },
        include: { references: { orderBy: { referenceOrder: "asc" } } },
      });
      if (!document || document.documentTypeCode !== "03" || document.taxAuthorityStatus !== "ACCEPTED" ||
        !document.customerId || !validAmount(document.total) || !validDate(document.taxAuthorityFinalizedAt) ||
        document.references.length !== 1) fail("DOCUMENT_INVALID");
      const reference = document.references[0];
      if (!reference.referencedBillingDocumentId || (reference.referencedDocumentTypeCode !== "01" && reference.referencedDocumentTypeCode !== "04")) fail("REFERENCE_INVALID");
      const original = await tx.billingDocument.findUnique({
        where: { id_tenantId: { id: reference.referencedBillingDocumentId, tenantId: claim.tenantId } },
        select: { id: true, customerId: true, currencyCode: true, documentTypeCode: true, taxAuthorityStatus: true },
      });
      if (!original || original.taxAuthorityStatus !== "ACCEPTED" || original.documentTypeCode !== reference.referencedDocumentTypeCode ||
        original.customerId !== document.customerId || original.currencyCode !== document.currencyCode) fail("REFERENCE_INVALID");

      const existing = await tx.$queryRaw<Array<{ id: string; customerId: string; currencyCode: string; creditNoteBillingDocumentId: string; referencedBillingDocumentId: string; affectedAccountReceivableId: string | null; totalCreditAmount: Prisma.Decimal; amountAppliedToAr: Prisma.Decimal; availableCreditAmount: Prisma.Decimal }>>`
        SELECT "id", "customerId", "currencyCode", "creditNoteBillingDocumentId", "referencedBillingDocumentId", "affectedAccountReceivableId", "totalCreditAmount", "amountAppliedToAr", "availableCreditAmount"
        FROM "fiscal_credit_note_finance_effects"
        WHERE "tenantId" = ${claim.tenantId} AND "creditNoteBillingDocumentId" = ${document.id}
        FOR UPDATE
      `;
      if (existing.length > 1) fail("EFFECT_CONFLICT");
      if (existing.length === 1) {
        if (!sameEffect(existing[0], document, original)) fail("EFFECT_CONFLICT");
        await complete(tx, child!.id, claim);
        return;
      }

      const total = document.total;
      let receivable: { id: string; outstandingAmount: Prisma.Decimal } | null = null;
      if (original.documentTypeCode === "01") {
        const locks = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "account_receivables"
          WHERE "tenantId" = ${claim.tenantId} AND "sourceType" = ${SOURCE_TYPE} AND "sourceId" = ${original.id}
          FOR UPDATE
        `;
        if (locks.length !== 1) fail("RECEIVABLE_NOT_READY");
        const found = await tx.accountReceivable.findUnique({ where: { tenantId_sourceType_sourceId: { tenantId: claim.tenantId, sourceType: SOURCE_TYPE, sourceId: original.id } } });
        if (!found || found.customerId !== document.customerId || found.currencyCode !== document.currencyCode || !validOutstanding(found.outstandingAmount, found.originalAmount)) fail("REFERENCE_INVALID");
        receivable = found;
      }
      const applied = receivable ? Prisma.Decimal.min(total, receivable.outstandingAmount) : new Prisma.Decimal(0);
      const available = total.minus(applied);
      const now = document.taxAuthorityFinalizedAt;
      const effectId = randomUUID();
      const effectKey = `fiscal-credit-note-finance-effect:${document.id}:v1`;
      await tx.$executeRaw`
        INSERT INTO "fiscal_credit_note_finance_effects" ("id", "tenantId", "customerId", "currencyCode", "creditNoteBillingDocumentId", "referencedBillingDocumentId", "affectedAccountReceivableId", "totalCreditAmount", "amountAppliedToAr", "availableCreditAmount", "effectiveAt", "createdBySystem", "idempotencyKey", "createdAt")
        VALUES (${effectId}, ${claim.tenantId}, ${document.customerId}, ${document.currencyCode}, ${document.id}, ${original.id}, ${receivable?.id ?? null}, ${total}, ${applied}, ${available}, ${now}, true, ${effectKey}, ${now})
      `;
      if (receivable && applied.gt(0)) {
        const outstanding = receivable.outstandingAmount.minus(applied);
        await tx.accountReceivable.update({ where: { id: receivable.id }, data: { outstandingAmount: outstanding, status: outstanding.isZero() ? AccountReceivableStatus.SETTLED : AccountReceivableStatus.PARTIALLY_SETTLED, settledAt: outstanding.isZero() ? now : null } });
        await tx.$executeRaw`
          INSERT INTO "fiscal_credit_note_ar_adjustments" ("id", "tenantId", "fiscalCreditNoteEffectId", "accountReceivableId", "amount", "appliedAt", "idempotencyKey", "createdAt")
          VALUES (${randomUUID()}, ${claim.tenantId}, ${effectId}, ${receivable.id}, ${applied}, ${now}, ${`fiscal-credit-note-ar-adjustment:${document.id}:v1`}, ${now})
        `;
      }
      await complete(tx, child!.id, claim);
    });
  }

  async failClaim(claim: ClaimedFiscalCreditNoteFinanceEffectEvent, errorCode: string): Promise<void> {
    await this.prisma.billingOutboxEvent.updateMany({ where: owned(claim), data: { status: "FAILED", lastError: safeError(errorCode), lockedAt: null, lockedBy: null } });
  }

  async releaseClaimAfterWorkerFailure(claim: ClaimedFiscalCreditNoteFinanceEffectEvent): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const event = await tx.billingOutboxEvent.findFirst({ where: owned(claim), select: { attemptCount: true, maximumAttempts: true } });
      if (!event) return;
      const exhausted = event.attemptCount >= event.maximumAttempts;
      await tx.billingOutboxEvent.updateMany({ where: owned(claim), data: exhausted ? { status: "FAILED", lastError: WORKER_FAILURE, lockedAt: null, lockedBy: null } : { status: "PENDING", availableAt: new Date(Date.now() + 1_000), lastError: WORKER_FAILURE, lockedAt: null, lockedBy: null } });
    });
  }
}

export function isNonRetryableFiscalCreditNoteFinanceEffectError(error: unknown): boolean {
  return error instanceof FinanceEffectError && error.code !== FISCAL_CREDIT_NOTE_FINANCE_EFFECT_ERRORS.RECEIVABLE_NOT_READY;
}

function validChild(child: any, claim: ClaimedFiscalCreditNoteFinanceEffectEvent): string | null {
  const p = child.payload;
  if (child.tenantId !== claim.tenantId || child.eventType !== FISCAL_CREDIT_NOTE_FINANCE_EFFECT_REQUESTED_EVENT_TYPE || child.eventVersion !== 1 || child.aggregateType !== FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE || !child.causationId || !object(p) || Object.keys(p).length !== 3 || p.tenantId !== claim.tenantId || typeof p.billingDocumentId !== "string" || p.billingDocumentId !== child.aggregateId || p.eventVersion !== 1) return null;
  return p.billingDocumentId;
}
function complete(tx: Prisma.TransactionClient, eventId: string, claim: ClaimedFiscalCreditNoteFinanceEffectEvent) { return tx.billingOutboxEvent.updateMany({ where: owned(claim, eventId), data: { status: "PROCESSED", processedAt: new Date(), lastError: null, lockedAt: null, lockedBy: null } }).then((r) => { if (r.count !== 1) fail("CLAIM_INVALID"); }); }
function owned(claim: ClaimedFiscalCreditNoteFinanceEffectEvent, id = claim.billingOutboxEventId) { return { id, tenantId: claim.tenantId, eventType: FISCAL_CREDIT_NOTE_FINANCE_EFFECT_REQUESTED_EVENT_TYPE, eventVersion: 1, status: "PROCESSING" as const, lockedBy: claim.lockOwner }; }
function sameEffect(row: any, document: any, original: any) { return row.customerId === document.customerId && row.currencyCode === document.currencyCode && row.creditNoteBillingDocumentId === document.id && row.referencedBillingDocumentId === original.id && row.totalCreditAmount.equals(document.total) && row.amountAppliedToAr.plus(row.availableCreditAmount).equals(document.total); }
function validAmount(value: unknown): value is Prisma.Decimal { return value instanceof Prisma.Decimal && value.isFinite() && value.gt(0) && value.lte(MAX) && value.decimalPlaces() <= 5; }
function validOutstanding(outstanding: unknown, original: unknown): outstanding is Prisma.Decimal { return outstanding instanceof Prisma.Decimal && original instanceof Prisma.Decimal && outstanding.gte(0) && outstanding.lte(original); }
function validDate(value: unknown): value is Date { return value instanceof Date && Number.isFinite(value.getTime()); }
function object(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function safeError(value: string) { return Object.values(FISCAL_CREDIT_NOTE_FINANCE_EFFECT_ERRORS).includes(value as never) ? value : WORKER_FAILURE; }
function fail(code: keyof typeof FISCAL_CREDIT_NOTE_FINANCE_EFFECT_ERRORS): never { throw new FinanceEffectError(FISCAL_CREDIT_NOTE_FINANCE_EFFECT_ERRORS[code]); }
