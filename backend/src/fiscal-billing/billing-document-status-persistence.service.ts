import { HttpException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { BillingDocumentStatusLookupResult } from "./billing-document-status-lookup.service";
import { fiscalBillingError } from "./fiscal-billing.errors";
import { FiscalIssuanceClock } from "./fiscal-issuance.clock";
import { nextFiscalStatusReconciliationSchedule } from "./fiscal-status-reconciliation-policy";

const persistenceSelect = Prisma.validator<Prisma.BillingDocumentSelect>()({
  id: true, tenantId: true, billingMode: true, lifecycleStatus: true,
  providerStatus: true, taxAuthorityStatus: true, providerDocumentId: true,
  haciendaKey: true, haciendaRejectionDetail: true, fiscalNumber: true, documentTypeCode: true,
  providerEnvironment: true, fiscalIssueDate: true, fiscalEmissionAt: true,
  billingDocumentNumberSequenceId: true, allocatedSequenceNumber: true,
  issuanceIdempotencyKey: true, providerRequestHash: true,
  providerLastAttemptAt: true, providerReconciliationRequired: true,
  providerLastErrorCode: true, providerLastErrorAt: true,
  submittedAt: true, issuedAt: true, taxAuthorityFinalizedAt: true,
  ...statusCheckSelect(),
  ...refreshSelect(),
} as Prisma.BillingDocumentSelect);
type StatusCheckFields={providerStatusCheckAttempts:number;providerLastStatusCheckAt:Date|null;providerNextStatusCheckAt:Date|null;providerStatusCheckLockOwner:string|null;providerStatusCheckLeaseUntil:Date|null};
type PersistenceRow = Prisma.BillingDocumentGetPayload<{ select: typeof persistenceSelect }> & StatusCheckFields;
type RefreshFields={providerRefreshAttempts:number;providerLastRefreshAt:Date|null;providerNextRefreshAt:Date|null;providerRefreshLockOwner:string|null;providerRefreshLeaseUntil:Date|null};
type Decision = "ACCEPTED" | "REJECTED" | null;

export interface BillingDocumentStatusPersistenceResult {
  readonly tenantId: string;
  readonly billingDocumentId: string;
  readonly final: boolean;
  readonly finalDecision: Decision;
  readonly lifecycleStatus: "SUBMITTED";
  readonly providerStatus: "PROCESSED";
  readonly taxAuthorityStatus: "PROCESSING" | "ACCEPTED" | "REJECTED";
  readonly issuedAt: Date | null;
  readonly taxAuthorityFinalizedAt: Date | null;
  readonly newlyPersisted: boolean;
  readonly rejectionDetail: string | null;
}

@Injectable()
export class BillingDocumentStatusPersistenceService {
  constructor(private readonly prisma: PrismaService, private readonly clock: FiscalIssuanceClock) {}

  async persist(lookup: BillingDocumentStatusLookupResult): Promise<BillingDocumentStatusPersistenceResult> {
    const input = validateInput(lookup);
    try {
      return await this.prisma.$transaction(async tx => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "billing_documents"
          WHERE "id" = ${input.billingDocumentId} AND "tenantId" = ${input.tenantId}
          FOR UPDATE
        `;
        if (locked.length !== 1) notFound();
        const row = await readRow(tx, input);
        if (!row) notFound();
        requireCompleteState(row);
        requireImmutableIdentity(row, input);

        const winner = classifyWinner(row, input);
        if (winner) return result(input, acknowledgedTaxStatus(row), row.issuedAt, row.taxAuthorityFinalizedAt, false);
        if (row.taxAuthorityStatus === "ACCEPTED" || row.taxAuthorityStatus === "REJECTED") conflict();
        requireSourceState(row, input);
        const completedAt=this.clock.now();if(!validDate(completedAt))corrupt();
        const attempts=input.statusCheckAttempts+1;
        const scheduling=input.decision===null?nextFiscalStatusReconciliationSchedule(input.submittedAt,attempts,completedAt):{nextStatusCheckAt:null,reconciliationRequired:false},refreshDue=input.decision===null&&scheduling.reconciliationRequired?completedAt:null;
        const issuedAt=input.decision==="ACCEPTED"?new Date(input.fiscalEmissionAt.getTime()):null;
        const taxAuthorityFinalizedAt=input.decision===null?null:completedAt;
        const target=input.decision??"PROCESSING";
        const updated = await tx.billingDocument.updateMany({
          where: expectedWhere(row, input),
          data: {
            taxAuthorityStatus: target,
            providerReconciliationRequired: scheduling.reconciliationRequired,
            providerLastErrorCode: null,
            providerLastErrorAt: null,
            haciendaRejectionDetail: target === "REJECTED" ? input.rejectionDetail : null,
            providerStatusCheckAttempts:attempts,providerLastStatusCheckAt:completedAt,providerNextStatusCheckAt:scheduling.nextStatusCheckAt,
            providerStatusCheckLockOwner:null,providerStatusCheckLeaseUntil:null,issuedAt,taxAuthorityFinalizedAt,
            providerNextRefreshAt:refreshDue,providerRefreshLockOwner:null,providerRefreshLeaseUntil:null,
          } as Prisma.BillingDocumentUpdateManyMutationInput,
        });
        if (updated.count === 1) return result(input, target, issuedAt, taxAuthorityFinalizedAt, true);
        const concurrent = await readRow(tx, input);
        if (!concurrent) notFound();
        requireCompleteState(concurrent);
        requireImmutableIdentity(concurrent, input);
        if (classifyWinner(concurrent, input)) return result(input, acknowledgedTaxStatus(concurrent), concurrent.issuedAt, concurrent.taxAuthorityFinalizedAt, false);
        conflict();
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw fiscalBillingError("BILLING_DOCUMENT_STATUS_PERSISTENCE_FAILED");
    }
  }
}

interface ValidatedInput {
  tenantId: string; billingDocumentId: string; sequenceId: string; allocatedSequenceNumber: bigint;
  providerDocumentId: string; haciendaKey: string; issuanceIdempotencyKey: string; fiscalEmissionAt: Date;
  requestHash: string; attemptedAt: Date; fiscalNumber: string; documentTypeCode: "01" | "04";
  providerEnvironment: "sandbox" | "production"; fiscalIssueDate: string; submittedAt: Date;
  sourceTaxStatus: "PROCESSING" | "ACCEPTED" | "REJECTED"; decision: Decision; rejectionDetail: string | null;
  statusCheckAttempts:number;lastStatusCheckAt:Date|null;nextStatusCheckAt:Date|null;statusCheckLockOwner:string|null;statusCheckLeaseUntil:Date|null;
  refreshAttempts:number;lastRefreshAt:Date|null;nextRefreshAt:Date|null;refreshLockOwner:string|null;refreshLeaseUntil:Date|null;
}

function validateInput(value: BillingDocumentStatusLookupResult): ValidatedInput {
  try {
    const identity = value.persistedIdentity, provider = value.providerResult;
    if (!identity || !provider || !safe(identity.tenantId, 191) || !safe(identity.billingDocumentId, 191) ||
      !safe(identity.billingDocumentNumberSequenceId, 191) || !/^[1-9]\d{0,9}$/.test(identity.allocatedSequenceNumber) ||
      !/^[A-Za-z0-9_-]{1,255}$/.test(identity.providerDocumentId) || !/^\d{50}$/.test(identity.haciendaKey) ||
      identity.issuanceIdempotencyKey !== `billing-document:${identity.billingDocumentId}:electronic-issuance:v1` || identity.issuanceIdempotencyKey.length > 100 ||
      !validDate(identity.fiscalEmissionAt) || !/^[a-f0-9]{64}$/.test(identity.providerRequestHash) || !validDate(identity.providerLastAttemptAt) ||
      !/^\d{20}$/.test(identity.fiscalNumber) || (identity.documentTypeCode !== "01" && identity.documentTypeCode !== "04") ||
      (identity.providerEnvironment !== "sandbox" && identity.providerEnvironment !== "production") || !canonicalDate(identity.fiscalIssueDate) ||
      identity.lifecycleStatus !== "SUBMITTED" || identity.providerStatus !== "PROCESSED" ||
      !["PROCESSING", "ACCEPTED", "REJECTED"].includes(identity.taxAuthorityStatus) || identity.providerReconciliationRequired !== false ||
      !validDate(identity.submittedAt) || identity.issuedAt !== null || identity.taxAuthorityFinalizedAt !== null || identity.providerLastAttemptAt.getTime() !== identity.submittedAt.getTime() ||
      !Number.isInteger(identity.providerStatusCheckAttempts)||identity.providerStatusCheckAttempts<0||identity.providerStatusCheckAttempts>=2147483647||
      !nullableDate(identity.providerLastStatusCheckAt)||!nullableDate(identity.providerNextStatusCheckAt)||!nullableDate(identity.providerStatusCheckLeaseUntil)||
      (identity.providerStatusCheckLockOwner===null)!==(identity.providerStatusCheckLeaseUntil===null)||(identity.providerStatusCheckLockOwner!==null&&!safe(identity.providerStatusCheckLockOwner,100))||
      (identity.providerLastStatusCheckAt!==null&&identity.providerNextStatusCheckAt!==null&&identity.providerLastStatusCheckAt.getTime()>identity.providerNextStatusCheckAt.getTime())||
      ((identity.taxAuthorityStatus==="ACCEPTED"||identity.taxAuthorityStatus==="REJECTED")&&(identity.providerNextStatusCheckAt!==null||identity.providerStatusCheckLockOwner!==null||identity.providerStatusCheckLeaseUntil!==null))||
      !Number.isInteger(identity.providerRefreshAttempts)||identity.providerRefreshAttempts<0||!nullableDate(identity.providerLastRefreshAt)||!nullableDate(identity.providerNextRefreshAt)||!nullableDate(identity.providerRefreshLeaseUntil)||(identity.providerRefreshLockOwner===null)!==(identity.providerRefreshLeaseUntil===null)||(identity.providerRefreshLockOwner!==null&&!safe(identity.providerRefreshLockOwner,100))||identity.providerNextRefreshAt!==null||identity.providerRefreshLockOwner!==null||
      identity.fiscalNumber.slice(8, 10) !== identity.documentTypeCode || identity.fiscalNumber.slice(10) !== identity.allocatedSequenceNumber.padStart(10, "0") ||
      identity.haciendaKey.slice(21, 41) !== identity.fiscalNumber || identity.haciendaKey.slice(3, 9) !== keyDate(identity.fiscalIssueDate)) corrupt();
    if (provider.classification !== "ELECTRONIC_DOCUMENT_STATUS" || provider.providerDocumentId !== identity.providerDocumentId ||
      provider.haciendaKey !== identity.haciendaKey || provider.consecutive !== identity.fiscalNumber || provider.providerEnvironment !== identity.providerEnvironment ||
      !/^[a-z][a-z0-9_]{0,63}$/.test(provider.providerStatus) || provider.final !== (provider.finalDecision !== null) ||
      (provider.finalDecision === "ACCEPTED") !== (provider.providerStatus === "accepted") ||
      (provider.finalDecision === "REJECTED") !== (provider.providerStatus === "rejected") ||
      (provider.finalDecision !== null && provider.finalDecision !== "ACCEPTED" && provider.finalDecision !== "REJECTED") ||
      !normalizedRejectionDetail(provider.rejectionDetail, provider.finalDecision === "REJECTED") ||
      (provider.fiscalIssuedAt !== null && (typeof provider.fiscalIssuedAt !== "string" || !sameCostaRicaDate(provider.fiscalIssuedAt, identity.fiscalIssueDate)))) corrupt();
    if ((identity.taxAuthorityStatus === "ACCEPTED" && provider.finalDecision !== "ACCEPTED") ||
        (identity.taxAuthorityStatus === "REJECTED" && provider.finalDecision !== "REJECTED")) conflict();
    return {
      tenantId: identity.tenantId, billingDocumentId: identity.billingDocumentId,
      sequenceId: identity.billingDocumentNumberSequenceId, allocatedSequenceNumber: BigInt(identity.allocatedSequenceNumber),
      providerDocumentId: identity.providerDocumentId, haciendaKey: identity.haciendaKey,
      issuanceIdempotencyKey: identity.issuanceIdempotencyKey, fiscalEmissionAt: new Date(identity.fiscalEmissionAt.getTime()),
      requestHash: identity.providerRequestHash, attemptedAt: new Date(identity.providerLastAttemptAt.getTime()),
      fiscalNumber: identity.fiscalNumber, documentTypeCode: identity.documentTypeCode,
      providerEnvironment: identity.providerEnvironment, fiscalIssueDate: identity.fiscalIssueDate,
      submittedAt: new Date(identity.submittedAt.getTime()), sourceTaxStatus: identity.taxAuthorityStatus,
      decision: provider.finalDecision, rejectionDetail: provider.rejectionDetail ?? null,
      statusCheckAttempts:identity.providerStatusCheckAttempts,lastStatusCheckAt:copyDate(identity.providerLastStatusCheckAt),nextStatusCheckAt:copyDate(identity.providerNextStatusCheckAt),
      statusCheckLockOwner:identity.providerStatusCheckLockOwner,statusCheckLeaseUntil:copyDate(identity.providerStatusCheckLeaseUntil),
      refreshAttempts:identity.providerRefreshAttempts,lastRefreshAt:copyDate(identity.providerLastRefreshAt),nextRefreshAt:copyDate(identity.providerNextRefreshAt),refreshLockOwner:identity.providerRefreshLockOwner,refreshLeaseUntil:copyDate(identity.providerRefreshLeaseUntil),
    };
  } catch (error) { if (error instanceof HttpException) throw error; corrupt(); }
}

async function readRow(tx: Prisma.TransactionClient, input: ValidatedInput) {
  return tx.billingDocument.findUnique({ where: { id_tenantId: { id: input.billingDocumentId, tenantId: input.tenantId } }, select: persistenceSelect }) as Promise<PersistenceRow|null>;
}
function requireCompleteState(row: PersistenceRow) {
  if (row.billingMode !== "ELECTRONIC_PROVIDER" || row.lifecycleStatus !== "SUBMITTED" || row.providerStatus !== "PROCESSED" ||
    (row.taxAuthorityStatus !== "PROCESSING" && row.taxAuthorityStatus !== "ACCEPTED" && row.taxAuthorityStatus !== "REJECTED") ||
    !safe(row.billingDocumentNumberSequenceId, 191) || typeof row.allocatedSequenceNumber !== "bigint" || !safe(row.fiscalNumber, 50) ||
    (row.documentTypeCode !== "01" && row.documentTypeCode !== "04") || !safe(row.issuanceIdempotencyKey, 100) ||
    !safe(row.providerRequestHash, 64) || !validDate(row.providerLastAttemptAt) || !safe(row.providerDocumentId, 255) ||
    !safe(row.haciendaKey, 50) || (row.providerEnvironment !== "sandbox" && row.providerEnvironment !== "production") ||
    !validDate(row.fiscalEmissionAt) || !validDate(row.fiscalIssueDate) || !validDate(row.submittedAt) ||
    !/^[1-9]\d{0,9}$/.test(row.allocatedSequenceNumber.toString()) || !/^\d{20}$/.test(row.fiscalNumber) ||
    row.fiscalNumber.slice(8,10) !== row.documentTypeCode || row.fiscalNumber.slice(10) !== row.allocatedSequenceNumber.toString().padStart(10,"0") ||
    row.issuanceIdempotencyKey !== `billing-document:${row.id}:electronic-issuance:v1` || !/^[a-f0-9]{64}$/.test(row.providerRequestHash) ||
    row.providerLastAttemptAt.getTime() !== row.submittedAt.getTime() || !/^[A-Za-z0-9_-]{1,255}$/.test(row.providerDocumentId) ||
    !/^\d{50}$/.test(row.haciendaKey) || row.haciendaKey.slice(21,41) !== row.fiscalNumber || row.haciendaKey.slice(3,9) !== keyDate(dateOnly(row.fiscalIssueDate)) ||
    !normalizedRejectionDetail(row.haciendaRejectionDetail,row.taxAuthorityStatus==="REJECTED")||row.providerLastErrorCode !== null || row.providerLastErrorAt !== null ||!Number.isInteger(row.providerStatusCheckAttempts)||row.providerStatusCheckAttempts<0||
    !nullableDate(row.providerLastStatusCheckAt)||!nullableDate(row.providerNextStatusCheckAt)||!nullableDate(row.providerStatusCheckLeaseUntil)||
    (row.providerStatusCheckLockOwner===null)!==(row.providerStatusCheckLeaseUntil===null)||(row.providerStatusCheckLockOwner!==null&&!safe(row.providerStatusCheckLockOwner,100))||
    (row.providerLastStatusCheckAt!==null&&row.providerNextStatusCheckAt!==null&&row.providerLastStatusCheckAt.getTime()>row.providerNextStatusCheckAt.getTime())||
    ((row.providerNextStatusCheckAt!==null||row.providerStatusCheckLockOwner!==null)&&(row.taxAuthorityStatus!=="PROCESSING"||row.providerReconciliationRequired||row.issuedAt!==null||row.taxAuthorityFinalizedAt!==null))||
    ((row.taxAuthorityStatus==="ACCEPTED"||row.taxAuthorityStatus==="REJECTED")&&(row.providerNextStatusCheckAt!==null||row.providerStatusCheckLockOwner!==null||row.providerStatusCheckLeaseUntil!==null||row.providerReconciliationRequired))||
    (row.taxAuthorityStatus==="PROCESSING"&&row.providerReconciliationRequired&&row.providerNextStatusCheckAt!==null)||
    !Number.isInteger((row as PersistenceRow&RefreshFields).providerRefreshAttempts)||(row as PersistenceRow&RefreshFields).providerRefreshAttempts<0||!nullableDate((row as PersistenceRow&RefreshFields).providerLastRefreshAt)||!nullableDate((row as PersistenceRow&RefreshFields).providerNextRefreshAt)||!nullableDate((row as PersistenceRow&RefreshFields).providerRefreshLeaseUntil)||(((row as PersistenceRow&RefreshFields).providerRefreshLockOwner===null)!==((row as PersistenceRow&RefreshFields).providerRefreshLeaseUntil===null))||((row as PersistenceRow&RefreshFields).providerRefreshLockOwner!==null&&!safe((row as PersistenceRow&RefreshFields).providerRefreshLockOwner,100))||
    (row.taxAuthorityStatus === "PROCESSING" && row.taxAuthorityFinalizedAt !== null) ||
    ((row.taxAuthorityStatus === "ACCEPTED" || row.taxAuthorityStatus === "REJECTED") && !validDate(row.taxAuthorityFinalizedAt)) ||
    (row.taxAuthorityStatus !== "ACCEPTED" && row.issuedAt !== null) || (row.issuedAt !== null && (!validDate(row.issuedAt) || row.issuedAt.getTime() !== row.fiscalEmissionAt!.getTime()))) corrupt();
}
function requireImmutableIdentity(row: PersistenceRow, input: ValidatedInput) {
  if (row.id !== input.billingDocumentId || row.tenantId !== input.tenantId || row.billingDocumentNumberSequenceId !== input.sequenceId ||
    row.allocatedSequenceNumber !== input.allocatedSequenceNumber || row.fiscalNumber !== input.fiscalNumber || row.documentTypeCode !== input.documentTypeCode ||
    row.issuanceIdempotencyKey !== input.issuanceIdempotencyKey || row.providerRequestHash !== input.requestHash ||
    row.providerLastAttemptAt!.getTime() !== input.attemptedAt.getTime() || row.providerDocumentId !== input.providerDocumentId ||
    row.haciendaKey !== input.haciendaKey || row.providerEnvironment !== input.providerEnvironment ||
    row.fiscalEmissionAt!.getTime() !== input.fiscalEmissionAt.getTime() || dateOnly(row.fiscalIssueDate!) !== input.fiscalIssueDate ||
    row.submittedAt!.getTime() !== input.submittedAt.getTime()) stale();
}
function requireSourceState(row: PersistenceRow, input: ValidatedInput) {
  if (row.lifecycleStatus !== "SUBMITTED" || row.providerStatus !== "PROCESSED" || row.taxAuthorityStatus !== input.sourceTaxStatus ||
    row.providerReconciliationRequired || row.providerLastErrorCode !== null || row.providerLastErrorAt !== null || row.haciendaRejectionDetail!==null || row.issuedAt !== null||row.taxAuthorityFinalizedAt!==null||
    row.providerStatusCheckAttempts!==input.statusCheckAttempts||dateTime(row.providerLastStatusCheckAt)!==dateTime(input.lastStatusCheckAt)||dateTime(row.providerNextStatusCheckAt)!==dateTime(input.nextStatusCheckAt)||
    row.providerStatusCheckLockOwner!==input.statusCheckLockOwner||dateTime(row.providerStatusCheckLeaseUntil)!==dateTime(input.statusCheckLeaseUntil)) stale();const refresh=row as PersistenceRow&RefreshFields;if(refresh.providerRefreshAttempts!==input.refreshAttempts||dateTime(refresh.providerLastRefreshAt)!==dateTime(input.lastRefreshAt)||dateTime(refresh.providerNextRefreshAt)!==dateTime(input.nextRefreshAt)||refresh.providerRefreshLockOwner!==input.refreshLockOwner||dateTime(refresh.providerRefreshLeaseUntil)!==dateTime(input.refreshLeaseUntil))stale();
  if ((input.sourceTaxStatus === "ACCEPTED" && input.decision !== "ACCEPTED") ||
      (input.sourceTaxStatus === "REJECTED" && input.decision !== "REJECTED")) conflict();
}
function classifyWinner(row: PersistenceRow, input: ValidatedInput): boolean {
  if(row.providerStatusCheckAttempts!==input.statusCheckAttempts+1||!validDate(row.providerLastStatusCheckAt)||row.providerStatusCheckLockOwner!==null||row.providerStatusCheckLeaseUntil!==null)return false;
  if(input.decision==="ACCEPTED")return row.taxAuthorityStatus==="ACCEPTED"&&row.haciendaRejectionDetail===null&&row.issuedAt?.getTime()===input.fiscalEmissionAt.getTime()&&validDate(row.taxAuthorityFinalizedAt)&&row.providerNextStatusCheckAt===null&&!row.providerReconciliationRequired&&(row as PersistenceRow&RefreshFields).providerNextRefreshAt===null&&(row as PersistenceRow&RefreshFields).providerRefreshLockOwner===null;
  if(input.decision==="REJECTED")return row.taxAuthorityStatus==="REJECTED"&&row.haciendaRejectionDetail===input.rejectionDetail&&row.issuedAt===null&&validDate(row.taxAuthorityFinalizedAt)&&row.providerNextStatusCheckAt===null&&!row.providerReconciliationRequired&&(row as PersistenceRow&RefreshFields).providerNextRefreshAt===null&&(row as PersistenceRow&RefreshFields).providerRefreshLockOwner===null;
  if(row.taxAuthorityStatus!=="PROCESSING"||row.haciendaRejectionDetail!==null||row.issuedAt!==null||row.taxAuthorityFinalizedAt!==null)return false;const schedule=nextFiscalStatusReconciliationSchedule(input.submittedAt,row.providerStatusCheckAttempts,row.providerLastStatusCheckAt);
  return dateTime(row.providerNextStatusCheckAt)===dateTime(schedule.nextStatusCheckAt)&&row.providerReconciliationRequired===schedule.reconciliationRequired&&dateTime((row as PersistenceRow&RefreshFields).providerNextRefreshAt)===dateTime(schedule.reconciliationRequired?row.providerLastStatusCheckAt:null);
}
function acknowledgedTaxStatus(row: PersistenceRow): "PROCESSING" | "ACCEPTED" | "REJECTED" {
  if (row.taxAuthorityStatus === "NOT_SUBMITTED") corrupt();
  return row.taxAuthorityStatus;
}
function expectedWhere(row: PersistenceRow, input: ValidatedInput) {
  return { id: input.billingDocumentId, tenantId: input.tenantId, billingMode: "ELECTRONIC_PROVIDER" as const,
    lifecycleStatus: "SUBMITTED" as const, providerStatus: "PROCESSED" as const, taxAuthorityStatus: input.sourceTaxStatus,
    billingDocumentNumberSequenceId: input.sequenceId, allocatedSequenceNumber: input.allocatedSequenceNumber,
    fiscalNumber: input.fiscalNumber, documentTypeCode: input.documentTypeCode, issuanceIdempotencyKey: input.issuanceIdempotencyKey,
    providerRequestHash: input.requestHash, providerLastAttemptAt: input.attemptedAt, providerDocumentId: input.providerDocumentId,
    haciendaKey: input.haciendaKey, providerEnvironment: input.providerEnvironment, fiscalEmissionAt: row.fiscalEmissionAt,
    fiscalIssueDate: row.fiscalIssueDate, submittedAt: input.submittedAt, providerReconciliationRequired: false,haciendaRejectionDetail:null,
    providerLastErrorCode: null, providerLastErrorAt: null, issuedAt: null,taxAuthorityFinalizedAt:null,providerStatusCheckAttempts:input.statusCheckAttempts,
    providerLastStatusCheckAt:input.lastStatusCheckAt,providerNextStatusCheckAt:input.nextStatusCheckAt,providerStatusCheckLockOwner:input.statusCheckLockOwner,providerStatusCheckLeaseUntil:input.statusCheckLeaseUntil,
    providerRefreshAttempts:input.refreshAttempts,providerLastRefreshAt:input.lastRefreshAt,providerNextRefreshAt:input.nextRefreshAt,providerRefreshLockOwner:input.refreshLockOwner,providerRefreshLeaseUntil:input.refreshLeaseUntil } as Prisma.BillingDocumentWhereInput;
}
function result(input: ValidatedInput, tax: "PROCESSING" | "ACCEPTED" | "REJECTED", issuedAt: Date | null, taxAuthorityFinalizedAt: Date | null, newlyPersisted: boolean): BillingDocumentStatusPersistenceResult {
  return { tenantId: input.tenantId, billingDocumentId: input.billingDocumentId, final: input.decision !== null,
    finalDecision: input.decision, lifecycleStatus: "SUBMITTED", providerStatus: "PROCESSED", taxAuthorityStatus: tax,
    issuedAt: issuedAt ? new Date(issuedAt.getTime()) : null,taxAuthorityFinalizedAt:taxAuthorityFinalizedAt?new Date(taxAuthorityFinalizedAt.getTime()):null, newlyPersisted, rejectionDetail: input.decision === "REJECTED" ? input.rejectionDetail : null };
}
function safe(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value; }
function normalizedRejectionDetail(value:unknown,rejected:boolean):boolean{return value===null||value===undefined?true:rejected&&typeof value==="string"&&value.length>=1&&value.length<=65_536&&value===value.trim()&&!/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);}
function validDate(value: unknown): value is Date { return value instanceof Date && Number.isFinite(value.getTime()); }
function nullableDate(value:unknown):value is Date|null{return value===null||validDate(value);}function copyDate(value:Date|null){return value===null?null:new Date(value.getTime());}function dateTime(value:Date|null){return value?.getTime()??null;}
function statusCheckSelect(){return{providerStatusCheckAttempts:true,providerLastStatusCheckAt:true,providerNextStatusCheckAt:true,providerStatusCheckLockOwner:true,providerStatusCheckLeaseUntil:true};}
function refreshSelect(){return{providerRefreshAttempts:true,providerLastRefreshAt:true,providerNextRefreshAt:true,providerRefreshLockOwner:true,providerRefreshLeaseUntil:true};}
function canonicalDate(value: unknown): value is string { const match=typeof value === "string"?/^(\d{4})-(\d{2})-(\d{2})$/.exec(value):null;if(!match)return false;const d=new Date(Date.UTC(+match[1],+match[2]-1,+match[3]));return d.getUTCFullYear()===+match[1]&&d.getUTCMonth()+1===+match[2]&&d.getUTCDate()===+match[3]; }
function sameCostaRicaDate(value:string,expected:string):boolean{const instant=new Date(value);if(!Number.isFinite(instant.getTime()))return false;const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Costa_Rica",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(instant);const part=(type:Intl.DateTimeFormatPartTypes)=>parts.find(item=>item.type===type)?.value??"";return `${part("year")}-${part("month")}-${part("day")}`===expected;}
function dateOnly(value: Date): string { return `${value.getUTCFullYear().toString().padStart(4,"0")}-${(value.getUTCMonth()+1).toString().padStart(2,"0")}-${value.getUTCDate().toString().padStart(2,"0")}`; }
function keyDate(value: string): string { return `${value.slice(8,10)}${value.slice(5,7)}${value.slice(2,4)}`; }
function notFound(): never { throw fiscalBillingError("BILLING_DOCUMENT_NOT_FOUND"); }
function stale(): never { throw fiscalBillingError("BILLING_DOCUMENT_STATUS_STALE"); }
function conflict(): never { throw fiscalBillingError("BILLING_DOCUMENT_STATUS_CONFLICT"); }
function corrupt(): never { throw fiscalBillingError("BILLING_DOCUMENT_STATUS_STATE_CORRUPT"); }
