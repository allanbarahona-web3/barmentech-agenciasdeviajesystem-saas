import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { fiscalBillingError } from "./fiscal-billing.errors";
import {
  FacturaEnCrPreparationError,
  prepareFacturaEnCrSubmission,
  type FacturaEnCrSubmissionAggregate,
} from "./providers/factura-en-cr-submission";
import { CR_V44_DECIMAL_V1 } from "./cr-v44-fiscal-calculation-policy";
import { validateCrV44CalculatedSnapshot } from "./cr-v44-calculated-snapshot-validator";
import { FiscalCalculationError } from "./fiscal-decimal";

const submissionSelect = Prisma.validator<Prisma.BillingDocumentSelect>()({
  id: true, tenantId: true, documentTypeCode: true, billingMode: true, lifecycleStatus: true, fiscalCalculationPolicyVersion: true,
  issuerIdentification: true, issuerEconomicActivityCode: true, issuerEstablishmentCode: true, issuerTerminalCode: true,
  billingDocumentNumberSequenceId: true, allocatedSequenceNumber: true, fiscalNumber: true, issuanceIdempotencyKey: true,
  fiscalEmissionAt: true, fiscalIssueDate: true, currencyCode: true, exchangeRate: true,
  officialExchangeRateObservationId: true, fiscalExchangeRateEffectiveDate: true, fiscalExchangeRateSourceAuthority: true, fiscalExchangeRateIndicatorCode: true,
  paymentConditionCode: true, creditTermDays: true,
  grossSubtotal: true, discountTotal: true, taxableTotal: true, exemptTotal: true, exoneratedTotal: true,
  grossTaxTotal: true, exoneratedTaxTotal: true, netTaxTotal: true, total: true,
  receiverName: true, receiverIdentificationType: true, receiverIdentification: true, receiverEconomicActivityCode: true,
  receiverEmail: true, receiverPhone: true, receiverAddressSnapshot: true,
  providerStatus: true, taxAuthorityStatus: true, providerDocumentId: true, providerEnvironment: true, providerRequestHash: true,
  providerLastAttemptAt: true, providerLastErrorCode: true, providerLastErrorAt: true, providerReconciliationRequired: true,
  haciendaKey: true, submittedAt: true, issuedAt: true,
  officialExchangeRateObservation: { select: {
    id: true, countryCode: true, foreignCurrencyCode: true, localCurrencyCode: true, rateType: true,
    effectiveDate: true, value: true, sourceAuthority: true, sourceIndicatorCode: true, requestIdentity: true, responseHash: true,
  } },
  paymentMethods: { orderBy: [{ paymentMethodOrder: "asc" }, { id: "asc" }], select: {
    id: true, tenantId: true, paymentMethodOrder: true, paymentMethodCode: true, description: true, declaredAmount: true,
  } },
  lines: { orderBy: [{ lineNumber: "asc" }, { id: "asc" }], select: {
    id: true, tenantId: true, lineNumber: true, cabysCode: true, itemCode: true, description: true, quantity: true,
    unitOfMeasureCode: true, unitPrice: true, grossAmount: true, discountAmount: true, discountCode: true,
    discountReason: true, taxableBase: true, taxAmount: true, exoneratedTaxAmount: true, netTaxAmount: true,
    lineSubtotal: true, lineTotal: true,
    taxes: { orderBy: [{ taxOrder: "asc" }, { id: "asc" }], select: {
      id: true, tenantId: true, taxOrder: true, taxCode: true, rateCode: true, ratePercentage: true, taxableBase: true,
      taxAmount: true, calculationFactor: true, netTaxAmount: true,
      exemption: { select: {
        id: true, tenantId: true, documentTypeCode: true, documentNumber: true, legalArticle: true, legalSection: true,
        issuingInstitutionCode: true, issuingInstitutionName: true, otherInstitutionDescription: true, issueDate: true,
        exemptedPercentage: true, exemptedAmount: true,
      } },
    } },
  } },
});

type SubmissionRow = Prisma.BillingDocumentGetPayload<{ select: typeof submissionSelect }>;

