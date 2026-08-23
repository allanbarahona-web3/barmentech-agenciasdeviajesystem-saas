import { Inject, Injectable } from "@nestjs/common";
import { BillingMode, Prisma } from "@prisma/client";
import {
  FiscalCatalogService,
  type FiscalProfileSelectionInput,
} from "../fiscal-catalogs/fiscal-catalog.service";
import {
  ADDITIONAL_SERVICE_SALES_ORDER_SOURCE_TYPE,
  billingCreationDeduplicationKey,
  billingInternalNumber,
  CR_DOCUMENT_TYPE_CHOICES,
  CR_DOCUMENT_TYPES,
  CR_PAYMENT_METHOD_CODES,
  ELIGIBLE_SALES_ORDER_STATUS,
  FISCAL_BILLING_SOURCE_TYPE,
  type CrDocumentTypeCode,
} from "./fiscal-billing.constants";
import { fiscalBillingError } from "./fiscal-billing.errors";
import {
  SALES_ORDER_FISCAL_BILLING_REPOSITORY,
  type SalesOrderFiscalBillingRepository,
} from "./fiscal-billing.repository";
import { BillingDocumentService } from "./billing-document.service";
import type {
  BillingDocumentDraftCommand,
  BillingDocumentDraftLineSnapshot,
  PrimaryDocumentSummary,
} from "./billing-document.types";
import type {
  BillingConfigurationSnapshot,
  FiscalIssuerSnapshot,
  FiscalProfileSnapshot,
  SalesOrderSource,
} from "./fiscal-billing.types";
import { normalizeCrIdentification } from "./fiscal-issuer-identification";

type CreateDraftInput = {
  fiscalIssuerId: string;
  documentTypeCode: string;
  receiverIdentificationTypeCode?: string;
  receiverIdentificationNumber?: string;
  paymentMethodCodes: string[];
};

type ReadinessIssue = {
  code: string;
  blocking: boolean;
  lineId?: string;
  details?: string[];
};

type Analysis = {
  salesOrder: SalesOrderSource;
  configuration: BillingConfigurationSnapshot | null;
  issuers: FiscalIssuerSnapshot[];
  profilesByCatalogId: Map<string, FiscalProfileSnapshot>;
  lines: Array<{
    source: SalesOrderSource["lines"][number];
    profile: FiscalProfileSnapshot | null;
    readinessStatus: "READY" | "MISSING" | "INACTIVE" | "INVALID";
    issues: string[];
  }>;
  issues: ReadinessIssue[];
  totals: { subtotal: string; tax: string; total: string };
  existingPrimaryDocument: PrimaryDocumentSummary | null;
};

@Injectable()
export class SalesOrderFiscalBillingService {
  constructor(
    @Inject(SALES_ORDER_FISCAL_BILLING_REPOSITORY)
    private readonly repository: SalesOrderFiscalBillingRepository,
    private readonly fiscalCatalogService: FiscalCatalogService,
    private readonly billingDocumentService: BillingDocumentService,
  ) {}

  listEligibleSalesOrders(tenantId: string, page: number, pageSize: number) {
    return this.repository.listEligibleSalesOrders(tenantId, page, pageSize);
  }

