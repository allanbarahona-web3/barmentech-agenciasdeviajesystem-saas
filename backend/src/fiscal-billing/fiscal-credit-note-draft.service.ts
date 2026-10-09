import { HttpException, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreateFiscalCreditNoteDraftDto,
  FiscalCreditNoteLineSelectionDto,
} from "./dto/fiscal-billing.dto";
import {
  CR_V44_DECIMAL_V1,
  calculateCrV44FiscalDocument,
} from "./cr-v44-fiscal-calculation-policy";
import { mapCrV44CalculationToBillingDocumentSnapshot } from "./cr-v44-billing-document-snapshot";
import { fiscalBillingError } from "./fiscal-billing.errors";
import { resolveTaxIncludedGrossCrV44Candidate } from "./tax-included-gross-calculator-input";

const CREDIT_NOTE_DOCUMENT_TYPE = "03";
const CREDITABLE_DOCUMENT_TYPES = new Set(["01", "04"]);
const MAX_DECIMAL = new Prisma.Decimal("99999999999999.99999");

type DraftLine = {
  sourceLineId: string;
  creditBasis: "QUANTITY" | "GROSS_AMOUNT" | "TOTAL_AMOUNT";
  lineNumber: number;
  cabysCode: string | null;
  itemCode: string | null;
  description: string;
  quantity: Prisma.Decimal;
  unitOfMeasureCode: string;
  unitPrice: Prisma.Decimal;
  grossAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  discountCode: string | null;
  discountReason: string | null;
  taxableBase: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  exoneratedTaxAmount: Prisma.Decimal;
  netTaxAmount: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  taxes: Array<{
    taxOrder: number;
    taxCode: string;
    rateCode: string;
    ratePercentage: Prisma.Decimal;
    taxableBase: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    calculationFactor: Prisma.Decimal | null;
    netTaxAmount: Prisma.Decimal;
    exemption: unknown | null;
  }>;
};

type AcceptedCreditUsage = {
  sourceLineId: string;
  creditedQuantity: Prisma.Decimal;
  creditedGrossAmount: Prisma.Decimal;
  creditedLineTotal: Prisma.Decimal;
};

