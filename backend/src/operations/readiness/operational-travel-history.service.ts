import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DEFAULT_FISCAL_TIMEZONE, nextTenantCalendarDate, tenantCalendarDateStartAsUtc } from "../../finance/tenant-fiscal-date";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import {
  ListOperationalTravelHistoryDto,
} from "./dto/list-operational-travel-history.dto";
import {
  sourceCategoryForOperationalWorkSourceType,
  sourceTypesForOperationalWorkCategory,
} from "./operational-work-source-filter";

const TERMINAL_STATUSES = ["CONFIRMED", "CANCELLED"] as const;
const TRAVEL_HISTORY_SOURCE_TYPES = ["TRAVEL_PACKAGE_COST_COMPONENT", "ADDITIONAL_SERVICE_ORDER_LINE"] as const;

type Tx = any;
type Db = { $transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> };
type HistoryContext = {
  requirementsById: Map<string, any>;
  travelPackagesById: Map<string, any>;
  passengersByFulfillmentId: Map<string, any[]>;
  purchasesByFulfillmentId: Map<string, any[]>;
  evidenceByFulfillmentId: Map<string, any[]>;
};

/**
 * Read-only terminal-execution history for TravelPackage Operations. The
 * source filter deliberately names only the two trip execution sources so
 * standalone Custom Quotation records can never enter this projection.
 */
@Injectable()
export class OperationalTravelHistoryService {
  private readonly database: Db;

  constructor(prisma: PrismaService) {
    this.database = prisma as unknown as Db;
  }