  async prepare(tenantId: string, salesOrderId: string) {
    const analysis = await this.analyze(tenantId, salesOrderId);
    const existing = analysis.existingPrimaryDocument;
    return {
      source: {
        id: analysis.salesOrder.id,
        number: analysis.salesOrder.orderNumber,
        sourceType: analysis.salesOrder.sourceType,
        status: analysis.salesOrder.status,
      },
      eligible: true,
      customer: {
        name: analysis.salesOrder.customerName,
        email: analysis.salesOrder.customerEmail,
        receiverFiscalIdentityComplete: false,
      },
      currency: analysis.salesOrder.currency,
      paymentCondition: {
        type: analysis.salesOrder.paymentConditionType,
        termValue: analysis.salesOrder.paymentTermValue,
        termUnit: analysis.salesOrder.paymentTermUnit,
      },
      commercialObservations: analysis.salesOrder.commercialObservations,
      totals: {
        commercialSubtotal: analysis.salesOrder.commercialSubtotal,
        commercialVat: analysis.salesOrder.totalVat,
        commercialTotal: analysis.salesOrder.total,
        calculatedSubtotal: analysis.totals.subtotal,
        calculatedVat: analysis.totals.tax,
        calculatedTotal: analysis.totals.total,
      },
      lines: analysis.lines.map(({ source, profile, readinessStatus, issues }) => ({
        id: source.id,
        additionalServiceCatalogId: source.additionalServiceCatalogId,
        serviceCode: source.serviceCode,
        serviceName: source.serviceName,
        serviceDetailsVersion: source.serviceDetailsVersion,
        serviceDetails: source.serviceDetails,
        commercialNotes: source.commercialNotes,
        subtotal: source.subtotal,
        vatPercentage: source.vatPercentage,
        vatAmount: source.vatAmount,
        total: source.total,
        participants: source.participants,
        fiscalReadiness: {
          status: readinessStatus,
          issues,
          profile: profile
            ? {
                cabysCode: profile.cabysCode,
                unitOfMeasureCode: profile.unitOfMeasureCode,
                taxCode: profile.taxCode,
                taxRateCode: profile.taxRateCode,
                taxPercentage: profile.taxPercentage,
              }
            : null,
        },
      })),
      billingConfiguration: analysis.configuration
        ? {
            found: true,
            billingEnabled: analysis.configuration.billingEnabled,
            electronicProviderEnabled:
              analysis.configuration.electronicIssuanceEnabled,
            countryCode: analysis.configuration.countryCode,
            schemaVersion: analysis.configuration.fiscalSchemaVersion,
          }
        : { found: false, billingEnabled: false, electronicProviderEnabled: false },
      issuerChoices: analysis.issuers.map((issuer) => ({
        id: issuer.id,
        displayName: issuer.displayName,
        legalName: issuer.legalName,
        identificationTypeCode: issuer.identificationTypeCode,
        identificationNumber: issuer.identificationNumber,
        economicActivities: issuer.economicActivities,
      })),
      documentTypeChoices: CR_DOCUMENT_TYPE_CHOICES,
      existingPrimaryDocument: existing,
      issues: analysis.issues,
      canCreateDraft:
        existing?.lifecycleStatus === "DRAFT" ||
        (!existing && !analysis.issues.some((issue) => issue.blocking)),
      nextAction: !existing
        ? "CREATE"
        : existing.lifecycleStatus === "DRAFT"
          ? "RESUME"
          : "VIEW",
    };
  }

  async createOrResumeDraft(
    tenantId: string,
    salesOrderId: string,
    input: CreateDraftInput,
    actorId: string,
  ) {
    this.assertDocumentType(input.documentTypeCode);
    const existing = await this.billingDocumentService.findPrimaryDocument(
      tenantId,
      FISCAL_BILLING_SOURCE_TYPE,
      salesOrderId,
    );
    if (existing) {
      return this.billingDocumentService.resumeOrReject(tenantId, existing);
    }

    const analysis = await this.analyze(tenantId, salesOrderId);
    const issuer = await this.repository.findIssuer(
      tenantId,
      input.fiscalIssuerId,
    );
    if (!issuer) throw fiscalBillingError("FISCAL_ISSUER_NOT_FOUND");
    if (!issuer.isActive) throw fiscalBillingError("FISCAL_ISSUER_NOT_ACTIVE");
    this.assertDraftReady(analysis);
    const commercialCondition = this.resolveCommercialCondition(
      analysis.salesOrder,
    );
    const receiverIdentity = this.resolveReceiverIdentity(
      input.documentTypeCode,
      input.receiverIdentificationTypeCode,
      input.receiverIdentificationNumber,
    );
    const paymentMethods = this.resolvePaymentMethods(input.paymentMethodCodes);
    const primaryActivity = issuer.economicActivities.find(
      (activity) => activity.isPrimary,
    );
    if (!primaryActivity) {
      throw fiscalBillingError(
        "FISCAL_ISSUER_ECONOMIC_ACTIVITY_NOT_CONFIGURED",
      );
    }

    const internalNumber = billingInternalNumber(salesOrderId);
    if (internalNumber.length > 50) {
      throw fiscalBillingError("BILLING_INTERNAL_NUMBER_INVALID");
    }
    const configuration = analysis.configuration!;
    const command: BillingDocumentDraftCommand = {
      tenantId,
      fiscalIssuerId: issuer.id,
      internalNumber,
      documentTypeCode: input.documentTypeCode,
      billingMode: BillingMode.ELECTRONIC_PROVIDER,
      source: {
        sourceType: FISCAL_BILLING_SOURCE_TYPE,
        sourceId: analysis.salesOrder.id,
        sourceNumber: analysis.salesOrder.orderNumber,
        sourceRole: "PRIMARY",
        creationDeduplicationKey:
          billingCreationDeduplicationKey(salesOrderId),
      },
      schemaVersion: configuration.fiscalSchemaVersion,
      countryCode: configuration.countryCode,
      currencyCode: analysis.salesOrder.currency,
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
      receiver: {
        name: analysis.salesOrder.customerName || null,
        identificationType: receiverIdentity.identificationType,
        identification: receiverIdentity.identification,
        economicActivityCode: null,
        email: analysis.salesOrder.customerEmail,
        phone: null,
        address: null,
      },
      totals: {
        grossSubtotal: analysis.totals.subtotal,
        discountTotal: "0.0000",
        taxableTotal: analysis.totals.subtotal,
        exemptTotal: "0.0000",
        exoneratedTotal: "0.0000",
        grossTaxTotal: analysis.totals.tax,
        exoneratedTaxTotal: "0.0000",
        netTaxTotal: analysis.totals.tax,
        total: analysis.totals.total,
      },
      paymentMethods,
      lines: this.toDraftLines(analysis),
      createdByUserId: actorId,
    };
    return this.billingDocumentService.createOrResumeDraft(command);
  }

