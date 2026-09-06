import { Injectable } from "@nestjs/common";
import { BillingMode, PaymentPurpose, Prisma } from "@prisma/client";
import { TravelFiscalClassificationService } from "../additional-services/travel-fiscal-classification.service";
import { FiscalCatalogService } from "../fiscal-catalogs/fiscal-catalog.service";
import { BillingDocumentService } from "../fiscal-billing/billing-document.service";
import { clientFiscalReceiverPrefill } from "../fiscal-billing/client-fiscal-receiver-prefill";
import { mapCrV44CalculationToBillingDocumentSnapshot } from "../fiscal-billing/cr-v44-billing-document-snapshot";
import {
  CR_V44_DECIMAL_V1,
  calculateCrV44FiscalDocument,
} from "../fiscal-billing/cr-v44-fiscal-calculation-policy";
import {
  resolveCrDraftPaymentMethods,
  resolveCrDraftReceiverIdentity,
} from "../fiscal-billing/fiscal-draft-selection";
import { PrismaService } from "../prisma/prisma.service";
import { mapFinancePaymentMethodToCrFiscalCode } from "./finance-fiscal-payment-method";

export const CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS = {
  PAYMENT_NOT_ELIGIBLE: "PAYMENT_NOT_ELIGIBLE_FOR_FISCALIZATION",
  RECEIVER_INVALID: "CONTRACT_PAYMENT_RECEIVER_INVALID",
  CLASSIFICATION_MISSING: "CONTRACT_PAYMENT_FISCAL_CLASSIFICATION_MISSING",
  CLASSIFICATION_INACTIVE: "CONTRACT_PAYMENT_FISCAL_CLASSIFICATION_INACTIVE",
  CLASSIFICATION_UNSUPPORTED: "CONTRACT_PAYMENT_FISCAL_CLASSIFICATION_UNSUPPORTED",
  PAYMENT_METHOD_INVALID: "CONTRACT_PAYMENT_FISCAL_PAYMENT_METHOD_INVALID",
  CALCULATION_MISMATCH: "CONTRACT_PAYMENT_FISCAL_CALCULATION_MISMATCH",
  ISSUER_NOT_CONFIGURED: "CONTRACT_PAYMENT_FISCAL_ISSUER_NOT_CONFIGURED",
} as const;

export class ContractPaymentFiscalPreparationError extends Error {
  constructor(
    readonly code: (typeof CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS)[keyof typeof CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS],
  ) {
    super(code);
  }
}

const ELIGIBLE_PURPOSES = new Set<PaymentPurpose>([
  PaymentPurpose.CONTRACT_PAYMENT,
  PaymentPurpose.CONTRACT_RESERVATION,
  PaymentPurpose.CONTRACT_INSTALLMENT,
]);
const CONFIRMED_PAYMENT_STATUSES = new Set([
  "RECEIVED",
  "PARTIALLY_ALLOCATED",
  "FULLY_ALLOCATED",
]);

/**
 * Finance/Contracts integration boundary. It loads Contract data and adapts it
 * to the generic fiscal draft input; the fiscal module has no Contract imports.
 */
