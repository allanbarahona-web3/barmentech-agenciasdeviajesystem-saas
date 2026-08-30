import { Injectable } from "@nestjs/common";
import { AccountReceivableStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  CurrencySettlementError,
  normalizeCurrencySettlementAmount,
} from "../finance/currency-settlement.policy";
import {
  ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_TYPE,
  ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_VERSION,
  FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE,
} from "./jobs/fiscal-accepted-fanout.constants";

const SOURCE_TYPE = "BILLING_DOCUMENT";
const DOCUMENT_TYPE_INVOICE = "01";
const CASH_CONDITION = "01";
const CREDIT_CONDITION = "02";
const MAX_AMOUNT = new Prisma.Decimal("99999999999999.99999");
const WORKER_FAILURE_ERROR = "ACCOUNT_RECEIVABLE_RECOGNITION_WORKER_FAILED";

export const ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS = {
  CLAIM_INVALID: "ACCOUNT_RECEIVABLE_RECOGNITION_CLAIM_INVALID",
  CHILD_INVALID: "ACCOUNT_RECEIVABLE_RECOGNITION_CHILD_INVALID",
  DOCUMENT_INVALID: "ACCOUNT_RECEIVABLE_RECOGNITION_DOCUMENT_INVALID",
  DOCUMENT_TYPE_UNSUPPORTED:
    "ACCOUNT_RECEIVABLE_RECOGNITION_DOCUMENT_TYPE_UNSUPPORTED",
  COMMERCIAL_CONDITION_INVALID:
    "ACCOUNT_RECEIVABLE_RECOGNITION_COMMERCIAL_CONDITION_INVALID",
  AMOUNT_INVALID: "ACCOUNT_RECEIVABLE_RECOGNITION_AMOUNT_INVALID",
  CURRENCY_UNSUPPORTED:
    "ACCOUNT_RECEIVABLE_RECOGNITION_CURRENCY_UNSUPPORTED",
  RECEIVABLE_CONFLICT: "ACCOUNT_RECEIVABLE_RECOGNITION_RECEIVABLE_CONFLICT",
} as const;

export interface ClaimedReceivableRecognitionEvent {
  tenantId: string;
  billingOutboxEventId: string;
  lockOwner: string;
}

interface RecognitionPayload {
  tenantId: string;
  billingDocumentId: string;
  eventVersion: number;
}

interface ReceivableMapping {
  tenantId: string;
  sourceType: string;
  sourceId: string;
  sourceNumber: string;
  sourceDocumentType: string;
  customerId: string | null;
  debtorDisplayName: string;
  debtorIdentificationType: string | null;
  debtorIdentificationNumber: string | null;
  currencyCode: string;
  originalAmount: Prisma.Decimal;
  outstandingAmount: Prisma.Decimal;
  dueDate: Date;
  paymentTermDays: number | null;
  status: AccountReceivableStatus;
  recognizedAt: Date;
  settledAt: null;
  cancelledAt: null;
}

class RecognitionError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

@Injectable()
export class AccountReceivableRecognitionService {
  constructor(private readonly prisma: PrismaService) {}