@Injectable()
export class FiscalCreditNoteDraftService {
  private readonly logger = new Logger(FiscalCreditNoteDraftService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createDraft(
    tenantId: string,
    actorId: string,
    input: CreateFiscalCreditNoteDraftDto,
  ) {
    const command = normalizeInput(tenantId, actorId, input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockOriginal(tx, command.tenantId, command.originalBillingDocumentId);
        const original = await tx.billingDocument.findUnique({
          where: {
            id_tenantId: {
              id: command.originalBillingDocumentId,
              tenantId: command.tenantId,
            },
          },
          include: {
            lines: {
              orderBy: [{ lineNumber: "asc" }, { id: "asc" }],
              include: {
                taxes: {
                  orderBy: [{ taxOrder: "asc" }, { id: "asc" }],
                  include: { exemption: true },
                },
              },
            },
            paymentMethods: {
              orderBy: [{ paymentMethodOrder: "asc" }, { id: "asc" }],
            },
          },
        });
        if (!original) throw fiscalBillingError("BILLING_CREDIT_NOTE_ORIGINAL_NOT_FOUND");
        assertCreditableOriginal(original);

        await lockOriginalLines(tx, command.tenantId, original.id);
        await lockAcceptedCreditNotes(tx, command.tenantId, original.id);
        const usage = await acceptedCreditUsage(tx, command.tenantId, original.id);
        const lines = command.fullDocument
          ? original.lines.map((line) => fullLine(line))
          : partialLines(original.lines, command.lines);
        assertCreditCapacity(original.lines, lines, usage);
        const totals = command.fullDocument ? totalsFromOriginal(original) : totalsFor(lines);
        // The parent uses the unchecked create input used by the established
        // fiscal-document repository.  This keeps the tenant scalar on the
        // parent while Prisma propagates the composite tenant/document keys to
        // nested relation creates.
        const draftCreateData: Prisma.BillingDocumentUncheckedCreateInput = {
            tenantId: command.tenantId,
            documentTypeCode: CREDIT_NOTE_DOCUMENT_TYPE,
            billingMode: original.billingMode,
            internalNumber: creditNoteInternalNumber(original.id),
            fiscalNumber: null,
            haciendaKey: null,
            customerId: original.customerId,
            sourceType: "FISCAL_CREDIT_NOTE",
            sourceId: original.id,
            sourceNumber: original.fiscalNumber,
            sourceRole: "PRIMARY",
            creationDeduplicationKey: null,
            fiscalIssuerId: original.fiscalIssuerId,
            schemaVersion: original.schemaVersion,
            fiscalCalculationPolicyVersion: CR_V44_DECIMAL_V1,
            countryCode: original.countryCode,
            currencyCode: original.currencyCode,
            exchangeRate: original.currencyCode === "USD" ? original.exchangeRate : null,
            fiscalEmissionAt: null,
            fiscalIssueDate: null,
            officialExchangeRateObservationId: original.currencyCode === "USD" ? original.officialExchangeRateObservationId : null,
            fiscalExchangeRateEffectiveDate: original.currencyCode === "USD" ? original.fiscalExchangeRateEffectiveDate : null,
            fiscalExchangeRateSourceAuthority: original.currencyCode === "USD" ? original.fiscalExchangeRateSourceAuthority : null,
            fiscalExchangeRateIndicatorCode: original.currencyCode === "USD" ? original.fiscalExchangeRateIndicatorCode : null,
            issuedAt: null,
            paymentConditionCode: original.paymentConditionCode,
            creditTermDays: original.creditTermDays,
            dueDate: null,
            lifecycleStatus: "DRAFT",
            providerStatus: "NOT_SUBMITTED",
            taxAuthorityStatus: "NOT_SUBMITTED",
            artifactStatus: "NOT_GENERATED",
            issuerName: original.issuerName,
            issuerIdentificationType: original.issuerIdentificationType,
            issuerIdentification: original.issuerIdentification,
            issuerEconomicActivityCode: original.issuerEconomicActivityCode,
            issuerEstablishmentCode: original.issuerEstablishmentCode,
            issuerTerminalCode: original.issuerTerminalCode,
            issuerEmail: original.issuerEmail,
            issuerPhone: original.issuerPhone,
            issuerAddressSnapshot: original.issuerAddressSnapshot ?? Prisma.DbNull,
            receiverName: original.receiverName,
            receiverIdentificationType: original.receiverIdentificationType,
            receiverIdentification: original.receiverIdentification,
            receiverEconomicActivityCode: original.receiverEconomicActivityCode,
            receiverEmail: original.receiverEmail,
            receiverPhone: original.receiverPhone,
            receiverAddressSnapshot: original.receiverAddressSnapshot ?? Prisma.DbNull,
            grossSubtotal: totals.grossSubtotal,
            discountTotal: totals.discountTotal,
            taxableTotal: totals.taxableTotal,
            exemptTotal: totals.exemptTotal,
            exoneratedTotal: totals.exoneratedTotal,
            grossTaxTotal: totals.grossTaxTotal,
            exoneratedTaxTotal: totals.exoneratedTaxTotal,
            netTaxTotal: totals.netTaxTotal,
            total: totals.total,
            confirmedAt: null,
            submittedAt: null,
            createdBy: command.actorId,
            references: {
              create: {
                referenceOrder: 1,
                referencedBillingDocumentId: original.id,
                externalDocumentKey: original.haciendaKey,
                externalDocumentNumber: original.fiscalNumber,
                referencedDocumentTypeCode: original.documentTypeCode,
                reasonCode: command.reasonCode,
                reasonDescription: command.reasonDescription,
                referenceDate: original.fiscalIssueDate!,
              },
            },
            paymentMethods: {
              create: original.paymentMethods.map((method) => ({
                paymentMethodOrder: method.paymentMethodOrder,
                paymentMethodCode: method.paymentMethodCode,
                description: method.description,
                declaredAmount: method.declaredAmount,
              })),
            },
            lines: {
              create: lines.map((line) => ({
                lineNumber: line.lineNumber,
                cabysCode: line.cabysCode,
                itemCode: line.itemCode,
                description: line.description,
                quantity: line.quantity,
                unitOfMeasureCode: line.unitOfMeasureCode,
                unitPrice: line.unitPrice,
                grossAmount: line.grossAmount,
                discountAmount: line.discountAmount,
                discountCode: line.discountCode,
                discountReason: line.discountReason,
                taxableBase: line.taxableBase,
                taxAmount: line.taxAmount,
                exoneratedTaxAmount: line.exoneratedTaxAmount,
                netTaxAmount: line.netTaxAmount,
                lineSubtotal: line.lineSubtotal,
                lineTotal: line.lineTotal,
                taxes: {
                  create: line.taxes.map((tax) => ({
                    taxOrder: tax.taxOrder,
                    taxCode: tax.taxCode,
                    rateCode: tax.rateCode,
                    ratePercentage: tax.ratePercentage,
                    taxableBase: tax.taxableBase,
                    taxAmount: tax.taxAmount,
                    calculationFactor: tax.calculationFactor,
                    netTaxAmount: tax.netTaxAmount,
                    ...(tax.exemption
                      ? {
                          exemption: {
                            create: copiedExemption(tax.exemption),
                          },
                        }
                      : {}),
                  })),
                },
              })),
            },
          };
        const draft = await tx.billingDocument.create({
          data: draftCreateData,
          select: {
            id: true,
            internalNumber: true,
            documentTypeCode: true,
            lifecycleStatus: true,
            total: true,
          },
        });

        const persistedLines = await tx.billingDocumentLine.findMany({
          where: { tenantId: command.tenantId, billingDocumentId: draft.id },
          select: { id: true, lineNumber: true },
        });
        const referenceUpdated = await tx.$executeRaw`
          UPDATE "billing_document_references"
          SET "referenceEmissionAt" = ${original.fiscalEmissionAt!}
          WHERE "billingDocumentId" = ${draft.id}
            AND "tenantId" = ${command.tenantId}
            AND "referenceOrder" = 1
        `;
        if (referenceUpdated !== 1) throw fiscalBillingError("BILLING_CREDIT_NOTE_DRAFT_PERSISTENCE_FAILED");
        const persistedByNumber = new Map(persistedLines.map((line) => [line.lineNumber, line.id]));
        for (const line of lines) {
          const persistedId = persistedByNumber.get(line.lineNumber);
          if (!persistedId) throw fiscalBillingError("BILLING_CREDIT_NOTE_DRAFT_PERSISTENCE_FAILED");
          const updated = await tx.$executeRaw`
            UPDATE "billing_document_lines"
            SET "sourceBillingDocumentLineId" = ${line.sourceLineId}
            WHERE "id" = ${persistedId}
              AND "tenantId" = ${command.tenantId}
              AND "billingDocumentId" = ${draft.id}
          `;
          if (updated !== 1) throw fiscalBillingError("BILLING_CREDIT_NOTE_DRAFT_PERSISTENCE_FAILED");
        }

        return {
          billingDocumentId: draft.id,
          internalNumber: draft.internalNumber,
          documentTypeCode: draft.documentTypeCode,
          lifecycleStatus: draft.lifecycleStatus,
          originalBillingDocumentId: original.id,
          total: draft.total.toFixed(),
        };
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logPersistenceFailure(command.tenantId, command.originalBillingDocumentId, error);
      throw fiscalBillingError("BILLING_CREDIT_NOTE_DRAFT_PERSISTENCE_FAILED");
    }
  }

  private logPersistenceFailure(
    tenantId: string,
    originalBillingDocumentId: string,
    error: unknown,
  ): void {
    const details = persistenceErrorDetails(error);
    this.logger.error(
      JSON.stringify({
        operation: "fiscal-credit-note-draft-persistence",
        tenantId,
        originalBillingDocumentId,
        errorName: details.name,
        errorMessage: details.message,
        prismaCode: details.prismaCode,
        prismaMeta: details.prismaMeta,
      }),
      details.stack,
    );
  }
}

function persistenceErrorDetails(error: unknown): {
  name: string;
  message: string;
  stack: string | undefined;
  prismaCode: string | null;
  prismaMeta: Record<string, string | string[]> | null;
} {
  const value = error instanceof Error ? error : null;
  const record = error !== null && typeof error === "object" ? error as {
    code?: unknown;
    meta?: unknown;
  } : null;
  return {
    name: value?.name || "UnknownError",
    message: value?.message || "Unknown persistence error",
    stack: value?.stack,
    prismaCode: typeof record?.code === "string" ? record.code : null,
    prismaMeta: safePrismaMeta(record?.meta),
  };
}

function safePrismaMeta(value: unknown): Record<string, string | string[]> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const result: Record<string, string | string[]> = {};
  for (const key of ["target", "constraint", "field_name", "modelName", "code"]) {
    const candidate = source[key];
    if (typeof candidate === "string") result[key] = candidate;
    else if (Array.isArray(candidate) && candidate.every((item) => typeof item === "string")) result[key] = candidate;
  }
  return Object.keys(result).length ? result : null;
}