export interface BillingDocumentSubmissionPreparationResult {
  readonly preparedSubmission: ReturnType<typeof prepareFacturaEnCrSubmission>;
  readonly allocationIdentity: {
    readonly billingDocumentNumberSequenceId: string;
    readonly allocatedSequenceNumber: string;
  };
  readonly recoveryIdentity: {
    readonly fiscalNumber: string;
    readonly documentTypeCode: "01" | "04";
    readonly issuanceIdempotencyKey: string;
    readonly fiscalEmissionAt: Date;
    readonly fiscalIssueDate: string;
    readonly issuedAt: Date | null;
  };
  readonly providerState: {
    readonly billingMode: string; readonly lifecycleStatus: string; readonly providerStatus: string; readonly taxAuthorityStatus: string;
    readonly providerDocumentId: string | null; readonly providerEnvironment: string | null; readonly providerRequestHash: string | null;
    readonly providerLastAttemptAt: Date | null; readonly providerLastErrorCode: string | null; readonly providerLastErrorAt: Date | null;
    readonly providerReconciliationRequired: boolean; readonly haciendaKey: string | null; readonly submittedAt: Date | null;
  };
  readonly identity: { readonly tenantId: string; readonly billingDocumentId: string };
}

@Injectable()
export class BillingDocumentSubmissionPreparationService {
  constructor(private readonly prisma: PrismaService) {}

  async prepare(tenantId: string, billingDocumentId: string): Promise<BillingDocumentSubmissionPreparationResult> {
    if (!tenantId || !billingDocumentId) throw fiscalBillingError("BILLING_DOCUMENT_NOT_FOUND");
    let row: SubmissionRow | null;
    try {
      row = await this.prisma.billingDocument.findUnique({ where: { id_tenantId: { id: billingDocumentId, tenantId } }, select: submissionSelect });
    } catch {
      throw fiscalBillingError("BILLING_DOCUMENT_SUBMISSION_READ_FAILED");
    }
    if (!row) throw fiscalBillingError("BILLING_DOCUMENT_NOT_FOUND");
    if (row.fiscalCalculationPolicyVersion !== CR_V44_DECIMAL_V1) {
      throw fiscalBillingError("BILLING_DOCUMENT_FISCAL_CALCULATION_POLICY_UNSUPPORTED");
    }

    let aggregate: FacturaEnCrSubmissionAggregate;
    try { aggregate = mapAggregate(row, tenantId); }
    catch { throw fiscalBillingError("BILLING_DOCUMENT_SUBMISSION_SNAPSHOT_INVALID"); }
    if (!aggregate.billingDocumentNumberSequenceId || typeof aggregate.allocatedSequenceNumber !== "string") {
      throw fiscalBillingError("BILLING_DOCUMENT_SUBMISSION_SNAPSHOT_INVALID");
    }
    try { validateCrV44CalculatedSnapshot(aggregate); }
    catch (error) {
      if (error instanceof FiscalCalculationError && error.code === "FISCAL_DECIMAL_CAPACITY_OVERFLOW") {
        throw fiscalBillingError("BILLING_DOCUMENT_HACIENDA_MONEY_CAPACITY_EXCEEDED");
      }
      throw fiscalBillingError("BILLING_DOCUMENT_CALCULATED_SNAPSHOT_INVALID");
    }

    let preparedSubmission: ReturnType<typeof prepareFacturaEnCrSubmission>;
    try { preparedSubmission = prepareFacturaEnCrSubmission(aggregate); }
    catch (error) {
      if (error instanceof FacturaEnCrPreparationError) throw fiscalBillingError("BILLING_DOCUMENT_SUBMISSION_PREPARATION_FAILED");
      throw fiscalBillingError("BILLING_DOCUMENT_SUBMISSION_PREPARATION_FAILED");
    }
    let recoveryIdentity: BillingDocumentSubmissionPreparationResult["recoveryIdentity"];
    try { recoveryIdentity = mapRecoveryIdentity(row); }
    catch { throw fiscalBillingError("BILLING_DOCUMENT_SUBMISSION_SNAPSHOT_INVALID"); }
    return {
      preparedSubmission,
      allocationIdentity: {
        billingDocumentNumberSequenceId: aggregate.billingDocumentNumberSequenceId,
        allocatedSequenceNumber: aggregate.allocatedSequenceNumber,
      },
      recoveryIdentity,
      identity: { tenantId: row.tenantId, billingDocumentId: row.id },
      providerState: {
        billingMode: row.billingMode, lifecycleStatus: row.lifecycleStatus, providerStatus: row.providerStatus,
        taxAuthorityStatus: row.taxAuthorityStatus, providerDocumentId: row.providerDocumentId,
        providerEnvironment: row.providerEnvironment, providerRequestHash: row.providerRequestHash,
        providerLastAttemptAt: row.providerLastAttemptAt, providerLastErrorCode: row.providerLastErrorCode,
        providerLastErrorAt: row.providerLastErrorAt, providerReconciliationRequired: row.providerReconciliationRequired,
        haciendaKey: row.haciendaKey, submittedAt: row.submittedAt,
      },
    };
  }
}