  async recognizeClaimedEvent(
    claim: ClaimedReceivableRecognitionEvent,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "billing_outbox_events"
        WHERE "id" = ${claim.billingOutboxEventId}
          AND "tenantId" = ${claim.tenantId}
          AND "eventType" = ${ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_TYPE}
          AND "eventVersion" = ${ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_VERSION}
          AND "status" = 'PROCESSING'
          AND "lockedBy" = ${claim.lockOwner}
        FOR UPDATE
      `;
      if (locked.length !== 1) {
        throw new RecognitionError(ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.CLAIM_INVALID);
      }

      const child = await tx.billingOutboxEvent.findUnique({
        where: { id: claim.billingOutboxEventId },
      });
      const payload = child && validChildPayload(child, claim);
      if (!child || !payload) {
        throw new RecognitionError(ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.CHILD_INVALID);
      }

      const document = await tx.billingDocument.findFirst({
        where: { id: payload.billingDocumentId, tenantId: claim.tenantId },
        select: billingDocumentRecognitionSelect,
      });
      const mapping = document && mapReceivable(document);
      if (!mapping) {
        throw new RecognitionError(ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.DOCUMENT_INVALID);
      }

      await tx.accountReceivable.createMany({
        data: mapping,
        skipDuplicates: true,
      });
      const receivable = await tx.accountReceivable.findUnique({
        where: {
          tenantId_sourceType_sourceId: {
            tenantId: mapping.tenantId,
            sourceType: mapping.sourceType,
            sourceId: mapping.sourceId,
          },
        },
      });
      if (!receivable || !isExactReceivable(receivable, mapping)) {
        throw new RecognitionError(
          ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.RECEIVABLE_CONFLICT,
        );
      }

      const completed = await tx.billingOutboxEvent.updateMany({
        where: {
          id: child.id,
          tenantId: claim.tenantId,
          status: "PROCESSING",
          lockedBy: claim.lockOwner,
        },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
          lastError: null,
          lockedAt: null,
          lockedBy: null,
        },
      });
      if (completed.count !== 1) {
        throw new RecognitionError(ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.CLAIM_INVALID);
      }
    });
  }

  async failClaim(
    claim: ClaimedReceivableRecognitionEvent,
    errorCode: string,
  ): Promise<void> {
    await this.prisma.billingOutboxEvent.updateMany({
      where: ownedRecognitionClaimWhere(claim),
      data: {
        status: "FAILED",
        lastError: safeRecognitionError(errorCode),
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  async releaseClaimAfterWorkerFailure(
    claim: ClaimedReceivableRecognitionEvent,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "billing_outbox_events"
        WHERE "id" = ${claim.billingOutboxEventId}
          AND "tenantId" = ${claim.tenantId}
          AND "eventType" = ${ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_TYPE}
          AND "eventVersion" = ${ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_VERSION}
          AND "status" = 'PROCESSING'
          AND "lockedBy" = ${claim.lockOwner}
        FOR UPDATE
      `;
      if (locked.length !== 1) return;
      const event = await tx.billingOutboxEvent.findUnique({
        where: { id: claim.billingOutboxEventId },
        select: { attemptCount: true, maximumAttempts: true },
      });
      if (!event) return;
      if (event.attemptCount >= event.maximumAttempts) {
        await tx.billingOutboxEvent.updateMany({
          where: ownedRecognitionClaimWhere(claim),
          data: {
            status: "FAILED", lastError: WORKER_FAILURE_ERROR,
            lockedAt: null, lockedBy: null,
          },
        });
        return;
      }
      const exponent = Math.min(Math.max(event.attemptCount - 1, 0), 30);
      const delayMs = Math.min(1_000 * 2 ** exponent, 60_000);
      await tx.billingOutboxEvent.updateMany({
        where: ownedRecognitionClaimWhere(claim),
        data: {
          status: "PENDING",
          availableAt: new Date(Date.now() + delayMs),
          lastError: WORKER_FAILURE_ERROR,
          lockedAt: null,
          lockedBy: null,
        },
      });
    });
  }
}

export function isNonRetryableRecognitionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return Object.values(ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS).includes(
    error.message as (typeof ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS)[keyof typeof ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS],
  );
}

const billingDocumentRecognitionSelect = {
  id: true,
  tenantId: true,
  documentTypeCode: true,
  taxAuthorityStatus: true,
  fiscalNumber: true,
  customerId: true,
  receiverName: true,
  receiverIdentificationType: true,
  receiverIdentification: true,
  currencyCode: true,
  total: true,
  fiscalIssueDate: true,
  paymentConditionCode: true,
  creditTermDays: true,
  taxAuthorityFinalizedAt: true,
} satisfies Prisma.BillingDocumentSelect;