function normalizeInput(tenantId: string, actorId: string, value: CreateFiscalCreditNoteDraftDto) {
  const originalBillingDocumentId = text(value?.originalBillingDocumentId, 191);
  const reasonCode = text(value?.referenceReasonCode, 4);
  const reasonDescription = text(value?.referenceReasonDescription, 500);
  if (!text(tenantId, 191) || !text(actorId, 100) || !originalBillingDocumentId || !reasonCode || !reasonDescription || !/^\d{1,4}$/.test(reasonCode) || typeof value?.fullDocument !== "boolean") {
    throw fiscalBillingError("BILLING_CREDIT_NOTE_INPUT_INVALID");
  }
  const lines = normalizeSelections(value.lines);
  if ((value.fullDocument && lines.length) || (!value.fullDocument && !lines.length)) {
    throw fiscalBillingError("BILLING_CREDIT_NOTE_INPUT_INVALID");
  }
  return { tenantId, actorId, originalBillingDocumentId, reasonCode, reasonDescription, fullDocument: value.fullDocument, lines };
}

type PartialCreditSelection = {
  sourceLineId: string;
  quantity: Prisma.Decimal | null;
  grossAmount: Prisma.Decimal | null;
  totalAmount: Prisma.Decimal | null;
};

function normalizeSelections(value: unknown): PartialCreditSelection[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.length || value.length > 100) throw fiscalBillingError("BILLING_CREDIT_NOTE_INPUT_INVALID");
  const ids = new Set<string>();
  return value.map((raw) => {
    const selection = raw as FiscalCreditNoteLineSelectionDto;
    const sourceLineId = text(selection?.sourceBillingDocumentLineId, 191);
    const quantity = decimal(selection?.creditedQuantity, 4);
    const grossAmount = decimal(selection?.creditedGrossAmount, 5);
    const totalAmount = decimal(selection?.creditedTotalAmount, 5);
    const inputCount = [quantity, grossAmount, totalAmount].filter((amount) => amount !== null).length;
    if (!sourceLineId || ids.has(sourceLineId) || inputCount !== 1) {
      throw fiscalBillingError("BILLING_CREDIT_NOTE_INPUT_INVALID");
    }
    ids.add(sourceLineId);
    return { sourceLineId, quantity, grossAmount, totalAmount };
  });
}