  async list(tenantId: string, input: Partial<ListOperationalTravelHistoryDto>, now = new Date()) {
    const page = positiveInteger(input.page, 1);
    const pageSize = boundedPageSize(input.pageSize);
    return runTenantTransaction(this.database, tenantId, async (tx) => {
      const configuration = hasDateFilter(input)
        ? await tx.tenantBillingConfiguration.findUnique({ where: { tenantId }, select: { fiscalTimezone: true } })
        : null;
      const dateRange = historyDateRange(input, configuration?.fiscalTimezone ?? DEFAULT_FISCAL_TIMEZONE, now);
      const where = historyWhere(tenantId, input, dateRange);
      const [fulfillments, total] = await Promise.all([
        tx.operationalFulfillment.findMany({
          where,
          select: FULFILLMENT_SELECT,
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.operationalFulfillment.count({ where }),
      ]);
      const context = await loadHistoryContext(tx, tenantId, fulfillments);
      return {
        items: fulfillments.map((fulfillment: any) => toHistoryItem(fulfillment, context)),
        total,
        page,
        pageSize,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
        dateAuthority: "FULFILLMENT_TERMINAL_UPDATED_AT",
      };
    });
  }

  async find(tenantId: string, fulfillmentId: string) {
    return runTenantTransaction(this.database, tenantId, async (tx) => {
      const fulfillment = await tx.operationalFulfillment.findFirst({
        where: { ...historyWhere(tenantId, {}, undefined), id: fulfillmentId },
        select: FULFILLMENT_SELECT,
      });
      if (!fulfillment) throw new NotFoundException("OPERATIONAL_TRAVEL_HISTORY_FULFILLMENT_NOT_FOUND");
      const context = await loadHistoryContext(tx, tenantId, [fulfillment]);
      const item = toHistoryItem(fulfillment, context);
      return {
        ...item,
        detailPayload: fulfillment.detailPayload ?? null,
        purchases: (context.purchasesByFulfillmentId.get(fulfillment.id) ?? []).map(toPurchase),
      };
    });
  }
}

const FULFILLMENT_SELECT = {
  id: true,
  travelPackageId: true,
  operationalRequirementId: true,
  servicePurposeCode: true,
  servicePurposeName: true,
  providerName: true,
  providerReference: true,
  reservationCode: true,
  confirmationReference: true,
  voucherReference: true,
  ticketReference: true,
  serviceStartAt: true,
  serviceEndAt: true,
  detailPayload: true,
  detailVersion: true,
  confirmationNotes: true,
  status: true,
  updatedAt: true,
} as const;

async function loadHistoryContext(tx: Tx, tenantId: string, fulfillments: any[]): Promise<HistoryContext> {
  const fulfillmentIds = fulfillments.map((item) => item.id);
  const requirementIds = unique(fulfillments.map((item) => item.operationalRequirementId));
  const travelPackageIds = unique(fulfillments.map((item) => item.travelPackageId));
  if (fulfillmentIds.length === 0) return emptyHistoryContext();

  const [requirements, travelPackages, passengers, purchases, evidence] = await Promise.all([
    tx.operationalRequirement.findMany({
      where: {
        tenantId,
        id: { in: requirementIds },
        travelPackageId: { in: travelPackageIds },
        scopeType: "TRAVEL_PACKAGE",
        sourceType: { in: TRAVEL_HISTORY_SOURCE_TYPES },
      },
      select: {
        id: true,
        travelPackageId: true,
        sourceType: true,
        sourceId: true,
        sourceLineId: true,
        sourceReference: true,
        servicePurposeCode: true,
        servicePurposeName: true,
        description: true,
      },
    }),
    tx.travelPackage.findMany({
      where: { tenantId, id: { in: travelPackageIds } },
      select: { id: true, packageCode: true, name: true, departureDate: true, returnDate: true },
    }),
    tx.operationalFulfillmentPassenger.findMany({
      where: { tenantId, operationalFulfillmentId: { in: fulfillmentIds } },
      select: {
        operationalFulfillmentId: true,
        travelPackageParticipantId: true,
        createdAt: true,
        id: true,
        travelPackageParticipant: {
          select: { id: true, clientId: true, role: true, client: { select: { fullName: true } } },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    tx.operationalPurchase.findMany({
      where: { tenantId, operationalFulfillmentId: { in: fulfillmentIds } },
      select: {
        id: true,
        operationalFulfillmentId: true,
        providerName: true,
        supplierReference: true,
        amount: true,
        currency: true,
        taxAmount: true,
        purchasedAt: true,
        supplierInvoiceNumber: true,
        notes: true,
      },
      orderBy: [{ purchasedAt: "desc" }, { id: "desc" }],
    }),
    tx.operationalEvidence.findMany({
      where: { tenantId, operationalFulfillmentId: { in: fulfillmentIds } },
      select: {
        id: true,
        operationalFulfillmentId: true,
        operationalPurchaseId: true,
        evidenceType: true,
        originalFilename: true,
        mimeType: true,
        byteSize: true,
        uploadedByUserId: true,
        uploadedByName: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);
  return {
    requirementsById: new Map(requirements.map((item: any) => [item.id, item])),
    travelPackagesById: new Map(travelPackages.map((item: any) => [item.id, item])),
    passengersByFulfillmentId: groupBy(passengers, "operationalFulfillmentId"),
    purchasesByFulfillmentId: groupBy(purchases, "operationalFulfillmentId"),
    evidenceByFulfillmentId: groupBy(evidence, "operationalFulfillmentId"),
  };
}

function emptyHistoryContext(): HistoryContext {
  return {
    requirementsById: new Map<string, any>(),
    travelPackagesById: new Map<string, any>(),
    passengersByFulfillmentId: new Map<string, any[]>(),
    purchasesByFulfillmentId: new Map<string, any[]>(),
    evidenceByFulfillmentId: new Map<string, any[]>(),
  };
}

function historyWhere(
  tenantId: string,
  input: Partial<ListOperationalTravelHistoryDto>,
  dateRange: { gte: Date; lt: Date } | undefined,
) {
  const terminalStatuses = input.terminalStatus && input.terminalStatus !== "ALL"
    ? [input.terminalStatus]
    : TERMINAL_STATUSES;
  const selectedSourceTypes = sourceTypesForOperationalWorkCategory(input.sourceCategory) ?? TRAVEL_HISTORY_SOURCE_TYPES;
  return {
    tenantId,
    travelPackageId: input.travelPackageId ?? { not: null },
    status: { in: terminalStatuses },
    ...(dateRange ? { updatedAt: dateRange } : {}),
    ...(input.travelPackageParticipantId ? {
      passengers: { some: { tenantId, travelPackageParticipantId: input.travelPackageParticipantId } },
    } : {}),
    operationalRequirement: {
      scopeType: "TRAVEL_PACKAGE",
      sourceType: { in: selectedSourceTypes },
    },
  };
}

function historyDateRange(
  input: Pick<ListOperationalTravelHistoryDto, "datePreset" | "dateFrom" | "dateTo">,
  timezone: string,
  now: Date,
): { gte: Date; lt: Date } | undefined {
  const preset = input.datePreset ?? ((input.dateFrom || input.dateTo) ? "CUSTOM" : undefined);
  if (!preset) return undefined;
  let from: string;
  let to: string;
  if (preset === "CUSTOM") {
    if (!input.dateFrom || !input.dateTo || input.dateFrom > input.dateTo) {
      throw new BadRequestException("OPERATIONAL_TRAVEL_HISTORY_DATE_RANGE_INVALID");
    }
    from = input.dateFrom;
    to = input.dateTo;
  } else {
    const today = tenantCalendarDate(now, timezone);
    const days = preset === "TODAY" ? 0 : preset === "LAST_7_DAYS" ? 6 : 29;
    from = shiftCalendarDate(today, -days);
    to = today;
  }
  return {
    gte: tenantCalendarDateStartAsUtc(from, timezone),
    lt: tenantCalendarDateStartAsUtc(nextTenantCalendarDate(to), timezone),
  };
}

function hasDateFilter(input: Pick<ListOperationalTravelHistoryDto, "datePreset" | "dateFrom" | "dateTo">) {
  return Boolean(input.datePreset || input.dateFrom || input.dateTo);
}

function tenantCalendarDate(value: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
    const year = part("year");
    const month = part("month");
    const day = part("day");
    if (!year || !month || !day) throw new Error("missing date part");
    return `${year}-${month}-${day}`;
  } catch {
    throw new BadRequestException("OPERATIONAL_TRAVEL_HISTORY_TIMEZONE_INVALID");
  }
}

function shiftCalendarDate(value: string, days: number) {
  const shifted = tenantCalendarDateStartAsUtc(value, "UTC");
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function toHistoryItem(fulfillment: any, context: HistoryContext) {
  const requirement = context.requirementsById.get(fulfillment.operationalRequirementId) ?? null;
  const travelPackage = context.travelPackagesById.get(fulfillment.travelPackageId) ?? null;
  const passengers = context.passengersByFulfillmentId.get(fulfillment.id) ?? [];
  const purchases = context.purchasesByFulfillmentId.get(fulfillment.id) ?? [];
  const evidence = context.evidenceByFulfillmentId.get(fulfillment.id) ?? [];
  const latestPurchase = purchases[0] ?? null;
  return {
    fulfillmentId: fulfillment.id,
    requirementId: fulfillment.operationalRequirementId,
    sourceType: requirement?.sourceType ?? null,
    sourceCategory: sourceCategoryForOperationalWorkSourceType(requirement?.sourceType) ?? null,
    terminalStatus: fulfillment.status,
    terminalAt: fulfillment.updatedAt,
    trip: travelPackage ? {
      travelPackageId: travelPackage.id,
      packageCode: travelPackage.packageCode,
      name: travelPackage.name,
      departureDate: travelPackage.departureDate,
      returnDate: travelPackage.returnDate,
    } : { travelPackageId: fulfillment.travelPackageId, packageCode: null, name: null, departureDate: null, returnDate: null },
    requirement: {
      servicePurposeCode: requirement?.servicePurposeCode ?? fulfillment.servicePurposeCode,
      servicePurposeName: requirement?.servicePurposeName ?? fulfillment.servicePurposeName,
      description: requirement?.description ?? null,
      sourceId: requirement?.sourceId ?? null,
      sourceLineId: requirement?.sourceLineId ?? null,
      sourceReference: requirement?.sourceReference ?? null,
    },
    passengers: passengers.map(toPassenger),
    passengerCount: passengers.length,
    reservation: {
      providerName: fulfillment.providerName,
      providerReference: fulfillment.providerReference,
      reservationCode: fulfillment.reservationCode,
      serviceStartAt: fulfillment.serviceStartAt,
      serviceEndAt: fulfillment.serviceEndAt,
    },
    purchase: latestPurchase ? toPurchase(latestPurchase) : null,
    purchaseCount: purchases.length,
    terminalContext: {
      confirmationReference: fulfillment.confirmationReference,
      voucherReference: fulfillment.voucherReference,
      ticketReference: fulfillment.ticketReference,
      confirmationNotes: fulfillment.confirmationNotes,
    },
    evidenceCount: evidence.length,
    evidence: evidence.map(toEvidence),
  };
}

function toPassenger(passenger: any) {
  return {
    travelPackageParticipantId: passenger.travelPackageParticipantId,
    clientId: passenger.travelPackageParticipant.clientId,
    fullName: passenger.travelPackageParticipant.client.fullName,
    role: passenger.travelPackageParticipant.role,
  };
}

function toPurchase(purchase: any) {
  return {
    purchaseId: purchase.id,
    providerName: purchase.providerName,
    supplierReference: purchase.supplierReference,
    amount: decimalText(purchase.amount),
    currency: purchase.currency,
    taxAmount: decimalText(purchase.taxAmount),
    purchasedAt: purchase.purchasedAt,
    supplierInvoiceNumber: purchase.supplierInvoiceNumber,
    notes: purchase.notes,
  };
}

function toEvidence(evidence: any) {
  return {
    evidenceId: evidence.id,
    purchaseId: evidence.operationalPurchaseId,
    evidenceType: evidence.evidenceType,
    originalFilename: evidence.originalFilename,
    mimeType: evidence.mimeType,
    byteSize: evidence.byteSize,
    uploadedBy: { userId: evidence.uploadedByUserId, name: evidence.uploadedByName },
    createdAt: evidence.createdAt,
  };
}

function groupBy(rows: any[], key: string) {
  const groups = new Map<string, any[]>();
  for (const row of rows) {
    const id = row[key];
    const values = groups.get(id) ?? [];
    values.push(row);
    groups.set(id, values);
  }
  return groups;
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function decimalText(value: any) {
  return value === null || value === undefined ? null : value.toFixed();
}

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && value! > 0 ? value! : fallback;
}

function boundedPageSize(value: number | undefined) {
  if (value === undefined) return 20;
  if (!Number.isInteger(value) || value < 1 || value > 25) {
    throw new BadRequestException("OPERATIONAL_TRAVEL_HISTORY_PAGE_SIZE_INVALID");
  }
  return value;
}