function validChildPayload(
  child: {
    tenantId: string;
    eventType: string;
    eventVersion: number;
    aggregateType: string;
    aggregateId: string;
    causationId: string | null;
    payload: Prisma.JsonValue;
  },
  claim: ClaimedReceivableRecognitionEvent,
): RecognitionPayload | null {
  if (
    child.tenantId !== claim.tenantId ||
    child.eventType !== ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_TYPE ||
    child.eventVersion !== ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_VERSION ||
    child.aggregateType !== FISCAL_ACCEPTED_FANOUT_AGGREGATE_TYPE ||
    !nonEmpty(child.causationId) ||
    !isJsonObject(child.payload) ||
    Object.keys(child.payload).length !== 3
  ) return null;
  const { tenantId, billingDocumentId, eventVersion } = child.payload;
  if (
    typeof tenantId !== "string" || tenantId !== child.tenantId ||
    typeof billingDocumentId !== "string" || !nonEmpty(billingDocumentId) ||
    billingDocumentId !== child.aggregateId ||
    eventVersion !== ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_VERSION
  ) return null;
  return { tenantId, billingDocumentId, eventVersion };
}

function mapReceivable(
  document: Prisma.BillingDocumentGetPayload<{ select: typeof billingDocumentRecognitionSelect }>,
): ReceivableMapping {
  if (document.taxAuthorityStatus !== "ACCEPTED") {
    throw new RecognitionError(ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.DOCUMENT_INVALID);
  }
  if (document.documentTypeCode !== DOCUMENT_TYPE_INVOICE) {
    throw new RecognitionError(
      ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.DOCUMENT_TYPE_UNSUPPORTED,
    );
  }
  if (!nonEmpty(document.fiscalNumber) || !nonEmpty(document.receiverName)) {
    throw new RecognitionError(ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.DOCUMENT_INVALID);
  }
  const fiscalAmount = validAmount(document.total);
  let amount: Prisma.Decimal;
  try {
    amount = normalizeCurrencySettlementAmount(
      fiscalAmount,
      document.currencyCode,
    );
  } catch (error) {
    if (error instanceof CurrencySettlementError) {
      throw new RecognitionError(
        error.code === "CURRENCY_SETTLEMENT_UNSUPPORTED_CURRENCY"
          ? ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.CURRENCY_UNSUPPORTED
          : ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.AMOUNT_INVALID,
      );
    }
    throw error;
  }
  const fiscalIssueDate = validDateOnly(document.fiscalIssueDate);
  const recognizedAt = validTimestamp(document.taxAuthorityFinalizedAt);
  const commercial = dueDateFor(document.paymentConditionCode, document.creditTermDays, fiscalIssueDate);
  return {
    tenantId: document.tenantId,
    sourceType: SOURCE_TYPE,
    sourceId: document.id,
    sourceNumber: document.fiscalNumber,
    sourceDocumentType: document.documentTypeCode,
    customerId: document.customerId,
    debtorDisplayName: document.receiverName,
    debtorIdentificationType: document.receiverIdentificationType,
    debtorIdentificationNumber: document.receiverIdentification,
    currencyCode: document.currencyCode,
    originalAmount: amount,
    outstandingAmount: amount,
    dueDate: commercial.dueDate,
    paymentTermDays: commercial.paymentTermDays,
    status: AccountReceivableStatus.OPEN,
    recognizedAt,
    settledAt: null,
    cancelledAt: null,
  };
}

function validAmount(value: unknown): Prisma.Decimal {
  if (
    !(value instanceof Prisma.Decimal) || !value.isFinite() ||
    value.lessThanOrEqualTo(0) || value.decimalPlaces() > 5 ||
    value.greaterThan(MAX_AMOUNT)
  ) {
    throw new RecognitionError(ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.AMOUNT_INVALID);
  }
  return value;
}