function assertCreditableOriginal(original: any): void {
  if (original.taxAuthorityStatus !== "ACCEPTED") throw fiscalBillingError("BILLING_CREDIT_NOTE_ORIGINAL_NOT_ACCEPTED");
  if (!CREDITABLE_DOCUMENT_TYPES.has(original.documentTypeCode)) throw fiscalBillingError("BILLING_CREDIT_NOTE_ORIGINAL_TYPE_UNSUPPORTED");
  if (!validText(original.haciendaKey, 50) || !validText(original.fiscalNumber, 50) || !(original.fiscalIssueDate instanceof Date) || !Number.isFinite(original.fiscalIssueDate.getTime()) || !(original.fiscalEmissionAt instanceof Date) || !Number.isFinite(original.fiscalEmissionAt.getTime())) {
    throw fiscalBillingError("BILLING_CREDIT_NOTE_ORIGINAL_FISCAL_IDENTITY_INVALID");
  }
  if (original.fiscalCalculationPolicyVersion !== CR_V44_DECIMAL_V1 || !Array.isArray(original.lines) || !original.lines.length) {
    throw fiscalBillingError("BILLING_CREDIT_NOTE_SOURCE_LINE_UNSUPPORTED");
  }
}

function fullLine(source: any): DraftLine {
  if (!positive(source.quantity) || !positive(source.unitPrice) || !positive(source.grossAmount) || !positive(source.lineTotal) || !Array.isArray(source.taxes) || !source.taxes.length) {
    throw fiscalBillingError("BILLING_CREDIT_NOTE_SOURCE_LINE_UNSUPPORTED");
  }
  return cloneSourceLine(source);
}

