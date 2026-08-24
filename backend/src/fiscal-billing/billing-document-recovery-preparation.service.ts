import { HttpException, Injectable } from "@nestjs/common";
import {
  BillingDocumentSubmissionPreparationService,
  type BillingDocumentSubmissionPreparationResult,
} from "./billing-document-submission-preparation.service";
import { fiscalBillingError } from "./fiscal-billing.errors";

export interface BillingDocumentRecoveryPreparationResult {
  readonly tenantId: string;
  readonly billingDocumentId: string;
  readonly preparedSubmission: BillingDocumentSubmissionPreparationResult["preparedSubmission"];
  readonly billingDocumentNumberSequenceId: string;
  readonly allocatedSequenceNumber: string;
  readonly fiscalNumber: string;
  readonly documentTypeCode: "01" | "04";
  readonly issuanceIdempotencyKey: string;
  readonly providerRequestHash: string;
  readonly providerLastAttemptAt: Date;
  readonly lifecycleStatus: "CONFIRMED";
  readonly providerStatus: "PENDING";
  readonly taxAuthorityStatus: "NOT_SUBMITTED";
  readonly providerReconciliationRequired: true;
  readonly providerLastErrorCode: string | null;
  readonly providerLastErrorAt: Date | null;
  readonly submittedAt: null;
  readonly issuedAt: null;
}

@Injectable()
export class BillingDocumentRecoveryPreparationService {
  constructor(private readonly preparation: BillingDocumentSubmissionPreparationService) {}

  async prepareRecovery(tenantId: string, billingDocumentId: string): Promise<BillingDocumentRecoveryPreparationResult> {
    if (!boundedIdentity(tenantId) || !boundedIdentity(billingDocumentId)) notFound();
    let value: BillingDocumentSubmissionPreparationResult;
    try { value = await this.preparation.prepare(tenantId, billingDocumentId); }
    catch (error) {
      if (error instanceof HttpException) throw error;
      throw fiscalBillingError("BILLING_DOCUMENT_RECOVERY_PREPARATION_FAILED");
    }
    try { return validateRecovery(value, tenantId, billingDocumentId); }
    catch (error) {
      if (error instanceof HttpException) throw error;
      throw fiscalBillingError("BILLING_DOCUMENT_RECOVERY_PREPARATION_FAILED");
    }
  }
}