function mapRecoveryIdentity(row: SubmissionRow): BillingDocumentSubmissionPreparationResult["recoveryIdentity"] {
  if (typeof row.fiscalNumber !== "string" || !/^\d{20}$/.test(row.fiscalNumber) ||
    (row.documentTypeCode !== "01" && row.documentTypeCode !== "04") ||
    typeof row.issuanceIdempotencyKey !== "string" ||
    row.issuanceIdempotencyKey !== `billing-document:${row.id}:electronic-issuance:v1` || row.issuanceIdempotencyKey.length > 100) invalidSnapshot();
  const fiscalIssueDate = dateOnly(row.fiscalIssueDate);
  if (!(row.fiscalEmissionAt instanceof Date) || !Number.isFinite(row.fiscalEmissionAt.getTime()) || fiscalIssueDate === null ||
    (row.issuedAt !== null && !(row.issuedAt instanceof Date && Number.isFinite(row.issuedAt.getTime())))) invalidSnapshot();
  return { fiscalNumber: row.fiscalNumber, documentTypeCode: row.documentTypeCode,
    issuanceIdempotencyKey: row.issuanceIdempotencyKey, fiscalEmissionAt: new Date(row.fiscalEmissionAt.getTime()), fiscalIssueDate,
    issuedAt: row.issuedAt === null ? null : new Date(row.issuedAt.getTime()) };
}

function mapAggregate(row: SubmissionRow, expectedTenantId: string): FacturaEnCrSubmissionAggregate {
  if (row.tenantId !== expectedTenantId || row.billingMode !== "ELECTRONIC_PROVIDER" || !["CONFIRMED", "SUBMITTED"].includes(row.lifecycleStatus) ||
    !["01", "04"].includes(row.documentTypeCode) || row.paymentMethods.some(x => x.tenantId !== expectedTenantId) ||
    row.lines.some(x => x.tenantId !== expectedTenantId || x.taxes.some(t => t.tenantId !== expectedTenantId || (t.exemption !== null && t.exemption.tenantId !== expectedTenantId)))) invalidSnapshot();
  verifyOfficialSnapshot(row);
  return {
    id: row.id, tenantId: row.tenantId, documentTypeCode: row.documentTypeCode,
    fiscalCalculationPolicyVersion: row.fiscalCalculationPolicyVersion,
    issuerIdentification: row.issuerIdentification, issuerEconomicActivityCode: row.issuerEconomicActivityCode,
    issuerEstablishmentCode: row.issuerEstablishmentCode, issuerTerminalCode: row.issuerTerminalCode,
    billingDocumentNumberSequenceId: row.billingDocumentNumberSequenceId,
    allocatedSequenceNumber: row.allocatedSequenceNumber === null ? null : row.allocatedSequenceNumber.toString(),
    fiscalNumber: row.fiscalNumber, issuanceIdempotencyKey: row.issuanceIdempotencyKey,
    fiscalEmissionAt: exactDate(row.fiscalEmissionAt), fiscalIssueDate: dateOnly(row.fiscalIssueDate),
    currencyCode: row.currencyCode, exchangeRate: decimal(row.exchangeRate),
    officialExchangeRateObservation: row.officialExchangeRateObservation ? {
      id: row.officialExchangeRateObservation.id, countryCode: row.officialExchangeRateObservation.countryCode,
      foreignCurrencyCode: row.officialExchangeRateObservation.foreignCurrencyCode, localCurrencyCode: row.officialExchangeRateObservation.localCurrencyCode,
      rateType: row.officialExchangeRateObservation.rateType, effectiveDate: dateOnly(row.officialExchangeRateObservation.effectiveDate)!,
      value: decimal(row.officialExchangeRateObservation.value)!, sourceAuthority: row.officialExchangeRateObservation.sourceAuthority,
      sourceIndicatorCode: row.officialExchangeRateObservation.sourceIndicatorCode, requestIdentity: row.officialExchangeRateObservation.requestIdentity,
      responseHash: row.officialExchangeRateObservation.responseHash,
    } : null,
    paymentConditionCode: row.paymentConditionCode, creditTermDays: row.creditTermDays,
    totals: {
      grossSubtotal: decimal(row.grossSubtotal)!, discountTotal: decimal(row.discountTotal)!,
      taxableTotal: decimal(row.taxableTotal)!, exemptTotal: decimal(row.exemptTotal)!,
      exoneratedTotal: decimal(row.exoneratedTotal)!, grossTaxTotal: decimal(row.grossTaxTotal)!,
      exoneratedTaxTotal: decimal(row.exoneratedTaxTotal)!, netTaxTotal: decimal(row.netTaxTotal)!, total: decimal(row.total)!,
    },
    receiver: { name: row.receiverName, identificationType: row.receiverIdentificationType, identification: row.receiverIdentification,
      economicActivityCode: row.receiverEconomicActivityCode, email: row.receiverEmail, phone: row.receiverPhone,
      address: address(row.receiverAddressSnapshot) },
    paymentMethods: row.paymentMethods.map(x => ({ paymentMethodOrder: x.paymentMethodOrder, paymentMethodCode: x.paymentMethodCode,
      description: x.description, declaredAmount: decimal(x.declaredAmount) })),
    lines: row.lines.map(line => ({ lineNumber: line.lineNumber, cabysCode: line.cabysCode, itemCode: line.itemCode,
      description: line.description, quantity: decimal(line.quantity)!, unitOfMeasureCode: line.unitOfMeasureCode,
      unitPrice: decimal(line.unitPrice)!, grossAmount: decimal(line.grossAmount)!, discountAmount: decimal(line.discountAmount)!,
      discountCode: line.discountCode, discountReason: line.discountReason, taxableBase: decimal(line.taxableBase)!,
      taxAmount: decimal(line.taxAmount)!, exoneratedTaxAmount: decimal(line.exoneratedTaxAmount)!, netTaxAmount: decimal(line.netTaxAmount)!,
      lineSubtotal: decimal(line.lineSubtotal)!, lineTotal: decimal(line.lineTotal)!, taxes: line.taxes.map(tax => ({
        taxOrder: tax.taxOrder, taxCode: tax.taxCode, rateCode: tax.rateCode, ratePercentage: decimal(tax.ratePercentage)!,
        taxableBase: decimal(tax.taxableBase)!, taxAmount: decimal(tax.taxAmount)!, calculationFactor: decimal(tax.calculationFactor),
        netTaxAmount: decimal(tax.netTaxAmount)!, exemption: tax.exemption ? {
          documentTypeCode: tax.exemption.documentTypeCode, documentNumber: tax.exemption.documentNumber,
          legalArticle: tax.exemption.legalArticle, legalSection: tax.exemption.legalSection,
          issuingInstitutionCode: tax.exemption.issuingInstitutionCode, issuingInstitutionName: tax.exemption.issuingInstitutionName,
          otherInstitutionDescription: tax.exemption.otherInstitutionDescription, issueDate: dateOnly(tax.exemption.issueDate)!,
          exemptedPercentage: decimal(tax.exemption.exemptedPercentage)!, exemptedAmount: decimal(tax.exemption.exemptedAmount)!,
        } : null,
      })) })),
  };
}

