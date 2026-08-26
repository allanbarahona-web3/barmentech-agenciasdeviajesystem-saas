import { HttpException, Injectable } from "@nestjs/common";
import { BillingMode, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { BillingDocumentRepository } from "./billing-document.repository";
import type {
  BillingDocumentDraftCommand,
  CrV44SalesOrderDraftCommand,
  BillingDocumentFiscalPreparation,
  BillingDocumentFiscalAllocationResult,
  BillingDocumentIssuancePreflight,
  BillingDocumentWorkspace,
  PrimaryDocumentSummary,
} from "./billing-document.types";
import { fiscalBillingError } from "./fiscal-billing.errors";
import { normalizeAndValidateIssuerIdentification } from "./fiscal-issuer-identification";
import {
  ADDITIONAL_SERVICE_SALES_ORDER_SOURCE_TYPE,
  billingCreationDeduplicationKey,
  CR_DOCUMENT_TYPES,
  ELIGIBLE_SALES_ORDER_STATUS,
  FISCAL_BILLING_SOURCE_TYPE,
} from "./fiscal-billing.constants";
import {
  CR_V44_DECIMAL_V1,
  assertHaciendaCrV44MoneyCapacity,
  calculateCrV44FiscalDocument,
  type CrV44FiscalCalculationResult,
  type CrV44FiscalDocumentInput,
} from "./cr-v44-fiscal-calculation-policy";
import {
  buildRequestIdentity,
  buildResponseHash,
} from "../official-exchange-rates/official-exchange-rate.resolver";
import { costaRicaDate } from "./fiscal-emission-time";
import {
  requireCrDraftDocumentType,
  resolveCrDraftCommercialCondition,
  resolveCrDraftReceiverIdentity,
  validateCrDraftPaymentSnapshots,
} from "./fiscal-draft-selection";
import { validateCrV44CalculatedSnapshot } from "./cr-v44-calculated-snapshot-validator";
import { FiscalCalculationError } from "./fiscal-decimal";

const MAX_SEQUENCE_NUMBER = 9_999_999_999n;
const SUPPORTED_DOCUMENT_TYPES = new Set<string>([
  CR_DOCUMENT_TYPES.ELECTRONIC_INVOICE,
  CR_DOCUMENT_TYPES.ELECTRONIC_TICKET,
]);
const ISSUANCE_EVENT_TYPE = "billing-document.electronic-issuance-requested";
const ISSUANCE_EVENT_VERSION = 1;
const BILLING_DOCUMENT_AGGREGATE = "BillingDocument";
const primaryDocumentSelect = {
  id: true,
  internalNumber: true,
  lifecycleStatus: true,
  documentTypeCode: true,
} as const;
const crV44ConcurrentWinnerSelect =
  Prisma.validator<Prisma.BillingDocumentSelect>()({
    id: true,
    tenantId: true,
    sourceType: true,
    sourceId: true,
    sourceRole: true,
    internalNumber: true,
    documentTypeCode: true,
    fiscalIssuerId: true,
    issuerEstablishmentCode: true,
    issuerTerminalCode: true,
    receiverIdentificationType: true,
    receiverIdentification: true,
    billingMode: true,
    creationDeduplicationKey: true,
    fiscalCalculationPolicyVersion: true,
    lifecycleStatus: true,
    providerStatus: true,
    taxAuthorityStatus: true,
    artifactStatus: true,
    confirmedAt: true,
    submittedAt: true,
    issuedAt: true,
    providerReconciliationRequired: true,
    providerLastErrorCode: true,
    providerLastErrorAt: true,
    billingDocumentNumberSequenceId: true,
    allocatedSequenceNumber: true,
    fiscalNumber: true,
    fiscalEmissionAt: true,
    fiscalIssueDate: true,
    exchangeRate: true,
    officialExchangeRateObservationId: true,
    fiscalExchangeRateEffectiveDate: true,
    fiscalExchangeRateSourceAuthority: true,
    fiscalExchangeRateIndicatorCode: true,
    issuanceIdempotencyKey: true,
    providerRequestHash: true,
    providerLastAttemptAt: true,
    providerDocumentId: true,
    haciendaKey: true,
    providerEnvironment: true,
    haciendaRejectionDetail: true,
    providerStatusCheckAttempts: true,
    providerLastStatusCheckAt: true,
    providerNextStatusCheckAt: true,
    providerStatusCheckLockOwner: true,
    providerStatusCheckLeaseUntil: true,
    providerRefreshAttempts: true,
    providerLastRefreshAt: true,
    providerNextRefreshAt: true,
    providerRefreshLockOwner: true,
    providerRefreshLeaseUntil: true,
    paymentMethods: {
      orderBy: { paymentMethodOrder: "asc" },
      select: { paymentMethodOrder: true, paymentMethodCode: true },
    },
  });
type CrV44ConcurrentWinner = Prisma.BillingDocumentGetPayload<{
  select: typeof crV44ConcurrentWinnerSelect;
}>;
type CrV44ConcurrentWinnerExpectation = {
  tenantId: string;
  sourceId: string;
  internalNumber: string;
  documentTypeCode: string;
  fiscalIssuerId: string;
  issuerEstablishmentCode: string | null;
  issuerTerminalCode: string | null;
  receiverIdentificationType: string | null;
  receiverIdentification: string | null;
  paymentMethods: ReadonlyArray<{ paymentMethodOrder: number; paymentMethodCode: string }>;
  creationDeduplicationKey: string;
};

function isExactPristineCrV44ConcurrentWinner(
  winner: CrV44ConcurrentWinner,
  expected: CrV44ConcurrentWinnerExpectation,
): boolean {
  return (
    winner.tenantId === expected.tenantId &&
    winner.sourceType === FISCAL_BILLING_SOURCE_TYPE &&
    winner.sourceId === expected.sourceId &&
    winner.sourceRole === "PRIMARY" &&
    winner.internalNumber === expected.internalNumber &&
    winner.documentTypeCode === expected.documentTypeCode &&
    winner.fiscalIssuerId === expected.fiscalIssuerId &&
    winner.issuerEstablishmentCode === expected.issuerEstablishmentCode &&
    winner.issuerTerminalCode === expected.issuerTerminalCode &&
    winner.receiverIdentificationType === expected.receiverIdentificationType &&
    winner.receiverIdentification === expected.receiverIdentification &&
    winner.billingMode === BillingMode.ELECTRONIC_PROVIDER &&
    winner.creationDeduplicationKey === expected.creationDeduplicationKey &&
    winner.fiscalCalculationPolicyVersion === CR_V44_DECIMAL_V1 &&
    winner.lifecycleStatus === "DRAFT" &&
    winner.providerStatus === "NOT_SUBMITTED" &&
    winner.taxAuthorityStatus === "NOT_SUBMITTED" &&
    winner.artifactStatus === "NOT_GENERATED" &&
    winner.confirmedAt === null &&
    winner.submittedAt === null &&
    winner.issuedAt === null &&
    winner.providerReconciliationRequired === false &&
    winner.providerLastErrorCode === null &&
    winner.providerLastErrorAt === null &&
    winner.billingDocumentNumberSequenceId === null &&
    winner.allocatedSequenceNumber === null &&
    winner.fiscalNumber === null &&
    winner.fiscalEmissionAt === null &&
    winner.fiscalIssueDate === null &&
    winner.exchangeRate === null &&
    winner.officialExchangeRateObservationId === null &&
    winner.fiscalExchangeRateEffectiveDate === null &&
    winner.fiscalExchangeRateSourceAuthority === null &&
    winner.fiscalExchangeRateIndicatorCode === null &&
    winner.issuanceIdempotencyKey === null &&
    winner.providerRequestHash === null &&
    winner.providerLastAttemptAt === null &&
    winner.providerDocumentId === null &&
    winner.haciendaKey === null &&
    winner.providerEnvironment === null &&
    winner.haciendaRejectionDetail === null &&
    winner.providerStatusCheckAttempts === 0 &&
    winner.providerLastStatusCheckAt === null &&
    winner.providerNextStatusCheckAt === null &&
    winner.providerStatusCheckLockOwner === null &&
    winner.providerStatusCheckLeaseUntil === null &&
    winner.providerRefreshAttempts === 0 &&
    winner.providerLastRefreshAt === null &&
    winner.providerNextRefreshAt === null &&
    winner.providerRefreshLockOwner === null &&
    winner.providerRefreshLeaseUntil === null &&
    exactPaymentMethods(winner.paymentMethods, expected.paymentMethods)
  );
}

function exactPaymentMethods(
  actual: ReadonlyArray<{ paymentMethodOrder: number; paymentMethodCode: string }>,
  expected: ReadonlyArray<{ paymentMethodOrder: number; paymentMethodCode: string }>,
): boolean {
  return (
    actual.length === expected.length &&
    actual.every(
      (method, index) =>
        method.paymentMethodOrder === expected[index]?.paymentMethodOrder &&
        method.paymentMethodCode === expected[index]?.paymentMethodCode,
    )
  );
}
const authoritativeSalesOrderInclude =
  Prisma.validator<Prisma.SalesOrderInclude>()({
    lines: {
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        additionalServiceCatalog: {
          include: { fiscalProfile: true },
        },
      },
    },
  });