function partialLines(sourceLines: any[], selections: PartialCreditSelection[]): DraftLine[] {
  const sourceById = new Map(sourceLines.map((line) => [line.id, line]));
  const result = selections.map((selection) => {
    const source = sourceById.get(selection.sourceLineId);
    if (!source) throw fiscalBillingError("BILLING_CREDIT_NOTE_SOURCE_LINE_INVALID");
    return partialLine(source, selection.quantity, selection.grossAmount, selection.totalAmount);
  });
  return result.sort((left, right) => left.lineNumber - right.lineNumber || left.sourceLineId.localeCompare(right.sourceLineId));
}

function partialLine(
  source: any,
  requestedQuantity: Prisma.Decimal | null,
  requestedGrossAmount: Prisma.Decimal | null,
  requestedTotalAmount: Prisma.Decimal | null,
): DraftLine {
  if (!positive(source.quantity) || !positive(source.unitPrice) || !positive(source.grossAmount) || source.taxes.length !== 1 || source.taxes[0].taxCode !== "01" || source.taxes[0].exemption !== null || !source.cabysCode) {
    throw fiscalBillingError("BILLING_CREDIT_NOTE_SOURCE_LINE_UNSUPPORTED");
  }
  if (requestedGrossAmount !== null) {
    assertMonetarySourceWithoutDiscount(source);
    return calculatedPartialLine(source, "GROSS_AMOUNT", new Prisma.Decimal(1), requestedGrossAmount, new Prisma.Decimal(0));
  }
  if (requestedTotalAmount !== null) {
    assertMonetarySourceWithoutDiscount(source);
    return totalAmountPartialLine(source, requestedTotalAmount);
  }
  const quantity = requestedQuantity!;
  if (!positive(quantity) || quantity.greaterThan(source.quantity)) throw fiscalBillingError("BILLING_CREDIT_NOTE_CREDIT_CAP_EXCEEDED");
  const grossAmount = money(quantity.times(source.unitPrice));
  const discountAmount = source.discountAmount.isZero()
    ? new Prisma.Decimal(0)
    : money(grossAmount.times(source.discountAmount).dividedBy(source.grossAmount));
  return calculatedPartialLine(source, "QUANTITY", quantity, source.unitPrice, discountAmount);
}

function assertMonetarySourceWithoutDiscount(source: any): void {
  if (!source.discountAmount.isZero() || source.discountCode !== null || source.discountReason !== null) {
    throw fiscalBillingError("BILLING_CREDIT_NOTE_SOURCE_LINE_DISCOUNT_UNSUPPORTED");
  }
}

function totalAmountPartialLine(source: any, requestedTotalAmount: Prisma.Decimal): DraftLine {
  const tax = source.taxes[0];
  let candidate: ReturnType<typeof resolveTaxIncludedGrossCrV44Candidate>;
  try {
    candidate = resolveTaxIncludedGrossCrV44Candidate({
      grossAmount: requestedTotalAmount,
      category: "SERVICE",
      quantity: new Prisma.Decimal(1),
      tax: { tariffCode: tax.rateCode, ratePercentage: tax.ratePercentage.toFixed() },
    });
  } catch {
    throw fiscalBillingError("BILLING_CREDIT_NOTE_SOURCE_LINE_UNSUPPORTED");
  }
  if (!candidate.calculatedTotal.equals(requestedTotalAmount)) {
    throw fiscalBillingError("BILLING_CREDIT_NOTE_TOTAL_AMOUNT_UNRECONCILABLE");
  }
  const line = calculatedPartialLine(
    source,
    "TOTAL_AMOUNT",
    new Prisma.Decimal(1),
    new Prisma.Decimal(candidate.unitPrice),
    new Prisma.Decimal(0),
  );
  if (!line.lineTotal.equals(requestedTotalAmount)) {
    throw fiscalBillingError("BILLING_CREDIT_NOTE_TOTAL_AMOUNT_UNRECONCILABLE");
  }
  return line;
}

