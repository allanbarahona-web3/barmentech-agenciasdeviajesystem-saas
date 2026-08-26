import { HttpException, Inject, Injectable } from "@nestjs/common";
import {
  BILLING_DOCUMENT_REPOSITORY,
  type BillingDocumentRepository,
} from "./billing-document.repository";
import { OfficialExchangeRateResolver } from "../official-exchange-rates/official-exchange-rate.resolver";
import type {
  BillingDocumentDraftCommand,
  CrV44SalesOrderDraftCommand,
  BillingDocumentFiscalPreparation,
  BillingDocumentIssuancePreflight,
  PrimaryDocumentSummary,
} from "./billing-document.types";
import { fiscalBillingError } from "./fiscal-billing.errors";
import { FiscalIssuanceClock } from "./fiscal-issuance.clock";
import { costaRicaDate } from "./fiscal-emission-time";

@Injectable()
export class BillingDocumentService {
  constructor(
    @Inject(BILLING_DOCUMENT_REPOSITORY)
    private readonly repository: BillingDocumentRepository,
    private readonly officialExchangeRateResolver: OfficialExchangeRateResolver,
    private readonly fiscalIssuanceClock: FiscalIssuanceClock,
  ) {}

  findPrimaryDocument(tenantId: string, sourceType: string, sourceId: string) {
    return this.repository.findPrimaryDocument(tenantId, sourceType, sourceId);
  }

  async requestElectronicIssuance(
    tenantId: string,
    billingDocumentId: string,
    actorUserId: string,
  ) {
    if (!tenantId || !billingDocumentId || !actorUserId || actorUserId.length > 100) {
      throw fiscalBillingError("BILLING_DOCUMENT_NOT_ELIGIBLE_FOR_ISSUANCE");
    }
    const preflight = await this.repository.findIssuancePreflight(
      tenantId,
      billingDocumentId,
    );
    if (!preflight) throw fiscalBillingError("BILLING_DOCUMENT_NOT_FOUND");

    if (allocationState(preflight) === "COMPLETE") {
      return this.repository.requestElectronicIssuance(
        tenantId,
        billingDocumentId,
        actorUserId,
        null,
      );
    }
    if (allocationState(preflight) === "PARTIAL" || !isCleanEligibleDraft(preflight)) {
      return this.repository.requestElectronicIssuance(
        tenantId,
        billingDocumentId,
        actorUserId,
        null,
      );
    }
    if (preflight.currencyCode !== "CRC" && preflight.currencyCode !== "USD") {
      throw fiscalBillingError("BILLING_DOCUMENT_UNSUPPORTED_FISCAL_CURRENCY");
    }

    const fiscalEmissionAt = this.fiscalIssuanceClock.now();
    const fiscalIssueDate = costaRicaDate(fiscalEmissionAt);
    let officialRate: BillingDocumentFiscalPreparation["officialRate"] = null;
    if (preflight.currencyCode === "USD") {
      const observation = await this.officialExchangeRateResolver.resolveExactObservation({
        countryCode: "CR",
        foreignCurrencyCode: "USD",
        localCurrencyCode: "CRC",
        rateType: "REFERENCE_SELL",
        effectiveDate: fiscalIssueDate,
      });
      if (
        observation.sourceAuthority !== "BCCR" ||
        observation.sourceIndicatorCode !== "318" ||
        observation.effectiveDate !== fiscalIssueDate ||
        observation.countryCode !== "CR" ||
        observation.foreignCurrencyCode !== "USD" ||
        observation.localCurrencyCode !== "CRC" ||
        observation.rateType !== "REFERENCE_SELL"
      ) {
        throw fiscalBillingError("BILLING_DOCUMENT_OFFICIAL_RATE_MISMATCH");
      }
      officialRate = {
        observationId: observation.id,
        value: observation.value,
        effectiveDate: observation.effectiveDate,
        sourceAuthority: observation.sourceAuthority,
        sourceIndicatorCode: observation.sourceIndicatorCode,
      };
    }

    return this.repository.requestElectronicIssuance(
      tenantId,
      billingDocumentId,
      actorUserId,
      {
        expectedCurrencyCode: preflight.currencyCode,
        fiscalEmissionAt,
        fiscalIssueDate,
        officialRate,
      },
    );
  }

