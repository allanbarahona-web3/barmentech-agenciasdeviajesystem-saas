import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ApplyCreditNoteDto } from "./dto/apply-credit-note.dto";
import { ApproveReceiptDto } from "./dto/approve-receipt.dto";
import { CreateCreditNoteDto } from "./dto/create-credit-note.dto";
import { ListBillingContractsDto } from "./dto/list-billing-contracts.dto";
import { RejectCreditNoteDto } from "./dto/reject-credit-note.dto";
import { RejectPaymentDto } from "./dto/reject-payment.dto";
import { ReportPaymentDto } from "./dto/report-payment.dto";
import { SendAccountStatementDto } from "./dto/send-account-statement.dto";
import { BillingService } from "./billing.service";

@Controller("billing")
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post("contracts/:contractId/bootstrap")
  bootstrapContractBilling(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param("contractId") contractId: string,
  ) {
    const userAgentHeader = req.headers?.["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

    return this.billingService.bootstrapContractBilling(req.user, contractId, req.ip || null, userAgent || null);
  }

  @Get("contracts")
  listContracts(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; tenantId: string };
    },
    @Query() query: ListBillingContractsDto,
  ) {
    return this.billingService.listBillingContracts(req.user, query);
  }

  @Get("audit")
  @Roles("ADMIN")
  @UseGuards(RolesGuard)
  listAudit(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
    },
    @Query("contractId") contractId?: string,
    @Query("entityType") entityType?: string,
    @Query("q") q?: string,
    @Query("limit") limit?: string,
  ) {
    return this.billingService.listAudit(req.user, {
      contractId: String(contractId || "").trim() || undefined,
      entityType: String(entityType || "").trim() || undefined,
      q: String(q || "").trim() || undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("contracts/:contractId/account")
  getContractAccount(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
    },
    @Param("contractId") contractId: string,
  ) {
    return this.billingService.getContractAccount(req.user, contractId);
  }

  @Get("contracts/:contractId/invoice/pdf")
  getInvoicePdfUrl(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
    },
    @Param("contractId") contractId: string,
  ) {
    return this.billingService.getInvoicePdfUrl(req.user, contractId);
  }

  @Get("contracts/:contractId/account/pdf")
  getAccountStatementPdfUrl(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
    },
    @Param("contractId") contractId: string,
  ) {
    return this.billingService.getAccountStatementPdfUrl(req.user, contractId);
  }

  @Post("contracts/:contractId/account/send-email")
  sendAccountStatementEmail(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param("contractId") contractId: string,
    @Body() dto: SendAccountStatementDto,
  ) {
    const userAgentHeader = req.headers?.["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

    return this.billingService.sendContractAccountStatementEmail(
      req.user,
      contractId,
      dto.toEmail,
      dto.ccEmail,
      req.ip || null,
      userAgent || null,
    );
  }

  @Post("contracts/:contractId/payments/report")
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: "attachments", maxCount: 10 },
    ]),
  )
  reportPayment(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param("contractId") contractId: string,
    @Body() dto: ReportPaymentDto,
    @UploadedFiles()
    files: {
      attachments?: Array<{
        buffer: Buffer;
        mimetype: string;
        originalname: string;
        size: number;
      }>;
    },
  ) {
    const userAgentHeader = req.headers?.["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

    return this.billingService.reportPayment(
      req.user,
      contractId,
      dto,
      files?.attachments || [],
      req.ip || null,
      userAgent || null,
    );
  }

  @Post("payments/:paymentId/review")
  markPaymentInReview(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param("paymentId") paymentId: string,
  ) {
    const userAgentHeader = req.headers?.["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

    return this.billingService.markPaymentInReview(req.user, paymentId, req.ip || null, userAgent || null);
  }

  @Post("payments/:paymentId/verify")
  @Roles("ADMIN", "FACTURACION_COBROS")
  @UseGuards(RolesGuard)
  verifyPayment(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param("paymentId") paymentId: string,
  ) {
    const userAgentHeader = req.headers?.["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

    return this.billingService.verifyPayment(req.user, paymentId, req.ip || null, userAgent || null);
  }

  @Post("payments/:paymentId/reject")
  @Roles("ADMIN", "FACTURACION_COBROS")
  @UseGuards(RolesGuard)
  rejectPayment(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param("paymentId") paymentId: string,
    @Body() dto: RejectPaymentDto,
  ) {
    const userAgentHeader = req.headers?.["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

    return this.billingService.rejectPayment(req.user, paymentId, dto.reason, req.ip || null, userAgent || null);
  }

  @Get("payments/:paymentId/attachments/:attachmentId")
  async getPaymentAttachment(
    @Req() req: { user: { id: string; email: string; fullName: string; role: string } },
    @Param("paymentId") paymentId: string,
    @Param("attachmentId") attachmentId: string,
    @Res() res: any,
  ) {
    const file = await this.billingService.getPaymentAttachment(req.user, paymentId, attachmentId);
    
    res.set({
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.fileName)}"`,
      "Content-Length": file.buffer.length,
    });
    
    res.send(file.buffer);
  }

  @Post("receipts/:receiptId/approve-send")
  @Roles("ADMIN", "FACTURACION_COBROS", "AGENT")
  @UseGuards(RolesGuard)
  approveAndSendReceipt(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; role: string };
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param("receiptId") receiptId: string,
    @Body() dto: ApproveReceiptDto,
  ) {
    const userAgentHeader = req.headers?.["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

    return this.billingService.approveAndSendReceipt(
      req.user,
      receiptId,
      dto.toEmail,
      dto.ccEmail,
      req.ip || null,
      userAgent || null,
    );
  }

  @Get("receipts/:receiptId/pdf")
  getReceiptPdfUrl(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
    },
    @Param("receiptId") receiptId: string,
  ) {
    return this.billingService.getReceiptPdfUrl(req.user, receiptId);
  }

  @Post("credit-notes/:creditNoteId/send-email")
  sendCreditNoteEmail(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; role: string };
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param("creditNoteId") creditNoteId: string,
    @Body() dto: ApproveReceiptDto,
  ) {
    const userAgentHeader = req.headers?.["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

    return this.billingService.sendCreditNoteEmail(
      req.user,
      creditNoteId,
      dto.toEmail,
      dto.ccEmail,
      req.ip || null,
      userAgent || null,
    );
  }

  @Post("contracts/:contractId/credit-notes")
  createCreditNote(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param("contractId") contractId: string,
    @Body() dto: CreateCreditNoteDto,
  ) {
    const userAgentHeader = req.headers?.["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

    return this.billingService.createCreditNote(
      req.user,
      contractId,
      dto,
      req.ip || null,
      userAgent || null,
    );
  }

  @Post("credit-notes/:creditNoteId/apply")
  @Roles("ADMIN")
  @UseGuards(RolesGuard)
  applyCreditNote(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param("creditNoteId") creditNoteId: string,
    @Body() dto: ApplyCreditNoteDto,
  ) {
    const userAgentHeader = req.headers?.["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

    return this.billingService.applyCreditNote(
      req.user,
      creditNoteId,
      dto,
      req.ip || null,
      userAgent || null,
    );
  }

  @Get("admin/credit-notes/pending")
  @Roles("ADMIN")
  @UseGuards(RolesGuard)
  listPendingCreditNotes(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; role: string };
    },
    @Query("q") q?: string,
    @Query("limit") limit?: string,
  ) {
    return this.billingService.listPendingCreditNotes(req.user, {
      q: String(q || "").trim() || undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("admin/pending-counts")
  @Roles("ADMIN", "CONTADOR", "AGENT", "FACTURACION_COBROS")
  @UseGuards(RolesGuard)
  async getPendingCounts(): Promise<{ pendingReceipts: number; pendingCreditNotes: number; contractsPendingSignature: number }> {
    const pendingReceipts = await this.billingService.getPendingPaymentsCount();
    const pendingCreditNotes = await this.billingService.getPendingCreditNotesCount();
    const contractsPendingSignature = await this.billingService.getPendingSignatureContractsCount();
    return { pendingReceipts, pendingCreditNotes, contractsPendingSignature };
  }

  @Get("admin/dashboard-metrics")
  @Roles("ADMIN", "CONTADOR")
  @UseGuards(RolesGuard)
  getDashboardMetrics(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
    },
    @Query("period") period?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.billingService.getDashboardMetrics(req.user, { 
      period: period || "month",
      from,
      to,
    });
  }

  @Get("admin/reports")
  @Roles("ADMIN", "CONTADOR", "FACTURACION_COBROS")
  @UseGuards(RolesGuard)
  getAdminReports(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; role: string };
    },
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("q") q?: string,
    @Query("invoiceStatus") invoiceStatus?: string,
    @Query("paymentStatus") paymentStatus?: string,
    @Query("limitInvoices") limitInvoices?: string,
    @Query("limitPayments") limitPayments?: string,
  ) {
    return this.billingService.getAdminReports(req.user, {
      from: String(from || "").trim() || undefined,
      to: String(to || "").trim() || undefined,
      q: String(q || "").trim() || undefined,
      invoiceStatus: String(invoiceStatus || "").trim() || undefined,
      paymentStatus: String(paymentStatus || "").trim() || undefined,
      limitInvoices: limitInvoices ? Number(limitInvoices) : undefined,
      limitPayments: limitPayments ? Number(limitPayments) : undefined,
    });
  }

  @Post("admin/credit-notes/:creditNoteId/approve")
  @Roles("ADMIN")
  @UseGuards(RolesGuard)
  approveCreditNote(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; role: string };
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param("creditNoteId") creditNoteId: string,
    @Body() dto: ApplyCreditNoteDto,
  ) {
    const userAgentHeader = req.headers?.["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

    return this.billingService.approveCreditNote(
      req.user,
      creditNoteId,
      dto,
      req.ip || null,
      userAgent || null,
    );
  }

  @Post("admin/credit-notes/:creditNoteId/reject")
  @Roles("ADMIN")
  @UseGuards(RolesGuard)
  rejectCreditNote(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string; role: string };
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param("creditNoteId") creditNoteId: string,
    @Body() dto: RejectCreditNoteDto,
  ) {
    const userAgentHeader = req.headers?.["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

    return this.billingService.rejectCreditNote(
      req.user,
      creditNoteId,
      dto.reason,
      req.ip || null,
      userAgent || null,
    );
  }

  @Get("credit-notes/:creditNoteId/pdf")
  getCreditNotePdfUrl(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
    },
    @Param("creditNoteId") creditNoteId: string,
  ) {
    return this.billingService.getCreditNotePdfUrl(req.user, creditNoteId);
  }
}