@Injectable()
export class ContractPaymentFiscalPreparationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly travelFiscalClassification: TravelFiscalClassificationService,
    private readonly fiscalCatalogs: FiscalCatalogService,
    private readonly billingDocuments: BillingDocumentService,
  ) {}

  async prepareOrResume(
    tenantId: string,
    paymentId: string,
    actorUserId: string,
  ) {
    if (!tenantId || !paymentId || !validActor(actorUserId)) {
      fail(CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.PAYMENT_NOT_ELIGIBLE);
    }
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, tenantId },
      select: {
        id: true,
        tenantId: true,
        receiptNumber: true,
        currencyCode: true,
        receivedAmount: true,
        paymentMethod: true,
        purpose: true,
        status: true,
        contractId: true,
        contract: {
          select: {
            id: true,
            tenantId: true,
            contractNumber: true,
            destination: true,
            clientId: true,
            client: {
              select: {
                id: true,
                fullName: true,
                idType: true,
                idNumber: true,
                email: true,
              },
            },
            travelPackage: {
              select: {
                id: true,
                name: true,
                fiscalClassificationCatalogId: true,
                fiscalClassificationCatalog: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    fiscalItemCategory: true,
                    isActive: true,
                    fiscalProfile: {
                      select: {
                        additionalServiceCatalogId: true,
                        cabysCode: true,
                        unitOfMeasureCode: true,
                        taxCode: true,
                        taxRateCode: true,
                        taxPercentage: true,
                        isActive: true,
                      },
                    },
                  },
                },
              },
            },
            internalTrip: {
              select: {
                id: true,
                name: true,
                fiscalClassificationCatalogId: true,
                fiscalClassificationCatalog: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    fiscalItemCategory: true,
                    isActive: true,
                    fiscalProfile: {
                      select: {
                        additionalServiceCatalogId: true,
                        cabysCode: true,
                        unitOfMeasureCode: true,
                        taxCode: true,
                        taxRateCode: true,
                        taxPercentage: true,
                        isActive: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!payment || !eligiblePayment(payment)) {
      fail(CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.PAYMENT_NOT_ELIGIBLE);
    }
    const contract = payment.contract;
    if (!contract || contract.tenantId !== tenantId || !contract.client) {
      fail(CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.PAYMENT_NOT_ELIGIBLE);
    }

    const travel = resolveTravelClassification(contract);
    await validateTravelClassification(
      this.travelFiscalClassification,
      tenantId,
      travel.catalogId,
      travel.usage,
    );
    const profile = travel.catalog.fiscalProfile;
    if (!profile) {
      fail(CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.CLASSIFICATION_MISSING);
    }
    if (!travel.catalog.isActive || !profile.isActive) {
      fail(CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.CLASSIFICATION_INACTIVE);
    }
    if (
      travel.catalog.fiscalItemCategory !== "SERVICE" &&
      travel.catalog.fiscalItemCategory !== "MERCHANDISE" ||
      profile.additionalServiceCatalogId !== travel.catalog.id ||
      !profile.cabysCode ||
      !profile.unitOfMeasureCode ||
      profile.taxCode !== "01" ||
      !profile.taxRateCode ||
      profile.taxPercentage === null
    ) {
      fail(CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.CLASSIFICATION_UNSUPPORTED);
    }
    const fiscalReadiness = await this.fiscalCatalogs.evaluateFiscalProfiles(
      tenantId,
      [{
        additionalServiceCatalogId: profile.additionalServiceCatalogId,
        cabysCode: profile.cabysCode,
        unitOfMeasureCode: profile.unitOfMeasureCode,
        taxCode: profile.taxCode,
        taxRateCode: profile.taxRateCode,
        taxPercentage: profile.taxPercentage.toFixed(),
        isActive: profile.isActive,
      }],
    );
    if (!fiscalReadiness.get(profile.additionalServiceCatalogId)?.isReady) {
      fail(CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.CLASSIFICATION_UNSUPPORTED);
    }

    const receiver = receiverFor(contract.client);
    const paymentMethodCode = mapFinancePaymentMethodToCrFiscalCode(
      payment.paymentMethod,
    );
    if (!paymentMethodCode) {
      fail(CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.PAYMENT_METHOD_INVALID);
    }
    const issuer = await this.requireIssuer(tenantId);
    const calculated = calculatePaymentSnapshot(payment, travel, contract.contractNumber);

    return this.billingDocuments.createOrResumeCrV44CalculatedDraft({
      tenantId,
      customerId: contract.client.id,
      fiscalIssuerId: issuer.id,
      internalNumber: contractPaymentBillingInternalNumber(payment.id),
      documentTypeCode: "01",
      billingMode: BillingMode.ELECTRONIC_PROVIDER,
      source: {
        sourceType: "CONTRACT_PAYMENT",
        sourceId: payment.id,
        sourceNumber: payment.receiptNumber,
        sourceRole: "PRIMARY",
        creationDeduplicationKey: contractPaymentFiscalizationKey(payment.id),
      },
      fiscalCalculationPolicyVersion: CR_V44_DECIMAL_V1,
      schemaVersion: "4.4",
      countryCode: "CR",
      currencyCode: payment.currencyCode,
      paymentConditionCode: "01",
      creditTermDays: null,
      issuer: {
        name: issuer.legalName,
        identificationType: issuer.identificationTypeCode,
        identification: issuer.identificationNumber,
        economicActivityCode: issuer.primaryActivity.economicActivityCode,
        establishmentCode: issuer.establishmentCode,
        terminalCode: issuer.terminalCode,
        email: issuer.email,
        phone: issuer.phoneNumber
          ? [issuer.phoneCountryCode, issuer.phoneNumber].filter(Boolean).join(" ")
          : null,
        address: {
          provinceCode: issuer.provinceCode,
          cantonCode: issuer.cantonCode,
          districtCode: issuer.districtCode,
          neighborhoodCode: issuer.neighborhoodCode,
          otherAddressDetails: issuer.otherAddressDetails,
        },
      },
      receiver,
      totals: calculated.totals,
      paymentMethods: resolveCrDraftPaymentMethods([paymentMethodCode]),
      lines: calculated.lines,
      createdByUserId: actorUserId,
    });
  }

  private async requireIssuer(tenantId: string) {
    const [configuration, issuers] = await Promise.all([
      this.prisma.tenantBillingConfiguration.findUnique({ where: { tenantId } }),
      this.prisma.fiscalIssuer.findMany({
        where: { tenantId, isActive: true, countryCode: "CR" },
        include: {
          economicActivities: {
            where: { isPrimary: true },
            orderBy: [{ displayOrder: "asc" }, { economicActivityCode: "asc" }],
          },
        },
      }),
    ]);
    if (
      !configuration ||
      !configuration.billingEnabled ||
      !configuration.electronicIssuanceEnabled ||
      configuration.countryCode !== "CR" ||
      configuration.fiscalSchemaVersion !== "4.4" ||
      issuers.length !== 1 ||
      issuers[0]?.economicActivities.length !== 1
    ) {
      fail(CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.ISSUER_NOT_CONFIGURED);
    }
    return { ...issuers[0], primaryActivity: issuers[0].economicActivities[0] };
  }
}

export function contractPaymentFiscalizationKey(paymentId: string) {
  return `contract-payment:fiscalization:${paymentId}:v1`;
}

function contractPaymentBillingInternalNumber(paymentId: string) {
  return `BD-CP-${paymentId}`;
}

function eligiblePayment(payment: {
  purpose: PaymentPurpose;
  status: string;
  contractId: string | null;
  receiptNumber: string | null;
  receivedAmount: Prisma.Decimal;
}) {
  return (
    ELIGIBLE_PURPOSES.has(payment.purpose) &&
    CONFIRMED_PAYMENT_STATUSES.has(payment.status) &&
    !!payment.contractId &&
    !!payment.receiptNumber &&
    payment.receivedAmount.greaterThan(0)
  );
}

function resolveTravelClassification(contract: any): {
  usage: "TRAVEL_PACKAGE" | "INTERNAL_TRIP";
  catalogId: string;
  travelName: string;
  catalog: any;
} {
  const packageClassification = contract.travelPackage?.fiscalClassificationCatalog;
  if (packageClassification && contract.travelPackage?.fiscalClassificationCatalogId) {
    return {
      usage: "TRAVEL_PACKAGE",
      catalogId: contract.travelPackage.fiscalClassificationCatalogId,
      travelName: contract.travelPackage.name,
      catalog: packageClassification,
    };
  }
  const tripClassification = contract.internalTrip?.fiscalClassificationCatalog;
  if (tripClassification && contract.internalTrip?.fiscalClassificationCatalogId) {
    return {
      usage: "INTERNAL_TRIP",
      catalogId: contract.internalTrip.fiscalClassificationCatalogId,
      travelName: contract.internalTrip.name,
      catalog: tripClassification,
    };
  }
  fail(CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.CLASSIFICATION_MISSING);
}

async function validateTravelClassification(
  service: TravelFiscalClassificationService,
  tenantId: string,
  catalogId: string,
  usage: "TRAVEL_PACKAGE" | "INTERNAL_TRIP",
) {
  try {
    await service.validate(tenantId, catalogId, usage);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("INACTIVE")) {
      fail(CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.CLASSIFICATION_INACTIVE);
    }
    if (message.includes("NOT_FOUND") || message.includes("PROFILE_MISSING")) {
      fail(CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.CLASSIFICATION_MISSING);
    }
    fail(CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.CLASSIFICATION_UNSUPPORTED);
  }
}

function receiverFor(client: {
  fullName: string;
  idType: string | null;
  idNumber: string;
  email: string | null;
}) {
  try {
    const prefill = clientFiscalReceiverPrefill({
      idType: client.idType,
      idNumber: client.idNumber,
    });
    const identity = resolveCrDraftReceiverIdentity(
      "01",
      prefill.receiverIdentificationTypeCode,
      prefill.receiverIdentificationNumber,
    );
    return {
      name: client.fullName,
      identificationType: identity.identificationType,
      identification: identity.identification,
      economicActivityCode: null,
      email: client.email,
      phone: null,
      address: null,
    };
  } catch {
    fail(CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.RECEIVER_INVALID);
  }
}

function calculatePaymentSnapshot(payment: any, travel: any, contractNumber: string) {
  const profile = travel.catalog.fiscalProfile;
  const divisor = new Prisma.Decimal(1).plus(profile.taxPercentage.dividedBy(100));
  const unitPrice = payment.receivedAmount
    .dividedBy(divisor)
    .toDecimalPlaces(5, Prisma.Decimal.ROUND_HALF_UP)
    .toFixed();
  try {
    const calculation = calculateCrV44FiscalDocument({
      lines: [{
        lineNumber: 1,
        category: travel.catalog.fiscalItemCategory,
        quantity: "1",
        unitPrice,
        discounts: [],
        taxes: [{
          kind: "ORDINARY_IVA",
          tariffCode: profile.taxRateCode,
          ratePercentage: profile.taxPercentage.toFixed(),
        }],
      }],
    });
    if (!new Prisma.Decimal(calculation.internalTotals.lineTotal).equals(payment.receivedAmount)) {
      fail(CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.CALCULATION_MISMATCH);
    }
    return mapCrV44CalculationToBillingDocumentSnapshot(calculation, [{
      lineNumber: 1,
      cabysCode: profile.cabysCode,
      itemCode: travel.catalog.id,
      description: contractPaymentDescription(payment.purpose, travel.travelName, contractNumber),
      unitOfMeasureCode: profile.unitOfMeasureCode,
      taxCode: "01",
    }]);
  } catch (error) {
    if (error instanceof ContractPaymentFiscalPreparationError) throw error;
    fail(CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS.CALCULATION_MISMATCH);
  }
}

function contractPaymentDescription(
  purpose: PaymentPurpose,
  travelName: string,
  contractNumber: string,
) {
  const context =
    purpose === PaymentPurpose.CONTRACT_RESERVATION
      ? "Reserva"
      : purpose === PaymentPurpose.CONTRACT_INSTALLMENT
        ? "Abono"
        : "Pago";
  return `${context} · ${travelName} · Contrato ${contractNumber}`.slice(0, 160);
}

function validActor(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 100;
}

function fail(
  code: (typeof CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS)[keyof typeof CONTRACT_PAYMENT_FISCAL_PREPARATION_ERRORS],
): never {
  throw new ContractPaymentFiscalPreparationError(code);
}
