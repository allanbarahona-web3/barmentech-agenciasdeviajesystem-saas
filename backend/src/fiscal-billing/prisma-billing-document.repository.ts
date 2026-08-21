import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { BillingDocumentRepository } from "./billing-document.repository";
import type {
  BillingDocumentDraftCommand,
  BillingDocumentFiscalAllocationResult,
  PrimaryDocumentSummary,
} from "./billing-document.types";
import { fiscalBillingError } from "./fiscal-billing.errors";
import { normalizeAndValidateIssuerIdentification } from "./fiscal-issuer-identification";
import { CR_DOCUMENT_TYPES } from "./fiscal-billing.constants";

const MAX_SEQUENCE_NUMBER = 9_999_999_999n;
const SUPPORTED_DOCUMENT_TYPES = new Set<string>([
  CR_DOCUMENT_TYPES.ELECTRONIC_INVOICE,
  CR_DOCUMENT_TYPES.ELECTRONIC_TICKET,
]);
const ISSUANCE_EVENT_TYPE = "billing-document.electronic-issuance-requested";
const ISSUANCE_EVENT_VERSION = 1;
const BILLING_DOCUMENT_AGGREGATE = "BillingDocument";
type AllocationDocument = Prisma.BillingDocumentGetPayload<{
  include: { lines: { include: { taxes: true } } };
}>;

