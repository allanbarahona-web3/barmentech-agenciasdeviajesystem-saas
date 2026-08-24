import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { fiscalBillingError } from "./fiscal-billing.errors";
import {
  ELECTRONIC_DOCUMENT_STATUS_PROVIDER,
  ElectronicDocumentStatusError,
  type ElectronicDocumentStatusProvider,
  type ElectronicDocumentStatusResult,
} from "./providers/electronic-document-status.provider";

const statusLookupSelect = Prisma.validator<Prisma.BillingDocumentSelect>()({
  id: true, tenantId: true, billingMode: true, lifecycleStatus: true,
  providerStatus: true, taxAuthorityStatus: true, providerDocumentId: true,
  haciendaKey: true, fiscalNumber: true, documentTypeCode: true,
  providerEnvironment: true, fiscalIssueDate: true, fiscalEmissionAt: true,
  billingDocumentNumberSequenceId: true, allocatedSequenceNumber: true,
  issuanceIdempotencyKey: true, providerRequestHash: true,
  providerLastAttemptAt: true, providerReconciliationRequired: true,
  providerLastErrorCode: true, providerLastErrorAt: true,
  submittedAt: true, issuedAt: true,
  ...statusCheckSelect(),
} as Prisma.BillingDocumentSelect);

type StatusCheckFields={providerStatusCheckAttempts:number;providerLastStatusCheckAt:Date|null;providerNextStatusCheckAt:Date|null;providerStatusCheckLockOwner:string|null;providerStatusCheckLeaseUntil:Date|null};
type StatusLookupRow = Prisma.BillingDocumentGetPayload<{ select: typeof statusLookupSelect }> & StatusCheckFields;

export interface BillingDocumentStatusLookupResult {
  readonly persistedIdentity: {
    readonly tenantId: string;
    readonly billingDocumentId: string;
    readonly billingDocumentNumberSequenceId: string;
    readonly allocatedSequenceNumber: string;
    readonly providerDocumentId: string;
    readonly haciendaKey: string;
    readonly issuanceIdempotencyKey: string;
    readonly fiscalEmissionAt: Date;
    readonly providerRequestHash: string;
    readonly providerLastAttemptAt: Date;
    readonly fiscalNumber: string;
    readonly documentTypeCode: "01" | "04";
    readonly providerEnvironment: "sandbox" | "production";
    readonly fiscalIssueDate: string;
    readonly lifecycleStatus: "SUBMITTED";
    readonly providerStatus: "PROCESSED";
    readonly taxAuthorityStatus: "PROCESSING" | "ACCEPTED" | "REJECTED";
    readonly providerReconciliationRequired: false;
    readonly submittedAt: Date;
    readonly issuedAt: null;
    readonly providerStatusCheckAttempts: number;
    readonly providerLastStatusCheckAt: Date | null;
    readonly providerNextStatusCheckAt: Date | null;
    readonly providerStatusCheckLockOwner: string | null;
    readonly providerStatusCheckLeaseUntil: Date | null;
  };
  readonly providerResult: ElectronicDocumentStatusResult;
}

