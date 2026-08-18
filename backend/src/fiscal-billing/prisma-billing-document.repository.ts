import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { BillingDocumentRepository } from "./billing-document.repository";
import type {
  BillingDocumentDraftCommand,
  PrimaryDocumentSummary,
} from "./billing-document.types";

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