  private async analyze(
    tenantId: string,
    salesOrderId: string,
  ): Promise<Analysis> {
    const salesOrder = await this.repository.findSalesOrder(
      tenantId,
      salesOrderId,
    );
    if (!salesOrder) throw fiscalBillingError("SALES_ORDER_NOT_FOUND");
    if (salesOrder.sourceType !== ADDITIONAL_SERVICE_SALES_ORDER_SOURCE_TYPE) {
      throw fiscalBillingError("SALES_ORDER_SOURCE_NOT_ELIGIBLE");
    }
    if (salesOrder.status !== ELIGIBLE_SALES_ORDER_STATUS) {
      throw fiscalBillingError("SALES_ORDER_STATUS_NOT_ELIGIBLE");
    }
    if (!salesOrder.lines.length) {
      throw fiscalBillingError("SALES_ORDER_HAS_NO_LINES");
    }

    const catalogIds = [
      ...new Set(
        salesOrder.lines.flatMap((line) =>
          line.additionalServiceCatalogId
            ? [line.additionalServiceCatalogId]
            : [],
        ),
      ),
    ];
    const [configuration, profiles, issuers, existingPrimaryDocument] =
      await Promise.all([
        this.repository.findBillingConfiguration(tenantId),
        this.repository.findFiscalProfiles(tenantId, catalogIds),
        this.repository.findActiveIssuers(tenantId),
        this.billingDocumentService.findPrimaryDocument(
          tenantId,
          FISCAL_BILLING_SOURCE_TYPE,
          salesOrderId,
        ),
      ]);
    const profilesByCatalogId = new Map(
      profiles.map((profile) => [profile.additionalServiceCatalogId, profile]),
    );
    const globalReadiness = profiles.length
      ? await this.fiscalCatalogService.evaluateFiscalProfiles(
          tenantId,
          profiles as FiscalProfileSelectionInput[],
        )
      : new Map();
    const issues: ReadinessIssue[] = [];
    if (!configuration) {
      issues.push({ code: "BILLING_CONFIGURATION_NOT_FOUND", blocking: true });
    } else if (
      !configuration.billingEnabled ||
      !configuration.electronicIssuanceEnabled
    ) {
      issues.push({ code: "BILLING_NOT_ENABLED", blocking: true });
    }
    if (!issuers.some((issuer) => issuer.economicActivities.some((a) => a.isPrimary))) {
      issues.push({
        code: "FISCAL_ISSUER_ECONOMIC_ACTIVITY_NOT_CONFIGURED",
        blocking: true,
      });
    }
    issues.push({ code: "RECEIVER_FISCAL_IDENTITY_INCOMPLETE", blocking: false });

    const lines = salesOrder.lines.map((source) => {
      if (!source.additionalServiceCatalogId) {
        issues.push({
          code: "SALES_ORDER_LINE_SOURCE_IDENTITY_MISSING",
          blocking: true,
          lineId: source.id,
        });
        return {
          source,
          profile: null,
          readinessStatus: "MISSING" as const,
          issues: ["SALES_ORDER_LINE_SOURCE_IDENTITY_MISSING"],
        };
      }
      const profile = profilesByCatalogId.get(
        source.additionalServiceCatalogId,
      );
      if (!profile) {
        issues.push({
          code: "SALES_ORDER_LINE_FISCAL_PROFILE_MISSING",
          blocking: true,
          lineId: source.id,
        });
        return {
          source,
          profile: null,
          readinessStatus: "MISSING" as const,
          issues: ["SALES_ORDER_LINE_FISCAL_PROFILE_MISSING"],
        };
      }
      if (!profile.isActive) {
        issues.push({
          code: "SALES_ORDER_LINE_FISCAL_PROFILE_INACTIVE",
          blocking: true,
          lineId: source.id,
        });
        return {
          source,
          profile,
          readinessStatus: "INACTIVE" as const,
          issues: ["SALES_ORDER_LINE_FISCAL_PROFILE_INACTIVE"],
        };
      }
      const readiness = globalReadiness.get(source.additionalServiceCatalogId);
      if (!readiness?.isReady || !profile.taxCode || !profile.taxRateCode || !profile.taxPercentage) {
        const details = readiness?.issues ?? [];
        issues.push({
          code: "SALES_ORDER_LINE_FISCAL_PROFILE_INVALID",
          blocking: true,
          lineId: source.id,
          details,
        });
        return {
          source,
          profile,
          readinessStatus: "INVALID" as const,
          issues: ["SALES_ORDER_LINE_FISCAL_PROFILE_INVALID", ...details],
        };
      }
      if (
        !new Prisma.Decimal(profile.taxPercentage).equals(
          new Prisma.Decimal(source.vatPercentage),
        )
      ) {
        issues.push({
          code: "SALES_ORDER_LINE_TAX_MISMATCH",
          blocking: true,
          lineId: source.id,
        });
        return {
          source,
          profile,
          readinessStatus: "INVALID" as const,
          issues: ["SALES_ORDER_LINE_TAX_MISMATCH"],
        };
      }
      return {
        source,
        profile,
        readinessStatus: "READY" as const,
        issues: [],
      };
    });

    const totals = salesOrder.lines.reduce(
      (result, line) => ({
        subtotal: result.subtotal.plus(line.subtotal),
        tax: result.tax.plus(line.vatAmount),
        total: result.total.plus(line.total),
      }),
      {
        subtotal: new Prisma.Decimal(0),
        tax: new Prisma.Decimal(0),
        total: new Prisma.Decimal(0),
      },
    );
    const calculatedTotals = {
      subtotal: totals.subtotal.toFixed(4),
      tax: totals.tax.toFixed(4),
      total: totals.total.toFixed(4),
    };
    if (
      !totals.subtotal.equals(salesOrder.commercialSubtotal) ||
      !totals.tax.equals(salesOrder.totalVat) ||
      !totals.total.equals(salesOrder.total)
    ) {
      issues.push({ code: "SALES_ORDER_TOTALS_MISMATCH", blocking: true });
    }
    return {
      salesOrder,
      configuration,
      issuers,
      profilesByCatalogId,
      lines,
      issues,
      totals: calculatedTotals,
      existingPrimaryDocument,
    };
  }

