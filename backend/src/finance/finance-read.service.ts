import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountReceivableStatus, BillingDocumentSourceRole, CommercialObligationStatus, PaymentAllocationStatus, PaymentPurpose, PaymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DailyExchangeRateResolver, convertDailyExchangeRateAmount } from "../exchange-rate/daily-exchange-rate.resolver";
import {
  ListAccountReceivableGroupItemsDto,
  ListAccountReceivableGroupsDto,
  ListContractObligationGroupContractsDto,
  ListContractObligationGroupsDto,
  ListContractPaymentsDto,
  ListAccountReceivablesDto,
  ListPaymentsDto,
  ListUnallocatedPaymentBalancesDto,
} from "./dto/finance.dto";
import {
  FINANCE_AUDIT_ACTIONS,
  FINANCE_AUDIT_ENTITY_TYPES,
} from "./finance-audit";
import { hasCompatibleAllocationCustomer } from "./payment-allocation.service";
import { canCancelPayment } from "./payment-cancellation-eligibility";

const DEFAULT_FISCAL_TIMEZONE = "America/Costa_Rica";

@Injectable()
export class FinanceReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dailyExchangeRates?: DailyExchangeRateResolver,
  ) {}

  async getContractCommercialObligation(tenantId: string, contractId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      select: { id: true },
    });
    if (!contract) throw new NotFoundException("CONTRACT_NOT_FOUND");

    const obligation = await this.prisma.commercialObligation.findUnique({
      where: {
        tenantId_sourceType_sourceId: {
          tenantId,
          sourceType: "CONTRACT",
          sourceId: contract.id,
        },
      },
    });
    if (!obligation) {
      return { contractId: contract.id, commercialObligation: null, payable: false };
    }
    const payable =
      (obligation.status === CommercialObligationStatus.OPEN ||
        obligation.status === CommercialObligationStatus.PARTIALLY_SETTLED) &&
      obligation.outstandingAmount.greaterThan(0);
    return {
      contractId: contract.id,
      commercialObligation: {
        id: obligation.id,
        currencyCode: obligation.currencyCode,
        originalAmount: money(obligation.originalAmount),
        outstandingAmount: money(obligation.outstandingAmount),
        status: obligation.status,
        dueDate: obligation.dueDate,
        settledAt: obligation.settledAt,
      },
      payable,
    };
  }

  async getAccountReceivableDetail(tenantId: string, id: string) {
    const [receivable, tenantCurrentCalendarDate] = await Promise.all([
      this.prisma.accountReceivable.findFirst({
        where: { id, tenantId },
        include: {
          paymentAllocations: {
            orderBy: { allocatedAt: "asc" },
            include: { payment: { select: { receiptNumber: true } }, reversal: true },
          },
        },
      }),
      this.getTenantCurrentCalendarDate(tenantId),
    ]);
    if (!receivable) throw new NotFoundException("ACCOUNT_RECEIVABLE_NOT_FOUND");
    const [auditRows, availablePaymentSummary] = await Promise.all([
      this.financeAuditRows(
        tenantId,
        [],
        receivable.paymentAllocations.map((allocation) => allocation.id),
        receivable.paymentAllocations.flatMap((allocation) => allocation.reversal ? [allocation.reversal.id] : []),
      ),
      receivable.customerId === null
        ? Promise.resolve(null)
        : this.prisma.payment.aggregate({
            where: {
              tenantId,
              customerId: receivable.customerId,
              currencyCode: receivable.currencyCode,
              ...availablePaymentConstraint(),
            },
            _sum: { availableAmount: true },
            _count: { _all: true },
          }),
    ]);
    return accountReceivableDetail(
      receivable,
      tenantCurrentCalendarDate,
      auditRows,
      availablePaymentSummary,
    );
  }

  async getPaymentDetail(tenantId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, tenantId },
      include: {
        allocations: {
          orderBy: { allocatedAt: "asc" },
          include: { accountReceivable: true, reversal: true },
        },
      },
    });
    if (!payment) throw new NotFoundException("PAYMENT_NOT_FOUND");
    const auditRows = await this.financeAuditRows(
      tenantId,
      [payment.id],
      payment.allocations.map((allocation) => allocation.id),
      payment.allocations.flatMap((allocation) => allocation.reversal ? [allocation.reversal.id] : []),
    );
    return paymentDetail(payment, auditRows);
  }

  async getAllocationSuggestion(
    tenantId: string,
    paymentId: string,
    accountReceivableId: string,
  ) {
    const [payment, receivable] = await Promise.all([
      this.prisma.payment.findFirst({
        where: { id: paymentId, tenantId },
        select: {
          id: true,
          customerId: true,
          currencyCode: true,
          receivedAmount: true,
          availableAmount: true,
          status: true,
        },
      }),
      this.prisma.accountReceivable.findFirst({
        where: { id: accountReceivableId, tenantId },
        select: {
          id: true,
          customerId: true,
          currencyCode: true,
          originalAmount: true,
          outstandingAmount: true,
          status: true,
        },
      }),
    ]);
    if (!payment || !receivable) {
      throw new NotFoundException("PAYMENT_OR_ACCOUNT_RECEIVABLE_NOT_FOUND");
    }
    if (
      (payment.status !== PaymentStatus.RECEIVED && payment.status !== PaymentStatus.PARTIALLY_ALLOCATED) ||
      !isAllocatableMoney(payment.receivedAmount, payment.availableAmount)
    ) {
      throw new ConflictException("PAYMENT_NOT_ALLOCATABLE");
    }
    if (
      (receivable.status !== AccountReceivableStatus.OPEN && receivable.status !== AccountReceivableStatus.PARTIALLY_SETTLED) ||
      !isAllocatableMoney(receivable.originalAmount, receivable.outstandingAmount)
    ) {
      throw new ConflictException("ACCOUNT_RECEIVABLE_NOT_ALLOCATABLE");
    }
    if (payment.currencyCode !== receivable.currencyCode) {
      throw new ConflictException("PAYMENT_ALLOCATION_CURRENCY_MISMATCH");
    }
    if (!hasCompatibleAllocationCustomer(payment.customerId, receivable.customerId)) {
      throw new ConflictException("PAYMENT_ALLOCATION_CUSTOMER_MISMATCH");
    }
    const suggestedAmount = payment.availableAmount.lessThan(receivable.outstandingAmount)
      ? payment.availableAmount
      : receivable.outstandingAmount;
    const remainingAfterSuggestion = payment.availableAmount.minus(suggestedAmount);
    return {
      paymentId: payment.id,
      accountReceivableId: receivable.id,
      currencyCode: payment.currencyCode,
      paymentAvailableAmount: money(payment.availableAmount),
      accountReceivableOutstandingAmount: money(receivable.outstandingAmount),
      suggestedAmount: money(suggestedAmount),
      remainingAfterSuggestion: money(remainingAfterSuggestion),
      hasRemainingAfterSuggestion: remainingAfterSuggestion.greaterThan(0),
    };
  }

  async getPaymentIdForAllocation(tenantId: string, id: string): Promise<string> {
    const allocation = await this.prisma.paymentAllocation.findFirst({
      where: { id, tenantId },
      select: { paymentId: true },
    });
    if (!allocation) throw new NotFoundException("PAYMENT_ALLOCATION_NOT_FOUND");
    return allocation.paymentId;
  }

  async listAccountReceivables(tenantId: string, query: ListAccountReceivablesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = accountReceivableWhere(tenantId, query);
    const tenantCurrentCalendarDate = await this.getTenantCurrentCalendarDate(tenantId);
    const [receivables, total] = await Promise.all([
      this.prisma.accountReceivable.findMany({
        where,
        select: accountReceivableListSelect,
        orderBy: [{ dueDate: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.accountReceivable.count({ where }),
    ]);
    return {
      accountReceivables: receivables.map((receivable) =>
        accountReceivableListItem(receivable, tenantCurrentCalendarDate),
      ),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async listAccountReceivableGroups(
    tenantId: string,
    query: ListAccountReceivableGroupsDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    const tenantCurrentCalendarDate = await this.getTenantCurrentCalendarDate(tenantId);
    const tenantToday = dateOnly(tenantCurrentCalendarDate);
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<AccountReceivableGroupRow[]>`
        WITH grouped AS (
          SELECT
            CASE WHEN "customerId" IS NULL THEN 'RECEIVABLE' ELSE 'CUSTOMER' END AS "groupKind",
            COALESCE("customerId", "id") AS "groupIdentity",
            "customerId",
            "currencyCode",
            (ARRAY_AGG("debtorDisplayName" ORDER BY "recognizedAt" DESC, "id" DESC))[1] AS "debtorDisplayName",
            (ARRAY_AGG("debtorIdentificationType" ORDER BY "recognizedAt" DESC, "id" DESC))[1] AS "debtorIdentificationType",
            (ARRAY_AGG("debtorIdentificationNumber" ORDER BY "recognizedAt" DESC, "id" DESC))[1] AS "debtorIdentificationNumber",
            SUM(CASE WHEN "status" <> 'CANCELLED' THEN "originalAmount" ELSE 0 END) AS "totalOriginalAmount",
            SUM(CASE WHEN "status" <> 'CANCELLED' THEN "originalAmount" - "outstandingAmount" ELSE 0 END) AS "totalAllocatedAmount",
            SUM(CASE WHEN "status" <> 'CANCELLED' THEN "outstandingAmount" ELSE 0 END) AS "totalOutstandingAmount",
            SUM(CASE WHEN "status" IN ('OPEN', 'PARTIALLY_SETTLED') AND "dueDate" < ${tenantToday} THEN "outstandingAmount" ELSE 0 END) AS "totalOverdueOutstandingAmount",
            COUNT(*) AS "totalCount",
            COUNT(*) FILTER (WHERE "status" = 'OPEN') AS "openCount",
            COUNT(*) FILTER (WHERE "status" = 'PARTIALLY_SETTLED') AS "partiallySettledCount",
            COUNT(*) FILTER (WHERE "status" = 'SETTLED') AS "settledCount",
            COUNT(*) FILTER (WHERE "status" = 'CANCELLED') AS "cancelledCount",
            COUNT(*) FILTER (WHERE "status" IN ('OPEN', 'PARTIALLY_SETTLED') AND "dueDate" < ${tenantToday}) AS "overdueCount"
          FROM "account_receivables"
          WHERE "tenantId" = ${tenantId}
          GROUP BY
            CASE WHEN "customerId" IS NULL THEN 'RECEIVABLE' ELSE 'CUSTOMER' END,
            COALESCE("customerId", "id"),
            "customerId",
            "currencyCode"
        ),
        paged AS (
          SELECT * FROM grouped
          ORDER BY LOWER("debtorDisplayName") ASC, "groupKind" ASC, "groupIdentity" ASC, "currencyCode" ASC
          LIMIT ${pageSize}
          OFFSET ${offset}
        ),
        unallocated_payments AS (
          SELECT
            "customerId",
            "currencyCode",
            SUM("availableAmount") AS "unallocatedPaymentAmount",
            COUNT(*) AS "unallocatedPaymentCount"
          FROM "payments"
          WHERE "tenantId" = ${tenantId}
            AND "customerId" IS NOT NULL
            AND "availableAmount" > 0
            AND "status" IN ('RECEIVED', 'PARTIALLY_ALLOCATED')
          GROUP BY "customerId", "currencyCode"
        ),
        received_payments AS (
          SELECT
            "customerId",
            "currencyCode",
            SUM("receivedAmount") AS "totalReceivedAmount"
          FROM "payments"
          WHERE "tenantId" = ${tenantId}
            AND "customerId" IS NOT NULL
            AND "status" <> 'CANCELLED'
          GROUP BY "customerId", "currencyCode"
        ),
        active_payment_allocations AS (
          SELECT
            payment."customerId",
            payment."currencyCode",
            SUM(allocation."amount") AS "totalActiveAllocatedAmount"
          FROM "payments" AS payment
          INNER JOIN "payment_allocations" AS allocation
            ON allocation."tenantId" = payment."tenantId"
            AND allocation."paymentId" = payment."id"
          WHERE payment."tenantId" = ${tenantId}
            AND payment."customerId" IS NOT NULL
            AND payment."status" <> 'CANCELLED'
            AND allocation."status" = 'ACTIVE'
          GROUP BY payment."customerId", payment."currencyCode"
        )
        SELECT
          paged.*,
          unallocated_payments."unallocatedPaymentAmount",
          unallocated_payments."unallocatedPaymentCount",
          received_payments."totalReceivedAmount",
          active_payment_allocations."totalActiveAllocatedAmount"
        FROM paged
        LEFT JOIN unallocated_payments
          ON paged."customerId" = unallocated_payments."customerId"
          AND paged."currencyCode" = unallocated_payments."currencyCode"
        LEFT JOIN received_payments
          ON paged."customerId" = received_payments."customerId"
          AND paged."currencyCode" = received_payments."currencyCode"
        LEFT JOIN active_payment_allocations
          ON paged."customerId" = active_payment_allocations."customerId"
          AND paged."currencyCode" = active_payment_allocations."currencyCode"
        ORDER BY LOWER(paged."debtorDisplayName") ASC, paged."groupKind" ASC, paged."groupIdentity" ASC, paged."currencyCode" ASC
      `,
      this.prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(*) AS "total"
        FROM (
          SELECT 1
          FROM "account_receivables"
          WHERE "tenantId" = ${tenantId}
          GROUP BY
            CASE WHEN "customerId" IS NULL THEN 'RECEIVABLE' ELSE 'CUSTOMER' END,
            COALESCE("customerId", "id"),
            "customerId",
            "currencyCode"
        ) AS grouped
      `,
    ]);
    const total = exactCount(totals[0]?.total ?? 0);
    return {
      groups: rows.map(accountReceivableGroup),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async listContractObligationGroups(
    tenantId: string,
    query: ListContractObligationGroupsDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    const tenantCurrentCalendarDate = await this.getTenantCurrentCalendarDate(tenantId);
    const tenantToday = dateOnly(tenantCurrentCalendarDate);
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<ContractObligationGroupRow[]>`
        WITH grouped AS (
          SELECT
            obligation."customerId",
            obligation."currencyCode",
            customer."fullName" AS "debtorDisplayName",
            customer."idType" AS "debtorIdentificationType",
            customer."idNumber" AS "debtorIdentificationNumber",
            SUM(CASE WHEN obligation."status" <> 'CANCELLED' THEN obligation."originalAmount" ELSE 0 END) AS "totalOriginalAmount",
            SUM(CASE WHEN obligation."status" <> 'CANCELLED' THEN obligation."originalAmount" - obligation."outstandingAmount" ELSE 0 END) AS "totalPaidAmount",
            SUM(CASE WHEN obligation."status" <> 'CANCELLED' THEN obligation."outstandingAmount" ELSE 0 END) AS "totalOutstandingAmount",
            COUNT(*) AS "totalCount",
            COUNT(*) FILTER (WHERE obligation."status" = 'OPEN') AS "openCount",
            COUNT(*) FILTER (WHERE obligation."status" = 'PARTIALLY_SETTLED') AS "partiallySettledCount",
            COUNT(*) FILTER (WHERE obligation."status" = 'SETTLED') AS "settledCount",
            COUNT(*) FILTER (WHERE obligation."status" = 'CANCELLED') AS "cancelledCount",
            COUNT(*) FILTER (
              WHERE obligation."status" IN ('OPEN', 'PARTIALLY_SETTLED')
                AND obligation."outstandingAmount" > 0
                AND obligation."dueDate" IS NOT NULL
                AND obligation."dueDate" < ${tenantToday}
            ) AS "overdueCount"
          FROM "commercial_obligations" AS obligation
          INNER JOIN "Contract" AS contract
            ON contract."id" = obligation."sourceId"
            AND contract."tenantId" = obligation."tenantId"
          INNER JOIN "Client" AS customer
            ON customer."id" = obligation."customerId"
            AND customer."tenantId" = obligation."tenantId"
          WHERE obligation."tenantId" = ${tenantId}
            AND obligation."sourceType" = 'CONTRACT'
          GROUP BY
            obligation."customerId",
            obligation."currencyCode",
            customer."fullName",
            customer."idType",
            customer."idNumber"
        )
        SELECT *
        FROM grouped
        ORDER BY LOWER("debtorDisplayName") ASC, "customerId" ASC, "currencyCode" ASC
        LIMIT ${pageSize}
        OFFSET ${offset}
      `,
      this.prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(*) AS "total"
        FROM (
          SELECT 1
          FROM "commercial_obligations" AS obligation
          INNER JOIN "Contract" AS contract
            ON contract."id" = obligation."sourceId"
            AND contract."tenantId" = obligation."tenantId"
          INNER JOIN "Client" AS customer
            ON customer."id" = obligation."customerId"
            AND customer."tenantId" = obligation."tenantId"
          WHERE obligation."tenantId" = ${tenantId}
            AND obligation."sourceType" = 'CONTRACT'
          GROUP BY obligation."customerId", obligation."currencyCode"
        ) AS grouped
      `,
    ]);
    const total = exactCount(totals[0]?.total ?? 0);
    return {
      items: rows.map(contractObligationGroup),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async listContractObligationGroupContracts(
    tenantId: string,
    groupKey: string,
    query: ListContractObligationGroupContractsDto,
  ) {
    const group = decodeContractObligationGroupKey(groupKey);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    const tenantCurrentCalendarDate = await this.getTenantCurrentCalendarDate(tenantId);
    const tenantToday = dateOnly(tenantCurrentCalendarDate);
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<ContractObligationPortfolioRow[]>`
        WITH eligible AS (
          SELECT
            contract."id" AS "contractId",
            contract."contractNumber",
            contract."source" AS "contractSource",
            contract."destination",
            contract."startDate",
            contract."endDate",
            contract."createdAt" AS "contractCreatedAt",
            contract."travelPackageId",
            contract."internalTripId",
            travel_package."name" AS "travelPackageName",
            travel_package."travelType" AS "travelType",
            internal_trip."name" AS "internalTripName",
            obligation."currencyCode",
            obligation."originalAmount",
            obligation."outstandingAmount",
            obligation."dueDate",
            obligation."status",
            obligation."settledAt"
          FROM "commercial_obligations" AS obligation
          INNER JOIN "Contract" AS contract
            ON contract."id" = obligation."sourceId"
            AND contract."tenantId" = obligation."tenantId"
          LEFT JOIN "TravelPackage" AS travel_package
            ON travel_package."id" = contract."travelPackageId"
            AND travel_package."tenantId" = contract."tenantId"
          LEFT JOIN "internal_trips" AS internal_trip
            ON internal_trip."id" = contract."internalTripId"
            AND internal_trip."tenantId" = contract."tenantId"
          WHERE obligation."tenantId" = ${tenantId}
            AND obligation."sourceType" = 'CONTRACT'
            AND obligation."customerId" = ${group.customerId}
            AND obligation."currencyCode" = ${group.currencyCode}
        ),
        paged AS (
          SELECT *
          FROM eligible
          ORDER BY "contractCreatedAt" DESC, "contractNumber" ASC, "contractId" ASC
          LIMIT ${pageSize}
          OFFSET ${offset}
        ),
        payment_counts AS (
          SELECT payment."contractId", COUNT(*) AS "paymentCount"
          FROM "payments" AS payment
          INNER JOIN paged ON paged."contractId" = payment."contractId"
          WHERE payment."tenantId" = ${tenantId}
            AND payment."purpose" IN ('CONTRACT_RESERVATION', 'CONTRACT_PAYMENT', 'CONTRACT_INSTALLMENT')
          GROUP BY payment."contractId"
        )
        SELECT paged.*, COALESCE(payment_counts."paymentCount", 0) AS "paymentCount"
        FROM paged
        LEFT JOIN payment_counts ON payment_counts."contractId" = paged."contractId"
        ORDER BY paged."contractCreatedAt" DESC, paged."contractNumber" ASC, paged."contractId" ASC
      `,
      this.prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(*) AS "total"
        FROM "commercial_obligations" AS obligation
        INNER JOIN "Contract" AS contract
          ON contract."id" = obligation."sourceId"
          AND contract."tenantId" = obligation."tenantId"
        WHERE obligation."tenantId" = ${tenantId}
          AND obligation."sourceType" = 'CONTRACT'
          AND obligation."customerId" = ${group.customerId}
          AND obligation."currencyCode" = ${group.currencyCode}
      `,
    ]);
    const total = exactCount(totals[0]?.total ?? 0);
    if (total === 0) throw new NotFoundException("CONTRACT_OBLIGATION_GROUP_NOT_FOUND");
    return {
      groupKey,
      items: rows.map((row) => contractObligationPortfolioItem(row, tenantCurrentCalendarDate)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async listContractPayments(
    tenantId: string,
    contractId: string,
    query: ListContractPaymentsDto,
  ) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      select: { id: true },
    });
    if (!contract) throw new NotFoundException("CONTRACT_NOT_FOUND");
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.PaymentWhereInput = {
      tenantId,
      contractId: contract.id,
      purpose: { in: contractPaymentPurposes },
    };
    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        select: contractPaymentHistorySelect,
        orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);
    const fiscalDocuments = payments.length
      ? await this.prisma.billingDocument.findMany({
          where: {
            tenantId,
            sourceType: "CONTRACT_PAYMENT",
            sourceId: { in: payments.map((payment) => payment.id) },
            sourceRole: BillingDocumentSourceRole.PRIMARY,
          },
          select: contractPaymentFiscalDocumentSelect,
        })
      : [];
    const fiscalDocumentsByPaymentId = new Map(
      fiscalDocuments.map((document) => [document.sourceId, document]),
    );
    return {
      items: payments.map((payment) =>
        contractPaymentHistoryItem(payment, fiscalDocumentsByPaymentId.get(payment.id) ?? null),
      ),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async listAccountReceivableGroupItems(
    tenantId: string,
    groupKey: string,
    query: ListAccountReceivableGroupItemsDto,
  ) {
    const group = decodeAccountReceivableGroupKey(groupKey);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.AccountReceivableWhereInput = group.kind === "CUSTOMER"
      ? {
          tenantId,
          customerId: group.identity,
          currencyCode: group.currencyCode,
        }
      : {
          tenantId,
          id: group.identity,
          customerId: null,
          currencyCode: group.currencyCode,
        };
    const tenantCurrentCalendarDate = await this.getTenantCurrentCalendarDate(tenantId);
    const [receivables, total] = await Promise.all([
      this.prisma.accountReceivable.findMany({
        where,
        select: accountReceivableListSelect,
        orderBy: [{ dueDate: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.accountReceivable.count({ where }),
    ]);
    if (total === 0) throw new NotFoundException("ACCOUNT_RECEIVABLE_GROUP_NOT_FOUND");
    return {
      groupKey,
      accountReceivables: receivables.map((receivable) =>
        accountReceivableListItem(receivable, tenantCurrentCalendarDate),
      ),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async listPayments(tenantId: string, query: ListPaymentsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const constraints: Prisma.PaymentWhereInput[] = [];
    if (query.status) constraints.push({ status: query.status });
    if (query.availableOnly) {
      constraints.push(availablePaymentConstraint());
    }
    const where: Prisma.PaymentWhereInput = {
      tenantId,
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.currency ? { currencyCode: query.currency } : {}),
      ...(constraints.length ? { AND: constraints } : {}),
    };
    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        select: paymentListSelect,
        orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return {
      payments: payments.map(paymentListItem),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async listUnallocatedPaymentBalances(
    tenantId: string,
    query: ListUnallocatedPaymentBalancesDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<UnallocatedPaymentBalanceRow[]>`
        SELECT
          "customerId",
          "currencyCode",
          (ARRAY_AGG("payerDisplayName" ORDER BY "receivedAt" DESC, "id" DESC))[1] AS "payerDisplayName",
          (ARRAY_AGG("payerIdentificationType" ORDER BY "receivedAt" DESC, "id" DESC))[1] AS "payerIdentificationType",
          (ARRAY_AGG("payerIdentificationNumber" ORDER BY "receivedAt" DESC, "id" DESC))[1] AS "payerIdentificationNumber",
          SUM("availableAmount") AS "unallocatedPaymentAmount",
          COUNT(*) AS "unallocatedPaymentCount"
        FROM "payments"
        WHERE "tenantId" = ${tenantId}
          AND "customerId" IS NOT NULL
          AND "availableAmount" > 0
          AND "status" IN ('RECEIVED', 'PARTIALLY_ALLOCATED')
        GROUP BY "customerId", "currencyCode"
        ORDER BY LOWER((ARRAY_AGG("payerDisplayName" ORDER BY "receivedAt" DESC, "id" DESC))[1]) ASC, "customerId" ASC, "currencyCode" ASC
        LIMIT ${pageSize}
        OFFSET ${offset}
      `,
      this.prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(*) AS "total"
        FROM (
          SELECT 1
          FROM "payments"
          WHERE "tenantId" = ${tenantId}
            AND "customerId" IS NOT NULL
            AND "availableAmount" > 0
            AND "status" IN ('RECEIVED', 'PARTIALLY_ALLOCATED')
          GROUP BY "customerId", "currencyCode"
        ) AS grouped
      `,
    ]);
    const total = exactCount(totals[0]?.total ?? 0);
    return {
      balances: rows.map(unallocatedPaymentBalance),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getCustomerFinancialBalance(tenantId: string, customerId: string) {
    const openStatuses = [AccountReceivableStatus.OPEN, AccountReceivableStatus.PARTIALLY_SETTLED];
    const where = { tenantId, customerId, status: { in: openStatuses } };
    const tenantCurrentCalendarDate = await this.getTenantCurrentCalendarDate(tenantId);
    const overdueWhere = { ...where, dueDate: { lt: dateOnly(tenantCurrentCalendarDate) } };
    const [balances, overdueBalances] = await Promise.all([
      this.prisma.accountReceivable.groupBy({
        by: ["currencyCode"],
        where,
        _sum: { outstandingAmount: true },
        _count: { _all: true },
      }),
      this.prisma.accountReceivable.groupBy({
        by: ["currencyCode"],
        where: overdueWhere,
        _sum: { outstandingAmount: true },
        _count: { _all: true },
      }),
    ]);
    const overdueByCurrency = new Map(overdueBalances.map((row) => [row.currencyCode, row]));
    return {
      customerId,
      balances: balances.map((row) => {
        const overdue = overdueByCurrency.get(row.currencyCode);
        return {
          currencyCode: row.currencyCode,
          totalOutstandingAmount: money(row._sum.outstandingAmount ?? new Prisma.Decimal(0)),
          openOrPartiallySettledCount: row._count._all,
          overdueOutstandingAmount: money(overdue?._sum.outstandingAmount ?? new Prisma.Decimal(0)),
          overdueCount: overdue?._count._all ?? 0,
        };
      }),
    };
  }

  async getCustomerFinancialSummary(tenantId: string, customerId: string) {
    const rows = await this.prisma.$queryRaw<CustomerFinancialSummaryRow[]>`
      WITH commercial_obligations AS (
        SELECT
          "currencyCode",
          SUM("originalAmount") AS "totalContracted",
          SUM("originalAmount" - "outstandingAmount") AS "commercialPaid",
          SUM("outstandingAmount") AS "commercialOutstanding"
        FROM "commercial_obligations"
        WHERE "tenantId" = ${tenantId}
          AND "customerId" = ${customerId}
          AND "sourceType" = 'CONTRACT'
          AND "status" <> 'CANCELLED'
        GROUP BY "currencyCode"
      ),
      account_receivables AS (
        SELECT
          "currencyCode",
          SUM("originalAmount") AS "totalInvoiced",
          SUM("originalAmount" - "outstandingAmount") AS "receivablePaid",
          SUM("outstandingAmount") AS "receivableOutstanding"
        FROM "account_receivables"
        WHERE "tenantId" = ${tenantId}
          AND "customerId" = ${customerId}
          AND "status" <> 'CANCELLED'
        GROUP BY "currencyCode"
      ),
      available_payments AS (
        SELECT
          "currencyCode",
          SUM("availableAmount") AS "available"
        FROM "payments"
        WHERE "tenantId" = ${tenantId}
          AND "customerId" = ${customerId}
          AND "status" IN ('RECEIVED', 'PARTIALLY_ALLOCATED')
          AND "availableAmount" > 0
        GROUP BY "currencyCode"
      ),
      currency_keys AS (
        SELECT "currencyCode" FROM commercial_obligations
        UNION
        SELECT "currencyCode" FROM account_receivables
        UNION
        SELECT "currencyCode" FROM available_payments
      )
      SELECT
        currency_keys."currencyCode",
        COALESCE(commercial_obligations."totalContracted", 0) AS "totalContracted",
        COALESCE(account_receivables."totalInvoiced", 0) AS "totalInvoiced",
        COALESCE(commercial_obligations."commercialPaid", 0)
          + COALESCE(account_receivables."receivablePaid", 0) AS "totalPaid",
        COALESCE(commercial_obligations."commercialOutstanding", 0)
          + COALESCE(account_receivables."receivableOutstanding", 0) AS "outstanding",
        COALESCE(available_payments."available", 0) AS "available"
      FROM currency_keys
      LEFT JOIN commercial_obligations
        ON commercial_obligations."currencyCode" = currency_keys."currencyCode"
      LEFT JOIN account_receivables
        ON account_receivables."currencyCode" = currency_keys."currencyCode"
      LEFT JOIN available_payments
        ON available_payments."currencyCode" = currency_keys."currencyCode"
      ORDER BY currency_keys."currencyCode" ASC
    `;

    const currencies = rows.map((row) => ({
        currencyCode: row.currencyCode,
        totalContracted: money(row.totalContracted),
        totalInvoiced: money(row.totalInvoiced),
        totalPaid: money(row.totalPaid),
        outstanding: money(row.outstanding),
        available: money(row.available),
      }));
    const exchangeRate = await this.dailyExchangeRates!.resolveDailyExchangeRate({
      tenantId,
      currencyCodes: rows.map((row) => row.currencyCode),
    });

    return {
      customerId,
      baseCurrencyCode: exchangeRate.baseCurrencyCode,
      consolidated: consolidatedSummary(rows, exchangeRate),
      currencies,
      exchangeRateContext: exchangeRate.status === "NOT_REQUIRED"
        ? null
        : { source: exchangeRate.source, effectiveDate: exchangeRate.effectiveDate, status: exchangeRate.status },
    };
  }

  paymentSummary(payment: {
    id: string; receiptNumber: string; status: string; currencyCode: string; receivedAmount: Prisma.Decimal;
    availableAmount: Prisma.Decimal; receivedAt: Date; cancelledAt: Date | null;
  }) {
    return {
      id: payment.id,
      receiptNumber: payment.receiptNumber,
      status: payment.status,
      currencyCode: payment.currencyCode,
      receivedAmount: money(payment.receivedAmount),
      availableAmount: money(payment.availableAmount),
      receivedAt: payment.receivedAt,
      cancelledAt: payment.cancelledAt,
    };
  }

  private async financeAuditRows(
    tenantId: string,
    paymentIds: string[],
    allocationIds: string[],
    reversalIds: string[],
  ): Promise<FinanceAuditRow[]> {
    const filters: Prisma.BillingAuditLogWhereInput[] = [];
    if (paymentIds.length) {
      filters.push({
        entityType: FINANCE_AUDIT_ENTITY_TYPES.PAYMENT,
        entityId: { in: paymentIds },
        action: { in: [FINANCE_AUDIT_ACTIONS.REGISTERED, FINANCE_AUDIT_ACTIONS.CANCELLED] },
      });
    }
    if (allocationIds.length) {
      filters.push({
        entityType: FINANCE_AUDIT_ENTITY_TYPES.ALLOCATION,
        entityId: { in: allocationIds },
        action: FINANCE_AUDIT_ACTIONS.APPLIED,
      });
    }
    if (reversalIds.length) {
      filters.push({
        entityType: FINANCE_AUDIT_ENTITY_TYPES.REVERSAL,
        entityId: { in: reversalIds },
        action: FINANCE_AUDIT_ACTIONS.REVERSED,
      });
    }
    if (!filters.length) return [];
    return this.prisma.billingAuditLog.findMany({
      where: { tenantId, OR: filters },
      select: financeAuditSelect,
      orderBy: { createdAt: "asc" },
    });
  }

  private async getTenantCurrentCalendarDate(tenantId: string): Promise<string> {
    const configuration = await this.prisma.tenantBillingConfiguration.findUnique({
      where: { tenantId },
      select: { fiscalTimezone: true },
    });
    return tenantCalendarDate(
      new Date(),
      configuration?.fiscalTimezone ?? DEFAULT_FISCAL_TIMEZONE,
    );
  }
}

const accountReceivableListSelect = {
  id: true,
  customerId: true,
  debtorDisplayName: true,
  debtorIdentificationType: true,
  debtorIdentificationNumber: true,
  currencyCode: true,
  originalAmount: true,
  outstandingAmount: true,
  dueDate: true,
  status: true,
  recognizedAt: true,
  settledAt: true,
  sourceType: true,
  sourceId: true,
  sourceNumber: true,
  sourceDocumentType: true,
} satisfies Prisma.AccountReceivableSelect;

const paymentListSelect = {
  id: true,
  receiptNumber: true,
  customerId: true,
  payerDisplayName: true,
  payerIdentificationType: true,
  payerIdentificationNumber: true,
  currencyCode: true,
  receivedAmount: true,
  availableAmount: true,
  receivedAt: true,
  paymentMethod: true,
  externalReference: true,
  description: true,
  status: true,
  cancelledAt: true,
} satisfies Prisma.PaymentSelect;

const contractPaymentPurposes: PaymentPurpose[] = [
  PaymentPurpose.CONTRACT_RESERVATION,
  PaymentPurpose.CONTRACT_PAYMENT,
  PaymentPurpose.CONTRACT_INSTALLMENT,
];

const contractPaymentHistorySelect = {
  id: true,
  contractId: true,
  receiptNumber: true,
  purpose: true,
  status: true,
  receivedAmount: true,
  availableAmount: true,
  currencyCode: true,
  paymentMethod: true,
  receivedAt: true,
  externalReference: true,
  description: true,
  commercialObligationAllocations: {
    orderBy: [{ allocatedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      amount: true,
      status: true,
      allocatedAt: true,
      reversal: { select: { reversedAt: true, reason: true } },
      commercialObligation: { select: { sourceType: true, sourceId: true } },
    },
  },
} satisfies Prisma.PaymentSelect;

const contractPaymentFiscalDocumentSelect = {
  id: true,
  sourceId: true,
  internalNumber: true,
  fiscalNumber: true,
  documentTypeCode: true,
  lifecycleStatus: true,
  providerStatus: true,
  taxAuthorityStatus: true,
  issuedAt: true,
} satisfies Prisma.BillingDocumentSelect;

type AccountReceivableGroupRow = {
  groupKind: "CUSTOMER" | "RECEIVABLE";
  groupIdentity: string;
  customerId: string | null;
  currencyCode: string;
  debtorDisplayName: string;
  debtorIdentificationType: string | null;
  debtorIdentificationNumber: string | null;
  totalOriginalAmount: Prisma.Decimal;
  totalAllocatedAmount: Prisma.Decimal;
  totalOutstandingAmount: Prisma.Decimal;
  totalOverdueOutstandingAmount: Prisma.Decimal;
  totalCount: bigint | number;
  openCount: bigint | number;
  partiallySettledCount: bigint | number;
  settledCount: bigint | number;
  cancelledCount: bigint | number;
  overdueCount: bigint | number;
  unallocatedPaymentAmount: Prisma.Decimal | null;
  unallocatedPaymentCount: bigint | number | null;
  totalReceivedAmount: Prisma.Decimal | null;
  totalActiveAllocatedAmount: Prisma.Decimal | null;
};

type ContractObligationGroupRow = {
  customerId: string;
  currencyCode: string;
  debtorDisplayName: string;
  debtorIdentificationType: string | null;
  debtorIdentificationNumber: string | null;
  totalOriginalAmount: Prisma.Decimal;
  totalPaidAmount: Prisma.Decimal;
  totalOutstandingAmount: Prisma.Decimal;
  totalCount: bigint | number;
  openCount: bigint | number;
  partiallySettledCount: bigint | number;
  settledCount: bigint | number;
  cancelledCount: bigint | number;
  overdueCount: bigint | number;
};

type ContractObligationPortfolioRow = {
  contractId: string;
  contractNumber: string;
  contractSource: string;
  destination: string;
  startDate: Date | null;
  endDate: Date | null;
  contractCreatedAt: Date;
  travelPackageId: string | null;
  internalTripId: string | null;
  travelPackageName: string | null;
  travelType: string | null;
  internalTripName: string | null;
  currencyCode: string;
  originalAmount: Prisma.Decimal;
  outstandingAmount: Prisma.Decimal;
  dueDate: Date | null;
  status: CommercialObligationStatus;
  settledAt: Date | null;
  paymentCount: bigint | number;
};

type UnallocatedPaymentBalanceRow = {
  customerId: string;
  currencyCode: string;
  payerDisplayName: string;
  payerIdentificationType: string | null;
  payerIdentificationNumber: string | null;
  unallocatedPaymentAmount: Prisma.Decimal;
  unallocatedPaymentCount: bigint | number;
};

type CustomerFinancialSummaryRow = {
  currencyCode: string;
  totalContracted: Prisma.Decimal;
  totalInvoiced: Prisma.Decimal;
  totalPaid: Prisma.Decimal;
  outstanding: Prisma.Decimal;
  available: Prisma.Decimal;
};

function consolidatedSummary(
  rows: readonly CustomerFinancialSummaryRow[],
  exchangeRate: Parameters<typeof convertDailyExchangeRateAmount>[2],
) {
  const totals = {
    totalContracted: new Prisma.Decimal(0),
    totalInvoiced: new Prisma.Decimal(0),
    totalPaid: new Prisma.Decimal(0),
    outstanding: new Prisma.Decimal(0),
    available: new Prisma.Decimal(0),
  };
  for (const row of rows) {
    const converted = {
      totalContracted: convertDailyExchangeRateAmount(row.totalContracted, row.currencyCode, exchangeRate),
      totalInvoiced: convertDailyExchangeRateAmount(row.totalInvoiced, row.currencyCode, exchangeRate),
      totalPaid: convertDailyExchangeRateAmount(row.totalPaid, row.currencyCode, exchangeRate),
      outstanding: convertDailyExchangeRateAmount(row.outstanding, row.currencyCode, exchangeRate),
      available: convertDailyExchangeRateAmount(row.available, row.currencyCode, exchangeRate),
    };
    if (Object.values(converted).some((value) => value === null)) return null;
    totals.totalContracted = totals.totalContracted.plus(converted.totalContracted!);
    totals.totalInvoiced = totals.totalInvoiced.plus(converted.totalInvoiced!);
    totals.totalPaid = totals.totalPaid.plus(converted.totalPaid!);
    totals.outstanding = totals.outstanding.plus(converted.outstanding!);
    totals.available = totals.available.plus(converted.available!);
  }
  return {
    totalContracted: consolidatedMoney(totals.totalContracted),
    totalInvoiced: consolidatedMoney(totals.totalInvoiced),
    totalPaid: consolidatedMoney(totals.totalPaid),
    outstanding: consolidatedMoney(totals.outstanding),
    available: consolidatedMoney(totals.available),
  };
}

type AccountReceivableGroupKey = {
  version: 1;
  kind: "CUSTOMER" | "RECEIVABLE";
  identity: string;
  currencyCode: string;
};

function accountReceivableGroup(row: AccountReceivableGroupRow) {
  const key: AccountReceivableGroupKey = {
    version: 1,
    kind: row.groupKind,
    identity: row.groupIdentity,
    currencyCode: row.currencyCode,
  };
  return {
    groupKey: encodeAccountReceivableGroupKey(key),
    customerId: row.customerId,
    debtor: {
      displayName: row.debtorDisplayName,
      identificationType: row.debtorIdentificationType,
      identificationNumber: row.debtorIdentificationNumber,
    },
    currencyCode: row.currencyCode,
    totalOriginalAmount: money(row.totalOriginalAmount),
    totalAllocatedAmount: money(row.totalAllocatedAmount),
    totalOutstandingAmount: money(row.totalOutstandingAmount),
    totalOverdueOutstandingAmount: money(row.totalOverdueOutstandingAmount),
    totalReceivedAmount: money(row.totalReceivedAmount ?? new Prisma.Decimal(0)),
    totalActiveAllocatedAmount: money(row.totalActiveAllocatedAmount ?? new Prisma.Decimal(0)),
    unallocatedPaymentAmount: row.unallocatedPaymentAmount
      ? money(row.unallocatedPaymentAmount)
      : "0.00",
    unallocatedPaymentCount: row.unallocatedPaymentCount == null
      ? 0
      : exactCount(row.unallocatedPaymentCount),
    counts: {
      total: exactCount(row.totalCount),
      open: exactCount(row.openCount),
      partiallySettled: exactCount(row.partiallySettledCount),
      settled: exactCount(row.settledCount),
      cancelled: exactCount(row.cancelledCount),
      overdue: exactCount(row.overdueCount),
    },
  };
}

type ContractObligationGroupKey = {
  version: 1;
  kind: "CONTRACT_OBLIGATION";
  customerId: string;
  currencyCode: string;
};

function contractObligationGroup(row: ContractObligationGroupRow) {
  return {
    groupKey: encodeContractObligationGroupKey({
      version: 1,
      kind: "CONTRACT_OBLIGATION",
      customerId: row.customerId,
      currencyCode: row.currencyCode,
    }),
    customerId: row.customerId,
    debtor: {
      displayName: row.debtorDisplayName,
      identificationType: row.debtorIdentificationType,
      identificationNumber: row.debtorIdentificationNumber,
    },
    currencyCode: row.currencyCode,
    totalOriginalAmount: money(row.totalOriginalAmount),
    totalPaidAmount: money(row.totalPaidAmount),
    totalOutstandingAmount: money(row.totalOutstandingAmount),
    counts: {
      total: exactCount(row.totalCount),
      open: exactCount(row.openCount),
      partiallySettled: exactCount(row.partiallySettledCount),
      settled: exactCount(row.settledCount),
      cancelled: exactCount(row.cancelledCount),
      overdue: exactCount(row.overdueCount),
    },
  };
}

function contractObligationPortfolioItem(
  row: ContractObligationPortfolioRow,
  tenantCurrentCalendarDate: string,
) {
  return {
    contractId: row.contractId,
    contractNumber: row.contractNumber,
    travelLabel: row.travelPackageName ?? row.internalTripName ?? row.destination,
    travelContext: {
      source: row.contractSource,
      destination: row.destination,
      travelPackageId: row.travelPackageId,
      internalTripId: row.internalTripId,
      travelType: row.travelType,
    },
    startDate: row.startDate,
    endDate: row.endDate,
    currencyCode: row.currencyCode,
    originalAmount: money(row.originalAmount),
    paidAmount: money(row.originalAmount.minus(row.outstandingAmount)),
    outstandingAmount: money(row.outstandingAmount),
    dueDate: row.dueDate,
    status: row.status,
    isOverdue: isCommercialObligationOverdue(row, tenantCurrentCalendarDate),
    settledAt: row.settledAt,
    paymentCount: exactCount(row.paymentCount),
  };
}

function contractPaymentHistoryItem(
  payment: Prisma.PaymentGetPayload<{ select: typeof contractPaymentHistorySelect }>,
  fiscalDocument: Prisma.BillingDocumentGetPayload<{ select: typeof contractPaymentFiscalDocumentSelect }> | null,
) {
  const commercialAllocation = payment.commercialObligationAllocations.find(
    (allocation) =>
      allocation.commercialObligation.sourceType === "CONTRACT" &&
      allocation.commercialObligation.sourceId === payment.contractId,
  );
  return {
    id: payment.id,
    receiptNumber: payment.receiptNumber,
    purpose: payment.purpose,
    status: payment.status,
    receivedAmount: money(payment.receivedAmount),
    availableAmount: money(payment.availableAmount),
    currencyCode: payment.currencyCode,
    paymentMethod: payment.paymentMethod,
    receivedAt: payment.receivedAt,
    externalReference: payment.externalReference,
    description: payment.description,
    commercialAllocation: commercialAllocation ? {
      id: commercialAllocation.id,
      amount: money(commercialAllocation.amount),
      status: commercialAllocation.status,
      allocatedAt: commercialAllocation.allocatedAt,
      reversedAt: commercialAllocation.reversal?.reversedAt ?? null,
      reversalReason: commercialAllocation.reversal?.reason ?? null,
    } : null,
    receiptAvailable: hasAvailablePaymentReceipt(payment.status, payment.receiptNumber),
    fiscalDocument: fiscalDocument ? {
      id: fiscalDocument.id,
      internalNumber: fiscalDocument.internalNumber,
      fiscalNumber: fiscalDocument.fiscalNumber,
      documentTypeCode: fiscalDocument.documentTypeCode,
      lifecycleStatus: fiscalDocument.lifecycleStatus,
      providerStatus: fiscalDocument.providerStatus,
      taxAuthorityStatus: fiscalDocument.taxAuthorityStatus,
      issuedAt: fiscalDocument.issuedAt,
    } : null,
  };
}

function unallocatedPaymentBalance(row: UnallocatedPaymentBalanceRow) {
  return {
    customerId: row.customerId,
    debtor: {
      displayName: row.payerDisplayName,
      identificationType: row.payerIdentificationType,
      identificationNumber: row.payerIdentificationNumber,
    },
    currencyCode: row.currencyCode,
    unallocatedPaymentAmount: money(row.unallocatedPaymentAmount),
    unallocatedPaymentCount: exactCount(row.unallocatedPaymentCount),
  };
}

function encodeAccountReceivableGroupKey(key: AccountReceivableGroupKey): string {
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

function encodeContractObligationGroupKey(key: ContractObligationGroupKey): string {
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

function decodeContractObligationGroupKey(value: string): ContractObligationGroupKey {
  try {
    if (!value || value.length > 1000) throw new Error("invalid");
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<ContractObligationGroupKey>;
    if (
      parsed.version !== 1 ||
      parsed.kind !== "CONTRACT_OBLIGATION" ||
      typeof parsed.customerId !== "string" || !parsed.customerId || parsed.customerId.length > 191 ||
      typeof parsed.currencyCode !== "string" || !/^[A-Z]{3}$/.test(parsed.currencyCode) ||
      Object.keys(parsed).length !== 4
    ) throw new Error("invalid");
    const key = parsed as ContractObligationGroupKey;
    if (encodeContractObligationGroupKey(key) !== value) throw new Error("invalid");
    return key;
  } catch {
    throw new NotFoundException("CONTRACT_OBLIGATION_GROUP_NOT_FOUND");
  }
}

function decodeAccountReceivableGroupKey(value: string): AccountReceivableGroupKey {
  try {
    if (!value || value.length > 1000) throw new Error("invalid");
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<AccountReceivableGroupKey>;
    if (
      parsed.version !== 1 ||
      (parsed.kind !== "CUSTOMER" && parsed.kind !== "RECEIVABLE") ||
      typeof parsed.identity !== "string" || !parsed.identity || parsed.identity.length > 191 ||
      typeof parsed.currencyCode !== "string" || !/^[A-Z]{3}$/.test(parsed.currencyCode) ||
      Object.keys(parsed).length !== 4
    ) throw new Error("invalid");
    const key = parsed as AccountReceivableGroupKey;
    if (encodeAccountReceivableGroupKey(key) !== value) throw new Error("invalid");
    return key;
  } catch {
    throw new NotFoundException("ACCOUNT_RECEIVABLE_GROUP_NOT_FOUND");
  }
}

function exactCount(value: bigint | number): number {
  const count = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("FINANCE_COUNT_OUT_OF_RANGE");
  }
  return count;
}

function paymentListItem(
  payment: Prisma.PaymentGetPayload<{ select: typeof paymentListSelect }>,
) {
  return {
    ...payment,
    receivedAmount: money(payment.receivedAmount),
    availableAmount: money(payment.availableAmount),
  };
}

function accountReceivableWhere(tenantId: string, query: ListAccountReceivablesDto): Prisma.AccountReceivableWhereInput {
  const dueDate: Prisma.DateTimeFilter = {};
  if (query.dueDateFrom) dueDate.gte = dateOnly(query.dueDateFrom);
  if (query.dueDateTo) dueDate.lte = dateOnly(query.dueDateTo);
  return {
    tenantId,
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.currency ? { currencyCode: query.currency } : {}),
    ...(Object.keys(dueDate).length ? { dueDate } : {}),
  };
}

function availablePaymentConstraint(): Prisma.PaymentWhereInput {
  return {
    availableAmount: { gt: new Prisma.Decimal(0) },
    status: { in: [PaymentStatus.RECEIVED, PaymentStatus.PARTIALLY_ALLOCATED] },
  };
}

function accountReceivableListItem(
  receivable: Prisma.AccountReceivableGetPayload<{ select: typeof accountReceivableListSelect }>,
  tenantCurrentCalendarDate: string,
) {
  return {
    id: receivable.id,
    customerId: receivable.customerId,
    debtorDisplayName: receivable.debtorDisplayName,
    debtorIdentificationType: receivable.debtorIdentificationType,
    debtorIdentificationNumber: receivable.debtorIdentificationNumber,
    currencyCode: receivable.currencyCode,
    originalAmount: money(receivable.originalAmount),
    outstandingAmount: money(receivable.outstandingAmount),
    dueDate: receivable.dueDate,
    status: receivable.status,
    isOverdue: isOverdue(receivable.status, receivable.dueDate, tenantCurrentCalendarDate),
    recognizedAt: receivable.recognizedAt,
    settledAt: receivable.settledAt,
    source: {
      type: receivable.sourceType,
      billingDocumentId: receivable.sourceType === "BILLING_DOCUMENT" ? receivable.sourceId : null,
      sourceId: receivable.sourceId,
      sourceNumber: receivable.sourceNumber,
      sourceDocumentType: receivable.sourceDocumentType,
    },
  };
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function tenantCalendarDate(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  if (!year || !month || !day) {
    throw new Error("FINANCE_TENANT_CALENDAR_DATE_UNAVAILABLE");
  }
  return `${year}-${month}-${day}`;
}

function isOverdue(
  status: AccountReceivableStatus,
  dueDate: Date,
  tenantCurrentCalendarDate: string,
): boolean {
  return (
    (status === AccountReceivableStatus.OPEN ||
      status === AccountReceivableStatus.PARTIALLY_SETTLED) &&
    dueDate.getTime() < dateOnly(tenantCurrentCalendarDate).getTime()
  );
}

function isCommercialObligationOverdue(
  obligation: Pick<ContractObligationPortfolioRow, "status" | "outstandingAmount" | "dueDate">,
  tenantCurrentCalendarDate: string,
): boolean {
  return (
    (obligation.status === CommercialObligationStatus.OPEN ||
      obligation.status === CommercialObligationStatus.PARTIALLY_SETTLED) &&
    obligation.outstandingAmount.greaterThan(0) &&
    obligation.dueDate !== null &&
    obligation.dueDate.getTime() < dateOnly(tenantCurrentCalendarDate).getTime()
  );
}

function hasAvailablePaymentReceipt(status: PaymentStatus, receiptNumber: string | null): boolean {
  return (
    (status === PaymentStatus.RECEIVED ||
      status === PaymentStatus.PARTIALLY_ALLOCATED ||
      status === PaymentStatus.FULLY_ALLOCATED ||
      status === PaymentStatus.CANCELLED) &&
    typeof receiptNumber === "string" &&
    receiptNumber.trim().length > 0
  );
}

function isAllocatableMoney(total: Prisma.Decimal, available: Prisma.Decimal): boolean {
  return total.isFinite() && available.isFinite() &&
    total.greaterThan(0) && available.greaterThan(0) &&
    available.lessThanOrEqualTo(total) &&
    total.decimalPlaces() <= 5 && available.decimalPlaces() <= 5;
}

const financeAuditSelect = {
  entityType: true,
  entityId: true,
  action: true,
  actorUserId: true,
  actorName: true,
  createdAt: true,
  afterJson: true,
} satisfies Prisma.BillingAuditLogSelect;

type FinanceAuditRow = Prisma.BillingAuditLogGetPayload<{ select: typeof financeAuditSelect }>;

function paymentDetail(payment: Prisma.PaymentGetPayload<{
  include: { allocations: { include: { accountReceivable: true; reversal: true } } };
}>, auditRows: FinanceAuditRow[]) {
  const registered = auditRow(auditRows, FINANCE_AUDIT_ENTITY_TYPES.PAYMENT, payment.id, FINANCE_AUDIT_ACTIONS.REGISTERED);
  const cancelled = auditRow(auditRows, FINANCE_AUDIT_ENTITY_TYPES.PAYMENT, payment.id, FINANCE_AUDIT_ACTIONS.CANCELLED);
  const appliedAmount = payment.allocations
    .filter((allocation) => allocation.status === PaymentAllocationStatus.ACTIVE)
    .reduce((total, allocation) => total.plus(allocation.amount), new Prisma.Decimal(0));
  return {
    id: payment.id,
    receiptNumber: payment.receiptNumber,
    customerId: payment.customerId,
    payerDisplayName: payment.payerDisplayName,
    payerIdentificationType: payment.payerIdentificationType,
    payerIdentificationNumber: payment.payerIdentificationNumber,
    currencyCode: payment.currencyCode,
    receivedAmount: money(payment.receivedAmount),
    appliedAmount: money(appliedAmount),
    availableAmount: money(payment.availableAmount),
    canCancel: canCancelPayment(payment, payment.allocations),
    receivedAt: payment.receivedAt,
    paymentMethod: payment.paymentMethod,
    externalReference: payment.externalReference,
    description: payment.description,
    status: payment.status,
    cancelledAt: payment.cancelledAt,
    registeredBy: actorProjection(registered),
    cancelledBy: cancelled && {
      ...actorProjection(cancelled)!,
      reason: auditReason(cancelled),
    },
    allocations: payment.allocations.map((allocation) => ({
      id: allocation.id,
      accountReceivableId: allocation.accountReceivableId,
      amount: money(allocation.amount),
      status: allocation.status,
      allocatedAt: allocation.allocatedAt,
      appliedBy: actorProjection(auditRow(auditRows, FINANCE_AUDIT_ENTITY_TYPES.ALLOCATION, allocation.id, FINANCE_AUDIT_ACTIONS.APPLIED)),
      accountReceivable: {
        id: allocation.accountReceivable.id,
        sourceNumber: allocation.accountReceivable.sourceNumber,
        sourceDocumentType: allocation.accountReceivable.sourceDocumentType,
        currencyCode: allocation.accountReceivable.currencyCode,
        originalAmount: money(allocation.accountReceivable.originalAmount),
        outstandingAmount: money(allocation.accountReceivable.outstandingAmount),
        status: allocation.accountReceivable.status,
      },
      reversal: allocation.reversal && {
        id: allocation.reversal.id,
        reason: allocation.reversal.reason,
        reversedAt: allocation.reversal.reversedAt,
        reversedBy: actorProjection(auditRow(auditRows, FINANCE_AUDIT_ENTITY_TYPES.REVERSAL, allocation.reversal.id, FINANCE_AUDIT_ACTIONS.REVERSED)),
      },
    })),
  };
}

function accountReceivableDetail(receivable: Prisma.AccountReceivableGetPayload<{
  include: { paymentAllocations: { include: { payment: { select: { receiptNumber: true } }; reversal: true } } };
}>,
tenantCurrentCalendarDate: string,
auditRows: FinanceAuditRow[],
availablePaymentSummary: { _sum: { availableAmount: Prisma.Decimal | null }; _count: { _all: number } } | null,
) {
  const unallocatedPaymentAmount = availablePaymentSummary?._sum.availableAmount ?? new Prisma.Decimal(0);
  const unallocatedPaymentCount = availablePaymentSummary?._count._all ?? 0;
  return {
    id: receivable.id,
    sourceType: receivable.sourceType,
    sourceId: receivable.sourceId,
    sourceNumber: receivable.sourceNumber,
    sourceDocumentType: receivable.sourceDocumentType,
    customerId: receivable.customerId,
    debtorDisplayName: receivable.debtorDisplayName,
    debtorIdentificationType: receivable.debtorIdentificationType,
    debtorIdentificationNumber: receivable.debtorIdentificationNumber,
    currencyCode: receivable.currencyCode,
    originalAmount: money(receivable.originalAmount),
    outstandingAmount: money(receivable.outstandingAmount),
    unallocatedPaymentAmount: money(unallocatedPaymentAmount),
    unallocatedPaymentCount,
    hasUnallocatedPayments: unallocatedPaymentCount > 0,
    dueDate: receivable.dueDate,
    paymentTermDays: receivable.paymentTermDays,
    status: receivable.status,
    isOverdue: isOverdue(receivable.status, receivable.dueDate, tenantCurrentCalendarDate),
    recognizedAt: receivable.recognizedAt,
    settledAt: receivable.settledAt,
    cancelledAt: receivable.cancelledAt,
    allocations: receivable.paymentAllocations.map((allocation) => ({
      id: allocation.id,
      paymentId: allocation.paymentId,
      paymentReceiptNumber: allocation.payment.receiptNumber,
      amount: money(allocation.amount),
      status: allocation.status,
      allocatedAt: allocation.allocatedAt,
      appliedBy: actorProjection(auditRow(auditRows, FINANCE_AUDIT_ENTITY_TYPES.ALLOCATION, allocation.id, FINANCE_AUDIT_ACTIONS.APPLIED)),
      reversal: allocation.reversal && {
        id: allocation.reversal.id,
        reason: allocation.reversal.reason,
        reversedAt: allocation.reversal.reversedAt,
        reversedBy: actorProjection(auditRow(auditRows, FINANCE_AUDIT_ENTITY_TYPES.REVERSAL, allocation.reversal.id, FINANCE_AUDIT_ACTIONS.REVERSED)),
      },
    })),
  };
}

function auditRow(
  rows: FinanceAuditRow[],
  entityType: string,
  entityId: string,
  action: string,
): FinanceAuditRow | null {
  return rows.find((row) => row.entityType === entityType && row.entityId === entityId && row.action === action) ?? null;
}

function actorProjection(row: FinanceAuditRow | null) {
  return row && { userId: row.actorUserId, name: row.actorName, at: row.createdAt };
}

function auditReason(row: FinanceAuditRow): string | null {
  const value = row.afterJson;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const reason = (value as Record<string, unknown>).reason;
  return typeof reason === "string" && reason ? reason : null;
}

function money(value: Prisma.Decimal): string {
  return value.toFixed();
}

function consolidatedMoney(value: Prisma.Decimal): string {
  return value.toDecimalPlaces(5, Prisma.Decimal.ROUND_HALF_UP).toFixed(5);
}
