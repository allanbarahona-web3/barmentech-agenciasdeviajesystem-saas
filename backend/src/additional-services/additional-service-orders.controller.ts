import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import {
  AdditionalServiceOrderDashboardResponseDto,
  CreateAdditionalServiceOrderDto,
  ListAdditionalServiceOrdersDto,
  SendCommercialProposalDto,
} from "./dto";
import { AdditionalServicesService } from "./additional-services.service";
import { PricingEngineBusinessErrorFilter } from "./infrastructure/pricing-engine-business-error.filter";
import { CommercialProposalPdfService } from "./commercial-proposal-pdf.service";
import { CommercialProposalEmailService } from "./commercial-proposal-email.service";
import { SalesOrderConversionService } from "../sales-orders/sales-order-conversion.service";
import { CommercialProposalStatus } from "./enums";
import { CommercialProposalInPersonApprovalService } from "./commercial-proposal-in-person-approval.service";

type OrderRequest = {
  user: {
    id: string;
    fullName: string;
    email: string;
    tenantId: string;
  };
};

@Controller("additional-services/orders")
@UseGuards(JwtAuthGuard, RolesGuard)
@UseFilters(PricingEngineBusinessErrorFilter)
@Roles("ADMIN", "AGENT", "OPERACIONES")
export class AdditionalServiceOrdersController {
  constructor(
    private readonly additionalServicesService: AdditionalServicesService,
    private readonly commercialProposalPdfService: CommercialProposalPdfService,
    private readonly commercialProposalEmailService: CommercialProposalEmailService,
    private readonly salesOrderConversionService: SalesOrderConversionService,
    private readonly inPersonApprovalService: CommercialProposalInPersonApprovalService,
  ) {}

  @Post()
  async create(
    @Req() req: OrderRequest,
    @Body() input: CreateAdditionalServiceOrderDto,
  ) {
    const order = await this.additionalServicesService.createOrder(
      req.user.tenantId,
      {
        id: req.user.id,
        fullName: req.user.fullName,
      },
      input,
    );

    return {
      orderId: order.id,
      status: order.status,
    };
  }

  @Post(":orderId/commercial-proposal/approve-in-person")
  async approveCommercialProposalInPerson(
    @Req() req: OrderRequest,
    @Param("orderId") orderId: string,
  ) {
    const order = await this.additionalServicesService.getOrder(
      req.user.tenantId,
      orderId,
    );
    return this.inPersonApprovalService.approve(
      order,
      req.user.tenantId,
      { id: req.user.id, fullName: req.user.fullName },
    );
  }

  @Post(":orderId/commercial-proposal/send")
  async sendCommercialProposal(
    @Req() req: OrderRequest,
    @Param("orderId") orderId: string,
    @Body() input: SendCommercialProposalDto,
  ) {
    const order = await this.additionalServicesService.getOrder(
      req.user.tenantId,
      orderId,
    );
    return this.commercialProposalEmailService.send(
      order,
      req.user.tenantId,
      {
        userId: req.user.id,
        email: req.user.email,
        fullName: req.user.fullName,
      },
      input?.cc,
    );
  }

  @Post(":orderId/commercial-proposal")
  async generateCommercialProposal(
    @Req() req: OrderRequest,
    @Param("orderId") orderId: string,
  ) {
    const order = await this.additionalServicesService.getOrder(
      req.user.tenantId,
      orderId,
    );
    if (order.commercialStatus !== CommercialProposalStatus.DRAFT) {
      throw new BadRequestException(
        "El PDF comercial solo puede generarse para una propuesta en borrador.",
      );
    }
    const document = await this.commercialProposalPdfService.persist(
      order,
      req.user.tenantId,
    );
    return { documentId: document.id };
  }

  @Get()
  list(
    @Req() req: OrderRequest,
    @Query() query: ListAdditionalServiceOrdersDto,
  ): Promise<AdditionalServiceOrderDashboardResponseDto> {
    return this.additionalServicesService.listOrderDashboard(
      req.user.tenantId,
      query,
    );
  }

  @Get(":orderId/commercial-proposal")
  async getCommercialProposal(
    @Req() req: OrderRequest,
    @Param("orderId") orderId: string,
  ) {
    const order = await this.additionalServicesService.getOrder(
      req.user.tenantId,
      orderId,
    );
    return this.commercialProposalPdfService.getPersistedPreview(
      order,
      req.user.tenantId,
    );
  }

  @Get(":orderId")
  async getById(
    @Req() req: OrderRequest,
    @Param("orderId") orderId: string,
  ) {
    const order = await this.additionalServicesService.getOrder(
      req.user.tenantId,
      orderId,
    );
    const salesOrder = await this.salesOrderConversionService.findByAdditionalServiceOrder(
      req.user.tenantId,
      orderId,
    );
    return { ...order, salesOrder };
  }
}