function validateRecovery(value: BillingDocumentSubmissionPreparationResult, tenantId: string, billingDocumentId: string): BillingDocumentRecoveryPreparationResult {
  if (!record(value) || !record(value.identity) || !record(value.allocationIdentity) || !record(value.recoveryIdentity) || !record(value.providerState) || !record(value.preparedSubmission)) mismatch();
  const identity=value.identity,allocation=value.allocationIdentity,recovery=value.recoveryIdentity,state=value.providerState,prepared=value.preparedSubmission;
  if (identity.tenantId !== tenantId || identity.billingDocumentId !== billingDocumentId ||
    prepared.metadata?.tenantId !== tenantId || prepared.metadata?.billingDocumentId !== billingDocumentId) mismatch();
  if (!safeString(allocation.billingDocumentNumberSequenceId,191) || typeof allocation.allocatedSequenceNumber !== "string" || !/^[1-9]\d{0,9}$/.test(allocation.allocatedSequenceNumber)) mismatch();
  if (typeof recovery.fiscalNumber !== "string" || !/^\d{20}$/.test(recovery.fiscalNumber) ||
    (recovery.documentTypeCode !== "01" && recovery.documentTypeCode !== "04") ||
    typeof recovery.issuanceIdempotencyKey !== "string" || recovery.issuanceIdempotencyKey !== `billing-document:${billingDocumentId}:electronic-issuance:v1` ||
    typeof recovery.fiscalIssueDate !== "string" || !canonicalDate(recovery.fiscalIssueDate) || recovery.issuedAt !== null) mismatch();
  if (recovery.fiscalNumber.slice(8,10) !== recovery.documentTypeCode || recovery.fiscalNumber.slice(10) !== allocation.allocatedSequenceNumber.padStart(10,"0") ||
    prepared.metadata?.fiscalNumber !== recovery.fiscalNumber || prepared.metadata?.documentTypeCode !== recovery.documentTypeCode ||
    prepared.metadata?.fiscalIssueDate !== recovery.fiscalIssueDate || prepared.idempotencyKey !== recovery.issuanceIdempotencyKey ||
    typeof prepared.canonicalBody !== "string" || !prepared.canonicalBody ||
    (prepared.endpoint !== "/documents/factura" && prepared.endpoint !== "/documents/tiquete") ||
    prepared.endpoint !== (recovery.documentTypeCode === "01" ? "/documents/factura" : "/documents/tiquete") ||
    typeof prepared.requestHash !== "string" || !/^[a-f0-9]{64}$/.test(prepared.requestHash)) mismatch();

  const errorCode=state.providerLastErrorCode,errorAt=state.providerLastErrorAt;
  if (state.billingMode !== "ELECTRONIC_PROVIDER" || state.lifecycleStatus !== "CONFIRMED" || state.providerStatus !== "PENDING" || state.taxAuthorityStatus !== "NOT_SUBMITTED" ||
    state.providerReconciliationRequired !== true || state.providerDocumentId !== null || state.haciendaKey !== null || state.providerEnvironment !== null ||
    state.submittedAt !== null || typeof state.providerRequestHash !== "string" || !/^[a-f0-9]{64}$/.test(state.providerRequestHash) ||
    !validDate(state.providerLastAttemptAt) || (errorCode === null) !== (errorAt === null) ||
    (errorCode !== null && (typeof errorCode !== "string" || !/^[A-Z][A-Z0-9_]{0,99}$/.test(errorCode))) ||
    (errorAt !== null && !validDate(errorAt))) ineligible();
  if (prepared.requestHash !== state.providerRequestHash) mismatch();

  return {
    tenantId, billingDocumentId, preparedSubmission: prepared,
    billingDocumentNumberSequenceId: allocation.billingDocumentNumberSequenceId,
    allocatedSequenceNumber: allocation.allocatedSequenceNumber,
    fiscalNumber: recovery.fiscalNumber, documentTypeCode: recovery.documentTypeCode,
    issuanceIdempotencyKey: recovery.issuanceIdempotencyKey, providerRequestHash: state.providerRequestHash,
    providerLastAttemptAt: new Date(state.providerLastAttemptAt.getTime()), lifecycleStatus:"CONFIRMED", providerStatus:"PENDING",
    taxAuthorityStatus:"NOT_SUBMITTED", providerReconciliationRequired:true,
    providerLastErrorCode:errorCode, providerLastErrorAt:errorAt===null?null:new Date(errorAt.getTime()), submittedAt:null, issuedAt:null,
  };
}

function boundedIdentity(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 191 && value.trim() === value; }
function safeString(value: unknown, maximum: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim() === value; }
function validDate(value: unknown): value is Date { return value instanceof Date && Number.isFinite(value.getTime()); }
function canonicalDate(value: string): boolean { const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);if(!match)return false;const date=new Date(Date.UTC(+match[1],+match[2]-1,+match[3]));return date.getUTCFullYear()===+match[1]&&date.getUTCMonth()+1===+match[2]&&date.getUTCDate()===+match[3]; }
function record(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function notFound(): never { throw fiscalBillingError("BILLING_DOCUMENT_NOT_FOUND"); }
function ineligible(): never { throw fiscalBillingError("BILLING_DOCUMENT_RECOVERY_INELIGIBLE"); }
function mismatch(): never { throw fiscalBillingError("BILLING_DOCUMENT_RECOVERY_IDENTITY_MISMATCH"); }