@Injectable()
export class BillingDocumentStatusLookupService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ELECTRONIC_DOCUMENT_STATUS_PROVIDER)
    private readonly statusProvider: ElectronicDocumentStatusProvider,
  ) {}

  async lookupStatus(tenantId: string, billingDocumentId: string): Promise<BillingDocumentStatusLookupResult> {
    if (!boundedIdentifier(tenantId) || !boundedIdentifier(billingDocumentId)) notFound();

    let row: StatusLookupRow | null;
    try {
      row = await this.prisma.billingDocument.findUnique({
        where: { id_tenantId: { id: billingDocumentId, tenantId } },
        select: statusLookupSelect,
      }) as StatusLookupRow | null;
    } catch {
      throw fiscalBillingError("BILLING_DOCUMENT_STATUS_LOOKUP_FAILED");
    }
    if (!row || row.id !== billingDocumentId || row.tenantId !== tenantId) notFound();

    const prepared = validateSnapshot(row);
    let providerResult: ElectronicDocumentStatusResult;
    try {
      providerResult = await this.statusProvider.getDocumentStatus({
        providerDocumentId: prepared.providerDocumentId,
        expectedHaciendaKey: prepared.haciendaKey,
        expectedConsecutive: prepared.fiscalNumber,
        expectedProviderEnvironment: prepared.providerEnvironment,
        expectedFiscalIssueDate: prepared.fiscalIssueDate,
        expectedDocumentType: prepared.documentTypeCode,
      });
    } catch (error) {
      if (error instanceof ElectronicDocumentStatusError) throw error;
      throw fiscalBillingError("BILLING_DOCUMENT_STATUS_LOOKUP_FAILED");
    }

    return {
      persistedIdentity: {
        tenantId: row.tenantId,
        billingDocumentId: row.id,
        billingDocumentNumberSequenceId: prepared.sequenceId,
        allocatedSequenceNumber: prepared.allocatedSequenceNumber,
        providerDocumentId: prepared.providerDocumentId,
        haciendaKey: prepared.haciendaKey,
        issuanceIdempotencyKey: prepared.issuanceIdempotencyKey,
        fiscalEmissionAt: new Date(prepared.fiscalEmissionAt.getTime()),
        providerRequestHash: prepared.requestHash,
        providerLastAttemptAt: new Date(prepared.attemptedAt.getTime()),
        fiscalNumber: prepared.fiscalNumber,
        documentTypeCode: prepared.documentTypeCode,
        providerEnvironment: prepared.providerEnvironment,
        fiscalIssueDate: prepared.fiscalIssueDate,
        lifecycleStatus: "SUBMITTED",
        providerStatus: "PROCESSED",
        taxAuthorityStatus: prepared.taxAuthorityStatus,
        providerReconciliationRequired: false,
        submittedAt: new Date(prepared.submittedAt.getTime()),
        issuedAt: null,
        providerStatusCheckAttempts: prepared.statusCheckAttempts,
        providerLastStatusCheckAt: copyDate(prepared.lastStatusCheckAt),
        providerNextStatusCheckAt: copyDate(prepared.nextStatusCheckAt),
        providerStatusCheckLockOwner: prepared.statusCheckLockOwner,
        providerStatusCheckLeaseUntil: copyDate(prepared.statusCheckLeaseUntil),
      },
      providerResult,
    };
  }
}

