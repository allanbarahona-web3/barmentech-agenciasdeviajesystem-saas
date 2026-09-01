import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
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
  ListAccountReceivableGroupsDto,
  ListAccountReceivablesDto,
  ListPaymentsDto,
  ListUnallocatedPaymentBalancesDto,
  RegisterPaymentDto,
  ReversePaymentAllocationDto,
  CustomerFundsAllocationDto,
  CustomerFundsAllocationPreviewDto,
} from "./dto/finance.dto";
import { translateFinanceError } from "./finance.errors";
import { FinanceReadService } from "./finance-read.service";
import { CustomerFundsAllocationService } from "./customer-funds-allocation.service";

type FinanceRequest = { user: { id: string; fullName: string; tenantId: string; role: UserRole } };

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
  ) {}

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