type AuthoritativeSalesOrder = Prisma.SalesOrderGetPayload<{
  include: typeof authoritativeSalesOrderInclude;
}>;
type AllocationDocument = Prisma.BillingDocumentGetPayload<{
  include: { lines: { include: { taxes: { include: { exemption: true } } } } };
}>;
const workspaceSelect=Prisma.validator<Prisma.BillingDocumentSelect>()({
  id:true,billingMode:true,internalNumber:true,documentTypeCode:true,sourceType:true,sourceId:true,sourceNumber:true,sourceRole:true,
  schemaVersion:true,fiscalCalculationPolicyVersion:true,countryCode:true,currencyCode:true,exchangeRate:true,fiscalEmissionAt:true,fiscalIssueDate:true,
  officialExchangeRateObservationId:true,fiscalExchangeRateEffectiveDate:true,fiscalExchangeRateSourceAuthority:true,fiscalExchangeRateIndicatorCode:true,dueDate:true,
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
        fiscalCalculationPolicyVersion: true,
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
    requireGenericDraftCreationPath(command);
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

      return tx.billingDocument.create({
        data: billingDocumentCreateData(command, null),
        select: {
          id: true,
          internalNumber: true,
          lifecycleStatus: true,
          documentTypeCode: true,
        },
      });
    });
  }

  async createCrV44SalesOrderDraft(
    request: CrV44SalesOrderDraftCommand,
  ): Promise<PrimaryDocumentSummary> {
    let expectedWinner: CrV44ConcurrentWinnerExpectation | null = null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.billingDocument.findFirst({
          where: {
            tenantId: request.tenantId,
            sourceType: FISCAL_BILLING_SOURCE_TYPE,
            sourceId: request.salesOrderId,
            sourceRole: "PRIMARY",
          },
          select: primaryDocumentSelect,
        });
        if (existing) return existing;

        requireCrDraftDocumentType(request.documentTypeCode);
        const receiverIdentity = resolveCrDraftReceiverIdentity(
          request.documentTypeCode,
          request.receiverIdentificationType,
          request.receiverIdentification,
        );
        const paymentMethods = validateCrDraftPaymentSnapshots(
          request.paymentMethods,
        );

        const salesOrder = await tx.salesOrder.findFirst({
          where: { id: request.salesOrderId, tenantId: request.tenantId },
          include: authoritativeSalesOrderInclude,
        });
        if (!salesOrder) throw fiscalBillingError("SALES_ORDER_NOT_FOUND");
        requireEligibleFiscalSalesOrder(salesOrder);

        const [configuration, issuer] = await Promise.all([
          tx.tenantBillingConfiguration.findUnique({
            where: { tenantId: request.tenantId },
          }),
          tx.fiscalIssuer.findFirst({
            where: {
              id: request.fiscalIssuerId,
              tenantId: request.tenantId,
            },
            include: {
              economicActivities: {
                orderBy: [
                  { displayOrder: "asc" },
                  { economicActivityCode: "asc" },
                ],
              },
            },
          }),
        ]);
        if (!configuration) {
          throw fiscalBillingError("BILLING_CONFIGURATION_NOT_FOUND");
        }
        if (
          !configuration.billingEnabled ||
          !configuration.electronicIssuanceEnabled
        ) {
          throw fiscalBillingError("BILLING_NOT_ENABLED");
        }
        if (
          configuration.countryCode !== "CR" ||
          configuration.fiscalSchemaVersion !== "4.4"
        ) {
          throw fiscalBillingError("BILLING_DRAFT_FISCAL_SOURCE_UNSUPPORTED");
        }
        if (!issuer) throw fiscalBillingError("FISCAL_ISSUER_NOT_FOUND");
        if (!issuer.isActive || issuer.countryCode !== "CR") {
          throw fiscalBillingError("FISCAL_ISSUER_NOT_ACTIVE");
        }
        const primaryActivities = issuer.economicActivities.filter(
          (activity) => activity.isPrimary,
        );
        if (primaryActivities.length !== 1) {
          throw fiscalBillingError(
            "FISCAL_ISSUER_ECONOMIC_ACTIVITY_NOT_CONFIGURED",
          );
        }
        const primaryActivity = primaryActivities[0];

        const { input, metadata } = crV44InputFromSalesOrder(salesOrder);
        await requireActiveFiscalCatalog(tx, metadata);
        let calculation: CrV44FiscalCalculationResult;
        try {
          calculation = calculateCrV44FiscalDocument(input);
        } catch {
          throw fiscalBillingError("BILLING_DRAFT_FISCAL_CALCULATION_FAILED");
        }

        let calculatedSnapshot: ReturnType<typeof mapCrV44Calculation>;
        try {
          calculatedSnapshot = mapCrV44Calculation(calculation, metadata);
        } catch {
          throw fiscalBillingError(
            "BILLING_DRAFT_HACIENDA_MONEY_CAPACITY_EXCEEDED",
          );
        }

        const commercialCondition = resolveCrDraftCommercialCondition(salesOrder);
        const command: BillingDocumentDraftCommand = {
          tenantId: request.tenantId,
          fiscalIssuerId: issuer.id,
          internalNumber: request.internalNumber,
          documentTypeCode: request.documentTypeCode,
          billingMode: BillingMode.ELECTRONIC_PROVIDER,
          source: {
            sourceType: FISCAL_BILLING_SOURCE_TYPE,
            sourceId: salesOrder.id,
            sourceNumber: salesOrder.orderNumber,
            sourceRole: "PRIMARY",
            creationDeduplicationKey: billingCreationDeduplicationKey(
              salesOrder.id,
            ),
          },
          schemaVersion: configuration.fiscalSchemaVersion,
          countryCode: configuration.countryCode,
          currencyCode: salesOrder.currency,
          paymentConditionCode: commercialCondition.paymentConditionCode,
          creditTermDays: commercialCondition.creditTermDays,
          issuer: {
            name: issuer.legalName,
            identificationType: issuer.identificationTypeCode,
            identification: issuer.identificationNumber,
            economicActivityCode: primaryActivity.economicActivityCode,
            establishmentCode: issuer.establishmentCode,
            terminalCode: issuer.terminalCode,
            email: issuer.email,
            phone: issuer.phoneNumber
              ? [issuer.phoneCountryCode, issuer.phoneNumber]
                  .filter(Boolean)
                  .join(" ")
              : null,
            address: {
              provinceCode: issuer.provinceCode,
              cantonCode: issuer.cantonCode,
              districtCode: issuer.districtCode,
              neighborhoodCode: issuer.neighborhoodCode,
              otherAddressDetails: issuer.otherAddressDetails,
            },
          },
          receiver: {
            name: salesOrder.customerName || null,
            identificationType: receiverIdentity.identificationType,
            identification: receiverIdentity.identification,
            economicActivityCode: null,
            email: salesOrder.customerEmail,
            phone: null,
            address: null,
          },
          totals: calculatedSnapshot.totals,
          paymentMethods,
          lines: calculatedSnapshot.lines,
          createdByUserId: request.createdByUserId,
        };
        expectedWinner = {
          tenantId: command.tenantId,
          sourceId: salesOrder.id,
          internalNumber: command.internalNumber,
          documentTypeCode: command.documentTypeCode,
          fiscalIssuerId: issuer.id,
          issuerEstablishmentCode: issuer.establishmentCode,
          issuerTerminalCode: issuer.terminalCode,
          receiverIdentificationType: receiverIdentity.identificationType,
          receiverIdentification: receiverIdentity.identification,
          paymentMethods: paymentMethods.map((method) => ({
            paymentMethodOrder: method.paymentMethodOrder,
            paymentMethodCode: method.paymentMethodCode,
          })),
          creationDeduplicationKey: billingCreationDeduplicationKey(
            salesOrder.id,
          ),
        };
        return tx.billingDocument.create({
          data: billingDocumentCreateData(command, CR_V44_DECIMAL_V1),
          select: primaryDocumentSelect,
        });
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (prismaErrorCode(error) === "P2002") {
        if (!expectedWinner) throw fiscalBillingError("BILLING_DRAFT_CONFLICT");
        let winner: CrV44ConcurrentWinner | null;
        try {
          winner = await this.findCrV44ConcurrentWinner(expectedWinner);
        } catch {
          throw fiscalBillingError("BILLING_DRAFT_ATOMIC_PERSISTENCE_FAILED");
        }
        if (!winner || !isExactPristineCrV44ConcurrentWinner(winner, expectedWinner)) {
          throw fiscalBillingError("BILLING_DRAFT_CONFLICT");
        }
        return {
          id: winner.id,
          internalNumber: winner.internalNumber,
          lifecycleStatus: winner.lifecycleStatus,
          documentTypeCode: winner.documentTypeCode,
        };
      }
      throw fiscalBillingError("BILLING_DRAFT_ATOMIC_PERSISTENCE_FAILED");
    }
  }

  private findCrV44ConcurrentWinner(
    expected: CrV44ConcurrentWinnerExpectation,
  ): Promise<CrV44ConcurrentWinner | null> {
    return this.prisma.billingDocument.findFirst({
      where: {
        tenantId: expected.tenantId,
        sourceType: FISCAL_BILLING_SOURCE_TYPE,
        sourceId: expected.sourceId,
        sourceRole: "PRIMARY",
      },
      select: crV44ConcurrentWinnerSelect,
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
              include: {
                taxes: {
                  orderBy: { taxOrder: "asc" },
                  include: { exemption: true },
                },
              },
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
    fiscalCalculationPolicyVersion: string | null;
    billingMode: string;
    lifecycleStatus: string;
    providerStatus: string;
    taxAuthorityStatus: string;
    fiscalNumber: string | null;
    providerDocumentId: string | null;
  }) {
    if (document.fiscalCalculationPolicyVersion !== CR_V44_DECIMAL_V1) {
      throw fiscalBillingError(
        "BILLING_DOCUMENT_FISCAL_CALCULATION_POLICY_UNSUPPORTED",
      );
    }
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
    if (document.fiscalCalculationPolicyVersion !== CR_V44_DECIMAL_V1) {
      throw fiscalBillingError(
        "BILLING_DOCUMENT_FISCAL_CALCULATION_POLICY_UNSUPPORTED",
      );
    }
    requireValidCalculatedSnapshot(document);
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
          !document.receiverIdentification?.trim()))
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
    const receiverFiscalIdentityMissing =
      document.documentTypeCode !== "04" &&
      (!document.receiverIdentificationType || !document.receiverIdentification);
    const exchangeRateMissing = !workspaceFiscalIdentityReady(document);
    const fiscalCalculationPolicyUnsupported =
      document.fiscalCalculationPolicyVersion !== CR_V44_DECIMAL_V1;
    const calculatedSnapshotInvalid =
      !fiscalCalculationPolicyUnsupported && !validCalculatedSnapshot(document);
    const readinessIssues: BillingDocumentWorkspace["readiness"]["issues"] = [];
    if (fiscalCalculationPolicyUnsupported) {
      readinessIssues.push("BILLING_DOCUMENT_FISCAL_CALCULATION_POLICY_UNSUPPORTED");
    }
    if (calculatedSnapshotInvalid) {
      readinessIssues.push("BILLING_DOCUMENT_CALCULATED_SNAPSHOT_INVALID");
    }
    return {
      id:document.id,billingMode:document.billingMode,internalNumber:document.internalNumber,documentTypeCode:document.documentTypeCode,
      sourceType:document.sourceType,sourceId:document.sourceId,sourceNumber:document.sourceNumber,sourceRole:document.sourceRole,
      schemaVersion:document.schemaVersion,fiscalCalculationPolicyVersion:document.fiscalCalculationPolicyVersion,countryCode:document.countryCode,currencyCode:document.currencyCode,exchangeRate:workspaceDecimal(document.exchangeRate),
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
        receiverFiscalIdentityMissing,
        exchangeRateMissing,
        fiscalCalculationPolicyUnsupported,
        calculatedSnapshotInvalid,
        issuanceReady:
          document.billingMode === "ELECTRONIC_PROVIDER" &&
          document.lifecycleStatus === "DRAFT" &&
          document.providerStatus === "NOT_SUBMITTED" &&
          document.taxAuthorityStatus === "NOT_SUBMITTED" &&
          !receiverFiscalIdentityMissing &&
          !exchangeRateMissing &&
          !fiscalCalculationPolicyUnsupported &&
          !calculatedSnapshotInvalid,
        issues: readinessIssues,
      },
    };
  }
}

