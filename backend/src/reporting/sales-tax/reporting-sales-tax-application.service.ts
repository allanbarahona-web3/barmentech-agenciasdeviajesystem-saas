import { Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ReportingAccessPolicy } from "../access/reporting-access-policy";
import type { ReportingPeriodSelection } from "../period/reporting-period.resolver";
import { ReportingPeriodResolver } from "../period/reporting-period.resolver";
import type { ReportDocumentReadFilter, ReportingProjection } from "../contracts/reporting.contracts";
import { SalesTaxReportService, type SalesTaxReportResult } from "./sales-tax-report.service";

export interface AuthenticatedSalesTaxReportRequest {
  tenantId: string;
  actorUserId: string;
  role: UserRole;
  period: ReportingPeriodSelection;
  page: number;
  pageSize: number;
  filter?: ReportDocumentReadFilter;
  projection?: ReportingProjection;
}

/** Outer application policy: authenticated tenant, fiscal timezone, then generic tax report. */
@Injectable()
export class ReportingSalesTaxApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ReportingAccessPolicy,
    private readonly periods: ReportingPeriodResolver,
    private readonly salesTax: SalesTaxReportService,
  ) {}

  async execute(request: AuthenticatedSalesTaxReportRequest): Promise<SalesTaxReportResult> {
    const config = await this.prisma.tenantBillingConfiguration.findUnique({
      where: { tenantId: request.tenantId },
      select: { fiscalTimezone: true },
    });
    const context = this.access.createReadContext({
      tenantId: request.tenantId,
      actorUserId: request.actorUserId,
      role: request.role,
      timezone: config?.fiscalTimezone ?? "UTC",
    }, "SALES_TAX");
    return this.salesTax.execute(context, this.periods.resolve(request.period, context.timezone), {
      page: request.page,
      pageSize: request.pageSize,
      filter: request.filter,
      projection: request.projection ?? { mode: "ORIGINAL" },
    });
  }
}