  private assertDraftReady(analysis: Analysis): void {
    const blocking = analysis.issues.find((issue) => issue.blocking);
    if (blocking) {
      throw fiscalBillingError(
        blocking.code as Parameters<typeof fiscalBillingError>[0],
        blocking.lineId ? { lineId: blocking.lineId } : undefined,
      );
    }
  }

  private toDraftLines(analysis: Analysis): BillingDocumentDraftLineSnapshot[] {
    return analysis.lines.map(({ source, profile }, index) => {
      if (!profile?.taxCode || !profile.taxRateCode || !profile.taxPercentage) {
        throw fiscalBillingError("SALES_ORDER_LINE_FISCAL_PROFILE_INVALID", {
          lineId: source.id,
        });
      }
      return {
        lineNumber: index + 1,
        cabysCode: profile.cabysCode,
        itemCode: source.serviceCode,
        description: source.serviceName,
        quantity: "1.0000",
        unitOfMeasureCode: profile.unitOfMeasureCode,
        unitPrice: source.subtotal,
        grossAmount: source.subtotal,
        discountAmount: "0.0000",
        discountCode: null,
        discountReason: null,
        taxableBase: source.subtotal,
        taxAmount: source.vatAmount,
        exoneratedTaxAmount: "0.0000",
        netTaxAmount: source.vatAmount,
        lineSubtotal: source.subtotal,
        lineTotal: source.total,
        taxes: [
          {
            taxOrder: 1,
            taxCode: profile.taxCode,
            rateCode: profile.taxRateCode,
            ratePercentage: profile.taxPercentage,
            taxableBase: source.subtotal,
            taxAmount: source.vatAmount,
            calculationFactor: null,
            netTaxAmount: source.vatAmount,
          },
        ],
      };
    });
  }