type CrV44LineMetadata = {
  lineNumber: number;
  cabysCode: string;
  itemCode: string;
  description: string;
  unitOfMeasureCode: string;
  taxCode: "01";
  taxRateCode: string;
  taxRatePercentage: Prisma.Decimal;
};

function requireEligibleFiscalSalesOrder(order: AuthoritativeSalesOrder): void {
  if (order.sourceType !== ADDITIONAL_SERVICE_SALES_ORDER_SOURCE_TYPE) {
    throw fiscalBillingError("SALES_ORDER_SOURCE_NOT_ELIGIBLE");
  }
  if (order.status !== ELIGIBLE_SALES_ORDER_STATUS) {
    throw fiscalBillingError("SALES_ORDER_STATUS_NOT_ELIGIBLE");
  }
  if (!order.lines.length) throw fiscalBillingError("SALES_ORDER_HAS_NO_LINES");
  if (order.currency !== "CRC" && order.currency !== "USD") {
    throw fiscalBillingError("BILLING_DRAFT_FISCAL_SOURCE_UNSUPPORTED");
  }
}

async function requireActiveFiscalCatalog(
  tx: Prisma.TransactionClient,
  metadata: readonly CrV44LineMetadata[],
): Promise<void> {
  const releases = await tx.fiscalCatalogRelease.findMany({
    where: {
      countryCode: "CR",
      status: "ACTIVE",
      catalogType: { in: ["CABYS", "ELECTRONIC_INVOICE_CODING"] },
    },
    select: { id: true, catalogType: true },
  });
  const cabysReleases = releases.filter(
    (release) => release.catalogType === "CABYS",
  );
  const codingReleases = releases.filter(
    (release) => release.catalogType === "ELECTRONIC_INVOICE_CODING",
  );
  if (cabysReleases.length !== 1 || codingReleases.length !== 1) {
    throw fiscalBillingError("SALES_ORDER_LINE_FISCAL_PROFILE_INVALID");
  }
  const cabysReleaseId = cabysReleases[0].id;
  const codingReleaseId = codingReleases[0].id;
  const cabysCodes = [...new Set(metadata.map((line) => line.cabysCode))];
  const unitCodes = [
    ...new Set(metadata.map((line) => line.unitOfMeasureCode)),
  ];
  const taxCodes = [...new Set(metadata.map((line) => line.taxCode))];
  const [cabys, units, taxes] = await Promise.all([
    tx.fiscalCabysEntry.findMany({
      where: {
        releaseId: cabysReleaseId,
        isActive: true,
        code: { in: cabysCodes },
      },
      select: { code: true },
    }),
    tx.fiscalUnitOfMeasureEntry.findMany({
      where: {
        releaseId: codingReleaseId,
        isActive: true,
        code: { in: unitCodes },
      },
      select: { code: true },
    }),
    tx.fiscalTaxEntry.findMany({
      where: {
        releaseId: codingReleaseId,
        isActive: true,
        code: { in: taxCodes },
      },
      select: { id: true, code: true },
    }),
  ]);
  const activeCabys = new Set(cabys.map((entry) => entry.code));
  const activeUnits = new Set(units.map((entry) => entry.code));
  const taxByCode = new Map(taxes.map((entry) => [entry.code, entry]));
  if (
    cabysCodes.some((code) => !activeCabys.has(code)) ||
    unitCodes.some((code) => !activeUnits.has(code)) ||
    taxCodes.some((code) => !taxByCode.has(code))
  ) {
    throw fiscalBillingError("SALES_ORDER_LINE_FISCAL_PROFILE_INVALID");
  }
  const taxIds = taxes.map((tax) => tax.id);
  const rateCodes = [...new Set(metadata.map((line) => line.taxRateCode))];
  const rates = await tx.fiscalTaxRateEntry.findMany({
    where: {
      releaseId: codingReleaseId,
      taxEntryId: { in: taxIds },
      code: { in: rateCodes },
      isActive: true,
    },
    select: {
      taxEntryId: true,
      code: true,
      percentage: true,
    },
  });
  const rateByIdentity = new Map(
    rates.map((rate) => [`${rate.taxEntryId}:${rate.code}`, rate]),
  );
  for (const line of metadata) {
    const tax = taxByCode.get(line.taxCode);
    const rate = tax
      ? rateByIdentity.get(`${tax.id}:${line.taxRateCode}`)
      : undefined;
    if (!rate || !rate.percentage.equals(line.taxRatePercentage)) {
      throw fiscalBillingError("SALES_ORDER_LINE_FISCAL_PROFILE_INVALID");
    }
  }
}