function calculatedPartialLine(
  source: any,
  creditBasis: DraftLine["creditBasis"],
  quantity: Prisma.Decimal,
  unitPrice: Prisma.Decimal,
  discountAmount: Prisma.Decimal,
): DraftLine {
  const tax = source.taxes[0];
  let calculated: ReturnType<typeof mapCrV44CalculationToBillingDocumentSnapshot>;
  try {
    calculated = mapCrV44CalculationToBillingDocumentSnapshot(
      calculateCrV44FiscalDocument({
        lines: [{
          lineNumber: source.lineNumber,
          category: "SERVICE",
          quantity: quantity.toFixed(),
          unitPrice: unitPrice.toFixed(),
          discounts: discountAmount.isZero() ? [] : [{ order: 1, kind: "EXACT_AMOUNT", amount: discountAmount.toFixed() }],
          taxes: [{ kind: "ORDINARY_IVA", tariffCode: tax.rateCode, ratePercentage: tax.ratePercentage.toFixed() }],
        }],
      }),
      [{ lineNumber: source.lineNumber, cabysCode: source.cabysCode, itemCode: source.itemCode, description: source.description, unitOfMeasureCode: source.unitOfMeasureCode, taxCode: "01" }],
    );
  } catch {
    throw fiscalBillingError("BILLING_CREDIT_NOTE_SOURCE_LINE_UNSUPPORTED");
  }
  const line = calculated.lines[0];
  if (!line || line.taxes.length !== 1 || line.taxes[0].rateCode !== tax.rateCode || line.taxes[0].ratePercentage !== tax.ratePercentage.toFixed()) {
    throw fiscalBillingError("BILLING_CREDIT_NOTE_SOURCE_LINE_UNSUPPORTED");
  }
  return {
    sourceLineId: source.id,
    creditBasis,
    lineNumber: line.lineNumber,
    cabysCode: line.cabysCode,
    itemCode: line.itemCode,
    description: line.description,
    quantity: new Prisma.Decimal(line.quantity),
    unitOfMeasureCode: line.unitOfMeasureCode,
    unitPrice: new Prisma.Decimal(line.unitPrice),
    grossAmount: new Prisma.Decimal(line.grossAmount),
    discountAmount: new Prisma.Decimal(line.discountAmount),
    discountCode: source.discountCode,
    discountReason: source.discountReason,
    taxableBase: new Prisma.Decimal(line.taxableBase),
    taxAmount: new Prisma.Decimal(line.taxAmount),
    exoneratedTaxAmount: new Prisma.Decimal(line.exoneratedTaxAmount),
    netTaxAmount: new Prisma.Decimal(line.netTaxAmount),
    lineSubtotal: new Prisma.Decimal(line.lineSubtotal),
    lineTotal: new Prisma.Decimal(line.lineTotal),
    taxes: line.taxes.map((entry) => ({
      taxOrder: entry.taxOrder,
      taxCode: entry.taxCode,
      rateCode: entry.rateCode,
      ratePercentage: new Prisma.Decimal(entry.ratePercentage),
      taxableBase: new Prisma.Decimal(entry.taxableBase),
      taxAmount: new Prisma.Decimal(entry.taxAmount),
      calculationFactor: entry.calculationFactor === null ? null : new Prisma.Decimal(entry.calculationFactor),
      netTaxAmount: new Prisma.Decimal(entry.netTaxAmount),
      exemption: null,
    })),
  };
}

function cloneSourceLine(source: any): DraftLine {
  return {
    sourceLineId: source.id,
    creditBasis: "QUANTITY",
    lineNumber: source.lineNumber,
    cabysCode: source.cabysCode,
    itemCode: source.itemCode,
    description: source.description,
    quantity: source.quantity,
    unitOfMeasureCode: source.unitOfMeasureCode,
    unitPrice: source.unitPrice,
    grossAmount: source.grossAmount,
    discountAmount: source.discountAmount,
    discountCode: source.discountCode,
    discountReason: source.discountReason,
    taxableBase: source.taxableBase,
    taxAmount: source.taxAmount,
    exoneratedTaxAmount: source.exoneratedTaxAmount,
    netTaxAmount: source.netTaxAmount,
    lineSubtotal: source.lineSubtotal,
    lineTotal: source.lineTotal,
    taxes: source.taxes.map((tax: any) => ({ ...tax })),
  };
}