  private assertDocumentType(value: string): asserts value is CrDocumentTypeCode {
    if (!Object.values(CR_DOCUMENT_TYPES).includes(value as CrDocumentTypeCode)) {
      throw fiscalBillingError("BILLING_DOCUMENT_TYPE_INVALID");
    }
  }

  private resolveCommercialCondition(salesOrder: SalesOrderSource): {
    paymentConditionCode: string;
    creditTermDays: number | null;
  } {
    if (salesOrder.paymentConditionType === "CASH") {
      return { paymentConditionCode: "01", creditTermDays: null };
    }
    if (
      salesOrder.paymentConditionType === "CREDIT" &&
      salesOrder.paymentTermUnit === "DAYS" &&
      Number.isSafeInteger(salesOrder.paymentTermValue) &&
      salesOrder.paymentTermValue! > 0
    ) {
      return {
        paymentConditionCode: "02",
        creditTermDays: salesOrder.paymentTermValue,
      };
    }
    throw fiscalBillingError("BILLING_COMMERCIAL_CREDIT_TERM_INVALID");
  }

  private resolveReceiverIdentity(
    documentTypeCode: string,
    typeCode?: string,
    number?: string,
  ): { identificationType: string | null; identification: string | null } {
    const supplied = typeCode !== undefined || number !== undefined;
    if (
      (documentTypeCode === CR_DOCUMENT_TYPES.ELECTRONIC_INVOICE && !supplied) ||
      (supplied && (!typeCode || !number))
    ) {
      throw fiscalBillingError("BILLING_RECEIVER_IDENTIFICATION_INVALID");
    }
    if (!supplied) {
      return { identificationType: null, identification: null };
    }
    const identification = normalizeCrIdentification(typeCode!, number!);
    if (!identification) {
      throw fiscalBillingError("BILLING_RECEIVER_IDENTIFICATION_INVALID");
    }
    return { identificationType: typeCode!, identification };
  }

  private resolvePaymentMethods(codes: string[]): BillingDocumentDraftCommand["paymentMethods"] {
    if (!Array.isArray(codes) || codes.length < 1 || codes.length > 4) {
      throw fiscalBillingError("BILLING_PAYMENT_METHOD_INVALID");
    }
    const supported = new Set<string>(CR_PAYMENT_METHOD_CODES);
    const normalized: string[] = [];
    for (const value of codes) {
      const code = typeof value === "string" ? value.trim() : "";
      if (!code || !supported.has(code)) {
        throw fiscalBillingError("BILLING_PAYMENT_METHOD_INVALID");
      }
      if (!normalized.includes(code)) normalized.push(code);
    }
    return normalized.map((paymentMethodCode, index) => ({
      paymentMethodOrder: index + 1,
      paymentMethodCode,
      description: null,
      declaredAmount: null,
    }));
  }

}