function validateSnapshot(row: StatusLookupRow) {
  if (row.billingMode !== "ELECTRONIC_PROVIDER" || (row.documentTypeCode !== "01" && row.documentTypeCode !== "04")) ineligible();
  const documentTypeCode: "01" | "04" = row.documentTypeCode === "01" ? "01" : "04";
  const hasAnyAcknowledgement = row.providerDocumentId !== null || row.haciendaKey !== null || row.providerEnvironment !== null || row.submittedAt !== null;
  if (row.providerDocumentId === null && !hasAnyAcknowledgement) ineligible();
  if (row.lifecycleStatus !== "SUBMITTED" || row.providerStatus !== "PROCESSED" ||
      (row.taxAuthorityStatus !== "PROCESSING" && row.taxAuthorityStatus !== "ACCEPTED" && row.taxAuthorityStatus !== "REJECTED") ||
      row.providerReconciliationRequired || row.providerLastErrorCode !== null || row.providerLastErrorAt !== null || row.issuedAt !== null) invalid();
  if (!safeString(row.billingDocumentNumberSequenceId, 191) || typeof row.allocatedSequenceNumber !== "bigint") invalid();
  const allocatedSequenceNumber = row.allocatedSequenceNumber.toString();
  if (!/^[1-9]\d{0,9}$/.test(allocatedSequenceNumber)) invalid();
  if (typeof row.fiscalNumber !== "string" || !/^\d{20}$/.test(row.fiscalNumber) ||
      row.fiscalNumber.slice(8, 10) !== documentTypeCode || row.fiscalNumber.slice(10) !== allocatedSequenceNumber.padStart(10, "0")) invalid();
  if (row.issuanceIdempotencyKey !== `billing-document:${row.id}:electronic-issuance:v1` || row.issuanceIdempotencyKey.length > 100) invalid();
  if (typeof row.providerRequestHash !== "string" || !/^[a-f0-9]{64}$/.test(row.providerRequestHash)) invalid();
  if (!validDate(row.providerLastAttemptAt) || !validDate(row.submittedAt) || row.providerLastAttemptAt.getTime() !== row.submittedAt.getTime()) invalid();
  if (!Number.isInteger(row.providerStatusCheckAttempts) || row.providerStatusCheckAttempts < 0 || !nullableDate(row.providerLastStatusCheckAt) || !nullableDate(row.providerNextStatusCheckAt) || !nullableDate(row.providerStatusCheckLeaseUntil)) invalid();
  if ((row.providerStatusCheckLockOwner === null) !== (row.providerStatusCheckLeaseUntil === null) ||
      (row.providerStatusCheckLockOwner !== null && !safeString(row.providerStatusCheckLockOwner, 100))) invalid();
  if ((row.taxAuthorityStatus === "ACCEPTED" || row.taxAuthorityStatus === "REJECTED") &&
      (row.providerNextStatusCheckAt !== null || row.providerStatusCheckLockOwner !== null || row.providerStatusCheckLeaseUntil !== null)) invalid();
  if (row.providerLastStatusCheckAt && row.providerNextStatusCheckAt && row.providerLastStatusCheckAt.getTime() > row.providerNextStatusCheckAt.getTime()) invalid();
  if (typeof row.providerDocumentId !== "string" || !/^[A-Za-z0-9_-]{1,255}$/.test(row.providerDocumentId)) invalid();
  if (typeof row.haciendaKey !== "string" || !/^\d{50}$/.test(row.haciendaKey) || row.haciendaKey.slice(21, 41) !== row.fiscalNumber) invalid();
  if (row.providerEnvironment !== "sandbox" && row.providerEnvironment !== "production") invalid();
  if (!validDate(row.fiscalIssueDate) || !validDate(row.fiscalEmissionAt)) invalid();
  const fiscalIssueDate = dateOnly(row.fiscalIssueDate);
  if (row.haciendaKey.slice(3, 9) !== keyDate(fiscalIssueDate)) invalid();
  return {
    sequenceId: row.billingDocumentNumberSequenceId,
    allocatedSequenceNumber,
    providerDocumentId: row.providerDocumentId,
    haciendaKey: row.haciendaKey,
    fiscalNumber: row.fiscalNumber,
    documentTypeCode,
    providerEnvironment: row.providerEnvironment,
    fiscalIssueDate,
    issuanceIdempotencyKey: row.issuanceIdempotencyKey,
    fiscalEmissionAt: row.fiscalEmissionAt,
    requestHash: row.providerRequestHash,
    attemptedAt: row.providerLastAttemptAt,
    submittedAt: row.submittedAt,
    taxAuthorityStatus: row.taxAuthorityStatus,
    statusCheckAttempts: row.providerStatusCheckAttempts,
    lastStatusCheckAt: row.providerLastStatusCheckAt,
    nextStatusCheckAt: row.providerNextStatusCheckAt,
    statusCheckLockOwner: row.providerStatusCheckLockOwner,
    statusCheckLeaseUntil: row.providerStatusCheckLeaseUntil,
  };
}

function boundedIdentifier(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 191 && value.trim() === value; }
function safeString(value: unknown, maximum: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim() === value; }
function validDate(value: unknown): value is Date { return value instanceof Date && Number.isFinite(value.getTime()); }
function nullableDate(value: unknown): value is Date | null { return value === null || validDate(value); }
function copyDate(value: Date | null): Date | null { return value === null ? null : new Date(value.getTime()); }
function statusCheckSelect(){return{providerStatusCheckAttempts:true,providerLastStatusCheckAt:true,providerNextStatusCheckAt:true,providerStatusCheckLockOwner:true,providerStatusCheckLeaseUntil:true};}
function dateOnly(value: Date): string { return `${value.getUTCFullYear().toString().padStart(4, "0")}-${(value.getUTCMonth() + 1).toString().padStart(2, "0")}-${value.getUTCDate().toString().padStart(2, "0")}`; }
function keyDate(value: string): string { return `${value.slice(8, 10)}${value.slice(5, 7)}${value.slice(2, 4)}`; }
function notFound(): never { throw fiscalBillingError("BILLING_DOCUMENT_NOT_FOUND"); }
function ineligible(): never { throw fiscalBillingError("BILLING_DOCUMENT_STATUS_LOOKUP_INELIGIBLE"); }
function invalid(): never { throw fiscalBillingError("BILLING_DOCUMENT_STATUS_SNAPSHOT_INVALID"); }
