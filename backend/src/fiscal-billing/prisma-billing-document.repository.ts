import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { BillingDocumentRepository } from "./billing-document.repository";
import type {
  BillingDocumentDraftCommand,
  BillingDocumentFiscalPreparation,
  BillingDocumentFiscalAllocationResult,
  BillingDocumentIssuancePreflight,
  BillingDocumentWorkspace,
  PrimaryDocumentSummary,
} from "./billing-document.types";
import { fiscalBillingError } from "./fiscal-billing.errors";
import { normalizeAndValidateIssuerIdentification } from "./fiscal-issuer-identification";
import { CR_DOCUMENT_TYPES } from "./fiscal-billing.constants";
import {
  buildRequestIdentity,
  buildResponseHash,
} from "../official-exchange-rates/official-exchange-rate.resolver";
import { costaRicaDate } from "./fiscal-emission-time";

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
const workspaceSelect=Prisma.validator<Prisma.BillingDocumentSelect>()({
  id:true,billingMode:true,internalNumber:true,documentTypeCode:true,sourceType:true,sourceId:true,sourceNumber:true,sourceRole:true,
  schemaVersion:true,countryCode:true,currencyCode:true,exchangeRate:true,fiscalEmissionAt:true,fiscalIssueDate:true,dueDate:true,
  confirmedAt:true,submittedAt:true,issuedAt:true,createdAt:true,updatedAt:true,paymentConditionCode:true,creditTermDays:true,
  lifecycleStatus:true,providerStatus:true,taxAuthorityStatus:true,artifactStatus:true,fiscalNumber:true,allocatedSequenceNumber:true,
  haciendaKey:true,haciendaRejectionDetail:true,providerEnvironment:true,providerDocumentId:true,providerLastErrorCode:true,providerLastErrorAt:true,
  issuerName:true,issuerIdentificationType:true,issuerIdentification:true,issuerEconomicActivityCode:true,issuerEstablishmentCode:true,
  issuerTerminalCode:true,issuerEmail:true,issuerPhone:true,issuerAddressSnapshot:true,receiverName:true,receiverIdentificationType:true,
  receiverIdentification:true,receiverEconomicActivityCode:true,receiverEmail:true,receiverPhone:true,receiverAddressSnapshot:true,
  grossSubtotal:true,discountTotal:true,taxableTotal:true,exemptTotal:true,exoneratedTotal:true,grossTaxTotal:true,
  exoneratedTaxTotal:true,netTaxTotal:true,total:true,
  paymentMethods:{orderBy:{paymentMethodOrder:"asc"},select:{id:true,paymentMethodOrder:true,paymentMethodCode:true,description:true,declaredAmount:true}},
  references:{orderBy:{referenceOrder:"asc"},select:{id:true,referenceOrder:true,referencedBillingDocumentId:true,externalDocumentKey:true,externalDocumentNumber:true,referencedDocumentTypeCode:true,reasonCode:true,reasonDescription:true,referenceDate:true}},
  lines:{orderBy:{lineNumber:"asc"},select:{id:true,lineNumber:true,cabysCode:true,itemCode:true,description:true,quantity:true,unitOfMeasureCode:true,unitPrice:true,grossAmount:true,discountAmount:true,discountCode:true,discountReason:true,taxableBase:true,taxAmount:true,exoneratedTaxAmount:true,netTaxAmount:true,lineSubtotal:true,lineTotal:true,
    taxes:{orderBy:{taxOrder:"asc"},select:{id:true,taxOrder:true,taxCode:true,rateCode:true,ratePercentage:true,taxableBase:true,taxAmount:true,calculationFactor:true,netTaxAmount:true,
      exemption:{select:{id:true,documentTypeCode:true,documentNumber:true,legalArticle:true,legalSection:true,issuingInstitutionCode:true,issuingInstitutionName:true,otherInstitutionDescription:true,issueDate:true,exemptedPercentage:true,exemptedAmount:true}}}}}}
});
type WorkspaceRow=Prisma.BillingDocumentGetPayload<{select:typeof workspaceSelect}>;

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

  async findIssuancePreflight(
    tenantId: string,
    billingDocumentId: string,
  ): Promise<BillingDocumentIssuancePreflight | null> {
    const document = await this.prisma.billingDocument.findUnique({
      where: { id_tenantId: { id: billingDocumentId, tenantId } },
      select: {
        id: true,
        billingMode: true,
        lifecycleStatus: true,
        providerStatus: true,
        taxAuthorityStatus: true,
        currencyCode: true,
        fiscalNumber: true,
        providerDocumentId: true,
        billingDocumentNumberSequenceId: true,
        allocatedSequenceNumber: true,
        issuanceIdempotencyKey: true,
        fiscalEmissionAt: true,
        fiscalIssueDate: true,
        exchangeRate: true,
        officialExchangeRateObservationId: true,
        fiscalExchangeRateEffectiveDate: true,
        fiscalExchangeRateSourceAuthority: true,
        fiscalExchangeRateIndicatorCode: true,
      },
    });
    return document
      ? {
          ...document,
          exchangeRate:
            document.exchangeRate === null
              ? null
              : document.exchangeRate.toFixed(),
        }
      : null;
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
      const data = {
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
        exchangeRate: null,
        issuedAt: null,
        paymentConditionCode: command.paymentConditionCode,
        creditTermDays: command.creditTermDays,
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
        paymentMethods: {
          create: command.paymentMethods.map((method) => ({
            paymentMethodOrder: method.paymentMethodOrder,
            paymentMethodCode: method.paymentMethodCode,
            description: method.description,
            declaredAmount: method.declaredAmount,
          })),
        },
      } satisfies Prisma.BillingDocumentUncheckedCreateInput;
      return tx.billingDocument.create({
        data,
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
    preparation: BillingDocumentFiscalPreparation | null,
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
        const fiscalSnapshot = await this.verifyFiscalPreparation(
          tx,
          document,
          preparation,
        );
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
        const confirmedAt = fiscalSnapshot.fiscalEmissionAt;

        let updated;
        try {
          updated = await tx.billingDocument.update({
            where: { id_tenantId: { id: billingDocumentId, tenantId } },
            data: {
              fiscalEmissionAt: fiscalSnapshot.fiscalEmissionAt,
              fiscalIssueDate: fiscalSnapshot.fiscalIssueDate,
              exchangeRate: fiscalSnapshot.exchangeRate,
              officialExchangeRateObservationId:
                fiscalSnapshot.officialExchangeRateObservationId,
              fiscalExchangeRateEffectiveDate:
                fiscalSnapshot.fiscalExchangeRateEffectiveDate,
              fiscalExchangeRateSourceAuthority:
                fiscalSnapshot.fiscalExchangeRateSourceAuthority,
              fiscalExchangeRateIndicatorCode:
                fiscalSnapshot.fiscalExchangeRateIndicatorCode,
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

  private async verifyFiscalPreparation(
    tx: Prisma.TransactionClient,
    document: AllocationDocument,
    preparation: BillingDocumentFiscalPreparation | null,
  ) {
    if (
      !preparation ||
      document.currencyCode !== preparation.expectedCurrencyCode ||
      document.fiscalEmissionAt !== null ||
      document.fiscalIssueDate !== null ||
      document.exchangeRate !== null ||
      document.officialExchangeRateObservationId !== null ||
      document.fiscalExchangeRateEffectiveDate !== null ||
      document.fiscalExchangeRateSourceAuthority !== null ||
      document.fiscalExchangeRateIndicatorCode !== null ||
      !isCanonicalDate(preparation.fiscalIssueDate) ||
      costaRicaDate(preparation.fiscalEmissionAt) !== preparation.fiscalIssueDate
    ) {
      throw fiscalBillingError("BILLING_DOCUMENT_FISCAL_EMISSION_CONFLICT");
    }
    const fiscalIssueDate = dateOnlyToUtc(preparation.fiscalIssueDate);
    if (document.currencyCode === "CRC") {
      if (preparation.officialRate !== null) {
        throw fiscalBillingError("BILLING_DOCUMENT_OFFICIAL_RATE_MISMATCH");
      }
      return {
        fiscalEmissionAt: preparation.fiscalEmissionAt,
        fiscalIssueDate,
        exchangeRate: null,
        officialExchangeRateObservationId: null,
        fiscalExchangeRateEffectiveDate: null,
        fiscalExchangeRateSourceAuthority: null,
        fiscalExchangeRateIndicatorCode: null,
      };
    }
    if (document.currencyCode !== "USD") {
      throw fiscalBillingError("BILLING_DOCUMENT_UNSUPPORTED_FISCAL_CURRENCY");
    }
    const rate = preparation.officialRate;
    if (
      !rate ||
      rate.sourceAuthority !== "BCCR" ||
      rate.sourceIndicatorCode !== "318" ||
      rate.effectiveDate !== preparation.fiscalIssueDate ||
      !isCanonicalPositiveDecimal(rate.value)
    ) {
      throw fiscalBillingError("BILLING_DOCUMENT_OFFICIAL_RATE_MISMATCH");
    }
    const observation = await this.loadAndVerifyOfficialObservation(tx, {
      observationId: rate.observationId,
      effectiveDate: preparation.fiscalIssueDate,
      value: rate.value,
      sourceAuthority: rate.sourceAuthority,
      sourceIndicatorCode: rate.sourceIndicatorCode,
    });
    return {
      fiscalEmissionAt: preparation.fiscalEmissionAt,
      fiscalIssueDate,
      exchangeRate: new Prisma.Decimal(rate.value),
      officialExchangeRateObservationId: observation.id,
      fiscalExchangeRateEffectiveDate: fiscalIssueDate,
      fiscalExchangeRateSourceAuthority: observation.sourceAuthority,
      fiscalExchangeRateIndicatorCode: observation.sourceIndicatorCode,
    };
  }

  private async loadAndVerifyOfficialObservation(
    tx: Prisma.TransactionClient,
    expected: {
      observationId: string;
      effectiveDate: string;
      value: string;
      sourceAuthority: string;
      sourceIndicatorCode: string;
    },
  ) {
    const identity = {
      countryCode: "CR",
      foreignCurrencyCode: "USD",
      localCurrencyCode: "CRC",
      rateType: "REFERENCE_SELL" as const,
      effectiveDate: expected.effectiveDate,
      sourceAuthority: "BCCR",
      sourceIndicatorCode: "318",
    };
    const observation = await tx.officialExchangeRateObservation.findUnique({
      where: { id: expected.observationId },
      select: {
        id: true,
        countryCode: true,
        foreignCurrencyCode: true,
        localCurrencyCode: true,
        rateType: true,
        effectiveDate: true,
        value: true,
        sourceAuthority: true,
        sourceIndicatorCode: true,
        requestIdentity: true,
        responseHash: true,
      },
    });
    if (
      !isCanonicalDate(expected.effectiveDate) ||
      !isCanonicalPositiveDecimal(expected.value) ||
      expected.sourceAuthority !== identity.sourceAuthority ||
      expected.sourceIndicatorCode !== identity.sourceIndicatorCode ||
      !observation ||
      observation.countryCode !== identity.countryCode ||
      observation.foreignCurrencyCode !== identity.foreignCurrencyCode ||
      observation.localCurrencyCode !== identity.localCurrencyCode ||
      observation.rateType !== identity.rateType ||
      dateToDateOnly(observation.effectiveDate) !== identity.effectiveDate ||
      observation.sourceAuthority !== identity.sourceAuthority ||
      observation.sourceAuthority !== expected.sourceAuthority ||
      observation.sourceIndicatorCode !== identity.sourceIndicatorCode ||
      observation.sourceIndicatorCode !== expected.sourceIndicatorCode ||
      observation.value.toFixed() !== expected.value ||
      observation.requestIdentity !== buildRequestIdentity(identity) ||
      observation.responseHash !== buildResponseHash(identity, expected.value)
    ) {
      throw fiscalBillingError("BILLING_DOCUMENT_OFFICIAL_RATE_MISMATCH");
    }
    return observation;
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
      !document.issuerTerminalCode ||
      !validExistingFiscalSnapshot(document)
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
    if (document.currencyCode === "USD") {
      await this.loadAndVerifyOfficialObservation(tx, {
        observationId: document.officialExchangeRateObservationId!,
        effectiveDate: dateToDateOnly(document.fiscalIssueDate!),
        value: document.exchangeRate!.toFixed(),
        sourceAuthority: document.fiscalExchangeRateSourceAuthority!,
        sourceIndicatorCode: document.fiscalExchangeRateIndicatorCode!,
      });
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
      !["CRC", "USD"].includes(document.currencyCode) ||
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

  async findWorkspace(tenantId: string, documentId: string):Promise<BillingDocumentWorkspace|null> {
    const document = await this.prisma.billingDocument.findUnique({
      where:{id_tenantId:{id:documentId,tenantId}},select:workspaceSelect,
    }) as WorkspaceRow|null;
    if (!document) return null;
    return {
      id:document.id,billingMode:document.billingMode,internalNumber:document.internalNumber,documentTypeCode:document.documentTypeCode,
      sourceType:document.sourceType,sourceId:document.sourceId,sourceNumber:document.sourceNumber,sourceRole:document.sourceRole,
      schemaVersion:document.schemaVersion,countryCode:document.countryCode,currencyCode:document.currencyCode,exchangeRate:workspaceDecimal(document.exchangeRate),
      fiscalEmissionAt:workspaceTimestamp(document.fiscalEmissionAt),fiscalIssueDate:workspaceDate(document.fiscalIssueDate),dueDate:workspaceDate(document.dueDate),
      confirmedAt:workspaceTimestamp(document.confirmedAt),submittedAt:workspaceTimestamp(document.submittedAt),issuedAt:workspaceTimestamp(document.issuedAt),
      createdAt:requiredWorkspaceTimestamp(document.createdAt),updatedAt:requiredWorkspaceTimestamp(document.updatedAt),paymentConditionCode:document.paymentConditionCode,creditTermDays:document.creditTermDays,
      lifecycleStatus:document.lifecycleStatus,providerStatus:document.providerStatus,taxAuthorityStatus:document.taxAuthorityStatus,artifactStatus:document.artifactStatus,
      fiscalNumber:document.fiscalNumber,allocatedSequenceNumber:document.allocatedSequenceNumber===null?null:document.allocatedSequenceNumber.toString(),haciendaKey:document.haciendaKey,
      haciendaRejectionDetail:document.haciendaRejectionDetail,providerEnvironment:document.providerEnvironment,providerDocumentId:document.providerDocumentId,
      providerLastErrorCode:document.providerLastErrorCode,providerLastErrorAt:workspaceTimestamp(document.providerLastErrorAt),
      issuerName:document.issuerName,issuerIdentificationType:document.issuerIdentificationType,issuerIdentification:document.issuerIdentification,
      issuerEconomicActivityCode:document.issuerEconomicActivityCode,issuerEstablishmentCode:document.issuerEstablishmentCode,issuerTerminalCode:document.issuerTerminalCode,
      issuerEmail:document.issuerEmail,issuerPhone:document.issuerPhone,issuerAddressSnapshot:document.issuerAddressSnapshot,
      receiverName:document.receiverName,receiverIdentificationType:document.receiverIdentificationType,receiverIdentification:document.receiverIdentification,
      receiverEconomicActivityCode:document.receiverEconomicActivityCode,receiverEmail:document.receiverEmail,receiverPhone:document.receiverPhone,receiverAddressSnapshot:document.receiverAddressSnapshot,
      grossSubtotal:requiredWorkspaceDecimal(document.grossSubtotal),discountTotal:requiredWorkspaceDecimal(document.discountTotal),taxableTotal:requiredWorkspaceDecimal(document.taxableTotal),
      exemptTotal:requiredWorkspaceDecimal(document.exemptTotal),exoneratedTotal:requiredWorkspaceDecimal(document.exoneratedTotal),grossTaxTotal:requiredWorkspaceDecimal(document.grossTaxTotal),
      exoneratedTaxTotal:requiredWorkspaceDecimal(document.exoneratedTaxTotal),netTaxTotal:requiredWorkspaceDecimal(document.netTaxTotal),total:requiredWorkspaceDecimal(document.total),
      paymentMethods:document.paymentMethods.map(method=>({id:method.id,paymentMethodOrder:method.paymentMethodOrder,paymentMethodCode:method.paymentMethodCode,description:method.description,declaredAmount:workspaceDecimal(method.declaredAmount)})),
      references:document.references.map(reference=>({id:reference.id,referenceOrder:reference.referenceOrder,referencedBillingDocumentId:reference.referencedBillingDocumentId,externalDocumentKey:reference.externalDocumentKey,externalDocumentNumber:reference.externalDocumentNumber,referencedDocumentTypeCode:reference.referencedDocumentTypeCode,reasonCode:reference.reasonCode,reasonDescription:reference.reasonDescription,referenceDate:requiredWorkspaceDate(reference.referenceDate)})),
      lines:document.lines.map(line=>({id:line.id,lineNumber:line.lineNumber,cabysCode:line.cabysCode,itemCode:line.itemCode,description:line.description,quantity:requiredWorkspaceDecimal(line.quantity),unitOfMeasureCode:line.unitOfMeasureCode,unitPrice:requiredWorkspaceDecimal(line.unitPrice),grossAmount:requiredWorkspaceDecimal(line.grossAmount),discountAmount:requiredWorkspaceDecimal(line.discountAmount),discountCode:line.discountCode,discountReason:line.discountReason,taxableBase:requiredWorkspaceDecimal(line.taxableBase),taxAmount:requiredWorkspaceDecimal(line.taxAmount),exoneratedTaxAmount:requiredWorkspaceDecimal(line.exoneratedTaxAmount),netTaxAmount:requiredWorkspaceDecimal(line.netTaxAmount),lineSubtotal:requiredWorkspaceDecimal(line.lineSubtotal),lineTotal:requiredWorkspaceDecimal(line.lineTotal),taxes:line.taxes.map(tax=>({id:tax.id,taxOrder:tax.taxOrder,taxCode:tax.taxCode,rateCode:tax.rateCode,ratePercentage:requiredWorkspaceDecimal(tax.ratePercentage),taxableBase:requiredWorkspaceDecimal(tax.taxableBase),taxAmount:requiredWorkspaceDecimal(tax.taxAmount),calculationFactor:workspaceDecimal(tax.calculationFactor),netTaxAmount:requiredWorkspaceDecimal(tax.netTaxAmount),exemption:tax.exemption?{id:tax.exemption.id,documentTypeCode:tax.exemption.documentTypeCode,documentNumber:tax.exemption.documentNumber,legalArticle:tax.exemption.legalArticle,legalSection:tax.exemption.legalSection,issuingInstitutionCode:tax.exemption.issuingInstitutionCode,issuingInstitutionName:tax.exemption.issuingInstitutionName,otherInstitutionDescription:tax.exemption.otherInstitutionDescription,issueDate:requiredWorkspaceDate(tax.exemption.issueDate),exemptedPercentage:requiredWorkspaceDecimal(tax.exemption.exemptedPercentage),exemptedAmount:requiredWorkspaceDecimal(tax.exemption.exemptedAmount)}:null}))})),
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

function workspaceDecimal(value:Prisma.Decimal|null):string|null{return value===null?null:value.toFixed();}
function requiredWorkspaceDecimal(value:Prisma.Decimal):string{return value.toFixed();}
function workspaceTimestamp(value:Date|null):Date|null{return value===null?null:requiredWorkspaceTimestamp(value);}
function requiredWorkspaceTimestamp(value:Date):Date{if(!(value instanceof Date)||!Number.isFinite(value.getTime()))workspaceMappingFailure();return new Date(value.getTime());}
function workspaceDate(value:Date|null):string|null{return value===null?null:requiredWorkspaceDate(value);}
function requiredWorkspaceDate(value:Date):string{if(!(value instanceof Date)||!Number.isFinite(value.getTime()))workspaceMappingFailure();return `${value.getUTCFullYear().toString().padStart(4,"0")}-${(value.getUTCMonth()+1).toString().padStart(2,"0")}-${value.getUTCDate().toString().padStart(2,"0")}`;}
function workspaceMappingFailure():never{throw fiscalBillingError("BILLING_DOCUMENT_SUBMISSION_READ_FAILED");}

function issuanceKey(billingDocumentId: string) {
  return `billing-document:${billingDocumentId}:electronic-issuance:v1`;
}

function outboxKey(billingDocumentId: string) {
  return `billing-document:${billingDocumentId}:electronic-issuance-requested:v1`;
}

function isCanonicalDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3])
  );
}

function dateOnlyToUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateToDateOnly(value: Date): string {
  return [
    value.getUTCFullYear().toString().padStart(4, "0"),
    (value.getUTCMonth() + 1).toString().padStart(2, "0"),
    value.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

function isCanonicalPositiveDecimal(value: string): boolean {
  const match = /^((?:0|[1-9]\d*))(?:\.(\d+))?$/.exec(value);
  if (!match) return false;
  const fraction = match[2] ?? "";
  return (
    !(match[1] === "0" && !fraction.replace(/0+$/, "")) &&
    match[1].length <= 18 &&
    fraction.replace(/0+$/, "").length <= 12
  );
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

function validExistingFiscalSnapshot(document: AllocationDocument): boolean {
  if (!document.fiscalEmissionAt || !document.fiscalIssueDate) return false;
  const issueDate = dateToDateOnly(document.fiscalIssueDate);
  if (costaRicaDate(document.fiscalEmissionAt) !== issueDate) return false;
  if (document.currencyCode === "CRC") {
    return (
      document.exchangeRate === null &&
      document.officialExchangeRateObservationId === null &&
      document.fiscalExchangeRateEffectiveDate === null &&
      document.fiscalExchangeRateSourceAuthority === null &&
      document.fiscalExchangeRateIndicatorCode === null
    );
  }
  if (document.currencyCode !== "USD") return false;
  return (
    document.exchangeRate !== null &&
    document.exchangeRate.gt(0) &&
    document.officialExchangeRateObservationId !== null &&
    document.fiscalExchangeRateEffectiveDate !== null &&
    dateToDateOnly(document.fiscalExchangeRateEffectiveDate) === issueDate &&
    document.fiscalExchangeRateSourceAuthority === "BCCR" &&
    document.fiscalExchangeRateIndicatorCode === "318"
  );
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
