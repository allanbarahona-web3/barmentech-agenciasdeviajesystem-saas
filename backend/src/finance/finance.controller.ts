import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import type { Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { Prisma, UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { PaymentAllocationReversalService } from "./payment-allocation-reversal.service";
import { PaymentAllocationService } from "./payment-allocation.service";
import { PaymentCancellationService } from "./payment-cancellation.service";
import { PaymentRegistrationService } from "./payment-registration.service";
import {
  AllocatePaymentDto,
  CancelPaymentDto,
  ListAccountReceivableGroupItemsDto,
  ListCustomerElectronicInvoicesDto,
  CustomerInvoicePaymentTargetsQueryDto,
  CustomerContractPaymentTargetsQueryDto,
  CustomerPaymentSettlementPreviewQueryDto,
  ReportedInvoicePaymentDto,
  ReportedContractPaymentDto,
  ListAccountReceivableGroupsDto,
  ListContractObligationGroupContractsDto,
  ListContractObligationGroupsDto,
  ListContractPaymentsDto,
  ListAccountReceivablesDto,
  ListPaymentsDto,
  ListUnallocatedPaymentBalancesDto,
  RegisterPaymentDto,
  RegisterPaymentAndApplyDto,
  RegisterContractInstallmentDto,
  ReversePaymentAllocationDto,
  CustomerFundsAllocationDto,
  CustomerFundsAllocationPreviewDto,
  CustomerAccountStatementQueryDto,
  SendCustomerAccountStatementDto,
  SendPaymentReceiptDto,
  RejectContractReservationPaymentDto,
  PaymentEvidenceDestinationOverrideDto,
  ListContractReservationPaymentsDto,
} from "./dto/finance.dto";
import { translateFinanceError } from "./finance.errors";
import { FinanceReadService } from "./finance-read.service";
import { CustomerFundsAllocationService } from "./customer-funds-allocation.service";
import { CustomerAccountStatementService } from "./customer-account-statement.service";
import { RegisterPaymentAndApplyService } from "./register-payment-and-apply.service";
import { PaymentReceiptService } from "./payment-receipt.service";
import { ContractReservationReviewService } from "./contract-reservation-review.service";
import { ContractInstallmentPaymentService } from "./contract-installment-payment.service";
import { ReportedInvoicePaymentIntakeService } from "./reported-invoice-payment-intake.service";
import { PendingInvoicePaymentEvidenceService, type PaymentEvidenceExtractionInput } from "./pending-invoice-payment-evidence.service";
import { CustomerAcceptedInvoiceReadService } from "./customer-accepted-invoice-read.service";

type FinanceRequest = { user: { id: string; email?: string; fullName: string; tenantId: string; role: UserRole } };

@Controller("finance")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS)
export class FinanceController {
  constructor(
    private readonly registrations: PaymentRegistrationService,
    private readonly allocations: PaymentAllocationService,
    private readonly reversals: PaymentAllocationReversalService,
    private readonly cancellations: PaymentCancellationService,
    private readonly reads: FinanceReadService,
    private readonly customerFunds?: CustomerFundsAllocationService,
    private readonly statements?: CustomerAccountStatementService,
    private readonly paymentAndApply?: RegisterPaymentAndApplyService,
    private readonly receipts?: PaymentReceiptService,
    private readonly contractReservations?: ContractReservationReviewService,
    private readonly contractInstallments?: ContractInstallmentPaymentService,
    private readonly reportedInvoicePayments?: ReportedInvoicePaymentIntakeService,
    private readonly pendingInvoicePaymentEvidence?: PendingInvoicePaymentEvidenceService,
    private readonly customerAcceptedInvoices?: CustomerAcceptedInvoiceReadService,
  ) {}

  @Get("contracts/:contractId/commercial-obligation")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS)
  getContractCommercialObligation(@Req() request: FinanceRequest, @Param("contractId") contractId: string) {
    return this.reads.getContractCommercialObligation(request.user.tenantId, contractId);
  }

  @Get("contracts/:contractId/payments")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.CONTADOR)
  listContractPayments(
    @Req() request: FinanceRequest,
    @Param("contractId") contractId: string,
    @Query() query: ListContractPaymentsDto,
  ) {
    return this.reads.listContractPayments(request.user.tenantId, contractId, query);
  }

  @Get("customers/:customerId/contracts/:contractId/financial-detail")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.AGENT, UserRole.CONTADOR)
  getCustomerContractFinancialDetail(
    @Req() request: FinanceRequest,
    @Param("customerId") customerId: string,
    @Param("contractId") contractId: string,
    @Query() query: ListContractPaymentsDto,
  ) {
    return this.reads.getCustomerContractFinancialDetail(
      request.user.tenantId,
      customerId,
      contractId,
      query,
    );
  }

  @Post("contracts/:contractId/installments")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS)
  async registerContractInstallment(
    @Req() request: FinanceRequest,
    @Param("contractId") contractId: string,
    @Body() body: RegisterContractInstallmentDto,
  ) {
    try {
      return await this.contractInstallments!.register({
        tenantId: request.user.tenantId,
        contractId,
        actor: { userId: request.user.id, name: request.user.fullName },
        registrationDeduplicationKey: body.registrationDeduplicationKey,
        amount: decimal(body.amount),
        paymentMethod: body.paymentMethod,
        receivedAt: new Date(body.receivedAt),
        externalReference: body.externalReference,
        description: body.description,
      });
    } catch (error) {
      return translateFinanceError(error);
    }
  }

  @Get("contract-reservation-payments/pending")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS)
  async listPendingContractReservations(@Req() request: FinanceRequest, @Query() query: ListContractReservationPaymentsDto) {
    return this.contractReservations!.listPending(request.user.tenantId, query.limit ?? 100);
  }

  @Get("contract-reservation-payments/:paymentId")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS)
  getInvoicePendingPaymentReviewDetail(@Req() request: FinanceRequest, @Param("paymentId") paymentId: string) {
    return this.contractReservations!.getPendingPaymentDetail(request.user.tenantId, paymentId);
  }

  @Post("contract-reservation-payments/:paymentId/approve-precheck")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS)
  precheckInvoicePendingPaymentApproval(@Req() request: FinanceRequest, @Param("paymentId") paymentId: string) {
    return this.contractReservations!.precheckPendingPayment(request.user.tenantId, paymentId);
  }

  @Post("contract-reservation-payments/:paymentId/approve")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS)
  async approveContractReservation(@Req() request: FinanceRequest, @Param("paymentId") paymentId: string) {
    const payment = await this.contractReservations!.approve(request.user.tenantId, paymentId, { userId: request.user.id, name: request.user.fullName });
    return { ok: true, paymentId: payment.id, status: payment.status, receiptNumber: payment.receiptNumber };
  }

  @Post("contract-reservation-payments/:paymentId/reject")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS)
  async rejectContractReservation(@Req() request: FinanceRequest, @Param("paymentId") paymentId: string, @Body() body: RejectContractReservationPaymentDto) {
    const payment = await this.contractReservations!.reject(request.user.tenantId, paymentId, body.reason, { userId: request.user.id, name: request.user.fullName });
    return { ok: true, paymentId: payment.id, status: payment.status };
  }

  @Get("contract-reservation-payments/:paymentId/evidence/:evidenceId")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS)
  async getContractReservationEvidence(@Req() request: FinanceRequest, @Param("paymentId") paymentId: string, @Param("evidenceId") evidenceId: string) {
    return this.contractReservations!.getEvidenceUrl(request.user.tenantId, paymentId, evidenceId);
  }

  @Get("customers/:customerId/account-statement")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.CONTADOR)
  getCustomerAccountStatement(@Req() request: FinanceRequest, @Param("customerId") customerId: string, @Query() query: CustomerAccountStatementQueryDto) {
    return this.statements!.get(request.user.tenantId, customerId, query.currencyCode.toUpperCase());
  }

  @Get("customers/:customerId/electronic-invoices/:billingDocumentId")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.AGENT)
  getCustomerAcceptedInvoice(
    @Req() request: FinanceRequest,
    @Param("customerId") customerId: string,
    @Param("billingDocumentId") billingDocumentId: string,
  ) {
    return this.customerAcceptedInvoices!.get(request.user.tenantId, customerId, billingDocumentId);
  }

  @Get("customers/:customerId/electronic-invoices/:billingDocumentId/artifacts")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.AGENT)
  listCustomerAcceptedInvoiceArtifacts(
    @Req() request: FinanceRequest,
    @Param("customerId") customerId: string,
    @Param("billingDocumentId") billingDocumentId: string,
  ) {
    return this.customerAcceptedInvoices!.listArtifacts(request.user.tenantId, customerId, billingDocumentId);
  }

  @Get("customers/:customerId/electronic-invoices/:billingDocumentId/artifacts/:artifactType/versions/:version/download")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.AGENT)
  async downloadCustomerAcceptedInvoiceArtifact(
    @Req() request: FinanceRequest,
    @Param("customerId") customerId: string,
    @Param("billingDocumentId") billingDocumentId: string,
    @Param("artifactType") artifactType: string,
    @Param("version") version: string,
    @Res() response: Response,
  ): Promise<void> {
    const artifact = await this.customerAcceptedInvoices!.downloadArtifact(
      request.user.tenantId, customerId, billingDocumentId, artifactType, version,
    );
    response.set({
      "Content-Type": artifact.mimeType,
      "Content-Length": artifact.bytes.length.toString(),
      "Content-Disposition": `attachment; filename="${artifact.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.send(artifact.bytes);
  }

  @Get("customers/:customerId/account-statement/pdf")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.CONTADOR)
  async getCustomerAccountStatementPdf(@Req() request: FinanceRequest, @Param("customerId") customerId: string, @Query() query: CustomerAccountStatementQueryDto, @Res() response: Response) {
    const result = await this.statements!.render(request.user.tenantId, customerId, query.currencyCode.toUpperCase());
    response.set({ "Content-Type": "application/pdf", "Content-Length": result.pdfBuffer.length.toString(), "Content-Disposition": `attachment; filename="${result.fileName}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    response.send(result.pdfBuffer);
  }

  @Post("customers/:customerId/account-statement/email")
  async sendCustomerAccountStatement(@Req() request: FinanceRequest, @Param("customerId") customerId: string, @Body() body: SendCustomerAccountStatementDto) {
    return this.statements!.send(request.user.tenantId, { userId: request.user.id, email: request.user.email ?? "", fullName: request.user.fullName }, customerId, body.currencyCode.toUpperCase(), body.to, body.cc);
  }

  @Post("customer-funds/allocation-preview")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.CONTADOR)
  async previewCustomerFunds(@Req() request: FinanceRequest, @Body() body: CustomerFundsAllocationPreviewDto) {
    try { return await this.customerFunds!.preview({ tenantId: request.user.tenantId, actor: { userId: request.user.id, name: request.user.fullName }, customerId: body.customerId, currencyCode: body.currencyCode, targets: body.targets.map(x => ({ accountReceivableId: x.accountReceivableId, amount: decimal(x.amount) })) }); } catch (error) { return translateFinanceError(error); }
  }

  @Post("customer-funds/allocations")
  async allocateCustomerFunds(@Req() request: FinanceRequest, @Body() body: CustomerFundsAllocationDto) {
    try { return await this.customerFunds!.commit({ tenantId: request.user.tenantId, actor: { userId: request.user.id, name: request.user.fullName }, customerId: body.customerId, currencyCode: body.currencyCode, deduplicationKey: body.portfolioAllocationDeduplicationKey, targets: body.targets.map(x => ({ accountReceivableId: x.accountReceivableId, amount: decimal(x.amount) })) }); } catch (error) { return translateFinanceError(error); }
  }

  @Post("payments")
  async registerPayment(@Req() request: FinanceRequest, @Body() body: RegisterPaymentDto) {
    try {
      const payment = await this.registrations.register({
        tenantId: request.user.tenantId,
        actor: { userId: request.user.id, name: request.user.fullName },
        registrationDeduplicationKey: body.registrationDeduplicationKey,
        payerDisplayName: body.payerDisplayName,
        currencyCode: body.currencyCode,
        receivedAmount: decimal(body.receivedAmount),
        receivedAt: new Date(body.receivedAt),
        paymentMethod: body.paymentMethod,
        customerId: body.customerId,
        payerIdentificationType: body.payerIdentificationType,
        payerIdentificationNumber: body.payerIdentificationNumber,
        externalReference: body.externalReference,
        description: body.description,
      });
      return this.reads.getPaymentDetail(request.user.tenantId, payment.id);
    } catch (error) {
      return translateFinanceError(error);
    }
  }

  @Post("account-receivables/:accountReceivableId/payments")
  async registerPaymentAndApply(@Req() request: FinanceRequest, @Param("accountReceivableId") accountReceivableId: string, @Body() body: RegisterPaymentAndApplyDto) {
    try {
      return await this.paymentAndApply!.execute({ tenantId: request.user.tenantId, actor: { userId: request.user.id, name: request.user.fullName }, accountReceivableId, registrationDeduplicationKey: body.registrationDeduplicationKey, payerDisplayName: body.payerDisplayName, currencyCode: body.currencyCode, receivedAmount: decimal(body.receivedAmount), receivedAt: new Date(body.receivedAt), paymentMethod: body.paymentMethod, customerId: body.customerId, payerIdentificationType: body.payerIdentificationType, payerIdentificationNumber: body.payerIdentificationNumber, externalReference: body.externalReference, description: body.description });
    } catch (error) { return translateFinanceError(error); }
  }

  @Post("payments/:paymentId/allocations")
  async allocatePayment(
    @Req() request: FinanceRequest,
    @Param("paymentId") paymentId: string,
    @Body() body: AllocatePaymentDto,
  ) {
    try {
      await this.allocations.allocate({
        tenantId: request.user.tenantId,
        actor: { userId: request.user.id, name: request.user.fullName },
        paymentId,
        allocations: body.allocations.map((item) => ({
          accountReceivableId: item.accountReceivableId,
          amount: decimal(item.amount),
          allocationDeduplicationKey: item.allocationDeduplicationKey,
        })),
      });
      return this.reads.getPaymentDetail(request.user.tenantId, paymentId);
    } catch (error) {
      return translateFinanceError(error);
    }
  }

  @Post("payment-allocations/:paymentAllocationId/reversal")
  async reverseAllocation(
    @Req() request: FinanceRequest,
    @Param("paymentAllocationId") paymentAllocationId: string,
    @Body() body: ReversePaymentAllocationDto,
  ) {
    try {
      const paymentId = await this.reads.getPaymentIdForAllocation(
        request.user.tenantId,
        paymentAllocationId,
      );
      const reversal = await this.reversals.reverse({
        tenantId: request.user.tenantId,
        actor: { userId: request.user.id, name: request.user.fullName },
        paymentAllocationId,
        reversalDeduplicationKey: body.reversalDeduplicationKey,
        reason: body.reason,
      });
      return {
        reversal: {
          id: reversal.id,
          paymentAllocationId: reversal.paymentAllocationId,
          reason: reversal.reason,
          reversedAt: reversal.reversedAt,
        },
        payment: await this.reads.getPaymentDetail(request.user.tenantId, paymentId),
      };
    } catch (error) {
      return translateFinanceError(error);
    }
  }

  @Post("payments/:paymentId/cancellation")
  async cancelPayment(
    @Req() request: FinanceRequest,
    @Param("paymentId") paymentId: string,
    @Body() body: CancelPaymentDto,
  ) {
    try {
      const payment = await this.cancellations.cancel({
        tenantId: request.user.tenantId,
        actor: { userId: request.user.id, name: request.user.fullName },
        paymentId,
        reason: body.reason,
      });
      return this.reads.getPaymentDetail(request.user.tenantId, payment.id);
    } catch (error) {
      return translateFinanceError(error);
    }
  }

  @Get("payments/:paymentId/receipt")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.CONTADOR)
  async getPaymentReceipt(@Req() request: FinanceRequest, @Param("paymentId") paymentId: string, @Res() response: Response) {
    const result = await this.receipts!.render(request.user.tenantId, paymentId);
    response.set({ "Content-Type": "application/pdf", "Content-Length": result.pdfBuffer.length.toString(), "Content-Disposition": `attachment; filename="${result.fileName}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    response.send(result.pdfBuffer);
  }

  @Post("payments/:paymentId/receipt/email")
  async sendPaymentReceipt(@Req() request: FinanceRequest, @Param("paymentId") paymentId: string, @Body() body: SendPaymentReceiptDto) {
    return this.receipts!.send(request.user.tenantId, { userId: request.user.id, email: request.user.email ?? "", fullName: request.user.fullName }, paymentId, body.to, body.cc);
  }

  @Get("account-receivables/:accountReceivableId")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.CONTADOR)
  getAccountReceivable(
    @Req() request: FinanceRequest,
    @Param("accountReceivableId") accountReceivableId: string,
  ) {
    return this.reads.getAccountReceivableDetail(request.user.tenantId, accountReceivableId);
  }

  @Get("account-receivables")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.CONTADOR)
  listAccountReceivables(@Req() request: FinanceRequest, @Query() query: ListAccountReceivablesDto) {
    return this.reads.listAccountReceivables(request.user.tenantId, query);
  }

  @Get("account-receivable-groups")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.CONTADOR)
  listAccountReceivableGroups(
    @Req() request: FinanceRequest,
    @Query() query: ListAccountReceivableGroupsDto,
  ) {
    return this.reads.listAccountReceivableGroups(request.user.tenantId, query);
  }

  @Get("contract-obligation-groups")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.CONTADOR)
  listContractObligationGroups(
    @Req() request: FinanceRequest,
    @Query() query: ListContractObligationGroupsDto,
  ) {
    return this.reads.listContractObligationGroups(request.user.tenantId, query);
  }

  @Get("contract-obligation-groups/:groupKey/contracts")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.CONTADOR)
  listContractObligationGroupContracts(
    @Req() request: FinanceRequest,
    @Param("groupKey") groupKey: string,
    @Query() query: ListContractObligationGroupContractsDto,
  ) {
    return this.reads.listContractObligationGroupContracts(
      request.user.tenantId,
      groupKey,
      query,
    );
  }

  @Get("account-receivable-groups/:groupKey/account-receivables")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.CONTADOR)
  listAccountReceivableGroupItems(
    @Req() request: FinanceRequest,
    @Param("groupKey") groupKey: string,
    @Query() query: ListAccountReceivableGroupItemsDto,
  ) {
    return this.reads.listAccountReceivableGroupItems(
      request.user.tenantId,
      groupKey,
      query,
    );
  }

  @Get("customers/:customerId/financial-balance")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.CONTADOR)
  getCustomerFinancialBalance(@Req() request: FinanceRequest, @Param("customerId") customerId: string) {
    return this.reads.getCustomerFinancialBalance(request.user.tenantId, customerId);
  }

  @Get("customers/:customerId/financial-summary")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.CONTADOR, UserRole.AGENT)
  getCustomerFinancialSummary(@Req() request: FinanceRequest, @Param("customerId") customerId: string) {
    return this.reads.getCustomerFinancialSummary(request.user.tenantId, customerId);
  }

  @Get("customers/:customerId/electronic-invoices")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.CONTADOR, UserRole.AGENT)
  listCustomerElectronicInvoices(
    @Req() request: FinanceRequest,
    @Param("customerId") customerId: string,
    @Query() query: ListCustomerElectronicInvoicesDto,
  ) {
    return this.reads.listCustomerElectronicInvoices(request.user.tenantId, customerId, query);
  }

  @Get("customers/:customerId/payment-targets/invoices")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.AGENT)
  listCustomerInvoicePaymentTargets(
    @Req() request: FinanceRequest,
    @Param("customerId") customerId: string,
    @Query() query: CustomerInvoicePaymentTargetsQueryDto,
  ) {
    return this.reads.listCustomerInvoicePaymentTargets(request.user.tenantId, customerId, query);
  }

  @Get("customers/:customerId/payment-targets/contracts")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.AGENT)
  listCustomerContractPaymentTargets(
    @Req() request: FinanceRequest,
    @Param("customerId") customerId: string,
    @Query() query: CustomerContractPaymentTargetsQueryDto,
  ) {
    return this.reads.listCustomerContractPaymentTargets(
      request.user.tenantId,
      customerId,
      query.currencyCode,
    );
  }

  @Get("customers/:customerId/payment-settlement-preview")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.AGENT)
  previewCustomerPaymentSettlement(
    @Req() request: FinanceRequest,
    @Param("customerId") customerId: string,
    @Query() query: CustomerPaymentSettlementPreviewQueryDto,
  ) {
    return this.reads.previewCustomerPaymentSettlement(request.user.tenantId, customerId, query);
  }

  @Post("customers/:customerId/reported-payments/invoices")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.AGENT)
  async submitReportedInvoicePayment(
    @Req() request: FinanceRequest,
    @Param("customerId") customerId: string,
    @Body() body: ReportedInvoicePaymentDto,
  ) {
    try {
      return await this.reportedInvoicePayments!.submit({
        tenantId: request.user.tenantId,
        customerId,
        actor: { userId: request.user.id, name: request.user.fullName },
        currencyCode: body.currencyCode,
        amount: decimal(body.amount),
        paymentMethod: body.paymentMethod,
        paymentDate: body.paymentDate ? new Date(body.paymentDate) : undefined,
        reference: body.reference,
        payerName: body.payerName,
        notes: body.notes,
        targets: body.targets.map((target) => ({
          accountReceivableId: target.accountReceivableId,
          intendedAmount: decimal(target.intendedAmount),
        })),
      });
    } catch (error) {
      return translateFinanceError(error);
    }
  }

  @Post("customers/:customerId/reported-payments/contracts")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.AGENT)
  async submitReportedContractPayment(
    @Req() request: FinanceRequest,
    @Param("customerId") customerId: string,
    @Body() body: ReportedContractPaymentDto,
  ) {
    try {
      return await this.reportedInvoicePayments!.submitContract({
        tenantId: request.user.tenantId,
        customerId,
        actor: { userId: request.user.id, name: request.user.fullName },
        currencyCode: body.currencyCode,
        amount: decimal(body.amount),
        paymentMethod: body.paymentMethod,
        paymentDate: body.paymentDate ? new Date(body.paymentDate) : undefined,
        reference: body.reference,
        payerName: body.payerName,
        notes: body.notes,
        contractId: body.contractId,
        commercialObligationId: body.commercialObligationId,
        intendedAmount: decimal(body.intendedAmount),
      });
    } catch (error) {
      return translateFinanceError(error);
    }
  }

  @Post("customers/:customerId/reported-payments/invoices/evidence/extract")
  @UseInterceptors(FileInterceptor("file"))
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.AGENT)
  extractReportedInvoicePaymentEvidence(
    @Req() request: FinanceRequest,
    @Param("customerId") customerId: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    return this.pendingInvoicePaymentEvidence!.extract({ tenantId: request.user.tenantId, customerId, file });
  }

  @Post("customers/:customerId/reported-payments/:paymentId/evidence")
  @UseInterceptors(FileInterceptor("file"))
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.AGENT)
  attachReportedInvoicePaymentEvidence(
    @Req() request: FinanceRequest,
    @Param("customerId") customerId: string,
    @Param("paymentId") paymentId: string,
    @Body() body: { extractionMetadata?: unknown },
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    return this.pendingInvoicePaymentEvidence!.attach({ tenantId: request.user.tenantId, customerId, paymentId, file, extraction: extractionMetadata(body.extractionMetadata) });
  }

  @Post("customers/:customerId/reported-payments/:paymentId/evidence/:evidenceId/destination-override")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.AGENT)
  acceptReportedInvoicePaymentDestinationOverride(
    @Req() request: FinanceRequest,
    @Param("customerId") customerId: string,
    @Param("paymentId") paymentId: string,
    @Param("evidenceId") evidenceId: string,
    @Body() body: PaymentEvidenceDestinationOverrideDto,
  ) {
    return this.pendingInvoicePaymentEvidence!.acceptDestinationOverride({
      tenantId: request.user.tenantId,
      customerId,
      paymentId,
      evidenceId,
      actor: { userId: request.user.id, name: request.user.fullName },
      reason: body.reason,
    });
  }

  @Get("customers/:customerId/reported-payments/:paymentId/evidence/:evidenceId")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.AGENT)
  getReportedInvoicePaymentEvidence(
    @Req() request: FinanceRequest,
    @Param("customerId") customerId: string,
    @Param("paymentId") paymentId: string,
    @Param("evidenceId") evidenceId: string,
  ) {
    return this.pendingInvoicePaymentEvidence!.getAccess({ tenantId: request.user.tenantId, customerId, paymentId, evidenceId });
  }

  @Get("payments")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.CONTADOR)
  listPayments(@Req() request: FinanceRequest, @Query() query: ListPaymentsDto) {
    return this.reads.listPayments(request.user.tenantId, query);
  }

  @Get("payments/:paymentId/allocation-suggestions/:accountReceivableId")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.CONTADOR)
  getAllocationSuggestion(
    @Req() request: FinanceRequest,
    @Param("paymentId") paymentId: string,
    @Param("accountReceivableId") accountReceivableId: string,
  ) {
    return this.reads.getAllocationSuggestion(
      request.user.tenantId,
      paymentId,
      accountReceivableId,
    );
  }

  @Get("unallocated-payment-balances")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.CONTADOR)
  listUnallocatedPaymentBalances(
    @Req() request: FinanceRequest,
    @Query() query: ListUnallocatedPaymentBalancesDto,
  ) {
    return this.reads.listUnallocatedPaymentBalances(request.user.tenantId, query);
  }

  @Get("payments/:paymentId")
  @Roles(UserRole.ADMIN, UserRole.FACTURACION_COBROS, UserRole.CONTADOR)
  getPayment(@Req() request: FinanceRequest, @Param("paymentId") paymentId: string) {
    return this.reads.getPaymentDetail(request.user.tenantId, paymentId);
  }

}

function decimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function extractionMetadata(value: unknown): PaymentEvidenceExtractionInput | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "object" && !Array.isArray(value)) return value as PaymentEvidenceExtractionInput;
  if (typeof value !== "string") throw new BadRequestException("FINANCE_PAYMENT_EVIDENCE_METADATA_INVALID");
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new BadRequestException("FINANCE_PAYMENT_EVIDENCE_METADATA_INVALID");
    }
    return parsed as PaymentEvidenceExtractionInput;
  } catch {
    throw new BadRequestException("FINANCE_PAYMENT_EVIDENCE_METADATA_INVALID");
  }
}
