import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AnyFilesInterceptor, FileInterceptor } from "@nestjs/platform-express";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import {
  AdditionalServiceOrderDashboardResponseDto,
  CreateAdditionalServiceOrderDto,
  ListAdditionalServiceOrdersDto,
  SendCommercialProposalDto,
} from "./dto";
import {
  AdditionalServiceOrderCreationEvidence,
  AdditionalServicesService,
} from "./additional-services.service";
import { PricingEngineBusinessErrorFilter } from "./infrastructure/pricing-engine-business-error.filter";
import { CommercialProposalPdfService } from "./commercial-proposal-pdf.service";
import { CommercialProposalEmailService } from "./commercial-proposal-email.service";
import { SalesOrderConversionService } from "../sales-orders/sales-order-conversion.service";
import { CommercialProposalStatus } from "./enums";
import { CommercialProposalInPersonApprovalService } from "./commercial-proposal-in-person-approval.service";
import {
  AdditionalServiceCommercialCostEvidenceFile,
  AdditionalServiceCommercialCostEvidenceService,
  MAX_ADDITIONAL_SERVICE_COST_EVIDENCE_BYTES,
} from "./additional-service-commercial-cost-evidence.service";

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
    private readonly commercialCostEvidenceService: AdditionalServiceCommercialCostEvidenceService,
  ) {}

  @Post()
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: { fileSize: MAX_ADDITIONAL_SERVICE_COST_EVIDENCE_BYTES },
    }),
  )
  async create(
    @Req() req: OrderRequest,
    @Body() body: unknown,
    @UploadedFiles() files: CreationEvidenceUpload[] = [],
  ) {
    const input = await parseCreateOrderPayload(body);
    const evidenceInputs = creationEvidenceInputs(files);
    const order = await this.additionalServicesService.createOrder(
      req.user.tenantId,
      {
        id: req.user.id,
        fullName: req.user.fullName,
      },
      input,
      evidenceInputs,
    );

    return {
      orderId: order.id,
      status: order.status,
    };
  }

  @Post(":orderId/lines/:lineId/cost-evidence")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_ADDITIONAL_SERVICE_COST_EVIDENCE_BYTES },
    }),
  )
  uploadCostEvidence(
    @Req() req: OrderRequest,
    @Param("orderId") orderId: string,
    @Param("lineId") lineId: string,
    @UploadedFile() file: AdditionalServiceCommercialCostEvidenceFile | undefined,
  ) {
    return this.commercialCostEvidenceService.upload(
      req.user.tenantId,
      orderId,
      lineId,
      file,
    );
  }

  @Get(":orderId/lines/:lineId/cost-evidence/access")
  getCostEvidenceAccess(
    @Req() req: OrderRequest,
    @Param("orderId") orderId: string,
    @Param("lineId") lineId: string,
  ) {
    return this.commercialCostEvidenceService.getAccess(
      req.user.tenantId,
      orderId,
      lineId,
    );
  }

  @Delete(":orderId/lines/:lineId/cost-evidence")
  removeCostEvidence(
    @Req() req: OrderRequest,
    @Param("orderId") orderId: string,
    @Param("lineId") lineId: string,
  ) {
    return this.commercialCostEvidenceService.remove(
      req.user.tenantId,
      orderId,
      lineId,
    );
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

type CreationEvidenceUpload = AdditionalServiceCommercialCostEvidenceFile & {
  fieldname: string;
};

async function parseCreateOrderPayload(
  body: unknown,
): Promise<CreateAdditionalServiceOrderDto> {
  let payload = body;
  if (body && typeof body === "object" && "payload" in body) {
    const encoded = (body as { payload: unknown }).payload;
    if (typeof encoded !== "string") {
      throw new BadRequestException(
        "El payload de la orden de servicios adicionales debe ser JSON válido.",
      );
    }
    try {
      payload = JSON.parse(encoded) as unknown;
    } catch {
      throw new BadRequestException(
        "El payload de la orden de servicios adicionales debe ser JSON válido.",
      );
    }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new BadRequestException(
      "El payload de la orden de servicios adicionales es inválido.",
    );
  }

  const input = plainToInstance(CreateAdditionalServiceOrderDto, payload);
  const errors = await validate(input, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length > 0) {
    throw new BadRequestException(errors);
  }
  return input;
}

function creationEvidenceInputs(
  files: readonly CreationEvidenceUpload[],
): AdditionalServiceOrderCreationEvidence[] {
  return files.map((file) => {
    const prefix = "costEvidence.";
    if (!file.fieldname.startsWith(prefix)) {
      throw new BadRequestException(
        "Cada archivo de evidencia debe usar el campo costEvidence.<temporaryLineKey>.",
      );
    }
    const temporaryLineKey = file.fieldname.slice(prefix.length).trim();
    if (!temporaryLineKey) {
      throw new BadRequestException(
        "Cada archivo de evidencia debe identificar una línea temporal.",
      );
    }
    return { temporaryLineKey, file };
  });
}