function copiedExemption(source: any) {
  return {
    documentTypeCode: source.documentTypeCode,
    documentNumber: source.documentNumber,
    legalArticle: source.legalArticle,
    legalSection: source.legalSection,
    issuingInstitutionCode: source.issuingInstitutionCode,
    issuingInstitutionName: source.issuingInstitutionName,
    otherInstitutionDescription: source.otherInstitutionDescription,
    issueDate: source.issueDate,
    exemptedPercentage: source.exemptedPercentage,
    exemptedAmount: source.exemptedAmount,
  };
}

function assertCreditCapacity(sourceLines: any[], draftLines: DraftLine[], usage: AcceptedCreditUsage[]): void {
  const usedByLine = new Map(usage.map((row) => [row.sourceLineId, row]));
  for (const line of draftLines) {
    const source = sourceLines.find((candidate) => candidate.id === line.sourceLineId);
    const used = usedByLine.get(line.sourceLineId);
    if (!source) {
      throw fiscalBillingError("BILLING_CREDIT_NOTE_CREDIT_CAP_EXCEEDED");
    }
    if (line.creditBasis === "GROSS_AMOUNT") {
      const usedGrossAmount = used?.creditedGrossAmount ?? new Prisma.Decimal(0);
      const usedLineTotal = used?.creditedLineTotal ?? new Prisma.Decimal(0);
      if (line.grossAmount.plus(usedGrossAmount).greaterThan(source.grossAmount) || line.lineTotal.plus(usedLineTotal).greaterThan(source.lineTotal)) {
        throw fiscalBillingError("BILLING_CREDIT_NOTE_CREDIT_CAP_EXCEEDED");
      }
      continue;
    }
    if (line.creditBasis === "TOTAL_AMOUNT") {
      const usedLineTotal = used?.creditedLineTotal ?? new Prisma.Decimal(0);
      if (line.lineTotal.plus(usedLineTotal).greaterThan(source.lineTotal)) {
        throw fiscalBillingError("BILLING_CREDIT_NOTE_CREDIT_CAP_EXCEEDED");
      }
      continue;
    }
    const usedQuantity = used?.creditedQuantity ?? new Prisma.Decimal(0);
    if (line.quantity.plus(usedQuantity).greaterThan(source.quantity)) {
      throw fiscalBillingError("BILLING_CREDIT_NOTE_CREDIT_CAP_EXCEEDED");
    }
  }
  const originalTotal = sourceLines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
  const previouslyCredited = usage.reduce((sum, row) => sum.plus(row.creditedLineTotal), new Prisma.Decimal(0));
  const requested = draftLines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
  if (previouslyCredited.plus(requested).greaterThan(originalTotal)) {
    throw fiscalBillingError("BILLING_CREDIT_NOTE_CREDIT_CAP_EXCEEDED");
  }
}

function totalsFor(lines: DraftLine[]) {
  const sum = (field: keyof Pick<DraftLine, "grossAmount" | "discountAmount" | "taxableBase" | "taxAmount" | "exoneratedTaxAmount" | "netTaxAmount" | "lineTotal">) => lines.reduce((total, line) => total.plus(line[field]), new Prisma.Decimal(0));
  const sumByTaxRate = (rateCode: string, field: "taxableBase") => lines
    .filter((line) => line.taxes[0]?.rateCode === rateCode)
    .reduce((total, line) => total.plus(line[field]), new Prisma.Decimal(0));
  return {
    grossSubtotal: sum("grossAmount"),
    discountTotal: sum("discountAmount"),
    taxableTotal: sum("taxableBase").minus(sumByTaxRate("10", "taxableBase")),
    exemptTotal: sumByTaxRate("10", "taxableBase"),
    exoneratedTotal: new Prisma.Decimal(0),
    grossTaxTotal: sum("taxAmount"),
    exoneratedTaxTotal: sum("exoneratedTaxAmount"),
    netTaxTotal: sum("netTaxAmount"),
    total: sum("lineTotal"),
  };
}