function dueDateFor(
  paymentConditionCode: string | null,
  creditTermDays: number | null,
  fiscalIssueDate: Date,
): { dueDate: Date; paymentTermDays: number | null } {
  if (paymentConditionCode === CASH_CONDITION && creditTermDays === null) {
    return { dueDate: fiscalIssueDate, paymentTermDays: null };
  }
  if (
    paymentConditionCode !== CREDIT_CONDITION || creditTermDays === null ||
    !isPositiveSupportedCreditTerm(creditTermDays)
  ) {
    throw new RecognitionError(
      ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.COMMERCIAL_CONDITION_INVALID,
    );
  }
  const dueDate = new Date(fiscalIssueDate.getTime());
  dueDate.setUTCDate(dueDate.getUTCDate() + creditTermDays);
  if (invalidDate(dueDate)) {
    throw new RecognitionError(
      ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.COMMERCIAL_CONDITION_INVALID,
    );
  }
  return { dueDate, paymentTermDays: creditTermDays };
}

function validDateOnly(value: unknown): Date {
  if (!(value instanceof Date) || invalidDate(value)) {
    throw new RecognitionError(ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.DOCUMENT_INVALID);
  }
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function validTimestamp(value: unknown): Date {
  if (!(value instanceof Date) || invalidDate(value)) {
    throw new RecognitionError(ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS.DOCUMENT_INVALID);
  }
  return value;
}

function isExactReceivable(
  receivable: {
    tenantId: string; sourceType: string; sourceId: string; sourceNumber: string | null;
    sourceDocumentType: string | null; customerId: string | null; debtorDisplayName: string;
    debtorIdentificationType: string | null; debtorIdentificationNumber: string | null;
    currencyCode: string; originalAmount: Prisma.Decimal; outstandingAmount: Prisma.Decimal;
    dueDate: Date; paymentTermDays: number | null; status: AccountReceivableStatus;
    recognizedAt: Date; settledAt: Date | null; cancelledAt: Date | null;
  },
  expected: ReceivableMapping,
): boolean {
  return receivable.tenantId === expected.tenantId &&
    receivable.sourceType === expected.sourceType && receivable.sourceId === expected.sourceId &&
    receivable.sourceNumber === expected.sourceNumber &&
    receivable.sourceDocumentType === expected.sourceDocumentType &&
    receivable.customerId === expected.customerId &&
    receivable.debtorDisplayName === expected.debtorDisplayName &&
    receivable.debtorIdentificationType === expected.debtorIdentificationType &&
    receivable.debtorIdentificationNumber === expected.debtorIdentificationNumber &&
    receivable.currencyCode === expected.currencyCode &&
    receivable.originalAmount.equals(expected.originalAmount) &&
    receivable.outstandingAmount.equals(expected.outstandingAmount) &&
    sameDate(receivable.dueDate, expected.dueDate) &&
    receivable.paymentTermDays === expected.paymentTermDays &&
    receivable.status === expected.status &&
    sameDate(receivable.recognizedAt, expected.recognizedAt) &&
    receivable.settledAt === null && receivable.cancelledAt === null;
}

function sameDate(left: unknown, right: Date): boolean {
  return left instanceof Date && !invalidDate(left) && left.getTime() === right.getTime();
}

function isPositiveSupportedCreditTerm(value: unknown): value is number {
  return typeof value === "number" && value > 0 && value <= 2_147_483_647 && value % 1 === 0;
}

function invalidDate(value: Date): boolean {
  return value.getTime() !== value.getTime();
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ownedRecognitionClaimWhere(claim: ClaimedReceivableRecognitionEvent) {
  return {
    id: claim.billingOutboxEventId,
    tenantId: claim.tenantId,
    eventType: ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_TYPE,
    eventVersion: ACCOUNT_RECEIVABLE_RECOGNITION_REQUESTED_EVENT_VERSION,
    status: "PROCESSING" as const,
    lockedBy: claim.lockOwner,
  };
}

function safeRecognitionError(value: string): string {
  return Object.values(ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS).includes(
    value as (typeof ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS)[keyof typeof ACCOUNT_RECEIVABLE_RECOGNITION_ERRORS],
  ) ? value : WORKER_FAILURE_ERROR;
}
