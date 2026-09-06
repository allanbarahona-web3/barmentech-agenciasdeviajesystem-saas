import { HttpException, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { BillingDocumentService } from "../fiscal-billing/billing-document.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  ContractPaymentFiscalPreparationError,
  ContractPaymentFiscalPreparationService,
} from "./contract-payment-fiscal-preparation.service";
import {
  CONTRACT_PAYMENT_FISCALIZATION_AGGREGATE_TYPE,
  CONTRACT_PAYMENT_FISCALIZATION_EVENT_TYPE,
  CONTRACT_PAYMENT_FISCALIZATION_EVENT_VERSION,
  type ContractPaymentFiscalizationEventPayload,
} from "./contract-payment-fiscalization.constants";

const WORKER_FAILURE = "CONTRACT_PAYMENT_FISCALIZATION_WORKER_FAILED";
const CLAIM_INVALID = "CONTRACT_PAYMENT_FISCALIZATION_CLAIM_INVALID";
const EVENT_INVALID = "CONTRACT_PAYMENT_FISCALIZATION_EVENT_INVALID";

export interface ClaimedContractPaymentFiscalizationEvent {
  tenantId: string;
  billingOutboxEventId: string;
  lockOwner: string;
}

class ContractPaymentFiscalizationWorkerError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

@Injectable()
export class ContractPaymentFiscalizationWorkerService {
  private readonly logger = new Logger(ContractPaymentFiscalizationWorkerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly preparation: ContractPaymentFiscalPreparationService,
    private readonly billingDocuments: BillingDocumentService,
  ) {}

  async processClaim(
    claim: ClaimedContractPaymentFiscalizationEvent,
  ): Promise<void> {
    const event = await this.prisma.billingOutboxEvent.findFirst({
      where: ownedClaimWhere(claim),
      select: {
        id: true,
        tenantId: true,
        eventType: true,
        eventVersion: true,
        aggregateType: true,
        aggregateId: true,
        payload: true,
      },
    });
    const payload = event && validPayload(event);
    if (!event) throw new ContractPaymentFiscalizationWorkerError(CLAIM_INVALID);
    if (!payload) throw new ContractPaymentFiscalizationWorkerError(EVENT_INVALID);

    const existing = await this.billingDocuments.findPrimaryDocument(
      payload.tenantId,
      "CONTRACT_PAYMENT",
      payload.paymentId,
    );
    if (existing && existing.lifecycleStatus !== "DRAFT") {
      this.logger.log(
        `Contract payment fiscalization already advanced tenantId=${payload.tenantId} paymentId=${payload.paymentId} billingDocumentId=${existing.id} outboxEventId=${event.id}`,
      );
      await this.completeClaim(claim);
      return;
    }

    const document = await this.preparation.prepareOrResume(
      payload.tenantId,
      payload.paymentId,
      "SYSTEM",
    );
    if (document.lifecycleStatus === "DRAFT") {
      await this.billingDocuments.requestElectronicIssuance(
        payload.tenantId,
        document.id,
        "SYSTEM",
      );
    }
    this.logger.log(
      `Contract payment fiscalization completed tenantId=${payload.tenantId} paymentId=${payload.paymentId} billingDocumentId=${document.id} outboxEventId=${event.id}`,
    );
    await this.completeClaim(claim);
  }

  async failClaim(
    claim: ClaimedContractPaymentFiscalizationEvent,
    errorCode: string,
  ): Promise<void> {
    this.logger.warn(
      `Contract payment fiscalization terminal failure tenantId=${claim.tenantId} outboxEventId=${claim.billingOutboxEventId} errorCode=${safeCode(errorCode)}`,
    );
    await this.prisma.billingOutboxEvent.updateMany({
      where: ownedClaimWhere(claim),
      data: {
        status: "FAILED",
        lastError: safeCode(errorCode),
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  async releaseClaimAfterWorkerFailure(
    claim: ClaimedContractPaymentFiscalizationEvent,
  ): Promise<void> {
    const event = await this.prisma.billingOutboxEvent.findFirst({
      where: ownedClaimWhere(claim),
      select: { attemptCount: true, maximumAttempts: true },
    });
    if (!event) return;
    if (event.attemptCount >= event.maximumAttempts) {
      await this.failClaim(claim, WORKER_FAILURE);
      return;
    }
    const exponent = Math.min(Math.max(event.attemptCount - 1, 0), 30);
    const delayMs = Math.min(1_000 * 2 ** exponent, 60_000);
    await this.prisma.billingOutboxEvent.updateMany({
      where: ownedClaimWhere(claim),
      data: {
        status: "PENDING",
        availableAt: new Date(Date.now() + delayMs),
        lastError: WORKER_FAILURE,
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  private async completeClaim(
    claim: ClaimedContractPaymentFiscalizationEvent,
  ): Promise<void> {
    const completed = await this.prisma.billingOutboxEvent.updateMany({
      where: ownedClaimWhere(claim),
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
        lastError: null,
        lockedAt: null,
        lockedBy: null,
      },
    });
    if (completed.count !== 1) {
      throw new ContractPaymentFiscalizationWorkerError(CLAIM_INVALID);
    }
  }
}

export function isNonRetryableContractPaymentFiscalizationError(
  error: unknown,
): boolean {
  if (error instanceof ContractPaymentFiscalPreparationError) return true;
  if (error instanceof ContractPaymentFiscalizationWorkerError) return true;
  return error instanceof HttpException && error.getStatus() >= 400 && error.getStatus() < 500;
}

export function contractPaymentFiscalizationErrorCode(error: unknown): string {
  if (error instanceof ContractPaymentFiscalPreparationError) return error.code;
  if (error instanceof ContractPaymentFiscalizationWorkerError) return error.code;
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === "object" && response !== null && !Array.isArray(response)) {
      const code = (response as Record<string, unknown>).code;
      if (typeof code === "string") return safeCode(code);
    }
  }
  return WORKER_FAILURE;
}

function validPayload(event: {
  tenantId: string;
  eventType: string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.JsonValue;
}): ContractPaymentFiscalizationEventPayload | null {
  if (
    event.eventType !== CONTRACT_PAYMENT_FISCALIZATION_EVENT_TYPE ||
    event.eventVersion !== CONTRACT_PAYMENT_FISCALIZATION_EVENT_VERSION ||
    event.aggregateType !== CONTRACT_PAYMENT_FISCALIZATION_AGGREGATE_TYPE ||
    !jsonObject(event.payload) ||
    Object.keys(event.payload).length !== 3
  ) return null;
  const { tenantId, paymentId, eventVersion } = event.payload;
  if (
    typeof tenantId !== "string" || tenantId !== event.tenantId || !tenantId ||
    typeof paymentId !== "string" || paymentId !== event.aggregateId || !paymentId ||
    eventVersion !== CONTRACT_PAYMENT_FISCALIZATION_EVENT_VERSION
  ) return null;
  return { tenantId, paymentId, eventVersion: 1 };
}

function ownedClaimWhere(claim: ClaimedContractPaymentFiscalizationEvent) {
  return {
    id: claim.billingOutboxEventId,
    tenantId: claim.tenantId,
    eventType: CONTRACT_PAYMENT_FISCALIZATION_EVENT_TYPE,
    eventVersion: CONTRACT_PAYMENT_FISCALIZATION_EVENT_VERSION,
    status: "PROCESSING" as const,
    lockedBy: claim.lockOwner,
  };
}

function jsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeCode(value: string): string {
  return /^[A-Z][A-Z0-9_]{0,99}$/.test(value)
    ? value
    : WORKER_FAILURE;
}