function crV44InputFromSalesOrder(order: AuthoritativeSalesOrder): {
  input: CrV44FiscalDocumentInput;
  metadata: readonly CrV44LineMetadata[];
} {
  let commercialSubtotal = new Prisma.Decimal(0);
  let commercialTax = new Prisma.Decimal(0);
  let commercialTotal = new Prisma.Decimal(0);
  const metadata: CrV44LineMetadata[] = [];
  const lines = order.lines.map((line, index) => {
    if (line.fiscalItemCategory === null) {
      throw fiscalBillingError(
        "SALES_ORDER_LINE_FISCAL_CATEGORY_UNCLASSIFIED",
      );
    }
    if (
      line.fiscalItemCategory !== "SERVICE" &&
      line.fiscalItemCategory !== "MERCHANDISE"
    ) {
      throw fiscalBillingError("BILLING_DRAFT_FISCAL_SOURCE_UNSUPPORTED");
    }
    if (!line.additionalServiceCatalogId) {
      throw fiscalBillingError("SALES_ORDER_LINE_SOURCE_IDENTITY_MISSING");
    }
    const catalog = line.additionalServiceCatalog;
    if (
      !catalog ||
      catalog.id !== line.additionalServiceCatalogId ||
      catalog.tenantId !== order.tenantId
    ) {
      throw fiscalBillingError("BILLING_DRAFT_FISCAL_SOURCE_UNSUPPORTED");
    }
    const profile = catalog.fiscalProfile;
    if (!profile) {
      throw fiscalBillingError("SALES_ORDER_LINE_FISCAL_PROFILE_MISSING");
    }
    if (
      profile.tenantId !== order.tenantId ||
      profile.additionalServiceCatalogId !== catalog.id
    ) {
      throw fiscalBillingError("BILLING_DRAFT_FISCAL_SOURCE_UNSUPPORTED");
    }
    if (!profile.isActive) {
      throw fiscalBillingError("SALES_ORDER_LINE_FISCAL_PROFILE_INACTIVE");
    }
    if (
      !profile.cabysCode ||
      !profile.unitOfMeasureCode ||
      !profile.taxCode ||
      !profile.taxRateCode ||
      profile.taxPercentage === null
    ) {
      throw fiscalBillingError("SALES_ORDER_LINE_FISCAL_PROFILE_INVALID");
    }
    if (profile.taxCode !== "01") {
      throw fiscalBillingError("BILLING_DRAFT_FISCAL_SOURCE_UNSUPPORTED");
    }
    if (!profile.taxPercentage.equals(line.vatPercentage)) {
      throw fiscalBillingError("SALES_ORDER_LINE_TAX_MISMATCH");
    }

    commercialSubtotal = commercialSubtotal.plus(line.subtotal);
    commercialTax = commercialTax.plus(line.vatAmount);
    commercialTotal = commercialTotal.plus(line.total);
    const lineNumber = index + 1;
    metadata.push({
      lineNumber,
      cabysCode: profile.cabysCode,
      itemCode: line.serviceCode,
      description: line.serviceName,
      unitOfMeasureCode: profile.unitOfMeasureCode,
      taxCode: "01",
      taxRateCode: profile.taxRateCode,
      taxRatePercentage: profile.taxPercentage,
    });
    return Object.freeze({
      lineNumber,
      category: line.fiscalItemCategory,
      quantity: "1",
      unitPrice: line.subtotal.toFixed(),
      discounts: Object.freeze([]),
      taxes: Object.freeze([
        Object.freeze({
          kind: "ORDINARY_IVA" as const,
          tariffCode: profile.taxRateCode,
          ratePercentage: profile.taxPercentage.toFixed(),
        }),
      ]),
    });
  });
  if (
    !commercialSubtotal.equals(order.commercialSubtotal) ||
    !commercialTax.equals(order.totalVat) ||
    !commercialTotal.equals(order.total)
  ) {
    throw fiscalBillingError("SALES_ORDER_TOTALS_MISMATCH");
  }
  return {
    input: Object.freeze({ lines: Object.freeze(lines) }),
    metadata: Object.freeze(metadata.map((value) => Object.freeze(value))),
  };
}