function totalsFromOriginal(original: any) {
  return {
    grossSubtotal: original.grossSubtotal,
    discountTotal: original.discountTotal,
    taxableTotal: original.taxableTotal,
    exemptTotal: original.exemptTotal,
    exoneratedTotal: original.exoneratedTotal,
    grossTaxTotal: original.grossTaxTotal,
    exoneratedTaxTotal: original.exoneratedTaxTotal,
    netTaxTotal: original.netTaxTotal,
    total: original.total,
  };
}

async function acceptedCreditUsage(tx: Prisma.TransactionClient, tenantId: string, originalBillingDocumentId: string): Promise<AcceptedCreditUsage[]> {
  return tx.$queryRaw<AcceptedCreditUsage[]>`
    SELECT line."sourceBillingDocumentLineId" AS "sourceLineId",
      SUM(line."quantity") AS "creditedQuantity",
      SUM(line."grossAmount") AS "creditedGrossAmount",
      SUM(line."lineTotal") AS "creditedLineTotal"
    FROM "billing_document_lines" line
    INNER JOIN "billing_documents" credit ON credit."id" = line."billingDocumentId"
      AND credit."tenantId" = line."tenantId"
    INNER JOIN "billing_document_references" reference ON reference."billingDocumentId" = credit."id"
      AND reference."tenantId" = credit."tenantId"
    WHERE line."tenantId" = ${tenantId}
      AND reference."referencedBillingDocumentId" = ${originalBillingDocumentId}
      AND credit."documentTypeCode" = ${CREDIT_NOTE_DOCUMENT_TYPE}
      AND credit."taxAuthorityStatus" = 'ACCEPTED'
      AND line."sourceBillingDocumentLineId" IS NOT NULL
    GROUP BY line."sourceBillingDocumentLineId"
  `;
}

async function lockOriginal(tx: Prisma.TransactionClient, tenantId: string, documentId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "billing_documents" WHERE "id" = ${documentId} AND "tenantId" = ${tenantId} FOR UPDATE`;
}

async function lockOriginalLines(tx: Prisma.TransactionClient, tenantId: string, documentId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "billing_document_lines" WHERE "billingDocumentId" = ${documentId} AND "tenantId" = ${tenantId} ORDER BY "id" ASC FOR UPDATE`;
}

async function lockAcceptedCreditNotes(tx: Prisma.TransactionClient, tenantId: string, documentId: string): Promise<void> {
  await tx.$queryRaw`SELECT credit."id" FROM "billing_document_references" reference INNER JOIN "billing_documents" credit ON credit."id" = reference."billingDocumentId" AND credit."tenantId" = reference."tenantId" WHERE reference."tenantId" = ${tenantId} AND reference."referencedBillingDocumentId" = ${documentId} AND credit."documentTypeCode" = ${CREDIT_NOTE_DOCUMENT_TYPE} AND credit."taxAuthorityStatus" = 'ACCEPTED' ORDER BY credit."id" ASC FOR UPDATE`;
}

function money(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(5, Prisma.Decimal.ROUND_HALF_UP);
}

function decimal(value: unknown, maxScale: number): Prisma.Decimal | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) throw fiscalBillingError("BILLING_CREDIT_NOTE_INPUT_INVALID");
  const parsed = new Prisma.Decimal(value);
  if (!positive(parsed) || parsed.decimalPlaces() > maxScale) throw fiscalBillingError("BILLING_CREDIT_NOTE_INPUT_INVALID");
  return parsed;
}

function positive(value: unknown): value is Prisma.Decimal {
  return value instanceof Prisma.Decimal && value.isFinite() && value.greaterThan(0) && value.lessThanOrEqualTo(MAX_DECIMAL);
}

function text(value: unknown, maximum: number): string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximum ? value.trim() : "";
}

function validText(value: unknown, maximum: number): value is string {
  return text(value, maximum).length > 0;
}

function creditNoteInternalNumber(originalBillingDocumentId: string): string {
  return `BD-NC-${originalBillingDocumentId.slice(0, 20)}-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}
