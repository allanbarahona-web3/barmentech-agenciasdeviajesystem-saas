import { BadRequestException, Controller, Get, Query, Req, Res, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { parseReportingQuery, ReportingQueryDto } from "./dto/sales-report-query.dto";
import { ReportingSalesApplicationService } from "./sales/reporting-sales-application.service";
import { ReportingSalesTaxApplicationService } from "./sales-tax/reporting-sales-tax-application.service";
import { ReportingExportService, type ReportingExportFormat } from "./exports/reporting-export.service";
import { parseReceivablesReportQuery, ReceivablesReportQueryDto } from "./dto/receivables-report-query.dto";
import { ReportingReceivablesApplicationService } from "./receivables/reporting-receivables-application.service";
import type { Response } from "express";

type ReportingRequest = { user: { id: string; tenantId: string; role: UserRole } };

@Controller("reporting")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportingController {
  constructor(
    private readonly sales: ReportingSalesApplicationService,
    private readonly salesTax: ReportingSalesTaxApplicationService,
    private readonly exports: ReportingExportService = {} as ReportingExportService,
    private readonly receivables: ReportingReceivablesApplicationService = {} as ReportingReceivablesApplicationService,
  ) {}

  @Get("sales/export")
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  async exportSales(@Req() request: ReportingRequest, @Query() query: ReportingQueryDto, @Res() response: Response) {
    if (!query.format) throw new BadRequestException("REPORTING_EXPORT_FORMAT_REQUIRED");
    const parsed = parseReportingQuery(query); const exported = await this.exports.exportSales({ tenantId: request.user.tenantId, actorUserId: request.user.id, role: request.user.role, ...parsed }, query.format as ReportingExportFormat);
    return send(response, exported);
  }

  @Get("sales-tax/export")
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  async exportSalesTax(@Req() request: ReportingRequest, @Query() query: ReportingQueryDto, @Res() response: Response) {
    if (!query.format) throw new BadRequestException("REPORTING_EXPORT_FORMAT_REQUIRED");
    const parsed = parseReportingQuery(query); const exported = await this.exports.exportSalesTax({ tenantId: request.user.tenantId, actorUserId: request.user.id, role: request.user.role, ...parsed }, query.format as ReportingExportFormat);
    return send(response, exported);
  }

  @Get("receivables/export")
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  async exportReceivables(@Req() request: ReportingRequest, @Query() query: ReceivablesReportQueryDto, @Res() response: Response) {
    if (!query.format) throw new BadRequestException("REPORTING_EXPORT_FORMAT_REQUIRED");
    const parsed = parseReceivablesReportQuery(query); const exported = await this.exports.exportReceivables({ tenantId: request.user.tenantId, actorUserId: request.user.id, role: request.user.role, ...parsed }, query.format as ReportingExportFormat);
    return send(response, exported);
  }

  @Get("sales")
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  salesReport(@Req() request: ReportingRequest, @Query() query: ReportingQueryDto) {
    const parsed = parseReportingQuery(query);
    return this.sales.execute({
      tenantId: request.user.tenantId,
      actorUserId: request.user.id,
      role: request.user.role,
      ...parsed,
    });
  }

  @Get("sales-tax")
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  salesTaxReport(@Req() request: ReportingRequest, @Query() query: ReportingQueryDto) {
    const parsed = parseReportingQuery(query);
    return this.salesTax.execute({
      tenantId: request.user.tenantId,
      actorUserId: request.user.id,
      role: request.user.role,
      ...parsed,
    });
  }

  @Get("receivables")
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  receivablesReport(@Req() request: ReportingRequest, @Query() query: ReceivablesReportQueryDto) {
    const parsed = parseReceivablesReportQuery(query);
    return this.receivables.execute({ tenantId: request.user.tenantId, actorUserId: request.user.id, role: request.user.role, ...parsed });
  }
}

function send(response: Response, exported: { bytes: Buffer; mimeType: string; fileName: string }) {
  response.set({ "Content-Type": exported.mimeType, "Content-Length": String(exported.bytes.length), "Content-Disposition": `attachment; filename="${exported.fileName}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  response.send(exported.bytes);
}