function verifyOfficialSnapshot(row: SubmissionRow) {
  const observation = row.officialExchangeRateObservation;
  if (row.currencyCode === "CRC") {
    if (row.exchangeRate !== null || observation !== null || row.officialExchangeRateObservationId !== null || row.fiscalExchangeRateEffectiveDate !== null || row.fiscalExchangeRateSourceAuthority !== null || row.fiscalExchangeRateIndicatorCode !== null) invalidSnapshot();
    return;
  }
  if (row.currencyCode !== "USD" || !observation || row.officialExchangeRateObservationId !== observation.id ||
    dateOnly(row.fiscalExchangeRateEffectiveDate) !== dateOnly(observation.effectiveDate) ||
    row.fiscalExchangeRateSourceAuthority !== observation.sourceAuthority || row.fiscalExchangeRateIndicatorCode !== observation.sourceIndicatorCode) invalidSnapshot();
}
function decimal(value: { toFixed(): string } | null): string | null { if (value === null) return null; const result=value.toFixed(); if (!/^(0|[1-9]\d*)(?:\.\d+)?$/.test(result)) invalidSnapshot(); return result; }
function dateOnly(value: Date | null): string | null { if (!value || !Number.isFinite(value.getTime())) return null; return `${value.getUTCFullYear().toString().padStart(4,"0")}-${(value.getUTCMonth()+1).toString().padStart(2,"0")}-${value.getUTCDate().toString().padStart(2,"0")}`; }
function exactDate(value: Date | null): Date | null { return value && Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null; }
function address(value: Prisma.JsonValue | null): NonNullable<FacturaEnCrSubmissionAggregate["receiver"]>["address"] { if (value === null) return null; if (typeof value !== "object" || Array.isArray(value)) invalidSnapshot(); return { ...value } as NonNullable<FacturaEnCrSubmissionAggregate["receiver"]>["address"]; }
function invalidSnapshot(): never { throw new Error("invalid persisted fiscal snapshot"); }