function mapCrV44Calculation(
  calculation: CrV44FiscalCalculationResult,
  metadata: readonly CrV44LineMetadata[],
): Pick<BillingDocumentDraftCommand, "totals" | "lines"> {
  if (
    calculation.policyVersion !== CR_V44_DECIMAL_V1 ||
    calculation.lines.length !== metadata.length
  ) {
    throw new Error("invalid fiscal calculation result");
  }
  const money = (value: string) => assertHaciendaCrV44MoneyCapacity(value);
  const totals = calculation.internalTotals;
  return {
    totals: {
      grossSubtotal: money(totals.grossAmountTotal),
      discountTotal: money(totals.discountAmountTotal),
      taxableTotal: money(totals.taxableBaseTotal),
      exemptTotal: money(totals.exemptBaseTotal),
      exoneratedTotal: money(totals.exoneratedBaseTotal),
      grossTaxTotal: money(totals.grossTaxAmountTotal),
      exoneratedTaxTotal: money(totals.exoneratedTaxAmountTotal),
      netTaxTotal: money(totals.netTaxAmountTotal),
      total: money(totals.lineTotal),
    },
    lines: calculation.lines.map((line, index) => {
      const source = metadata[index];
      if (!source || source.lineNumber !== line.lineNumber) {
        throw new Error("invalid fiscal calculation line identity");
      }
      const taxableBase = money(line.taxableBase);
      const taxAmount = money(line.grossTaxAmount);
      const netTaxAmount = money(line.netTaxAmount);
      return {
        lineNumber: line.lineNumber,
        cabysCode: source.cabysCode,
        itemCode: source.itemCode,
        description: source.description,
        quantity: line.quantity,
        unitOfMeasureCode: source.unitOfMeasureCode,
        unitPrice: money(line.unitPrice),
        grossAmount: money(line.grossAmount),
        discountAmount: money(line.discountAmount),
        discountCode: null,
        discountReason: null,
        taxableBase,
        taxAmount,
        exoneratedTaxAmount: money(line.exoneratedTaxAmount),
        netTaxAmount,
        lineSubtotal: money(line.lineSubtotal),
        lineTotal: money(line.lineTotal),
        taxes: [
          {
            taxOrder: 1,
            taxCode: source.taxCode,
            rateCode: line.ivaTariffCode,
            ratePercentage: line.ivaRatePercentage,
            taxableBase,
            taxAmount,
            calculationFactor: null,
            netTaxAmount,
          },
        ],
      };
    }),
  };
}