@Injectable()
export class PrismaBillingDocumentRepository
  implements BillingDocumentRepository
{
  constructor(private readonly prisma: PrismaService) {}

  findPrimaryDocument(
    tenantId: string,
    sourceType: string,
    sourceId: string,
  ): Promise<PrimaryDocumentSummary | null> {
    return this.prisma.billingDocument.findFirst({
      where: { tenantId, sourceType, sourceId, sourceRole: "PRIMARY" },
      select: {
        id: true,
        internalNumber: true,
        lifecycleStatus: true,
        documentTypeCode: true,
      },
    });
  }

  createDraft(
    command: BillingDocumentDraftCommand,
  ): Promise<PrimaryDocumentSummary> {
    return this.prisma.$transaction(async (tx) => {
      if (command.source?.sourceRole === "PRIMARY") {
        const existing = await tx.billingDocument.findFirst({
          where: {
            tenantId: command.tenantId,
            sourceType: command.source.sourceType,
            sourceId: command.source.sourceId,
            sourceRole: "PRIMARY",
          },
          select: {
            id: true,
            internalNumber: true,
            lifecycleStatus: true,
            documentTypeCode: true,
          },
        });
        if (existing) return existing;
      }

      const source = command.source;
      return tx.billingDocument.create({
        data: {
          tenantId: command.tenantId,
          fiscalIssuerId: command.fiscalIssuerId,
          documentTypeCode: command.documentTypeCode,
          billingMode: command.billingMode,
          internalNumber: command.internalNumber,
          fiscalNumber: null,
          haciendaKey: null,
          sourceType: source?.sourceType ?? null,
          sourceId: source?.sourceId ?? null,
          sourceNumber: source?.sourceNumber ?? null,
          sourceRole: source?.sourceRole ?? "PRIMARY",
          creationDeduplicationKey:
            source?.creationDeduplicationKey ?? null,
          schemaVersion: command.schemaVersion,
          countryCode: command.countryCode,
          currencyCode: command.currencyCode,
          exchangeRate:
            command.exchangeRate === null
              ? null
              : new Prisma.Decimal(command.exchangeRate),
          issuedAt: null,
          paymentConditionCode: null,
          creditTermDays: null,
          dueDate: null,
          lifecycleStatus: "DRAFT",
          providerStatus: "NOT_SUBMITTED",
          taxAuthorityStatus: "NOT_SUBMITTED",
          artifactStatus: "NOT_GENERATED",
          issuerName: command.issuer.name,
          issuerIdentificationType: command.issuer.identificationType,
          issuerIdentification: command.issuer.identification,
          issuerEconomicActivityCode: command.issuer.economicActivityCode,
          issuerEstablishmentCode: command.issuer.establishmentCode,
          issuerTerminalCode: command.issuer.terminalCode,
          issuerEmail: command.issuer.email,
          issuerPhone: command.issuer.phone,
          issuerAddressSnapshot: command.issuer.address
            ? (command.issuer.address as Prisma.InputJsonValue)
            : Prisma.DbNull,
          receiverName: command.receiver.name,
          receiverIdentificationType: command.receiver.identificationType,
          receiverIdentification: command.receiver.identification,
          receiverEconomicActivityCode: command.receiver.economicActivityCode,
          receiverEmail: command.receiver.email,
          receiverPhone: command.receiver.phone,
          receiverAddressSnapshot: command.receiver.address
            ? (command.receiver.address as Prisma.InputJsonValue)
            : Prisma.DbNull,
          grossSubtotal: new Prisma.Decimal(command.totals.grossSubtotal),
          discountTotal: new Prisma.Decimal(command.totals.discountTotal),
          taxableTotal: new Prisma.Decimal(command.totals.taxableTotal),
          exemptTotal: new Prisma.Decimal(command.totals.exemptTotal),
          exoneratedTotal: new Prisma.Decimal(command.totals.exoneratedTotal),
          grossTaxTotal: new Prisma.Decimal(command.totals.grossTaxTotal),
          exoneratedTaxTotal: new Prisma.Decimal(
            command.totals.exoneratedTaxTotal,
          ),
          netTaxTotal: new Prisma.Decimal(command.totals.netTaxTotal),
          total: new Prisma.Decimal(command.totals.total),
          confirmedAt: null,
          submittedAt: null,
          createdBy: command.createdByUserId,
          lines: {
            create: command.lines.map((line) => ({
              tenantId: command.tenantId,
              lineNumber: line.lineNumber,
              cabysCode: line.cabysCode,
              itemCode: line.itemCode,
              description: line.description,
              quantity: new Prisma.Decimal(line.quantity),
              unitOfMeasureCode: line.unitOfMeasureCode,
              unitPrice: new Prisma.Decimal(line.unitPrice),
              grossAmount: new Prisma.Decimal(line.grossAmount),
              discountAmount: new Prisma.Decimal(line.discountAmount),
              discountCode: line.discountCode,
              discountReason: line.discountReason,
              taxableBase: new Prisma.Decimal(line.taxableBase),
              taxAmount: new Prisma.Decimal(line.taxAmount),
              exoneratedTaxAmount: new Prisma.Decimal(
                line.exoneratedTaxAmount,
              ),
              netTaxAmount: new Prisma.Decimal(line.netTaxAmount),
              lineSubtotal: new Prisma.Decimal(line.lineSubtotal),
              lineTotal: new Prisma.Decimal(line.lineTotal),
              taxes: {
                create: line.taxes.map((tax) => ({
                  tenantId: command.tenantId,
                  taxOrder: tax.taxOrder,
                  taxCode: tax.taxCode,
                  rateCode: tax.rateCode,
                  ratePercentage: new Prisma.Decimal(tax.ratePercentage),
                  taxableBase: new Prisma.Decimal(tax.taxableBase),
                  taxAmount: new Prisma.Decimal(tax.taxAmount),
                  calculationFactor:
                    tax.calculationFactor === null
                      ? null
                      : new Prisma.Decimal(tax.calculationFactor),
                  netTaxAmount: new Prisma.Decimal(tax.netTaxAmount),
                })),
              },
            })),
          },
        },
        select: {
          id: true,
          internalNumber: true,
          lifecycleStatus: true,
          documentTypeCode: true,
        },
      });
    });
  }

  async requestElectronicIssuance(
    tenantId: string,
    billingDocumentId: string,
    actorUserId: string,
  ): Promise<BillingDocumentFiscalAllocationResult> {
    if (
      !tenantId ||
      !billingDocumentId ||
      !actorUserId ||
      actorUserId.length > 100
    ) {
      throw fiscalBillingError(
        "BILLING_DOCUMENT_NOT_ELIGIBLE_FOR_ISSUANCE",
      );
    }
    const issuanceIdempotencyKey = issuanceKey(billingDocumentId);
    const outboxDeduplicationKey = outboxKey(billingDocumentId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "billing_documents"
          WHERE "id" = ${billingDocumentId} AND "tenantId" = ${tenantId}
          FOR UPDATE
        `;
        if (!locked.length) {
          throw fiscalBillingError("BILLING_DOCUMENT_NOT_FOUND");
        }

        const document = await tx.billingDocument.findUnique({
          where: { id_tenantId: { id: billingDocumentId, tenantId } },
          include: {
            lines: {
              orderBy: { lineNumber: "asc" },
              include: { taxes: { orderBy: { taxOrder: "asc" } } },
            },
          },
        });
        if (!document) {
          throw fiscalBillingError("BILLING_DOCUMENT_NOT_FOUND");
        }

        const bundle = allocationBundleState(document);
        if (bundle === "PARTIAL") {
          throw fiscalBillingError("BILLING_DOCUMENT_ALLOCATION_STATE_CONFLICT");
        }
        if (bundle === "COMPLETE") {
          return this.readExistingAllocation(
            tx,
            document,
            issuanceIdempotencyKey,
            outboxDeduplicationKey,
          );
        }

        this.requireEligibleDraft(document);
        await this.requireFinalReadiness(tx, document);

        const sequence = await tx.billingDocumentNumberSequence.findUnique({
          where: {
            tenantId_fiscalIssuerId_establishmentCode_terminalCode_documentTypeCode:
              {
                tenantId,
                fiscalIssuerId: document.fiscalIssuerId!,
                establishmentCode: document.issuerEstablishmentCode!,
                terminalCode: document.issuerTerminalCode!,
                documentTypeCode: document.documentTypeCode,
              },
          },
        });
        if (!sequence) {
          throw fiscalBillingError("BILLING_DOCUMENT_SEQUENCE_NOT_CONFIGURED");
        }
        if (
          sequence.nextSequenceNumber < 1n ||
          sequence.nextSequenceNumber > MAX_SEQUENCE_NUMBER
        ) {
          throw fiscalBillingError("BILLING_DOCUMENT_SEQUENCE_EXHAUSTED");
        }

        const advanced = await tx.$queryRaw<
          Array<{ id: string; allocatedSequenceNumber: bigint }>
        >`
          UPDATE "billing_document_number_sequences"
          SET "nextSequenceNumber" = "nextSequenceNumber" + 1,
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${sequence.id}
            AND "tenantId" = ${tenantId}
            AND "fiscalIssuerId" = ${document.fiscalIssuerId!}
            AND "establishmentCode" = ${document.issuerEstablishmentCode!}
            AND "terminalCode" = ${document.issuerTerminalCode!}
            AND "documentTypeCode" = ${document.documentTypeCode}
            AND "nextSequenceNumber" BETWEEN 1 AND 9999999999
          RETURNING "id", "nextSequenceNumber" - 1 AS "allocatedSequenceNumber"
        `;
        const allocation = advanced[0];
        if (!allocation) {
          throw fiscalBillingError("BILLING_DOCUMENT_SEQUENCE_EXHAUSTED");
        }

        const allocatedSequenceNumber = allocation.allocatedSequenceNumber;
        const providerBase = allocatedSequenceNumber.toString().padStart(10, "0");
        const fiscalNumber =
          document.issuerEstablishmentCode! +
          document.issuerTerminalCode! +
          document.documentTypeCode +
          providerBase;
        const confirmedAt = new Date();

        let updated;
        try {
          updated = await tx.billingDocument.update({
            where: { id_tenantId: { id: billingDocumentId, tenantId } },
            data: {
              billingDocumentNumberSequenceId: allocation.id,
              allocatedSequenceNumber,
              fiscalNumber,
              issuanceIdempotencyKey,
              lifecycleStatus: "CONFIRMED",
              confirmedAt,
              providerStatus: "PENDING",
              providerDocumentId: null,
              haciendaKey: null,
              taxAuthorityStatus: "NOT_SUBMITTED",
              issuedAt: null,
            },
            select: { lifecycleStatus: true, providerStatus: true },
          });
        } catch (error) {
          if (isUniqueConstraintViolation(error)) {
            throw fiscalBillingError(
              "BILLING_DOCUMENT_CONCURRENT_ALLOCATION_CONFLICT",
            );
          }
          throw error;
        }

        const outboxInsert = await tx.billingOutboxEvent.createMany({
          data: {
            tenantId,
            eventType: ISSUANCE_EVENT_TYPE,
            eventVersion: ISSUANCE_EVENT_VERSION,
            aggregateType: BILLING_DOCUMENT_AGGREGATE,
            aggregateId: billingDocumentId,
            deduplicationKey: outboxDeduplicationKey,
            payload: {
              tenantId,
              billingDocumentId,
              eventVersion: ISSUANCE_EVENT_VERSION,
            },
            status: "PENDING",
          },
          skipDuplicates: true,
        });
        if (outboxInsert.count !== 1) {
          await tx.billingOutboxEvent.findUnique({
            where: {
              tenantId_deduplicationKey: {
                tenantId,
                deduplicationKey: outboxDeduplicationKey,
              },
            },
            select: { id: true },
          });
          throw fiscalBillingError("BILLING_DOCUMENT_OUTBOX_CONFLICT");
        }
        const outbox = await tx.billingOutboxEvent.findUnique({
          where: {
            tenantId_deduplicationKey: {
              tenantId,
              deduplicationKey: outboxDeduplicationKey,
            },
          },
          select: { id: true },
        });
        if (!outbox) {
          throw fiscalBillingError("BILLING_DOCUMENT_OUTBOX_CONFLICT");
        }

        return {
          billingDocumentId,
          sequenceId: allocation.id,
          allocatedSequenceNumber: allocatedSequenceNumber.toString(),
          providerBase,
          fiscalNumber,
          issuanceIdempotencyKey,
          outboxEventId: outbox.id,
          outboxDeduplicationKey,
          lifecycleStatus: updated.lifecycleStatus,
          providerStatus: updated.providerStatus,
          newlyAllocated: true,
        };
      });
    } catch (error) {
      if (isSafeFiscalError(error)) throw error;
      throw fiscalBillingError("BILLING_DOCUMENT_CONCURRENT_ALLOCATION_CONFLICT");
    }
  }

  private async readExistingAllocation(
    tx: Prisma.TransactionClient,
    document: AllocationDocument,
    issuanceIdempotencyKey: string,
    outboxDeduplicationKey: string,
  ): Promise<BillingDocumentFiscalAllocationResult> {
    if (
      document.billingMode !== "ELECTRONIC_PROVIDER" ||
      !["CONFIRMED", "SUBMITTED"].includes(document.lifecycleStatus) ||
      !["PENDING", "PROCESSED", "FAILED"].includes(document.providerStatus) ||
      document.issuanceIdempotencyKey !== issuanceIdempotencyKey ||
      document.allocatedSequenceNumber! < 1n ||
      document.allocatedSequenceNumber! > MAX_SEQUENCE_NUMBER ||
      !document.fiscalIssuerId ||
      !document.issuerEstablishmentCode ||
      !document.issuerTerminalCode
    ) {
      throw fiscalBillingError("BILLING_DOCUMENT_ALLOCATION_STATE_CONFLICT");
    }
    const providerBase = document.allocatedSequenceNumber!
      .toString()
      .padStart(10, "0");
    const expectedFiscalNumber =
      document.issuerEstablishmentCode +
      document.issuerTerminalCode +
      document.documentTypeCode +
      providerBase;
    if (document.fiscalNumber !== expectedFiscalNumber) {
      throw fiscalBillingError("BILLING_DOCUMENT_ALLOCATION_STATE_CONFLICT");
    }
    const [sequence, outbox] = await Promise.all([
      tx.billingDocumentNumberSequence.findFirst({
        where: {
          id: document.billingDocumentNumberSequenceId!,
          tenantId: document.tenantId,
          fiscalIssuerId: document.fiscalIssuerId,
          establishmentCode: document.issuerEstablishmentCode,
          terminalCode: document.issuerTerminalCode,
          documentTypeCode: document.documentTypeCode,
        },
        select: { id: true },
      }),
      tx.billingOutboxEvent.findUnique({
        where: {
          tenantId_deduplicationKey: {
            tenantId: document.tenantId,
            deduplicationKey: outboxDeduplicationKey,
          },
        },
        select: {
          id: true,
          eventType: true,
          aggregateType: true,
          aggregateId: true,
        },
      }),
    ]);
    if (!sequence) {
      throw fiscalBillingError("BILLING_DOCUMENT_ALLOCATION_STATE_CONFLICT");
    }
    if (
      !outbox ||
      outbox.eventType !== ISSUANCE_EVENT_TYPE ||
      outbox.aggregateType !== BILLING_DOCUMENT_AGGREGATE ||
      outbox.aggregateId !== document.id
    ) {
      throw fiscalBillingError("BILLING_DOCUMENT_OUTBOX_CONFLICT");
    }
    return {
      billingDocumentId: document.id,
      sequenceId: sequence.id,
      allocatedSequenceNumber: document.allocatedSequenceNumber!.toString(),
      providerBase,
      fiscalNumber: document.fiscalNumber!,
      issuanceIdempotencyKey,
      outboxEventId: outbox.id,
      outboxDeduplicationKey,
      lifecycleStatus: document.lifecycleStatus,
      providerStatus: document.providerStatus,
      newlyAllocated: false,
    };
  }

  private requireEligibleDraft(document: {
    billingMode: string;
    lifecycleStatus: string;
    providerStatus: string;
    taxAuthorityStatus: string;
    fiscalNumber: string | null;
    providerDocumentId: string | null;
  }) {
    if (
      document.billingMode !== "ELECTRONIC_PROVIDER" ||
      document.lifecycleStatus !== "DRAFT" ||
      document.providerStatus !== "NOT_SUBMITTED" ||
      document.taxAuthorityStatus !== "NOT_SUBMITTED" ||
      document.fiscalNumber !== null ||
      document.providerDocumentId !== null
    ) {
      throw fiscalBillingError(
        "BILLING_DOCUMENT_NOT_ELIGIBLE_FOR_ISSUANCE",
      );
    }
  }

  private async requireFinalReadiness(
    tx: Prisma.TransactionClient,
    document: AllocationDocument,
  ) {
    if (!document.fiscalIssuerId) readinessFailure();
    if (
      document.countryCode !== "CR" ||
      document.schemaVersion !== "4.4" ||
      !SUPPORTED_DOCUMENT_TYPES.has(document.documentTypeCode) ||
      !validIssuerIdentification(document) ||
      !/^\d{3}$/.test(document.issuerEstablishmentCode ?? "") ||
      !/^\d{5}$/.test(document.issuerTerminalCode ?? "") ||
      !document.issuerEconomicActivityCode?.trim() ||
      !/^[A-Z]{3}$/.test(document.currencyCode) ||
      (document.currencyCode !== "CRC" &&
        (!document.exchangeRate || document.exchangeRate.lte(0))) ||
      (document.documentTypeCode !== "04" &&
        (!document.receiverName?.trim() ||
          !document.receiverIdentificationType?.trim() ||
          !document.receiverIdentification?.trim())) ||
      !validLinesAndTotals(document)
    ) {
      readinessFailure();
    }

    const [configuration, issuer, activity] = await Promise.all([
      tx.tenantBillingConfiguration.findUnique({
        where: { tenantId: document.tenantId },
        select: {
          billingEnabled: true,
          electronicIssuanceEnabled: true,
          countryCode: true,
          fiscalSchemaVersion: true,
        },
      }),
      tx.fiscalIssuer.findFirst({
        where: { id: document.fiscalIssuerId, tenantId: document.tenantId },
        select: {
          isActive: true,
          countryCode: true,
          establishmentCode: true,
          terminalCode: true,
        },
      }),
      tx.fiscalIssuerEconomicActivity.findFirst({
        where: {
          tenantId: document.tenantId,
          fiscalIssuerId: document.fiscalIssuerId,
          economicActivityCode: document.issuerEconomicActivityCode,
        },
        select: { id: true },
      }),
    ]);
    if (
      !configuration?.billingEnabled ||
      !configuration.electronicIssuanceEnabled ||
      configuration.countryCode !== "CR" ||
      configuration.fiscalSchemaVersion !== "4.4" ||
      !issuer?.isActive ||
      issuer.countryCode !== "CR" ||
      issuer.establishmentCode !== document.issuerEstablishmentCode ||
      issuer.terminalCode !== document.issuerTerminalCode ||
      !activity
    ) {
      readinessFailure();
    }
  }

  async findWorkspace(tenantId: string, documentId: string) {
    const document = await this.prisma.billingDocument.findFirst({
      where: { tenantId, id: documentId },
      include: {
        lines: {
          orderBy: { lineNumber: "asc" },
          include: { taxes: { orderBy: { taxOrder: "asc" } } },
        },
      },
    });
    if (!document) return null;
    const decimal = (value: Prisma.Decimal | null) =>
      value === null ? null : value.toFixed();
    return {
      ...document,
      exchangeRate: decimal(document.exchangeRate),
      grossSubtotal: decimal(document.grossSubtotal),
      discountTotal: decimal(document.discountTotal),
      taxableTotal: decimal(document.taxableTotal),
      exemptTotal: decimal(document.exemptTotal),
      exoneratedTotal: decimal(document.exoneratedTotal),
      grossTaxTotal: decimal(document.grossTaxTotal),
      exoneratedTaxTotal: decimal(document.exoneratedTaxTotal),
      netTaxTotal: decimal(document.netTaxTotal),
      total: decimal(document.total),
      paymentMethods: [],
      references: [],
      lines: document.lines.map((line) => ({
        ...line,
        quantity: decimal(line.quantity),
        unitPrice: decimal(line.unitPrice),
        grossAmount: decimal(line.grossAmount),
        discountAmount: decimal(line.discountAmount),
        taxableBase: decimal(line.taxableBase),
        taxAmount: decimal(line.taxAmount),
        exoneratedTaxAmount: decimal(line.exoneratedTaxAmount),
        netTaxAmount: decimal(line.netTaxAmount),
        lineSubtotal: decimal(line.lineSubtotal),
        lineTotal: decimal(line.lineTotal),
        taxes: line.taxes.map((tax) => ({
          ...tax,
          ratePercentage: decimal(tax.ratePercentage),
          taxableBase: decimal(tax.taxableBase),
          taxAmount: decimal(tax.taxAmount),
          calculationFactor: decimal(tax.calculationFactor),
          netTaxAmount: decimal(tax.netTaxAmount),
        })),
      })),
      readiness: {
        receiverFiscalIdentityMissing:
          !document.receiverIdentificationType ||
          !document.receiverIdentification,
        exchangeRateMissing:
          document.currencyCode !== "CRC" && document.exchangeRate === null,
      },
    };
  }
}

function issuanceKey(billingDocumentId: string) {
  return `billing-document:${billingDocumentId}:electronic-issuance:v1`;
}

function outboxKey(billingDocumentId: string) {
  return `billing-document:${billingDocumentId}:electronic-issuance-requested:v1`;
}

function allocationBundleState(document: {
  billingDocumentNumberSequenceId: string | null;
  allocatedSequenceNumber: bigint | null;
  issuanceIdempotencyKey: string | null;
}) {
  const present = [
    document.billingDocumentNumberSequenceId,
    document.allocatedSequenceNumber,
    document.issuanceIdempotencyKey,
  ].filter((value) => value !== null).length;
  if (present === 0) return "EMPTY" as const;
  if (present === 3) return "COMPLETE" as const;
  return "PARTIAL" as const;
}

function validIssuerIdentification(document: AllocationDocument) {
  try {
    return (
      normalizeAndValidateIssuerIdentification(
        document.countryCode,
        document.issuerIdentificationType,
        document.issuerIdentification,
      ) === document.issuerIdentification
    );
  } catch {
    return false;
  }
}

function validLinesAndTotals(document: AllocationDocument) {
  const totals = [
    document.grossSubtotal,
    document.discountTotal,
    document.taxableTotal,
    document.exemptTotal,
    document.exoneratedTotal,
    document.grossTaxTotal,
    document.exoneratedTaxTotal,
    document.netTaxTotal,
    document.total,
  ];
  if (
    !document.lines.length ||
    totals.some((value) => value.lt(0)) ||
    document.total.lte(0) ||
    !document.grossTaxTotal
      .minus(document.exoneratedTaxTotal)
      .equals(document.netTaxTotal) ||
    !document.grossSubtotal
      .minus(document.discountTotal)
      .plus(document.netTaxTotal)
      .equals(document.total)
  ) {
    return false;
  }

  const lineSubtotal = document.lines.reduce(
    (sum, line) => sum.plus(line.lineSubtotal),
    new Prisma.Decimal(0),
  );
  const lineTotal = document.lines.reduce(
    (sum, line) => sum.plus(line.lineTotal),
    new Prisma.Decimal(0),
  );
  if (
    !lineSubtotal.equals(document.grossSubtotal.minus(document.discountTotal)) ||
    !lineTotal.equals(document.total)
  ) {
    return false;
  }
  return document.lines.every(
    (line) =>
      line.lineNumber > 0 &&
      Boolean(line.description.trim()) &&
      Boolean(line.unitOfMeasureCode.trim()) &&
      line.quantity.gt(0) &&
      line.unitPrice.gte(0) &&
      line.grossAmount.gte(0) &&
      line.discountAmount.gte(0) &&
      line.taxableBase.gte(0) &&
      line.taxAmount.gte(0) &&
      line.exoneratedTaxAmount.gte(0) &&
      line.netTaxAmount.gte(0) &&
      line.lineSubtotal.gte(0) &&
      line.lineTotal.gt(0) &&
      line.grossAmount.minus(line.discountAmount).equals(line.lineSubtotal) &&
      line.lineSubtotal.plus(line.netTaxAmount).equals(line.lineTotal),
  );
}

function readinessFailure(): never {
  throw fiscalBillingError("BILLING_DOCUMENT_FISCAL_READINESS_FAILED");
}

function isUniqueConstraintViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function isSafeFiscalError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: unknown }).response === "object"
  );
}