  async createOrResumeDraft(command: BillingDocumentDraftCommand) {
    requireGenericDraftCreationPath(command);
    const primarySource =
      command.source?.sourceRole === "PRIMARY" ? command.source : null;
    if (primarySource) {
      const existing = await this.repository.findPrimaryDocument(
        command.tenantId,
        primarySource.sourceType,
        primarySource.sourceId,
      );
      if (existing) return this.resumeOrReject(command.tenantId, existing);
    }

    try {
      const result = await this.repository.createDraft(command);
      return this.resumeOrReject(command.tenantId, result);
    } catch (error) {
      if (!this.isUniqueConstraintViolation(error)) throw error;
      if (!primarySource) throw fiscalBillingError("BILLING_DRAFT_CONFLICT");
      const winner = await this.repository.findPrimaryDocument(
        command.tenantId,
        primarySource.sourceType,
        primarySource.sourceId,
      );
      if (!winner) throw fiscalBillingError("BILLING_DRAFT_CONFLICT");
      return this.resumeOrReject(command.tenantId, winner);
    }
  }

  async createOrResumeCrV44SalesOrderDraft(
    command: CrV44SalesOrderDraftCommand,
  ) {
    const existing = await this.repository.findPrimaryDocument(
      command.tenantId,
      "SALES_ORDER",
      command.salesOrderId,
    );
    if (existing) return this.resumeOrReject(command.tenantId, existing);

    try {
      const result = await this.repository.createCrV44SalesOrderDraft(command);
      return this.resumeOrReject(command.tenantId, result);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (!this.isUniqueConstraintViolation(error)) {
        throw fiscalBillingError("BILLING_DRAFT_ATOMIC_PERSISTENCE_FAILED");
      }
      const winner = await this.repository.findPrimaryDocument(
        command.tenantId,
        "SALES_ORDER",
        command.salesOrderId,
      );
      if (
        !winner ||
        winner.internalNumber !== command.internalNumber ||
        winner.documentTypeCode !== command.documentTypeCode
      ) {
        throw fiscalBillingError("BILLING_DRAFT_CONFLICT");
      }
      return this.resumeOrReject(command.tenantId, winner);
    }
  }

  async resumeOrReject(
    tenantId: string,
    document: PrimaryDocumentSummary,
  ) {
    if (document.lifecycleStatus !== "DRAFT") {
      throw fiscalBillingError("BILLING_DRAFT_ALREADY_ADVANCED", {
        billingDocumentId: document.id,
        lifecycleStatus: document.lifecycleStatus,
      });
    }
    return this.getWorkspace(tenantId, document.id);
  }

  async getWorkspace(tenantId: string, billingDocumentId: string) {
    try {
      const workspace = await this.repository.findWorkspace(
        tenantId,
        billingDocumentId,
      );
      if (!workspace) throw fiscalBillingError("BILLING_DOCUMENT_NOT_FOUND");
      return workspace;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw fiscalBillingError("BILLING_DOCUMENT_SUBMISSION_READ_FAILED");
    }
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    );
  }
}

function requireGenericDraftCreationPath(
  command: BillingDocumentDraftCommand,
): void {
  try {
    const runtime = command as BillingDocumentDraftCommand & {
      fiscalCalculationPolicyVersion?: unknown;
    };
    if (
      runtime.source?.sourceType === "SALES_ORDER" ||
      (runtime.fiscalCalculationPolicyVersion !== undefined &&
        runtime.fiscalCalculationPolicyVersion !== null)
    ) {
      throw fiscalBillingError("BILLING_DRAFT_CREATION_PATH_UNSUPPORTED");
    }
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw fiscalBillingError("BILLING_DRAFT_CREATION_PATH_UNSUPPORTED");
  }
}

function allocationState(document: BillingDocumentIssuancePreflight) {
  const present = [
    document.billingDocumentNumberSequenceId,
    document.allocatedSequenceNumber,
    document.issuanceIdempotencyKey,
  ].filter((value) => value !== null).length;
  if (present === 0) return "EMPTY" as const;
  if (present === 3) return "COMPLETE" as const;
  return "PARTIAL" as const;
}

function isCleanEligibleDraft(document: BillingDocumentIssuancePreflight) {
  return (
    document.billingMode === "ELECTRONIC_PROVIDER" &&
    document.lifecycleStatus === "DRAFT" &&
    document.providerStatus === "NOT_SUBMITTED" &&
    document.taxAuthorityStatus === "NOT_SUBMITTED" &&
    document.fiscalNumber === null &&
    document.providerDocumentId === null &&
    document.fiscalEmissionAt === null &&
    document.fiscalIssueDate === null &&
    document.exchangeRate === null &&
    document.officialExchangeRateObservationId === null &&
    document.fiscalExchangeRateEffectiveDate === null &&
    document.fiscalExchangeRateSourceAuthority === null &&
    document.fiscalExchangeRateIndicatorCode === null
  );
}