function billingDocumentCreateData(
  command: BillingDocumentDraftCommand,
  fiscalCalculationPolicyVersion: string | null,
): Prisma.BillingDocumentUncheckedCreateInput {
  const source = command.source;
  return {
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
    creationDeduplicationKey: source?.creationDeduplicationKey ?? null,
    schemaVersion: command.schemaVersion,
    fiscalCalculationPolicyVersion,
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
    exoneratedTaxTotal: new Prisma.Decimal(command.totals.exoneratedTaxTotal),
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
        exoneratedTaxAmount: new Prisma.Decimal(line.exoneratedTaxAmount),
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
  };
}

function prismaErrorCode(error: unknown): string | null {
  try {
    if (typeof error !== "object" || error === null || !("code" in error)) {
      return null;
    }
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  } catch {
    return null;
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
      runtime.source?.sourceType === FISCAL_BILLING_SOURCE_TYPE ||
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

function workspaceDecimal(value:Prisma.Decimal|null):string|null{return value===null?null:value.toFixed();}
function requiredWorkspaceDecimal(value:Prisma.Decimal):string{return value.toFixed();}
function workspaceTimestamp(value:Date|null):Date|null{return value===null?null:requiredWorkspaceTimestamp(value);}
function requiredWorkspaceTimestamp(value:Date):Date{if(!(value instanceof Date)||!Number.isFinite(value.getTime()))workspaceMappingFailure();return new Date(value.getTime());}
function workspaceDate(value:Date|null):string|null{return value===null?null:requiredWorkspaceDate(value);}
function requiredWorkspaceDate(value:Date):string{if(!(value instanceof Date)||!Number.isFinite(value.getTime()))workspaceMappingFailure();return `${value.getUTCFullYear().toString().padStart(4,"0")}-${(value.getUTCMonth()+1).toString().padStart(2,"0")}-${value.getUTCDate().toString().padStart(2,"0")}`;}
function workspaceMappingFailure():never{throw fiscalBillingError("BILLING_DOCUMENT_SUBMISSION_READ_FAILED");}
function workspaceFiscalIdentityReady(document:WorkspaceRow):boolean{
  if(document.currencyCode!=="CRC"&&document.currencyCode!=="USD")return false;
  const allocated=document.lifecycleStatus!=="DRAFT"||document.fiscalNumber!==null||document.allocatedSequenceNumber!==null;
  const emissionEmpty=document.fiscalEmissionAt===null&&document.fiscalIssueDate===null;
  const emissionComplete=validWorkspaceDate(document.fiscalEmissionAt)&&validWorkspaceDate(document.fiscalIssueDate);
  const rateEmpty=document.exchangeRate===null&&document.officialExchangeRateObservationId===null&&document.fiscalExchangeRateEffectiveDate===null&&document.fiscalExchangeRateSourceAuthority===null&&document.fiscalExchangeRateIndicatorCode===null;
  const rateComplete=document.exchangeRate!==null&&document.exchangeRate.greaterThan(0)&&typeof document.officialExchangeRateObservationId==="string"&&document.officialExchangeRateObservationId.length>0&&validWorkspaceDate(document.fiscalExchangeRateEffectiveDate)&&document.fiscalExchangeRateSourceAuthority==="BCCR"&&document.fiscalExchangeRateIndicatorCode==="318"&&validWorkspaceDate(document.fiscalIssueDate)&&document.fiscalExchangeRateEffectiveDate!.getTime()===document.fiscalIssueDate!.getTime();
  if(!allocated)return emissionEmpty&&rateEmpty;
  return emissionComplete&&(document.currencyCode==="CRC"?rateEmpty:rateComplete);
}
function validWorkspaceDate(value:Date|null):value is Date{return value instanceof Date&&Number.isFinite(value.getTime());}

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

function validCalculatedSnapshot(document: AllocationDocument | WorkspaceRow) {
  try {
    validateCrV44CalculatedSnapshot(calculatedSnapshot(document));
    return true;
  } catch {
    return false;
  }
}

function requireValidCalculatedSnapshot(document: AllocationDocument): void {
  try {
    validateCrV44CalculatedSnapshot(calculatedSnapshot(document));
  } catch (error) {
    if (
      error instanceof FiscalCalculationError &&
      error.code === "FISCAL_DECIMAL_CAPACITY_OVERFLOW"
    ) {
      throw fiscalBillingError(
        "BILLING_DOCUMENT_HACIENDA_MONEY_CAPACITY_EXCEEDED",
      );
    }
    throw fiscalBillingError("BILLING_DOCUMENT_CALCULATED_SNAPSHOT_INVALID");
  }
}

function calculatedSnapshot(document: AllocationDocument | WorkspaceRow) {
  return {
    fiscalCalculationPolicyVersion: document.fiscalCalculationPolicyVersion,
    totals: {
      grossSubtotal: document.grossSubtotal.toFixed(),
      discountTotal: document.discountTotal.toFixed(),
      taxableTotal: document.taxableTotal.toFixed(),
      exemptTotal: document.exemptTotal.toFixed(),
      exoneratedTotal: document.exoneratedTotal.toFixed(),
      grossTaxTotal: document.grossTaxTotal.toFixed(),
      exoneratedTaxTotal: document.exoneratedTaxTotal.toFixed(),
      netTaxTotal: document.netTaxTotal.toFixed(),
      total: document.total.toFixed(),
    },
    lines: document.lines.map((line) => ({
      lineNumber: line.lineNumber,
      quantity: line.quantity.toFixed(),
      unitPrice: line.unitPrice.toFixed(),
      grossAmount: line.grossAmount.toFixed(),
      discountAmount: line.discountAmount.toFixed(),
      discountCode: line.discountCode,
      discountReason: line.discountReason,
      taxableBase: line.taxableBase.toFixed(),
      taxAmount: line.taxAmount.toFixed(),
      exoneratedTaxAmount: line.exoneratedTaxAmount.toFixed(),
      netTaxAmount: line.netTaxAmount.toFixed(),
      lineSubtotal: line.lineSubtotal.toFixed(),
      lineTotal: line.lineTotal.toFixed(),
      taxes: line.taxes.map((tax) => ({
        taxOrder: tax.taxOrder,
        taxCode: tax.taxCode,
        rateCode: tax.rateCode,
        ratePercentage: tax.ratePercentage.toFixed(),
        taxableBase: tax.taxableBase.toFixed(),
        taxAmount: tax.taxAmount.toFixed(),
        calculationFactor: tax.calculationFactor?.toFixed() ?? null,
        netTaxAmount: tax.netTaxAmount.toFixed(),
        exemption: tax.exemption,
      })),
    })),
  };
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
