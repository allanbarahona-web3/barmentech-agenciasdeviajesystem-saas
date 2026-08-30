import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  FiscalCatalogService,
  type FiscalProfileSelectionInput,
} from "../fiscal-catalogs/fiscal-catalog.service";
import {
  ADDITIONAL_SERVICE_SALES_ORDER_SOURCE_TYPE,
  billingInternalNumber,
  CR_DOCUMENT_TYPE_CHOICES,
  ELIGIBLE_SALES_ORDER_STATUS,
  FISCAL_BILLING_SOURCE_TYPE,
} from "./fiscal-billing.constants";
import { fiscalBillingError } from "./fiscal-billing.errors";
import {
  SALES_ORDER_FISCAL_BILLING_REPOSITORY,
  type SalesOrderFiscalBillingRepository,
} from "./fiscal-billing.repository";
import { BillingDocumentService } from "./billing-document.service";
import type {
  CrV44SalesOrderDraftCommand,
  PrimaryDocumentSummary,
} from "./billing-document.types";
import type {
  BillingConfigurationSnapshot,
  FiscalIssuerSnapshot,
  FiscalProfileSnapshot,
  SalesOrderSource,
} from "./fiscal-billing.types";
import {
  requireCrDraftDocumentType,
  resolveCrDraftCommercialCondition,
  resolveCrDraftPaymentMethods,
  resolveCrDraftReceiverIdentity,
} from "./fiscal-draft-selection";
import {
  clientFiscalReceiverPrefill,
  type FiscalReceiverIdentityPrefill,
} from "./client-fiscal-receiver-prefill";
import { buildSalesOrderLineFiscalDescription } from "./sales-order-line-fiscal-description";

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
  receiverFiscalIdentity: FiscalReceiverIdentityPrefill;
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
        ...analysis.receiverFiscalIdentity,
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
        description: buildSalesOrderLineFiscalDescription({
          serviceName: source.serviceName,
          serviceCode: source.serviceCode,
          serviceDetailsVersion: source.serviceDetailsVersion,
          serviceDetails: source.serviceDetails,
        }),
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
    requireCrDraftDocumentType(input.documentTypeCode);
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
    resolveCrDraftCommercialCondition(analysis.salesOrder);
    const receiverIdentity = resolveCrDraftReceiverIdentity(
      input.documentTypeCode,
      input.receiverIdentificationTypeCode,
      input.receiverIdentificationNumber,
    );
    const paymentMethods = resolveCrDraftPaymentMethods(input.paymentMethodCodes);
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
    const command: CrV44SalesOrderDraftCommand = {
      tenantId,
      salesOrderId,
      fiscalIssuerId: issuer.id,
      internalNumber,
      documentTypeCode: input.documentTypeCode,
      receiverIdentificationType: receiverIdentity.identificationType,
      receiverIdentification: receiverIdentity.identification,
      paymentMethods,
      createdByUserId: actorId,
    };
    return this.billingDocumentService.createOrResumeCrV44SalesOrderDraft(
      command,
    );
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
    const receiverFiscalIdentity = clientFiscalReceiverPrefill(
      salesOrder.customerFiscalIdentity,
    );
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
    if (!receiverFiscalIdentity.receiverFiscalIdentityComplete) {
      issues.push({
        code: "RECEIVER_FISCAL_IDENTITY_INCOMPLETE",
        blocking: false,
      });
    }

    const lines = salesOrder.lines.map((source) => {
      if (source.fiscalItemCategory === null) {
        issues.push({
          code: "SALES_ORDER_LINE_FISCAL_CATEGORY_UNCLASSIFIED",
          blocking: true,
          lineId: source.id,
        });
        return {
          source,
          profile: null,
          readinessStatus: "INVALID" as const,
          issues: ["SALES_ORDER_LINE_FISCAL_CATEGORY_UNCLASSIFIED"],
        };
      }
      if (
        source.fiscalItemCategory !== "SERVICE" &&
        source.fiscalItemCategory !== "MERCHANDISE"
      ) {
        issues.push({
          code: "BILLING_DRAFT_FISCAL_SOURCE_UNSUPPORTED",
          blocking: true,
          lineId: source.id,
        });
        return {
          source,
          profile: null,
          readinessStatus: "INVALID" as const,
          issues: ["BILLING_DRAFT_FISCAL_SOURCE_UNSUPPORTED"],
        };
      }
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
      receiverFiscalIdentity,
    };
  }

  private assertDraftReady(analysis: Analysis): void {
    const blocking = analysis.issues.find((issue) => issue.blocking);
    if (blocking) {
      const exposeExistingLineIdentity =
        blocking.code !== "SALES_ORDER_LINE_FISCAL_CATEGORY_UNCLASSIFIED" &&
        blocking.code !== "BILLING_DRAFT_FISCAL_SOURCE_UNSUPPORTED";
      throw fiscalBillingError(
        blocking.code as Parameters<typeof fiscalBillingError>[0],
        exposeExistingLineIdentity && blocking.lineId
          ? { lineId: blocking.lineId }
          : undefined,
      );
    }
  }

}
